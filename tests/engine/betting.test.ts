import { describe, expect, it } from "vitest";
import { IllegalActionError, actionsOf, applyAction, legalActions, replayHand, totalPot } from "../../src/engine/hand.ts";
import { play, scenario, scenarioConfig, stackOf } from "../helpers/scenario.ts";

const six = () => scenario({ stacks: [200, 200, 200, 200, 200, 200] });
const legal = (s: ReturnType<typeof six>) => legalActions(s)!;

describe("blinds and who acts", () => {
  it("posts the blinds and puts the first action left of the big blind", () => {
    const s = six();
    expect(stackOf(s, 1)).toBe(199);
    expect(stackOf(s, 2)).toBe(198);
    expect(s.toAct).toBe(3);
    expect(s.currentBet).toBe(2);
    expect(totalPot(s)).toBe(3);
    expect(s.street).toBe("preflop");
  });

  it("heads-up: the button is the small blind and acts first before the flop", () => {
    const s = scenario({ stacks: [200, 200] });
    expect(stackOf(s, 0)).toBe(199);
    expect(stackOf(s, 1)).toBe(198);
    expect(s.toAct).toBe(0);
  });

  it("heads-up: the button acts last after the flop", () => {
    const s = play(scenario({ stacks: [200, 200] }), [[0, "call"], [1, "check"]]);
    expect(s.street).toBe("flop");
    expect(s.toAct).toBe(1);
  });

  it("after the flop the first active player left of the button acts", () => {
    const s = play(six(), [[3, "call"], [4, "call"], [5, "call"], [0, "call"], [1, "call"], [2, "check"]]);
    expect(s.street).toBe("flop");
    expect(s.board).toHaveLength(3);
    expect(s.toAct).toBe(1);
  });

  it("skips folded players after the flop", () => {
    const s = play(six(), [[3, "call"], [4, "call"], [5, "call"], [0, "call"], [1, "fold"], [2, "check"]]);
    expect(s.toAct).toBe(2);
  });

  it("gives the big blind an option to check or raise when everyone limps", () => {
    const s = play(six(), [[3, "call"], [4, "call"], [5, "call"], [0, "call"], [1, "call"]]);
    expect(s.street).toBe("preflop");
    expect(s.toAct).toBe(2);
    const l = legal(s);
    expect(l.canCheck).toBe(true);
    expect(l.canRaise).toBe(true);
    expect(l.minRaiseTo).toBe(4);
  });

  it("moves to the flop after the big blind checks", () => {
    const s = play(six(), [[3, "call"], [4, "call"], [5, "call"], [0, "call"], [1, "call"], [2, "check"]]);
    expect(s.street).toBe("flop");
  });

  it("everyone folding to the big blind ends the hand without an option", () => {
    const s = play(six(), [[3, "fold"], [4, "fold"], [5, "fold"], [0, "fold"], [1, "fold"]]);
    expect(s.street).toBe("complete");
    expect(s.toAct).toBe(-1);
    expect(s.result!.showdown).toBe(false);
    expect(s.result!.net![2]).toBe(1);
    expect(s.result!.net![1]).toBe(-1);
  });

  it("deals the board one street at a time: 3, 1, 1", () => {
    let s = play(scenario({ stacks: [200, 200] }), [[0, "call"], [1, "check"]]);
    expect(s.board).toHaveLength(3);
    s = play(s, [[1, "check"], [0, "check"]]);
    expect(s.street).toBe("turn");
    expect(s.board).toHaveLength(4);
    s = play(s, [[1, "check"], [0, "check"]]);
    expect(s.street).toBe("river");
    expect(s.board).toHaveLength(5);
    s = play(s, [[1, "check"], [0, "check"]]);
    expect(s.street).toBe("complete");
    expect(s.result!.showdown).toBe(true);
  });

  it("plays a short-stacked big blind all-in on the blind", () => {
    const s = scenario({ stacks: [200, 200, 1] });
    expect(s.players[2]!.allIn).toBe(true);
    expect(s.players[2]!.committed).toBe(1);
    expect(s.toAct).toBe(0);
  });

  it("needs two players with chips", () => {
    expect(() => scenario({ stacks: [200, 0, null] })).toThrow();
  });

  it("rejects a blind seat that is not in the hand", () => {
    expect(() => scenario({ stacks: [200, 200, 200], bigBlindSeat: 5 })).toThrow();
  });
});

