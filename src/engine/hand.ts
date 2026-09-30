// One hand of no-limit hold'em as a pure state machine.
// startHand() deals a hand, legalActions() says what the player to act may do,
// applyAction() returns the next state. No screens, no clocks, no hidden randomness:
// the same config and the same actions always produce the same hand.

import { newDeck, type Card } from "./cards.ts";
import { evaluate } from "./evaluator.ts";
import { createRng, shuffle } from "./rng.ts";

export type Street = "preflop" | "flop" | "turn" | "river" | "complete";
export type ActionType = "fold" | "check" | "call" | "raise";

export interface Action {
  seat: number;
  type: ActionType;
  /** For "raise" (which also means "bet"): the player's total bet for this street after raising. */
  to?: number;
}

export interface SeatSetup {
  name: string;
  stack: number;
}

export interface HandConfig {
  /** One entry per seat; null (or a zero stack) means nobody is dealt in. */
  seats: readonly (SeatSetup | null)[];
  buttonSeat: number;
  /** null when the small blind is dead (its owner left the table). */
  smallBlindSeat: number | null;
  bigBlindSeat: number;
  smallBlind: number;
  bigBlind: number;
  /** Seeds the shuffle. */
  seed: string;
  handNumber: number;
  /** Tests only: a full 52-card deck in deal order, instead of a shuffle. */
  deck?: readonly Card[];
}

export interface PlayerState {
  seat: number;
  name: string;
  startStack: number;
  /** Chips behind (not yet bet). */
  stack: number;
  /** Chips put in on the current street. */
  bet: number;
  /** Chips put in on the whole hand. */
  committed: number;
  folded: boolean;
  allIn: boolean;
  /** Has acted since the last full raise. */
  acted: boolean;
  /** False after acting until a full raise reopens the betting. */
  canRaise: boolean;
  hole: readonly [Card, Card];
}

export type HandEvent =
  | { type: "hand_start"; handNumber: number; buttonSeat: number; smallBlindSeat: number | null; bigBlindSeat: number }
  | { type: "post_blind"; seat: number; blind: "small" | "big"; amount: number; allIn: boolean }
  | { type: "deal_board"; street: "flop" | "turn" | "river"; cards: readonly Card[] }
  | {
      type: "action";
      seat: number;
      street: Street;
      action: "fold" | "check" | "call" | "bet" | "raise";
      /** Chips added by this action. */
      amount: number;
      /** The player's street total after the action (bets, raises and calls). */
      to: number;
      allIn: boolean;
    }
  | { type: "uncalled_return"; seat: number; amount: number }
  | { type: "show"; seat: number; hole: readonly [Card, Card]; score: number }
  | { type: "muck"; seat: number }
  | {
      type: "pot_award";
      potIndex: number;
      amount: number;
      eligible: readonly number[];
      winners: readonly number[];
      awards: readonly { seat: number; amount: number }[];
      /** Winning hand description, when there was a showdown. */
      handScore: number | null;
    }
  | { type: "hand_end" };

export interface PotResult {
  amount: number;
  eligible: readonly number[];
  winners: readonly number[];
  awards: readonly { seat: number; amount: number }[];
}

export interface HandResult {
  pots: readonly PotResult[];
  /** True when more than one player was left after the final betting round. */
  showdown: boolean;
  /** Per seat: final stack minus starting stack (null for seats not dealt in). */
  net: readonly (number | null)[];
  finalStacks: readonly (number | null)[];
}

export interface HandState {
  config: HandConfig;
  players: readonly (PlayerState | null)[];
  deck: readonly Card[];
  deckPos: number;
  board: readonly Card[];
  street: Street;
  /** Seat that must act now, or -1 when the hand is over. */
  toAct: number;
  /** Highest total bet on this street. */
  currentBet: number;
  /** Size of the last full bet or raise on this street; the next raise must be at least this much bigger. */
  lastRaiseSize: number;
  /** Seat that last bet or raised on this street (short all-ins count). */
  lastAggressor: number | null;
  events: readonly HandEvent[];
  result: HandResult | null;
  /** Seat the betting pointer last moved past (internal). */
  cursor: number;
}

