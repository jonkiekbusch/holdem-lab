import { describe, expect, it } from "vitest";
import { formatHand } from "../../src/engine/log.ts";
import { play, scenario, stackOf } from "../helpers/scenario.ts";

const BOARD = "2c 7d Jh Ks 3d";
const ROYAL = "As Ks Qs Js Ts";

describe("side pots", () => {
  // Four players all in for 100 / 200 / 300 / 400. The biggest stack's extra 100 has no caller.
  const fourWayAllIn = (holes: Record<number, string>) =>
    play(scenario({ stacks: [100, 200, 300, 400], holes, board: BOARD }), [
      [3, "raise", 400],
      [0, "call"],
      [1, "call"],
      [2, "call"],
    ]);

  it("builds a main pot and two side pots, and returns the uncalled 100", () => {
    const s = fourWayAllIn({ 0: "KdKc", 1: "AsAd", 2: "QsQd", 3: "9h8h" });
    const pots = s.result!.pots;
    expect(pots.map((p) => p.amount)).toEqual([400, 300, 200]);
    expect(pots.map((p) => p.eligible)).toEqual([[0, 1, 2, 3], [1, 2, 3], [2, 3]]);
    expect(s.events.find((e) => e.type === "uncalled_return")).toMatchObject({ seat: 3, amount: 100 });
  });

  it("pays each pot to the best hand among the players it covers", () => {
    const s = fourWayAllIn({ 0: "KdKc", 1: "AsAd", 2: "QsQd", 3: "9h8h" });
    expect(s.result!.pots.map((p) => p.winners)).toEqual([[0], [1], [2]]);
    expect([0, 1, 2, 3].map((seat) => stackOf(s, seat))).toEqual([400, 300, 200, 100]);
  });

  it("lets the biggest stack win everything it covers, and keeps chips conserved", () => {
    const s = fourWayAllIn({ 0: "4d4h", 1: "5d5h", 2: "6d6h", 3: "AsAd" });
    expect([0, 1, 2, 3].map((seat) => stackOf(s, seat))).toEqual([0, 0, 0, 1000]);
  });

  it("lets one player win every pot they are in when they hold the best hand", () => {
    // Seat 1 has trips (kings with the king on the board), so it wins the main pot and the first side pot.
    const s = fourWayAllIn({ 0: "AsAd", 1: "KdKc", 2: "QsQd", 3: "9h8h" });
    expect(s.result!.pots.map((p) => p.winners)).toEqual([[1], [1], [2]]);
    expect(stackOf(s, 1)).toBe(700);
  });

  it("gives the main pot to the short stack when it has the nuts and the side pots to the next best", () => {
    const s = fourWayAllIn({ 0: "KdKc", 1: "QsQd", 2: "AsAd", 3: "9h8h" });
    expect(s.result!.pots.map((p) => p.winners)).toEqual([[0], [2], [2]]);
    expect([0, 1, 2, 3].map((seat) => stackOf(s, seat))).toEqual([400, 0, 500, 100]);
  });

  it("has the everyone-folded-but-one winner take all the side pots too", () => {
    let s = scenario({ stacks: [100, 200, 300] });
    s = play(s, [[0, "raise", 100], [1, "raise", 200], [2, "call"]]);
    // seat 2 still has 100 behind; seats 0 and 1 are all-in: hand runs out
    expect(s.street).toBe("complete");
    expect(s.result!.pots).toHaveLength(2);
    expect(s.result!.pots[0].amount).toBe(300);
    expect(s.result!.pots[1].amount).toBe(200);
  });

  it("counts chips from players who folded as dead money in the pot", () => {
    let s = scenario({ stacks: [100, 100, 50, 100], holes: { 0: "2d2h", 1: "4d4h", 2: "KdKc", 3: "AsAd" }, board: BOARD });
    s = play(s, [[3, "raise", 20], [0, "call"], [1, "call"], [2, "raise", 50], [3, "call"], [0, "fold"], [1, "fold"]]);
    // 50 + 50 from the two live players, 20 + 20 dead, plus 2 more... all on one eligible set
    expect(s.result!.pots).toHaveLength(1);
    expect(s.result!.pots[0].amount).toBe(140);
    expect(s.result!.pots[0].eligible).toEqual([2, 3]);
    expect(s.result!.pots[0].winners).toEqual([2]);
    expect(stackOf(s, 2)).toBe(140);
  });
});

