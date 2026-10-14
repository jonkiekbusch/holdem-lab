import { describe, expect, it } from "vitest";
import { dealNextHand, createTable, applyHandResult } from "../../src/engine/table.ts";
import { applyAction, legalActions, type HandState } from "../../src/engine/hand.ts";
import { play, scenario, stackOf } from "../helpers/scenario.ts";

/** Two players, 100 chips each, all in before the flop, with chosen cards. */
function headsUpAllIn(holes: [string, string], board: string): HandState {
  return play(scenario({ stacks: [100, 100], holes: { 0: holes[0], 1: holes[1] }, board }), [[0, "raise", 100], [1, "call"]]);
}
const final = (s: HandState) => [stackOf(s, 0), stackOf(s, 1)];

describe("whole hands: the named hands win and lose correctly", () => {
  it("four of a kind beats a full house", () => {
    const s = headsUpAllIn(["9c9h", "2d2h"], "9s 9d 2c 3h 4d"); // quad nines vs deuces full of nines
    expect(final(s)).toEqual([200, 0]);
  });

  it("four of a kind on the board: the higher kicker wins", () => {
    const s = headsUpAllIn(["AcKd", "QcJd"], "9s 9d 9c 9h 2d");
    expect(final(s)).toEqual([200, 0]);
  });

  it("four of a kind on the board: equal kickers split", () => {
    const s = headsUpAllIn(["AcKd", "AdQc"], "9s 9d 9c 9h 2d");
    expect(final(s)).toEqual([100, 100]);
  });

  it("higher four of a kind beats lower four of a kind", () => {
    const s = headsUpAllIn(["7c7h", "8c8h"], "7s 7d 8s 8d 2d"); // quad sevens vs quad eights
    expect(final(s)).toEqual([0, 200]);
  });

  it("a straight flush beats four of a kind", () => {
    const s = headsUpAllIn(["6s5s", "7hAd"], "9s 8s 7s 7d 7c");
    expect(final(s)).toEqual([200, 0]);
  });

  it("a royal flush beats a lower flush", () => {
    const s = headsUpAllIn(["Ts3c", "9s4c"], "As Ks Qs Js 2d");
    expect(final(s)).toEqual([200, 0]);
  });

  it("a higher straight flush beats a lower one", () => {
    const s = headsUpAllIn(["9h8h", "4h3h"], "7h 6h 5h Kd 2c"); // nine-high vs seven-high straight flush
    expect(final(s)).toEqual([200, 0]);
  });

  it("the steel wheel (A-2-3-4-5 of one suit) is a straight flush, and loses to a six-high straight flush", () => {
    const steel = headsUpAllIn(["As9d", "KdQc"], "2s 3s 4s 5s Kc");
    expect(final(steel)).toEqual([200, 0]); // beats a pair of kings
    const lower = headsUpAllIn(["As9d", "6s9c"], "2s 3s 4s 5s Kc");
    expect(final(lower)).toEqual([0, 200]); // 2-3-4-5-6 of spades beats the steel wheel
  });

  it("the wheel A-2-3-4-5 is a real straight that beats three of a kind", () => {
    const s = headsUpAllIn(["5c9d", "KcKh"], "As 2d 3c 4h Kd");
    expect(final(s)).toEqual([200, 0]);
  });

  it("the wheel loses to a six-high straight", () => {
    const s = headsUpAllIn(["5c9d", "5h6d"], "As 2d 3c 4h Kd");
    expect(final(s)).toEqual([0, 200]);
  });

  it("the wheel beats a pair of aces, and does not wrap around (K-A-2-3-4 is not a straight)", () => {
    const wheel = headsUpAllIn(["5c9d", "AcQh"], "As 2d 3c 4h Kd");
    expect(final(wheel)).toEqual([200, 0]);
    const noWrap = headsUpAllIn(["KcQd", "AhJd"], "Ks Ad 2c 3h 4d"); // K-A-2-3-4 is nothing: pairs decide
    expect(final(noWrap)).toEqual([0, 200]); // pair of aces beats pair of kings
  });

  it("two different hole-card pairs making the same straight tie", () => {
    const s = headsUpAllIn(["5cKd", "5dQc"], "9s 8d 7c 6h 2d");
    expect(final(s)).toEqual([100, 100]);
  });

  it("two players with the same wheel tie", () => {
    const s = headsUpAllIn(["5cKd", "5hQc"], "As 2d 3c 4h 9d");
    expect(final(s)).toEqual([100, 100]);
  });

  it("the same two pair and the same kicker tie, even with different unused cards", () => {
    const s = headsUpAllIn(["Ac3c", "As4h"], "Ks Kd 7c 7h 2d");
    expect(final(s)).toEqual([100, 100]);
  });

  it("the same flush on the board ties", () => {
    const s = headsUpAllIn(["3d4d", "5d6d"], "As Ks Qs Js 2s");
    expect(final(s)).toEqual([100, 100]);
  });

  it("a pair with a better kicker wins, and equal kickers tie", () => {
    const better = headsUpAllIn(["KdQc", "KhJc"], "Ks 7d 4c 2h 9d");
    expect(final(better)).toEqual([200, 0]);
    const equal = headsUpAllIn(["KdQc", "KhQd"], "Ks 7d 4c 2h 9d");
    expect(final(equal)).toEqual([100, 100]);
  });

  it("a three-way pot where two tie: only the tied players split", () => {
    let s = scenario({ stacks: [100, 100, 100], holes: { 0: "5cKd", 1: "5dQc", 2: "2h2c" }, board: "9s 8d 7c 6h 3d" });
    s = play(s, [[0, "raise", 100], [1, "call"], [2, "call"]]);
    // seats 0 and 1 both make the same 5-9 straight; seat 2 only has a pair of deuces
    expect([0, 1, 2].map((seat) => stackOf(s, seat))).toEqual([150, 150, 0]);
  });
});