/** The same state with arrays we may change; only used inside this file on a fresh copy. */
type Draft = { -readonly [K in keyof HandState]: HandState[K] extends readonly (infer U)[] ? U[] : HandState[K] };

export interface LegalActions {
  seat: number;
  canFold: true;
  canCheck: boolean;
  /** Chips needed to call (already capped at the player's stack); 0 when checking is possible. */
  callAmount: number;
  canRaise: boolean;
  /** Smallest legal "raise to" total. Equals maxRaiseTo when only an all-in is possible. */
  minRaiseTo: number;
  /** The player's whole stack: bet + stack. */
  maxRaiseTo: number;
  /** Total chips in the middle right now (all streets). */
  pot: number;
  currentBet: number;
  playerBet: number;
  stack: number;
}

export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IllegalActionError";
  }
}

// ---------------------------------------------------------------------------------------------
// Setup

/** Seats dealt into this hand, clockwise starting with the seat left of the button. */
export function holeDealOrder(config: HandConfig): number[] {
  const n = config.seats.length;
  const order: number[] = [];
  for (let i = 1; i <= n; i++) {
    const seat = (config.buttonSeat + i) % n;
    const s = config.seats[seat];
    if (s && s.stack > 0) order.push(seat);
  }
  return order;
}

function isCount(x: number): boolean {
  return Number.isInteger(x) && x >= 0;
}

export function startHand(config: HandConfig): HandState {
  const n = config.seats.length;
  if (!Number.isInteger(config.bigBlind) || config.bigBlind < 1) throw new Error("bigBlind must be a whole number >= 1");
  if (!isCount(config.smallBlind) || config.smallBlind > config.bigBlind) throw new Error("smallBlind must be 0..bigBlind");
  for (const s of config.seats) if (s && !isCount(s.stack)) throw new Error("Stacks must be whole numbers");
  const order = holeDealOrder(config);
  if (order.length < 2) throw new Error("Need at least two players with chips");
  const inHand = (seat: number | null): seat is number => seat !== null && order.includes(seat);
  if (!inHand(config.bigBlindSeat)) throw new Error("Big blind seat is not in the hand");
  if (config.smallBlindSeat !== null && !inHand(config.smallBlindSeat)) throw new Error("Small blind seat is not in the hand");

  let deck: Card[];
  if (config.deck) {
    deck = config.deck.slice();
    if (deck.length !== 52 || new Set(deck).size !== 52) throw new Error("Supplied deck must be 52 distinct cards");
  } else {
    deck = shuffle(newDeck(), createRng(config.seed));
  }

  // Two passes around the table, one card at a time.
  const holes = new Map<number, Card[]>();
  for (const seat of order) holes.set(seat, []);
  let pos = 0;
  for (let pass = 0; pass < 2; pass++) for (const seat of order) holes.get(seat)!.push(deck[pos++]);

  const players: (PlayerState | null)[] = Array.from({ length: n }, () => null);
  for (const seat of order) {
    const setup = config.seats[seat]!;
    const h = holes.get(seat)!;
    players[seat] = {
      seat,
      name: setup.name,
      startStack: setup.stack,
      stack: setup.stack,
      bet: 0,
      committed: 0,
      folded: false,
      allIn: false,
      acted: false,
      canRaise: true,
      hole: [h[0], h[1]],
    };
  }

  const events: HandEvent[] = [
    {
      type: "hand_start",
      handNumber: config.handNumber,
      buttonSeat: config.buttonSeat,
      smallBlindSeat: config.smallBlindSeat,
      bigBlindSeat: config.bigBlindSeat,
    },
  ];

  const post = (seat: number, blind: "small" | "big", amount: number): void => {
    const p = players[seat]!;
    const paid = Math.min(p.stack, amount);
    p.stack -= paid;
    p.bet += paid;
    p.committed += paid;
    if (p.stack === 0) p.allIn = true;
    events.push({ type: "post_blind", seat, blind, amount: paid, allIn: p.allIn });
  };
  if (config.smallBlindSeat !== null && config.smallBlind > 0) post(config.smallBlindSeat, "small", config.smallBlind);
  post(config.bigBlindSeat, "big", config.bigBlind);

  const state: Draft = {
    config,
    players,
    deck,
    deckPos: pos,
    board: [],
    street: "preflop",
    toAct: -1,
    currentBet: config.bigBlind,
    lastRaiseSize: config.bigBlind,
    lastAggressor: null,
    events,
    result: null,
    cursor: config.bigBlindSeat,
  };
  progress(state);
  return state;
}

