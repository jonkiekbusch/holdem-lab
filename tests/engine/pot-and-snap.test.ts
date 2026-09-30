import { describe, expect, it } from "vitest";
import { ALL_IN_SNAP_BIG_BLINDS, contestedPot, legalActions, potAfterEvent, totalPot, uncalledBet } from "../../src/engine/hand.ts";
import { formatHand } from "../../src/engine/log.ts";
import { viewFor } from "../../src/engine/view.ts";
import { play, scenario } from "../helpers/scenario.ts";

describe("the pot you are actually playing for", () => {
  it("counts every chip while a bet can still be called", () => {
    const s = play(scenario({ stacks: [200, 200, 200] }), [[0, "raise", 50]]);
    expect(uncalledBet(s)).toBeNull();
    expect(contestedPot(s)).toBe(totalPot(s));
    expect(contestedPot(s)).toBe(53);
  });

  it("is the whole pot once the hand is settled (the uncalled part is already back with its owner)", () => {
    const s = play(scenario({ stacks: [1000, 100] }), [[0, "raise", 1000], [1, "call"]]);
    expect(uncalledBet(s)).toBeNull();
    expect(totalPot(s)).toBe(200);
    expect(contestedPot(s)).toBe(200);
  });

  it("step by step: an overbet that an all-in caller cannot match is left out once the round closes", () => {
    // Ann shoves 1000, Ben calls all-in for 100. The board runs out.
    const s = play(scenario({ stacks: [1000, 100] }), [[0, "raise", 1000], [1, "call"]]);
    const flop = s.events.findIndex((e) => e.type === "deal_board");
    const lastBet = flop - 1;
    // While the betting was open, the pot showed everything in the middle: 1000 + 100.
    expect(potAfterEvent(s.events, lastBet)).toEqual({ contested: 1100, uncalled: 0 });
    // The moment the flop is dealt, the 900 nobody can call is no longer part of the pot.
    expect(potAfterEvent(s.events, flop)).toEqual({ contested: 200, uncalled: 900 });
    // After the refund, the pot is just the 200 that was played for.
    const returned = s.events.findIndex((e) => e.type === "uncalled_return");
    expect(potAfterEvent(s.events, returned)).toEqual({ contested: 200, uncalled: 0 });
  });

  it("step by step: no excess is reported when every bet was called", () => {
    let s = play(scenario({ stacks: [200, 200] }), [[0, "call"], [1, "check"]]);
    s = play(s, [[1, "raise", 10], [0, "call"]]);
    const turn = s.events.findIndex((e) => e.type === "deal_board" && e.street === "turn");
    expect(potAfterEvent(s.events, turn)).toEqual({ contested: 24, uncalled: 0 });
  });

  it("step by step: a side pot situation leaves out only the biggest stack's excess", () => {
    // Four players all in for 100 / 200 / 300 / 400: the last 100 of the 400 is uncalled.
    const s = play(scenario({ stacks: [100, 200, 300, 400] }), [[3, "raise", 400], [0, "call"], [1, "call"], [2, "call"]]);
    const flop = s.events.findIndex((e) => e.type === "deal_board");
    expect(potAfterEvent(s.events, flop)).toEqual({ contested: 900, uncalled: 100 });
  });

  it("exposes the contested pot to bots through their view", () => {
    const s = play(scenario({ stacks: [200, 200, 200] }), [[0, "raise", 50]]);
    expect(viewFor(s, 1).pot).toBe(contestedPot(s));
  });
});