describe("split pots with an odd chip in a side pot", () => {
  it("splits the main pot (odd chip to the first winner left of the button) and awards the side pot separately", () => {
    // Seats 0 and 1 tie with the same straight, seat 2 has less. Seat 0 is all-in for 25, the others for 100.
    let s = scenario({ stacks: [25, 100, 100], holes: { 0: "JcTc", 1: "JdTh", 2: "9s8h" }, board: "As Ks Qs 7d 2c" });
    s = play(s, [[0, "raise", 25], [1, "call"], [2, "call"]]);
    s = play(s, [[1, "raise", 75], [2, "call"]]);
    expect(s.result!.pots.map((p) => p.amount)).toEqual([75, 150]);
    expect(s.result!.pots[0].awards).toEqual([
      { seat: 1, amount: 38 }, // the odd chip goes to the first seat left of the button
      { seat: 0, amount: 37 },
    ]);
    expect(s.result!.pots[1].awards).toEqual([{ seat: 1, amount: 150 }]);
    expect([0, 1, 2].map((seat) => stackOf(s, seat))).toEqual([37, 188, 0]);
  });
});

describe("heads-up blinds and button order through whole hands", () => {
  const table = () =>
    createTable({ seed: "hu", seats: [{ name: "Ann", stack: 200, sittingOut: false }, { name: "Ben", stack: 200, sittingOut: false }, null, null, null, null] });

  it("the button posts the small blind and acts first before the flop; the other player has the big blind", () => {
    const { hand } = dealNextHand(table())!;
    const button = hand.config.buttonSeat;
    const other = button === 0 ? 1 : 0;
    expect(hand.config.smallBlindSeat).toBe(button);
    expect(hand.config.bigBlindSeat).toBe(other);
    expect(hand.players[button]!.bet).toBe(1);
    expect(hand.players[other]!.bet).toBe(2);
    expect(hand.toAct).toBe(button);
  });

  it("the big blind gets the option after the button limps", () => {
    const { hand } = dealNextHand(table())!;
    const s = applyAction(hand, { seat: hand.toAct, type: "call" });
    expect(s.street).toBe("preflop");
    expect(s.toAct).toBe(hand.config.bigBlindSeat);
    expect(legalActions(s)!.canCheck).toBe(true);
    expect(legalActions(s)!.canRaise).toBe(true);
  });

  it("after the flop the non-button player acts first on every street, and the button acts last", () => {
    let { hand } = dealNextHand(table())!;
    const button = hand.config.buttonSeat;
    const other = button === 0 ? 1 : 0;
    hand = applyAction(hand, { seat: button, type: "call" });
    hand = applyAction(hand, { seat: other, type: "check" });
    for (const street of ["flop", "turn", "river"]) {
      expect(hand.street).toBe(street);
      expect(hand.toAct).toBe(other);
      hand = applyAction(hand, { seat: other, type: "check" });
      expect(hand.toAct === button || hand.street === "complete").toBe(true);
      hand = applyAction(hand, { seat: button, type: "check" });
    }
    expect(hand.street).toBe("complete");
  });

  it("the button and the big blind swap every hand, and each player pays the big blind every other hand", () => {
    let t = table();
    const buttons: number[] = [];
    const bigBlinds: number[] = [];
    for (let i = 0; i < 6; i++) {
      const dealt = dealNextHand(t)!;
      buttons.push(dealt.hand.config.buttonSeat);
      bigBlinds.push(dealt.hand.config.bigBlindSeat);
      // the small blind folds so the hand ends quickly
      const folded = applyAction(dealt.hand, { seat: dealt.hand.toAct, type: "fold" });
      t = applyHandResult(dealt.table, folded);
    }
    for (let i = 1; i < 6; i++) {
      expect(buttons[i]).not.toBe(buttons[i - 1]);
      expect(bigBlinds[i]).not.toBe(bigBlinds[i - 1]);
    }
    expect(bigBlinds.filter((b) => b === 0)).toHaveLength(3);
    // after six folded small blinds the players are back to 200 each: +1 -1 alternating
    expect(t.seats[0]!.stack).toBe(200);
    expect(t.seats[1]!.stack).toBe(200);
  });

  it("a heads-up big blind that is short posts what it has and is all-in", () => {
    const t = createTable({ seed: "hu", seats: [{ name: "Ann", stack: 200, sittingOut: false }, { name: "Ben", stack: 1, sittingOut: false }, null, null, null, null] });
    const { hand } = dealNextHand(t)!;
    const short = hand.players[1]!;
    if (hand.config.bigBlindSeat === 1) {
      expect(short.allIn).toBe(true);
      expect(short.committed).toBe(1);
    } else {
      expect(short.allIn).toBe(true); // posts its one chip as the small blind
    }
  });
});
