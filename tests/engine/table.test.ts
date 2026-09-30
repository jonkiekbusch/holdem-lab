import { describe, expect, it } from "vitest";
import { applyHandResult, createTable, dealNextHand, liveSeats, prepareNextHand, rebuySeat, type Table, type TableSeat } from "../../src/engine/table.ts";
import { holeDealOrder } from "../../src/engine/hand.ts";

const NAMES = ["Ann", "Ben", "Cat", "Dan", "Eve", "Fay"];
const seat = (i: number, stack = 200): TableSeat => ({ name: NAMES[i], stack, sittingOut: false });
const full = (opts: { buttonSeat?: number } = {}): Table =>
  createTable({ seed: "t", seats: NAMES.map((_, i) => seat(i)), ...opts });

/** Positions of the next n hands, advancing the table each time. */
function positions(table: Table, n: number) {
  const out: Array<{ button: number; sb: number | null; bb: number }> = [];
  let t = table;
  for (let i = 0; i < n; i++) {
    const next = prepareNextHand(t)!;
    out.push({ button: next.config.buttonSeat, sb: next.config.smallBlindSeat, bb: next.config.bigBlindSeat });
    t = next.table;
  }
  return out;
}

describe("button and blinds", () => {
  it("starts with the button on seat 0, small blind 1, big blind 2", () => {
    expect(positions(full(), 1)[0]).toEqual({ button: 0, sb: 1, bb: 2 });
  });

  it("starts from a chosen button", () => {
    expect(positions(full({ buttonSeat: 4 }), 1)[0]).toEqual({ button: 4, sb: 5, bb: 0 });
  });

  it("moves everything one seat clockwise each hand", () => {
    const p = positions(full(), 4);
    expect(p).toEqual([
      { button: 0, sb: 1, bb: 2 },
      { button: 1, sb: 2, bb: 3 },
      { button: 2, sb: 3, bb: 4 },
      { button: 3, sb: 4, bb: 5 },
    ]);
  });

  it("wraps around the table", () => {
    const p = positions(full(), 8);
    expect(p[4]).toEqual({ button: 4, sb: 5, bb: 0 });
    expect(p[5]).toEqual({ button: 5, sb: 0, bb: 1 });
    expect(p[6]).toEqual({ button: 0, sb: 1, bb: 2 });
  });

  it("gives every seat the button and each blind exactly twice in 12 hands", () => {
    const p = positions(full(), 12);
    for (const key of ["button", "sb", "bb"] as const) {
      for (let i = 0; i < 6; i++) expect(p.filter((x) => x[key] === i)).toHaveLength(2);
    }
  });

  it("numbers hands from 1 and seeds each hand differently", () => {
    const a = prepareNextHand(full())!;
    const b = prepareNextHand(a.table)!;
    expect(a.config.handNumber).toBe(1);
    expect(b.config.handNumber).toBe(2);
    expect(a.config.seed).not.toBe(b.config.seed);
    expect(a.table.handNumber).toBe(1);
  });

  it("the first hand's button can start on an empty seat: it moves to the next live seat", () => {
    const seats = NAMES.map((_, i) => (i === 0 ? null : seat(i)));
    const t = createTable({ seed: "t", seats });
    expect(positions(t, 1)[0]).toEqual({ button: 1, sb: 2, bb: 3 });
  });
});

