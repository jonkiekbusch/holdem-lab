// Helpers for writing short, readable hand scenarios in tests.

import { newDeck, parseCards, type Card } from "../../src/engine/cards.ts";
import {
  applyAction,
  holeDealOrder,
  startHand,
  type ActionType,
  type HandConfig,
  type HandState,
} from "../../src/engine/hand.ts";

const NAMES = ["Ann", "Ben", "Cat", "Dan", "Eve", "Fay"];

export interface ScenarioOptions {
  /** Stack per seat; null = empty seat. */
  stacks: readonly (number | null)[];
  button?: number;
  /** Override seats if you need dead blinds. */
  smallBlindSeat?: number | null;
  bigBlindSeat?: number;
  smallBlind?: number;
  bigBlind?: number;
  /** Hole cards by seat, e.g. { 0: "AsAd", 1: "KsKd" }. Give every dealt seat a hand to rig the deck. */
  holes?: Record<number, string>;
  /** Board, e.g. "2c 7d Jh Ks 3d". */
  board?: string;
  seed?: string;
}

function nextDealt(stacks: readonly (number | null)[], from: number): number {
  const n = stacks.length;
  for (let i = 1; i <= n; i++) {
    const seat = (from + i) % n;
    if ((stacks[seat] ?? 0) > 0) return seat;
  }
  throw new Error("nobody");
}

export function scenarioConfig(o: ScenarioOptions): HandConfig {
  const n = o.stacks.length;
  const button = o.button ?? 0;
  const dealt = o.stacks.filter((s) => (s ?? 0) > 0).length;
  let sb: number | null;
  let bb: number;
  if (dealt === 2) {
    sb = button;
    bb = nextDealt(o.stacks, button);
  } else {
    sb = nextDealt(o.stacks, button);
    bb = nextDealt(o.stacks, sb);
  }
  const config: HandConfig = {
    seats: o.stacks.map((s, i) => (s === null ? null : { name: NAMES[i % n], stack: s })),
    buttonSeat: button,
    smallBlindSeat: o.smallBlindSeat !== undefined ? o.smallBlindSeat : sb,
    bigBlindSeat: o.bigBlindSeat ?? bb,
    smallBlind: o.smallBlind ?? 1,
    bigBlind: o.bigBlind ?? 2,
    seed: o.seed ?? "scenario",
    handNumber: 1,
  };
  if (o.holes) {
    const order = holeDealOrder(config);
    const first: Card[] = [];
    const second: Card[] = [];
    for (const seat of order) {
      const cards = parseCards(o.holes[seat] ?? "");
      if (cards.length !== 2) throw new Error(`Seat ${seat} needs two hole cards`);
      first.push(cards[0]);
      second.push(cards[1]);
    }
    const board = o.board ? parseCards(o.board) : [];
    const used = [...first, ...second, ...board];
    if (new Set(used).size !== used.length) throw new Error("Duplicate card in scenario");
    const rest = newDeck().filter((c) => !used.includes(c));
    // Deal order: first cards, second cards, then the board in order, then everything else.
    config.deck = [...first, ...second, ...board, ...rest];
  }
  return config;
}

export function scenario(o: ScenarioOptions): HandState {
  return startHand(scenarioConfig(o));
}

export type Step = [seat: number, type: ActionType | "raise", to?: number] | [seat: number, type: ActionType];

/** Plays a list of [seat, action, raiseTo?] steps. */
export function play(state: HandState, steps: readonly (readonly [number, ActionType] | readonly [number, "raise", number])[]): HandState {
  let s = state;
  for (const step of steps) {
    s = applyAction(s, { seat: step[0], type: step[1], to: step[2] as number | undefined });
  }
  return s;
}

export const stackOf = (s: HandState, seat: number): number => s.players[seat]!.stack;
