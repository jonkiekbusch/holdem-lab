// The table between hands: who sits where, stacks, and where the button and blinds go next.
// Uses the "moving big blind" dead-button rule: the big blind always moves to the next live
// player, the small blind goes to whoever had the big blind last hand, and the button follows.
// If a blind's owner has left, that blind is simply skipped (dead) and nobody pays it twice.

import { startHand, type HandConfig, type HandState } from "./hand.ts";

export interface TableSeat {
  name: string;
  stack: number;
  sittingOut: boolean;
}

export interface Table {
  seed: string;
  smallBlind: number;
  bigBlind: number;
  seats: readonly (TableSeat | null)[];
  /** Positions, which can point at an empty seat (a dead button). */
  buttonSeat: number;
  smallBlindSeat: number;
  bigBlindSeat: number | null;
  /** Hands dealt so far. */
  handNumber: number;
}

export interface CreateTableOptions {
  seed: string;
  seats: readonly (TableSeat | null)[];
  smallBlind?: number;
  bigBlind?: number;
  /** Where the button starts. Defaults to seat 0. */
  buttonSeat?: number;
}

export function createTable(opts: CreateTableOptions): Table {
  return {
    seed: opts.seed,
    smallBlind: opts.smallBlind ?? 1,
    bigBlind: opts.bigBlind ?? 2,
    seats: opts.seats,
    buttonSeat: opts.buttonSeat ?? 0,
    smallBlindSeat: -1,
    bigBlindSeat: null,
    handNumber: 0,
  };
}

const isLive = (s: TableSeat | null): s is TableSeat => s !== null && !s.sittingOut && s.stack > 0;

export function liveSeats(table: Table): number[] {
  return table.seats.map((s, i) => (isLive(s) ? i : -1)).filter((i) => i >= 0);
}

function nextLive(table: Table, from: number): number {
  const n = table.seats.length;
  for (let i = 1; i <= n; i++) {
    const seat = (from + i) % n;
    if (isLive(table.seats[seat])) return seat;
  }
  throw new Error("No live seats");
}

/**
 * Works out the next hand. Returns the config to give to startHand() and the table with its
 * positions advanced, or null when fewer than two players can play.
 */
export function prepareNextHand(table: Table): { config: HandConfig; table: Table } | null {
  const live = liveSeats(table);
  if (live.length < 2) return null;

  let button: number;
  let smallBlindPos: number;
  let bigBlind: number;

  if (table.bigBlindSeat === null) {
    // First hand: start from the requested button.
    button = isLive(table.seats[table.buttonSeat]) ? table.buttonSeat : nextLive(table, table.buttonSeat);
    if (live.length === 2) {
      smallBlindPos = button;
      bigBlind = nextLive(table, button);
    } else {
      smallBlindPos = nextLive(table, button);
      bigBlind = nextLive(table, smallBlindPos);
    }
  } else {
    bigBlind = nextLive(table, table.bigBlindSeat);
    if (live.length === 2) {
      // Heads-up: the button is the small blind.
      smallBlindPos = nextLive(table, bigBlind);
      button = smallBlindPos;
    } else {
      smallBlindPos = table.bigBlindSeat;
      button = table.smallBlindSeat >= 0 ? table.smallBlindSeat : (table.buttonSeat + 1) % table.seats.length;
    }
  }

  const handNumber = table.handNumber + 1;
  const config: HandConfig = {
    seats: table.seats.map((s) => (isLive(s) ? { name: s.name, stack: s.stack } : null)),
    buttonSeat: button,
    smallBlindSeat: isLive(table.seats[smallBlindPos]) ? smallBlindPos : null,
    bigBlindSeat: bigBlind,
    smallBlind: table.smallBlind,
    bigBlind: table.bigBlind,
    seed: `${table.seed}#${handNumber}`,
    handNumber,
  };
  return {
    config,
    table: { ...table, buttonSeat: button, smallBlindSeat: smallBlindPos, bigBlindSeat: bigBlind, handNumber },
  };
}

/** Puts each player's chips back on the table after a hand. */
export function applyHandResult(table: Table, hand: HandState): Table {
  const seats = table.seats.map((s, i) => {
    const p = hand.players[i];
    return s && p ? { ...s, stack: p.stack } : s;
  });
  return { ...table, seats };
}

export function rebuySeat(table: Table, seat: number, stack: number): Table {
  const seats = table.seats.map((s, i) => (i === seat && s ? { ...s, stack } : s));
  return { ...table, seats };
}

/** Convenience: prepare and start the next hand. */
export function dealNextHand(table: Table): { hand: HandState; table: Table } | null {
  const next = prepareNextHand(table);
  if (!next) return null;
  return { hand: startHand(next.config), table: next.table };
}