// ---------------------------------------------------------------------------------------------
// Reading the state

function ableCount(s: HandState | Draft): number {
  let count = 0;
  for (const p of s.players) if (p && !p.folded && !p.allIn) count++;
  return count;
}

export function totalPot(s: HandState): number {
  let total = 0;
  for (const p of s.players) if (p) total += p.committed;
  return total;
}

export function legalActions(s: HandState): LegalActions | null {
  if (s.toAct < 0) return null;
  const p = s.players[s.toAct]!;
  const owed = s.currentBet - p.bet;
  const maxRaiseTo = p.bet + p.stack;
  const someoneCanCall = s.players.some((q) => q && q.seat !== p.seat && !q.folded && !q.allIn);
  const canRaise = p.canRaise && someoneCanCall && maxRaiseTo > s.currentBet;
  const minFull = s.currentBet + s.lastRaiseSize;
  return {
    seat: p.seat,
    canFold: true,
    canCheck: owed <= 0,
    callAmount: owed > 0 ? Math.min(owed, p.stack) : 0,
    canRaise,
    minRaiseTo: canRaise ? Math.min(minFull, maxRaiseTo) : maxRaiseTo,
    maxRaiseTo,
    pot: totalPot(s),
    currentBet: s.currentBet,
    playerBet: p.bet,
    stack: p.stack,
  };
}

// ---------------------------------------------------------------------------------------------
// Acting

function cloneState(s: HandState): Draft {
  return {
    ...s,
    deck: s.deck as Card[],
    players: s.players.map((p) => (p ? { ...p } : null)),
    board: s.board.slice(),
    events: s.events.slice(),
  };
}

export function applyAction(state: HandState, action: Action): HandState {
  if (state.toAct < 0) throw new IllegalActionError("The hand is over");
  if (action.seat !== state.toAct) throw new IllegalActionError(`It is seat ${state.toAct}'s turn, not seat ${action.seat}'s`);
  const legal = legalActions(state)!;

  const s = cloneState(state);
  const p = s.players[action.seat]! as PlayerState;
  const street = s.street;
  const isFull = (to: number): boolean => to - s.currentBet >= s.lastRaiseSize;

  switch (action.type) {
    case "fold": {
      p.folded = true;
      s.events.push({ type: "action", seat: p.seat, street, action: "fold", amount: 0, to: p.bet, allIn: false });
      break;
    }
    case "check": {
      if (!legal.canCheck) throw new IllegalActionError("Cannot check when facing a bet");
      s.events.push({ type: "action", seat: p.seat, street, action: "check", amount: 0, to: p.bet, allIn: false });
      break;
    }
    case "call": {
      if (legal.canCheck) throw new IllegalActionError("Nothing to call");
      const amount = legal.callAmount;
      p.stack -= amount;
      p.bet += amount;
      p.committed += amount;
      if (p.stack === 0) p.allIn = true;
      s.events.push({ type: "action", seat: p.seat, street, action: "call", amount, to: p.bet, allIn: p.allIn });
      break;
    }
    case "raise": {
      const to = action.to;
      if (to === undefined || !Number.isInteger(to)) throw new IllegalActionError("A raise needs a whole-number total");
      if (!legal.canRaise) throw new IllegalActionError("Raising is not allowed here");
      if (to < legal.minRaiseTo) throw new IllegalActionError(`Raise to at least ${legal.minRaiseTo}`);
      if (to > legal.maxRaiseTo) throw new IllegalActionError(`Raise to at most ${legal.maxRaiseTo}`);
      const kind = s.currentBet === 0 ? "bet" : "raise";
      const full = isFull(to);
      const amount = to - p.bet;
      p.stack -= amount;
      p.bet = to;
      p.committed += amount;
      if (p.stack === 0) p.allIn = true;
      if (full) s.lastRaiseSize = to - s.currentBet;
      s.currentBet = to;
      s.lastAggressor = p.seat;
      s.events.push({ type: "action", seat: p.seat, street, action: kind, amount, to, allIn: p.allIn });
      if (full) {
        // A full raise reopens the betting for everybody else.
        for (const q of s.players) {
          if (q && q.seat !== p.seat) {
            q.acted = false;
            q.canRaise = true;
          }
        }
      }
      break;
    }
    default:
      throw new IllegalActionError(`Unknown action: ${String((action as Action).type)}`);
  }

  p.acted = true;
  p.canRaise = false;
  s.cursor = p.seat;
  progress(s);
  return s;
}