describe("the readable log shows the contested pot and labels the excess", () => {
  it("prints the pot without the uncalled excess and says how much came back", () => {
    // Seat 0 has far more than seat 1. Seat 0 shoves 1000 and seat 1 calls all-in for 100.
    let s = scenario({ stacks: [1000, 100] });
    s = play(s, [[0, "raise", 1000], [1, "call"]]);
    const text = formatHand(s).join("\n");
    expect(text).toContain("Flop");
    expect(text).toContain("pot 200 (+900 uncalled, returned at the end)");
    expect(text).not.toContain("pot 1100");
    expect(text).toContain("Uncalled bet of 900 returned to Ann");
  });

  it("prints a plain pot when nothing is uncalled", () => {
    let s = play(scenario({ stacks: [200, 200] }), [[0, "call"], [1, "check"]]);
    s = play(s, [[1, "check"], [0, "check"]]);
    const text = formatHand(s).join("\n");
    expect(text).toContain("Flop");
    expect(text).toContain("pot 4 —");
    expect(text).not.toContain("uncalled, returned");
  });

  it("prints a rebuy right under its own hand's header line, before the stacks", () => {
    const s = play(scenario({ stacks: [200, 200] }), [[0, "fold"]]);
    const lines = formatHand(s, { rebuys: [{ name: "Ben", amount: 200 }, { name: "Ann", amount: 200 }] });
    expect(lines[0]).toMatch(/^Hand #1/);
    expect(lines[1]).toBe("↻ Rebuy before this hand: Ben rebought 200, Ann rebought 200");
    expect(lines[2]).toMatch(/^Stacks:/);
  });

  it("prints no rebuy line when nobody rebought", () => {
    const s = play(scenario({ stacks: [200, 200] }), [[0, "fold"]]);
    expect(formatHand(s, { rebuys: [] }).some((l) => l.startsWith("↻"))).toBe(false);
    expect(formatHand(s).some((l) => l.startsWith("↻"))).toBe(false);
  });
});

describe("a raise that leaves only a sliver behind counts as all-in", () => {
  it(`snaps when fewer than ${ALL_IN_SNAP_BIG_BLINDS} big blinds would be left`, () => {
    expect(ALL_IN_SNAP_BIG_BLINDS).toBe(2);
  });

  // Heads-up, blinds 1/2. Ann (button, small blind) has 193 in total: 192 behind after the blind.
  const hu = (stack: number) => scenario({ stacks: [stack, 200] });

  it("raise to 190 with 3 chips left becomes an all-in for 193", () => {
    const s = play(hu(193), [[0, "raise", 190]]);
    const p = s.players[0]!;
    expect(p.allIn).toBe(true);
    expect(p.stack).toBe(0);
    expect(p.bet).toBe(193);
    const e = s.events.filter((x) => x.type === "action").at(-1)!;
    expect(e).toMatchObject({ action: "raise", to: 193, allIn: true });
  });

  it.each([
    [3, true],
    [2, true],
    [1, true],
    [4, false],
    [5, false],
    [10, false],
  ])("leaving %i chips behind (blinds 1/2): all-in = %s", (left, snapped) => {
    const s = play(hu(193), [[0, "raise", 193 - left]]);
    expect(s.players[0]!.allIn).toBe(snapped);
    expect(s.players[0]!.stack).toBe(snapped ? 0 : left);
  });

  it("raising the whole stack is unchanged", () => {
    const s = play(hu(193), [[0, "raise", 193]]);
    expect(s.players[0]!.allIn).toBe(true);
    expect(s.players[0]!.bet).toBe(193);
  });

  it("a min-raise that would leave a sliver also becomes all-in", () => {
    // Ann has 6 chips in total: a raise to 4 would leave 2 (< 4), so she is all-in for 6.
    const s = play(scenario({ stacks: [6, 200] }), [[0, "raise", 4]]);
    expect(s.players[0]!.allIn).toBe(true);
    expect(s.players[0]!.bet).toBe(6);
  });

  it("applies after the flop too", () => {
    let s = play(scenario({ stacks: [200, 200] }), [[0, "call"], [1, "check"]]);
    // each has 198 behind; a bet of 195 leaves 3
    s = play(s, [[1, "raise", 195]]);
    expect(s.players[1]!.allIn).toBe(true);
    expect(s.players[1]!.bet).toBe(198);
  });

  it("scales with the big blind", () => {
    const cfg = () => scenario({ stacks: [1000, 1000], bigBlind: 20, smallBlind: 10 });
    // with blinds 10/20 the threshold is 40 chips
    const a = play(cfg(), [[0, "raise", 1000 - 39]]);
    expect(a.players[0]!.allIn).toBe(true);
    const b = play(cfg(), [[0, "raise", 1000 - 40]]);
    expect(b.players[0]!.allIn).toBe(false);
  });

  it("does not change the legal range offered to the player", () => {
    const s = hu(193);
    const l = legalActions(s)!;
    expect(l.maxRaiseTo).toBe(193);
    expect(l.minRaiseTo).toBe(4);
  });

  it("the opponent then faces an all-in: no raise is offered, only call or fold", () => {
    const s = play(hu(193), [[0, "raise", 190]]);
    const l = legalActions(s)!;
    expect(l.seat).toBe(1);
    expect(l.canRaise).toBe(false);
    expect(l.callAmount).toBe(191);
  });
});