describe("dead button handling", () => {
  const without = (t: Table, i: number): Table => ({ ...t, seats: t.seats.map((s, k) => (k === i ? null : s)) });

  it("skips a dead small blind instead of making someone pay it twice", () => {
    const t1 = prepareNextHand(full())!.table; // button 0, sb 1, bb 2
    const t2 = without(t1, 2); // the big blind leaves
    const next = prepareNextHand(t2)!;
    expect(next.config.bigBlindSeat).toBe(3);
    expect(next.config.smallBlindSeat).toBeNull(); // seat 2 is empty: dead small blind
    expect(next.config.buttonSeat).toBe(1); // the button does not skip ahead
  });

  it("lets the button rest on an empty seat", () => {
    let t = prepareNextHand(full())!.table;
    t = without(t, 2);
    t = prepareNextHand(t)!.table; // bb 3, dead sb, button 1
    const third = prepareNextHand(t)!; // bb 4, sb 3, button = old small blind position = seat 2 (empty)
    expect(third.config.buttonSeat).toBe(2);
    expect(third.table.seats[2]).toBeNull();
    expect(third.config.smallBlindSeat).toBe(3);
    expect(third.config.bigBlindSeat).toBe(4);
    // the first card goes to the first live player after the empty button seat
    expect(holeDealOrder(third.config)[0]).toBe(3);
  });

  it("never makes the same player pay the big blind twice in a row when seats come and go", () => {
    let t = full();
    let last = -1;
    for (let i = 0; i < 60; i++) {
      if (i % 7 === 3) t = { ...t, seats: t.seats.map((s, k) => (k === (i % 5) + 1 ? null : s)) };
      if (i % 11 === 5) t = { ...t, seats: t.seats.map((s, k) => (s ? s : seat(k))) };
      const next = prepareNextHand(t)!;
      if (liveSeats(t).length > 2) expect(next.config.bigBlindSeat).not.toBe(last);
      last = next.config.bigBlindSeat;
      t = next.table;
    }
  });

  it("always puts the big blind on a live player", () => {
    let t = full();
    for (let i = 0; i < 40; i++) {
      if (i % 5 === 2) t = { ...t, seats: t.seats.map((s, k) => (k === i % 6 ? null : s)) };
      if (i % 9 === 4) t = { ...t, seats: t.seats.map((s, k) => (s ? s : seat(k))) };
      const next = prepareNextHand(t);
      if (!next) break;
      expect(next.table.seats[next.config.bigBlindSeat]).not.toBeNull();
      if (next.config.smallBlindSeat !== null) expect(next.table.seats[next.config.smallBlindSeat]).not.toBeNull();
      t = next.table;
    }
  });
});

describe("heads-up and short tables", () => {
  it("heads-up the button is the small blind, and the roles swap each hand", () => {
    const t = createTable({ seed: "t", seats: [seat(0), seat(1), null, null, null, null] });
    const p = positions(t, 4);
    expect(p[0]).toEqual({ button: 0, sb: 0, bb: 1 });
    expect(p[1]).toEqual({ button: 1, sb: 1, bb: 0 });
    expect(p[2]).toEqual({ button: 0, sb: 0, bb: 1 });
    expect(p[3]).toEqual({ button: 1, sb: 1, bb: 0 });
  });

  it("switches to heads-up when a player busts out", () => {
    let t = createTable({ seed: "t", seats: [seat(0), seat(1), seat(2), null, null, null] });
    t = prepareNextHand(t)!.table; // button 0, sb 1, bb 2
    t = { ...t, seats: t.seats.map((s, k) => (k === 1 && s ? { ...s, stack: 0 } : s)) }; // seat 1 busts
    const next = prepareNextHand(t)!;
    expect(next.config.bigBlindSeat).toBe(0); // next live after seat 2
    expect(next.config.smallBlindSeat).toBe(2);
    expect(next.config.buttonSeat).toBe(2); // the button is the small blind
  });

  it("returns null when fewer than two players can play", () => {
    expect(prepareNextHand(createTable({ seed: "t", seats: [seat(0), null, null, null, null, null] }))).toBeNull();
    expect(prepareNextHand(createTable({ seed: "t", seats: [seat(0), seat(1, 0), null, null, null, null] }))).toBeNull();
  });

  it("leaves out players who are sitting out or have no chips", () => {
    const t = createTable({
      seed: "t",
      seats: [seat(0), { ...seat(1), sittingOut: true }, seat(2, 0), seat(3), seat(4), seat(5)],
    });
    expect(liveSeats(t)).toEqual([0, 3, 4, 5]);
    const cfg = prepareNextHand(t)!.config;
    expect(cfg.seats[1]).toBeNull();
    expect(cfg.seats[2]).toBeNull();
    expect(holeDealOrder(cfg)).toEqual([3, 4, 5, 0]);
  });
});

describe("carrying chips between hands", () => {
  it("writes each player's chips back to the table", () => {
    const dealt = dealNextHand(full())!;
    const fold = (hand: typeof dealt.hand) => hand;
    expect(fold(dealt.hand).config.handNumber).toBe(1);
    const t = applyHandResult(dealt.table, dealt.hand);
    // blinds are posted but the hand is undecided: stacks reflect chips behind
    expect(t.seats[1]!.stack).toBe(199);
    expect(t.seats[2]!.stack).toBe(198);
  });

  it("rebuys a seat to a chosen stack", () => {
    const t = rebuySeat(full(), 3, 500);
    expect(t.seats[3]!.stack).toBe(500);
    expect(t.seats[2]!.stack).toBe(200);
  });
});