describe("split pots and the odd chip", () => {
  it("splits a pot evenly when the board plays", () => {
    const s = play(scenario({ stacks: [100, 100], holes: { 0: "2c3d", 1: "4c5d" }, board: ROYAL }), [[0, "raise", 100], [1, "call"]]);
    expect(s.result!.pots).toHaveLength(1);
    // Odd-chip order starts left of the button (seat 0), so seat 1 is listed first.
    expect(s.result!.pots[0].winners).toEqual([1, 0]);
    expect(stackOf(s, 0)).toBe(100);
    expect(stackOf(s, 1)).toBe(100);
  });

  it("gives the odd chip to the first winner left of the button", () => {
    // Button 0. Seat 0 raises to 6, the small blind folds (1 chip of dead money), the big blind calls. Pot 13.
    let s = scenario({ stacks: [100, 100, 100], holes: { 0: "2c3d", 1: "6c7d", 2: "4c5d" }, board: ROYAL });
    s = play(s, [[0, "raise", 6], [1, "fold"], [2, "call"]]);
    for (let i = 0; i < 3; i++) s = play(s, [[2, "check"], [0, "check"]]);
    expect(s.result!.pots[0].amount).toBe(13);
    expect(s.result!.pots[0].awards).toEqual([
      { seat: 2, amount: 7 },
      { seat: 0, amount: 6 },
    ]);
  });

  it("finds 'left of the button' correctly when the order wraps past seat 0", () => {
    // Button 1, small blind seat 2, big blind seat 0. Seat 1 raises, seat 2 folds, seat 0 calls.
    let s = scenario({ stacks: [100, 100, 100], button: 1, holes: { 0: "2c3d", 1: "4c5d", 2: "6c7d" }, board: ROYAL });
    expect(s.toAct).toBe(1);
    s = play(s, [[1, "raise", 6], [2, "fold"], [0, "call"]]);
    for (let i = 0; i < 3; i++) s = play(s, [[0, "check"], [1, "check"]]);
    expect(s.result!.pots[0].amount).toBe(13);
    expect(s.result!.pots[0].awards).toEqual([
      { seat: 0, amount: 7 },
      { seat: 1, amount: 6 },
    ]);
  });

  it("splits three ways with the extra chip going first left of the button", () => {
    let s = scenario({ stacks: [50, 50, 50, 50], holes: { 0: "2c3d", 1: "8c9d", 2: "4c5d", 3: "6c7d" }, board: ROYAL });
    s = play(s, [[3, "raise", 50], [0, "call"], [1, "fold"], [2, "call"]]);
    expect(s.result!.pots[0].amount).toBe(151);
    expect(s.result!.pots[0].winners).toEqual([2, 3, 0]);
    expect(s.result!.pots[0].awards).toEqual([
      { seat: 2, amount: 51 },
      { seat: 3, amount: 50 },
      { seat: 0, amount: 50 },
    ]);
  });

  it("splits only the pots that are actually tied", () => {
    // Seats 0 and 1 tie with the same straight; seat 2 has less. Seat 0 is all-in for 50, the others for 100.
    let s = scenario({ stacks: [50, 100, 100], holes: { 0: "JcTc", 1: "JdTh", 2: "9s8h" }, board: "As Ks Qs 7d 2c" });
    s = play(s, [[0, "raise", 50], [1, "call"], [2, "call"]]);
    s = play(s, [[1, "raise", 50], [2, "call"]]);
    const pots = s.result!.pots;
    expect(pots.map((p) => p.amount)).toEqual([150, 100]);
    expect(pots[0].winners).toEqual([1, 0]); // tied, split
    expect(pots[1].winners).toEqual([1]); // seat 1 beats seat 2 outright
    expect([0, 1, 2].map((seat) => stackOf(s, seat))).toEqual([75, 175, 0]);
  });
});

