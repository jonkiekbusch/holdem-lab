// A complete, self-contained record of one finished hand: who sat where, every card dealt, and every action.
// This is enough to replay the hand exactly, even if the shuffle code changes later, and to work out
// afterwards what the pot, the price of a call and your hand were at each of your decisions.
// (Saving records to the device and reviewing them comes in a later phase; for now they are kept in memory.)

import { newDeck, type Card } from "./cards.ts";
import { actionsOf, holeDealOrder, replayHand, type Action, type HandConfig, type HandState } from "./hand.ts";

export interface HandRecord {
  version: 1;
  handNumber: number;
  heroSeat: number;
  config: Omit<HandConfig, "deck">;
  cards: {
    holes: Record<number, [Card, Card]>;
    board: Card[];
  };
  actions: Action[];
  /** Who sat where and how they were set up to play (for reviewing hands later). */
  opponents: { seat: number; name: string; style: string | null }[];
  /** Per seat: final stack minus starting stack (null for seats not dealt in). */
  net: (number | null)[];
}

export function recordHand(state: HandState, heroSeat: number, styles: readonly (string | null)[] = []): HandRecord {
  if (state.street !== "complete") throw new Error("Only finished hands can be recorded");
  const { deck: _deck, ...config } = state.config;
  const holes: Record<number, [Card, Card]> = {};
  for (const p of state.players) if (p) holes[p.seat] = [p.hole[0], p.hole[1]];
  return {
    version: 1,
    handNumber: state.config.handNumber,
    heroSeat,
    config: { ...config, seats: config.seats.map((s) => (s ? { ...s } : null)) },
    cards: { holes, board: [...state.board] },
    actions: actionsOf(state),
    opponents: state.players.flatMap((p) => (p ? [{ seat: p.seat, name: p.name, style: styles[p.seat] ?? null }] : [])),
    net: [...state.result!.net],
  };
}

/** Replays a record using the cards it stored, not the shuffle. */
export function replayRecord(record: HandRecord): HandState {
  const config: HandConfig = { ...record.config };
  const order = holeDealOrder(config);
  const first = order.map((seat) => record.cards.holes[seat][0]);
  const second = order.map((seat) => record.cards.holes[seat][1]);
  const used = [...first, ...second, ...record.cards.board];
  const rest = newDeck().filter((c) => !used.includes(c));
  config.deck = [...first, ...second, ...record.cards.board, ...rest];
  return replayHand(config, record.actions);
}
