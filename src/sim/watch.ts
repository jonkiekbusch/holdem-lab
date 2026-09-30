// Plays whole hands between placeholder bots. The watch page uses this; it has no screen code.

import { placeholderAction, type PlaceholderStyle } from "../bots/placeholder.ts";
import { applyAction, type HandState } from "../engine/hand.ts";
import { createRng, type Rng } from "../engine/rng.ts";
import { applyHandResult, createTable, dealNextHand, type Table } from "../engine/table.ts";
import { viewFor } from "../engine/view.ts";

export interface WatchPlayer {
  name: string;
  style: PlaceholderStyle;
  stack: number;
}

export const WATCH_PLAYERS: readonly WatchPlayer[] = [
  { name: "Ann", style: "caller", stack: 200 },
  { name: "Ben", style: "wild", stack: 80 },
  { name: "Cat", style: "careful", stack: 400 },
  { name: "Dan", style: "caller", stack: 120 },
  { name: "Eve", style: "wild", stack: 200 },
  { name: "Fay", style: "careful", stack: 60 },
];

export const REBUY_STACK = 200;

export interface WatchGame {
  table: Table;
  styles: readonly PlaceholderStyle[];
  rng: Rng;
}

export function newWatchGame(seed: string): WatchGame {
  return {
    table: createTable({
      seed,
      seats: WATCH_PLAYERS.map((p) => ({ name: p.name, stack: p.stack, sittingOut: false })),
      buttonSeat: 0,
    }),
    styles: WATCH_PLAYERS.map((p) => p.style),
    rng: createRng(`${seed}:bots`),
  };
}

/** Plays one complete hand. Busted players rebuy before the next one. Returns null if nobody can play. */
export function playWatchHand(game: WatchGame): { hand: HandState; rebuys: string[] } | null {
  // Busted players rebuy, like a real game.
  const rebuys: string[] = [];
  const seats = game.table.seats.map((s) => {
    if (s && s.stack === 0) {
      rebuys.push(s.name);
      return { ...s, stack: REBUY_STACK };
    }
    return s;
  });
  game.table = { ...game.table, seats };

  const dealt = dealNextHand(game.table);
  if (!dealt) return null;
  let hand = dealt.hand;
  while (hand.toAct >= 0) {
    const seat = hand.toAct;
    hand = applyAction(hand, placeholderAction(viewFor(hand, seat), game.styles[seat], game.rng));
  }
  game.table = applyHandResult(dealt.table, hand);
  return { hand, rebuys };
}