describe("showdown order", () => {
  const toRiver = (holes: Record<number, string>) => {
    let s = scenario({ stacks: [100, 100, 100], holes, board: "2c 7d Jh Ks 3d" });
    s = play(s, [[0, "call"], [1, "call"], [2, "check"]]);
    s = play(s, [[1, "check"], [2, "check"], [0, "check"]]);
    s = play(s, [[1, "check"], [2, "check"], [0, "check"]]);
    return s;
  };
  const shows = (s: ReturnType<typeof toRiver>) =>
    s.events.filter((e) => e.type === "show" || e.type === "muck").map((e) => (e.type === "show" || e.type === "muck" ? `${e.type}${e.seat}` : ""));

  it("the last player to bet on the river shows first", () => {
    let s = toRiver({ 0: "AsAd", 1: "9h8h", 2: "QsQd" });
    s = play(s, [[1, "check"], [2, "raise", 4], [0, "call"], [1, "fold"]]);
    // seat 2 bet, so seat 2 shows first; seat 0's aces beat queens so seat 0 shows too
    expect(shows(s)).toEqual(["show2", "show0"]);
  });

  it("a caller with a worse hand mucks after the bettor shows", () => {
    let s = toRiver({ 0: "9h8h", 1: "6c5c", 2: "QsQd" });
    s = play(s, [[1, "check"], [2, "raise", 4], [0, "call"], [1, "fold"]]);
    expect(shows(s)).toEqual(["show2", "muck0"]);
  });

  it("with no river bet, the first player left of the button shows first", () => {
    let s = toRiver({ 0: "AsAd", 1: "9h8h", 2: "QsQd" });
    s = play(s, [[1, "check"], [2, "check"], [0, "check"]]);
    // order: seat 1 (first left of button), seat 2, seat 0
    expect(shows(s)).toEqual(["show1", "show2", "show0"]);
  });

  it("only hands that could win are shown; the rest muck", () => {
    let s = toRiver({ 0: "9h8h", 1: "AsAd", 2: "QsQd" });
    s = play(s, [[1, "check"], [2, "check"], [0, "check"]]);
    expect(shows(s)).toEqual(["show1", "muck2", "muck0"]);
  });

  it("everyone shows when a player is all-in", () => {
    const s = play(scenario({ stacks: [100, 100], holes: { 0: "AsAd", 1: "9h8h" }, board: BOARD }), [[0, "raise", 100], [1, "call"]]);
    expect(shows(s as never)).toEqual(["show1", "show0"]);
  });

  it("shows nothing when everyone else folds", () => {
    const s = play(scenario({ stacks: [100, 100, 100] }), [[0, "raise", 6], [1, "fold"], [2, "fold"]]);
    expect(s.events.some((e) => e.type === "show" || e.type === "muck")).toBe(false);
    expect(s.result!.showdown).toBe(false);
  });
});

describe("the readable log", () => {
  it("describes a hand from blinds to result", () => {
    let s = scenario({ stacks: [100, 100], holes: { 0: "AsAd", 1: "KdKc" }, board: BOARD });
    s = play(s, [[0, "raise", 100], [1, "call"]]);
    const text = formatHand(s, { showAllHoleCards: true }).join("\n");
    expect(text).toContain("Ann posts the small blind 1");
    expect(text).toContain("Ben posts the big blind 2");
    expect(text).toContain("Ann raises to 100 (all-in)");
    expect(text).toContain("Ben calls 98 (all-in)");
    expect(text).toContain("Flop: 2♣ 7♦ J♥");
    expect(text).toContain("Ben shows K♦ K♣ — Three of a kind, Kings");
    expect(text).toContain("Ben wins the pot, 200 with Three of a kind, Kings");
    expect(text).toContain("Result: Ann -100, Ben +100");
  });

  it("names side pots and splits", () => {
    const s = play(scenario({ stacks: [100, 200, 300, 400], holes: { 0: "KdKc", 1: "AsAd", 2: "QsQd", 3: "9h8h" }, board: BOARD }), [
      [3, "raise", 400],
      [0, "call"],
      [1, "call"],
      [2, "call"],
    ]);
    const text = formatHand(s).join("\n");
    expect(text).toContain("wins the main pot, 400");
    expect(text).toContain("wins side pot 1, 300");
    expect(text).toContain("wins side pot 2, 200");
    expect(text).toContain("Uncalled bet of 100 returned to Dan");
  });
});
