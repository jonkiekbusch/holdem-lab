// Turns a hand into readable text lines. Pure text; the screen just prints the lines.

import { cardPretty, type Card } from "./cards.ts";
import { describeScore } from "./evaluator.ts";
import { potAfterEvent, type HandState } from "./hand.ts";

const cards = (list: readonly Card[]): string => list.map(cardPretty).join(" ");

export interface FormatOptions {
  /** Only print the first N events (for showing a hand as it unfolds). */
  upTo?: number;
  /** Seat that is the reader ("You"): verbs are written as "You call", "You win". */
  youSeat?: number;
  /** Players who rebought just before this hand; printed right under the hand's header line. */
  rebuys?: readonly { name: string; amount: number }[];
  /** Show every player's hole cards at the start (for the watch page; a real game never does). */
  showAllHoleCards?: boolean;
}

export function formatHand(state: HandState, options: FormatOptions = {}): string[] {
  const name = (seat: number): string => state.config.seats[seat]?.name ?? `Seat ${seat + 1}`;
  const you = options.youSeat;
  /** "Ann calls" / "You call" */
  const did = (seat: number, third: string, base: string): string => `${name(seat)} ${seat === you ? base : third}`;
  const lines: string[] = [];
  const potNames = (index: number, total: number): string => (total === 1 ? "the pot" : index === 0 ? "the main pot" : `side pot ${index}`);
  const count = Math.min(options.upTo ?? state.events.length, state.events.length);
  for (let index = 0; index < count; index++) {
    const e = state.events[index];
    switch (e.type) {
      case "hand_start": {
        const sb = e.smallBlindSeat === null ? "no small blind (dead)" : `small blind ${name(e.smallBlindSeat)}`;
        lines.push(`Hand #${e.handNumber} · button ${name(e.buttonSeat)} · ${sb} · big blind ${name(e.bigBlindSeat)} · ${state.config.smallBlind}/${state.config.bigBlind}`);
        if (options.rebuys && options.rebuys.length > 0) {
          lines.push(`↻ Rebuy before this hand: ${options.rebuys.map((r) => `${r.name} rebought ${r.amount}`).join(", ")}`);
        }
        lines.push(
          "Stacks: " +
            state.players
              .filter((p) => p)
              .map((p) => `${p!.name} ${p!.startStack}`)
              .join(", "),
        );
        if (options.showAllHoleCards) {
          lines.push(
            "Cards: " +
              state.players
                .filter((p) => p)
                .map((p) => `${p!.name} ${cards(p!.hole)}`)
                .join(" · "),
          );
        }
        break;
      }
      case "post_blind":
        lines.push(`${did(e.seat, "posts", "post")} the ${e.blind} blind ${e.amount}${e.allIn ? " (all-in)" : ""}`);
        break;
      case "deal_board": {
        const { contested, uncalled } = potAfterEvent(state.events, index);
        const potText = uncalled > 0 ? `pot ${contested} (+${uncalled} uncalled, returned at the end)` : `pot ${contested}`;
        lines.push(`— ${e.street[0].toUpperCase()}${e.street.slice(1)}: ${cards(e.cards)}${e.street === "flop" ? "" : ` (board ${cards(state.board.slice(0, e.street === "turn" ? 4 : 5))})`} · ${potText} —`);
        break;
      }
      case "action": {
        const tail = e.allIn ? " (all-in)" : "";
        if (e.action === "fold") lines.push(`${did(e.seat, "folds", "fold")}`);
        else if (e.action === "check") lines.push(`${did(e.seat, "checks", "check")}`);
        else if (e.action === "call") lines.push(`${did(e.seat, "calls", "call")} ${e.amount}${tail}`);
        else if (e.action === "bet") lines.push(`${did(e.seat, "bets", "bet")} ${e.amount}${tail}`);
        else lines.push(`${did(e.seat, "raises", "raise")} to ${e.to}${tail}`);
        break;
      }
      case "uncalled_return":
        lines.push(`Uncalled bet of ${e.amount} returned to ${name(e.seat)}`);
        break;
      case "show":
        lines.push(`${did(e.seat, "shows", "show")} ${cards(e.hole)} — ${describeScore(e.score)}`);
        break;
      case "muck":
        lines.push(`${did(e.seat, "mucks", "muck")}`);
        break;
      case "pot_award": {
        const total = state.result!.pots.length;
        const label = potNames(e.potIndex, total);
        const why = e.handScore !== null ? ` with ${describeScore(e.handScore)}` : e.eligible.length === 1 && !state.result!.showdown ? " (everyone else folded)" : "";
        if (e.winners.length === 1) {
          lines.push(`${did(e.winners[0], "wins", "win")} ${label}, ${e.amount}${why}`);
        } else {
          const split = e.awards.map((a) => `${name(a.seat)} ${a.amount}`).join(", ");
          lines.push(`${e.winners.map(name).join(" and ")} split ${label}, ${e.amount}${why}: ${split}`);
        }
        break;
      }
      case "hand_end": {
        const net = state.result!.net;
        lines.push(
          "Result: " +
            net
              .map((n, seat) => (n === null ? null : `${name(seat)} ${n >= 0 ? "+" : ""}${n}`))
              .filter((x) => x !== null)
              .join(", "),
        );
        break;
      }
    }
  }
  return lines;
}