describe("what each player may do", () => {
  it("first to act before the flop: call 2, min-raise to 4, up to the whole stack", () => {
    const l = legal(six());
    expect(l.canCheck).toBe(false);
    expect(l.callAmount).toBe(2);
    expect(l.canRaise).toBe(true);
    expect(l.minRaiseTo).toBe(4);
    expect(l.maxRaiseTo).toBe(200);
  });

  it("a min-raise equals the previous raise size", () => {
    let s = six();
    s = play(s, [[3, "raise", 6]]); // raised by 4
    expect(legal(s).minRaiseTo).toBe(10);
    s = play(s, [[4, "raise", 20]]); // raised by 14
    expect(legal(s).minRaiseTo).toBe(34);
    s = play(s, [[5, "raise", 34]]); // a min-raise
    expect(legal(s).minRaiseTo).toBe(48);
  });

  it("the minimum bet after the flop is the big blind, and the raise size follows the bet", () => {
    let s = play(scenario({ stacks: [200, 200] }), [[0, "call"], [1, "check"]]);
    expect(legal(s).minRaiseTo).toBe(2);
    expect(legal(s).canCheck).toBe(true);
    s = play(s, [[1, "raise", 10]]);
    expect(legal(s).callAmount).toBe(10);
    expect(legal(s).minRaiseTo).toBe(20);
    s = play(s, [[0, "raise", 30]]);
    expect(legal(s).minRaiseTo).toBe(50);
  });

  it("calling is capped at the stack", () => {
    const s = scenario({ stacks: [200, 200, 200, 5] });
    // seat 1 is the small blind, seat 2 the big blind, seat 3 acts first with 5 chips
    const after = play(s, [[3, "raise", 5]]);
    expect(after.players[3]!.allIn).toBe(true);
    const s2 = scenario({ stacks: [200, 200, 200, 200] });
    const big = play(s2, [[3, "raise", 100]]);
    const shortCall = scenario({ stacks: [30, 200, 200, 200] });
    const r = play(shortCall, [[3, "raise", 100]]);
    expect(legal(big).callAmount).toBe(100);
    expect(legal(r).callAmount).toBe(30);
  });

  it("records bets and raises under the right names", () => {
    let s = play(scenario({ stacks: [200, 200] }), [[0, "call"], [1, "check"]]);
    s = play(s, [[1, "raise", 6], [0, "raise", 18]]);
    const kinds = s.events.filter((e) => e.type === "action").map((e) => (e.type === "action" ? e.action : ""));
    expect(kinds).toEqual(["call", "check", "bet", "raise"]);
  });

  it("an all-in for less than a min-raise is allowed (it is the only raise available)", () => {
    const s = play(scenario({ stacks: [200, 200, 14] }), [[0, "raise", 10], [1, "call"]]);
    const l = legal(s);
    expect(l.seat).toBe(2);
    expect(l.canRaise).toBe(true);
    expect(l.minRaiseTo).toBe(14);
    expect(l.maxRaiseTo).toBe(14);
  });

  it("does not offer a raise when every opponent is all-in", () => {
    const s = play(scenario({ stacks: [200, 500] }), [[0, "raise", 200]]);
    const l = legal(s);
    expect(l.canRaise).toBe(false);
    expect(l.callAmount).toBe(198);
  });
});