// ---------------------------------------------------------------------------------------------
// Moving the hand along (mutates the copy it is given)

function nextToAct(s: Draft): number {
  const n = s.players.length;
  const able = ableCount(s);
  for (let i = 1; i <= n; i++) {
    const seat = (s.cursor + i) % n;
    const p = s.players[seat];
    if (!p || p.folded || p.allIn) continue;
    if (p.bet < s.currentBet || (!p.acted && able >= 2)) return seat;
  }
  return -1;
}

function progress(s: Draft): void {
  for (;;) {
    const alive = s.players.filter((p) => p && !p.folded);
    if (alive.length === 1) {
      settle(s, false);
      return;
    }
    const next = nextToAct(s);
    if (next >= 0) {
      s.toAct = next;
      return;
    }
    if (s.street === "river") {
      settle(s, true);
      return;
    }
    dealNextStreet(s);
  }
}

function dealNextStreet(s: Draft): void {
  const count = s.street === "preflop" ? 3 : 1;
  const cards = s.deck.slice(s.deckPos, s.deckPos + count);
  s.deckPos += count;
  s.board = [...s.board, ...cards];
  s.street = s.street === "preflop" ? "flop" : s.street === "flop" ? "turn" : "river";
  s.events.push({ type: "deal_board", street: s.street, cards });
  for (const p of s.players) {
    if (p) {
      p.bet = 0;
      p.acted = false;
      p.canRaise = true;
    }
  }
  s.currentBet = 0;
  s.lastRaiseSize = s.config.bigBlind;
  s.lastAggressor = null;
  s.cursor = s.config.buttonSeat;
}

// ---------------------------------------------------------------------------------------------
// Settling the hand: returning uncalled bets, building pots, showdown, paying out

