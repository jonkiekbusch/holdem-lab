// Turns a hand into readable text lines. Pure text; the screen just prints the lines.

import { cardPretty, type Card } from "./cards.ts";
import { describeScore } from "./evaluator.ts";
import type { HandState } from "./hand.ts";

const cards = (list: readonly Card[]): string => list.map(cardPretty).join(" ");

export interface FormatOptions {
  /** Show every player's hole cards at the start (for the watch page; a real game never does). */
  showAllHoleCards?: boolean;
}

export function formatHand(state: HandState, options: FormatOptions = {}): string[] {
  const name = (seat: number): string => state.config.seats[seat]?.name ?? `Seat ${seat + 1}`;
  const lines: string[] = [];
  let pot = 0;
  const potNames = (index: number, total: number): string => (total === 1 ? "the pot" : index === 0 ? "the main pot" : `side pot ${index}`);

  for (const e of state.events) {
    switch (e.type) {
      case "hand_start": {
        const sb = e.smallBlindSeat === null ? "no small blind (dead)" : `small blind ${name(e.smallBlindSeat)}`;
        lines.push(`Hand #${e.handNumber} · button ${name(e.buttonSeat)} · ${sb} · big blind ${name(e.bigBlindSeat)} · ${state.config.smallBlind}/${state.config.bigBlind}`);
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
        pot += e.amount;
        lines.push(`${name(e.seat)} posts the ${e.blind} blind ${e.amount}${e.allIn ? " (all-in)" : ""}`);
        break;
      case "deal_board":
        lines.push(`— ${e.street[0].toUpperCase()}${e.street.slice(1)}: ${cards(e.cards)}${e.street === "flop" ? "" : ` (board ${cards(state.board.slice(0, e.street === "turn" ? 4 : 5))})`} · pot ${pot} —`);
        break;
      case "action": {
        pot += e.amount;
        const tail = e.allIn ? " (all-in)" : "";
        if (e.action === "fold") lines.push(`${name(e.seat)} folds`);
        else if (e.action === "check") lines.push(`${name(e.seat)} checks`);
        else if (e.action === "call") lines.push(`${name(e.seat)} calls ${e.amount}${tail}`);
        else if (e.action === "bet") lines.push(`${name(e.seat)} bets ${e.amount}${tail}`);
        else lines.push(`${name(e.seat)} raises to ${e.to}${tail}`);
        break;
      }
      case "uncalled_return":
        pot -= e.amount;
        lines.push(`Uncalled bet of ${e.amount} returned to ${name(e.seat)}`);
        break;
      case "show":
        lines.push(`${name(e.seat)} shows ${cards(e.hole)} — ${describeScore(e.score)}`);
        break;
      case "muck":
        lines.push(`${name(e.seat)} mucks`);
        break;
      case "pot_award": {
        const total = state.result!.pots.length;
        const label = potNames(e.potIndex, total);
        const why = e.handScore !== null ? ` with ${describeScore(e.handScore)}` : e.eligible.length === 1 && !state.result!.showdown ? " (everyone else folded)" : "";
        if (e.winners.length === 1) {
          lines.push(`${name(e.winners[0])} wins ${label}, ${e.amount}${why}`);
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