describe("illegal actions are refused", () => {
  const refused = (fn: () => unknown) => expect(fn).toThrow(IllegalActionError);

  it("rejects the wrong player", () => {
    refused(() => applyAction(six(), { seat: 4, type: "fold" }));
    refused(() => applyAction(six(), { seat: 0, type: "call" }));
  });

  it("rejects checking into a bet", () => {
    refused(() => applyAction(six(), { seat: 3, type: "check" }));
  });

  it("rejects calling when there is nothing to call", () => {
    const s = play(scenario({ stacks: [200, 200] }), [[0, "call"], [1, "check"]]);
    refused(() => applyAction(s, { seat: 1, type: "call" }));
  });

  it.each([
    ["below the minimum", 3],
    ["zero", 0],
    ["negative", -10],
    ["above the stack", 201],
    ["a fraction", 4.5],
    ["not a number", Number.NaN],
    ["infinity", Number.POSITIVE_INFINITY],
  ])("rejects a raise %s", (_name, to) => {
    refused(() => applyAction(six(), { seat: 3, type: "raise", to }));
  });

  it("rejects a raise with no amount", () => {
    refused(() => applyAction(six(), { seat: 3, type: "raise" }));
  });

  it("rejects an unknown action", () => {
    refused(() => applyAction(six(), { seat: 3, type: "shrug" as never }));
  });

  it("rejects any action once the hand is over", () => {
    const s = play(six(), [[3, "fold"], [4, "fold"], [5, "fold"], [0, "fold"], [1, "fold"]]);
    refused(() => applyAction(s, { seat: 2, type: "check" }));
    expect(legalActions(s)).toBeNull();
  });

  it("does not change the state when it refuses an action", () => {
    const s = six();
    const before = JSON.stringify(s);
    try {
      applyAction(s, { seat: 3, type: "raise", to: 3 });
    } catch {
      /* expected */
    }
    expect(JSON.stringify(s)).toBe(before);
  });

  it("never mutates the state it is given", () => {
    const s = six();
    const before = JSON.stringify(s);
    applyAction(s, { seat: 3, type: "call" });
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("all-ins that do not reopen the betting", () => {
  it("a short all-in raise does not let players who already acted raise again", () => {
    let s = play(scenario({ stacks: [200, 200, 14] }), [[0, "raise", 10], [1, "call"], [2, "raise", 14]]);
    expect(s.currentBet).toBe(14);
    expect(s.lastRaiseSize).toBe(8); // still the last FULL raise
    let l = legal(s);
    expect(l.seat).toBe(0);
    expect(l.canRaise).toBe(false);
    expect(l.callAmount).toBe(4);
    expect(() => applyAction(s, { seat: 0, type: "raise", to: 40 })).toThrow(IllegalActionError);
    s = play(s, [[0, "call"]]);
    l = legal(s);
    expect(l.seat).toBe(1);
    expect(l.canRaise).toBe(false);
    s = play(s, [[1, "call"]]);
    expect(s.street).toBe("flop");
  });

  it("a full all-in raise does reopen the betting", () => {
    const s = play(scenario({ stacks: [200, 200, 30] }), [[0, "raise", 10], [1, "call"], [2, "raise", 30]]);
    expect(s.lastRaiseSize).toBe(20);
    const l = legal(s);
    expect(l.seat).toBe(0);
    expect(l.canRaise).toBe(true);
    expect(l.minRaiseTo).toBe(50);
  });

  it("after a short all-in, a player who has not acted can raise, by the last full raise size", () => {
    let s = play(scenario({ stacks: [200, 200, 17] }), [[0, "call"], [1, "call"], [2, "check"]]);
    expect(s.street).toBe("flop");
    s = play(s, [[1, "raise", 10], [2, "raise", 15]]); // seat 2 all-in, only 5 more: short
    expect(s.lastRaiseSize).toBe(10);
    const l = legal(s);
    expect(l.seat).toBe(0);
    expect(l.canRaise).toBe(true);
    expect(l.minRaiseTo).toBe(25);
    s = play(s, [[0, "call"]]);
    const l1 = legal(s);
    expect(l1.seat).toBe(1);
    expect(l1.canRaise).toBe(false);
    expect(l1.callAmount).toBe(5);
  });

  it("a raise by someone else reopens the betting for players who had acted", () => {
    let s = play(scenario({ stacks: [200, 200, 200] }), [[0, "call"], [1, "call"], [2, "check"]]);
    s = play(s, [[1, "raise", 10], [2, "call"], [0, "raise", 40]]);
    const l = legal(s);
    expect(l.seat).toBe(1);
    expect(l.canRaise).toBe(true);
    expect(l.minRaiseTo).toBe(70);
  });
});

describe("running out the board", () => {
  it("deals every remaining street when everyone is all-in", () => {
    const s = play(scenario({ stacks: [100, 100] }), [[0, "raise", 100], [1, "call"]]);
    expect(s.street).toBe("complete");
    expect(s.board).toHaveLength(5);
    const streets = s.events.filter((e) => e.type === "deal_board").map((e) => (e.type === "deal_board" ? e.street : ""));
    expect(streets).toEqual(["flop", "turn", "river"]);
    expect(s.result!.showdown).toBe(true);
  });

  it("runs out the board when only one player still has chips and is not facing a bet", () => {
    let s = play(scenario({ stacks: [200, 20, 200] }), [[0, "raise", 20], [1, "call"], [2, "call"]]);
    // seat 1 is all-in; seats 0 and 2 still play the flop
    expect(s.street).toBe("flop");
    s = play(s, [[2, "raise", 50], [0, "fold"]]);
    // seat 1 is all-in, seat 2 bet 50 and nobody can call: the hand runs out
    expect(s.street).toBe("complete");
    expect(s.board).toHaveLength(5);
  });

  it("returns the part of a bet nobody could call", () => {
    const s = play(scenario({ stacks: [200, 50] }), [[0, "raise", 200], [1, "call"]]);
    const back = s.events.find((e) => e.type === "uncalled_return");
    expect(back).toMatchObject({ seat: 0, amount: 150 });
  });

  it("returns an uncalled raise when everyone folds", () => {
    const s = play(scenario({ stacks: [200, 200] }), [[0, "raise", 100], [1, "fold"]]);
    const back = s.events.find((e) => e.type === "uncalled_return");
    expect(back).toMatchObject({ seat: 0, amount: 98 });
    expect(s.result!.net![0]).toBe(2);
    expect(s.result!.net![1]).toBe(-2);
  });
});

describe("replaying a hand", () => {
  it("the same config and actions reproduce the hand exactly", () => {
    const config = scenarioConfig({ stacks: [200, 200, 200, 200], seed: "replay-1" });
    let s = replayHand(config, []);
    s = play(s, [[3, "raise", 8], [0, "call"], [1, "fold"], [2, "call"]]);
    s = play(s, [[2, "raise", 12], [3, "call"], [0, "fold"]]);
    s = play(s, [[2, "check"], [3, "raise", 40], [2, "call"]]);
    const again = replayHand(config, actionsOf(s));
    expect(JSON.stringify(again)).toBe(JSON.stringify(s));
  });

  it("the same seed deals the same cards and a different seed does not", () => {
    const a = scenario({ stacks: [200, 200, 200], seed: "s1" });
    const b = scenario({ stacks: [200, 200, 200], seed: "s1" });
    const c = scenario({ stacks: [200, 200, 200], seed: "s2" });
    expect(a.players.map((p) => p?.hole)).toEqual(b.players.map((p) => p?.hole));
    expect(a.players.map((p) => p?.hole)).not.toEqual(c.players.map((p) => p?.hole));
  });
});