function settle(s: Draft, showdown: boolean): void {
  const n = s.players.length;
  const inHand = s.players.filter((p): p is PlayerState => p !== null);

  // 1. The part of the biggest bet that nobody matched goes back to its owner.
  const byCommitted = [...inHand].sort((a, b) => b.committed - a.committed);
  if (byCommitted.length >= 2 && byCommitted[0].committed > byCommitted[1].committed) {
    const top = byCommitted[0];
    const refund = top.committed - byCommitted[1].committed;
    top.committed -= refund;
    top.bet = Math.max(0, top.bet - refund);
    top.stack += refund;
    s.events.push({ type: "uncalled_return", seat: top.seat, amount: refund });
  }

  // 2. Build the main pot and side pots from how much each player put in.
  interface Pot {
    amount: number;
    eligible: number[];
  }
  const pots: Pot[] = [];
  const levels = [...new Set(inHand.map((p) => p.committed).filter((c) => c > 0))].sort((a, b) => a - b);
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const p of inHand) amount += Math.min(p.committed, level) - Math.min(p.committed, prev);
    const eligible = inHand.filter((p) => !p.folded && p.committed >= level).map((p) => p.seat);
    prev = level;
    const last = pots[pots.length - 1];
    if (eligible.length === 0 || (last && last.eligible.length === eligible.length && last.eligible.every((x, i) => x === eligible[i]))) {
      if (last) last.amount += amount;
      continue;
    }
    pots.push({ amount, eligible });
  }

  // 3. Showdown: show or muck, in the right order.
  const scores = new Map<number, number>();
  const alive = inHand.filter((p) => !p.folded);
  if (showdown) {
    for (const p of alive) scores.set(p.seat, evaluate([...p.hole, ...s.board]));
    const firstToShow = s.lastAggressor ?? (s.config.buttonSeat + 1) % n;
    const order: PlayerState[] = [];
    for (let i = 0; i < n; i++) {
      const p = s.players[(firstToShow + i) % n];
      if (p && !p.folded) order.push(p);
    }
    const everyoneShows = alive.some((p) => p.allIn);
    let best = -1;
    for (const p of order) {
      const score = scores.get(p.seat)!;
      if (everyoneShows || score >= best) {
        s.events.push({ type: "show", seat: p.seat, hole: p.hole, score });
        best = Math.max(best, score);
      } else {
        s.events.push({ type: "muck", seat: p.seat });
      }
    }
  }

  // 4. Pay each pot. Odd chips go to the first winner left of the button.
  const results: PotResult[] = [];
  pots.forEach((pot, potIndex) => {
    let winners = pot.eligible;
    let handScore: number | null = null;
    if (pot.eligible.length > 1) {
      const best = Math.max(...pot.eligible.map((seat) => scores.get(seat)!));
      winners = pot.eligible.filter((seat) => scores.get(seat) === best);
      handScore = best;
    } else if (showdown) {
      handScore = scores.get(pot.eligible[0]) ?? null;
    }
    const ordered = [...winners].sort((a, b) => ((a - s.config.buttonSeat - 1 + n) % n) - ((b - s.config.buttonSeat - 1 + n) % n));
    const share = Math.floor(pot.amount / ordered.length);
    let odd = pot.amount - share * ordered.length;
    const awards = ordered.map((seat) => {
      const extra = odd > 0 ? 1 : 0;
      odd -= extra;
      return { seat, amount: share + extra };
    });
    for (const a of awards) s.players[a.seat]!.stack += a.amount;
    results.push({ amount: pot.amount, eligible: pot.eligible, winners: ordered, awards });
    s.events.push({ type: "pot_award", potIndex, amount: pot.amount, eligible: pot.eligible, winners: ordered, awards, handScore });
  });

  s.events.push({ type: "hand_end" });
  s.street = "complete";
  s.toAct = -1;
  s.result = {
    pots: results,
    showdown,
    net: s.players.map((p) => (p ? p.stack - p.startStack : null)),
    finalStacks: s.players.map((p) => (p ? p.stack : null)),
  };
}

// ---------------------------------------------------------------------------------------------
// Replay

/** The actions taken so far, in order. With the config, this is enough to replay a hand exactly. */
export function actionsOf(s: HandState): Action[] {
  const out: Action[] = [];
  for (const e of s.events) {
    if (e.type !== "action") continue;
    if (e.action === "bet" || e.action === "raise") out.push({ seat: e.seat, type: "raise", to: e.to });
    else out.push({ seat: e.seat, type: e.action });
  }
  return out;
}

export function replayHand(config: HandConfig, actions: readonly Action[]): HandState {
  let s = startHand(config);
  for (const a of actions) s = applyAction(s, a);
  return s;
}
