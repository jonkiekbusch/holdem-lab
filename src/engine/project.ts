// Works out what the table looks like after the first N events of a hand.
// The engine settles a whole run-out in one step, but a screen wants to show the flop, turn,
// river, showdown and payouts one at a time. This replays the event list up to a point.
// No screen code here: it only produces plain numbers and text.

import type { Card } from "./cards.ts";
import { describeScore } from "./evaluator.ts";
import type { HandConfig, HandEvent } from "./hand.ts";

export interface DisplaySeat {
  seat: number;
  name: string;
  stack: number;
  /** Chips in front of the player on the current street. */
  bet: number;
  folded: boolean;
  allIn: boolean;
  /** "Check", "Call 6", "Raise to 18", "All-in 200", "Fold"; null before the player has acted on this street. */
  lastAction: string | null;
  /** Hole cards, once shown at showdown. */
  revealed: readonly [Card, Card] | null;
  mucked: boolean;
  /** Chips won from pots so far. */
  won: number;
  /** Name of the hand that won, e.g. "Two pair, Tens and Sixes". */
  winningHand: string | null;
}

export interface DisplayHand {
  handNumber: number;
  buttonSeat: number;
  smallBlindSeat: number | null;
  bigBlindSeat: number;
  street: "preflop" | "flop" | "turn" | "river" | "showdown" | "complete";
  board: readonly Card[];
  /** Chips being played for, including bets still on the table, minus anything already paid out. */
  pot: number;
  /** A bet nobody could call that is waiting to go back to its owner. */
  uncalled: { seat: number; amount: number } | null;
  seats: readonly (DisplaySeat | null)[];
  complete: boolean;
}

function describeAction(e: Extract<HandEvent, { type: "action" }>): string {
  if (e.action === "fold") return "Fold";
  if (e.action === "check") return "Check";
  if (e.allIn) return `All-in ${e.to}`;
  if (e.action === "call") return `Call ${e.amount}`;
  if (e.action === "bet") return `Bet ${e.to}`;
  return `Raise to ${e.to}`;
}

export function projectEvents(config: HandConfig, events: readonly HandEvent[], upTo: number): DisplayHand {
  const seats: (DisplaySeat | null)[] = config.seats.map((s, seat) =>
    s && s.stack > 0
      ? { seat, name: s.name, stack: s.stack, bet: 0, folded: false, allIn: false, lastAction: null, revealed: null, mucked: false, won: 0, winningHand: null }
      : null,
  );
  const committed = new Map<number, number>();
  const addCommitted = (seat: number, amount: number): void => {
    committed.set(seat, (committed.get(seat) ?? 0) + amount);
  };

  let street: DisplayHand["street"] = "preflop";
  let board: Card[] = [];
  let awarded = 0;
  let complete = false;
  let roundJustClosed = false;
  const last = Math.min(upTo, events.length);

  for (let i = 0; i < last; i++) {
    const e = events[i];
    roundJustClosed = e.type === "deal_board";
    switch (e.type) {
      case "post_blind": {
        const p = seats[e.seat]!;
        p.stack -= e.amount;
        p.bet += e.amount;
        if (e.allIn) p.allIn = true;
        addCommitted(e.seat, e.amount);
        break;
      }
      case "action": {
        const p = seats[e.seat]!;
        p.stack -= e.amount;
        p.bet = e.to;
        addCommitted(e.seat, e.amount);
        if (e.action === "fold") p.folded = true;
        if (e.allIn) p.allIn = true;
        p.lastAction = describeAction(e);
        break;
      }
      case "deal_board": {
        board = [...board, ...e.cards];
        street = e.street;
        for (const p of seats) {
          if (!p) continue;
          p.bet = 0;
          if (!p.folded && !p.allIn) p.lastAction = null;
        }
        break;
      }
      case "uncalled_return": {
        const p = seats[e.seat]!;
        p.stack += e.amount;
        p.bet = Math.max(0, p.bet - e.amount);
        addCommitted(e.seat, -e.amount);
        break;
      }
      case "show": {
        street = "showdown";
        seats[e.seat]!.revealed = e.hole;
        break;
      }
      case "muck": {
        street = "showdown";
        seats[e.seat]!.mucked = true;
        break;
      }
      case "pot_award": {
        for (const a of e.awards) {
          const p = seats[a.seat]!;
          p.stack += a.amount;
          p.won += a.amount;
          if (e.handScore !== null) p.winningHand = describeScore(e.handScore);
        }
        awarded += e.amount;
        break;
      }
      case "hand_end": {
        complete = true;
        street = "complete";
        for (const p of seats) if (p) p.bet = 0;
        break;
      }
      case "hand_start":
        break;
    }
  }

  const total = [...committed.values()].reduce((a, b) => a + b, 0);
  const sorted = [...committed.entries()].sort((a, b) => b[1] - a[1]);
  let uncalled: DisplayHand["uncalled"] = null;
  // When a betting round has just closed, any excess of the biggest bet over the next biggest could not be called.
  if (roundJustClosed && sorted.length >= 2 && sorted[0][1] > sorted[1][1]) {
    uncalled = { seat: sorted[0][0], amount: sorted[0][1] - sorted[1][1] };
  }

  return {
    handNumber: config.handNumber,
    buttonSeat: config.buttonSeat,
    smallBlindSeat: config.smallBlindSeat,
    bigBlindSeat: config.bigBlindSeat,
    street,
    board,
    pot: total - (uncalled?.amount ?? 0) - awarded,
    uncalled,
    seats,
    complete,
  };
}
