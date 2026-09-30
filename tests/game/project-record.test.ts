import { describe, expect, it } from "vitest";
import { potAfterEvent, startHand, applyAction, legalActions, type HandState } from "../../src/engine/hand.ts";
import { projectEvents } from "../../src/engine/project.ts";
import { recordHand, replayRecord } from "../../src/engine/record.ts";
import { createRng } from "../../src/engine/rng.ts";
import { play, scenario, scenarioConfig } from "../helpers/scenario.ts";

function randomHand(seed: string, stacks: number[]): HandState {
  const rng = createRng(seed);
  let s = startHand(scenarioConfig({ stacks, seed, button: rng.int(stacks.length) }));
  while (s.toAct >= 0) {
    const l = legalActions(s)!;
    const roll = rng.float();
    const action =
      roll < 0.12 ? { seat: l.seat, type: "fold" as const }
      : roll < 0.6 || !l.canRaise ? (l.canCheck ? { seat: l.seat, type: "check" as const } : { seat: l.seat, type: "call" as const })
      : { seat: l.seat, type: "raise" as const, to: l.minRaiseTo + rng.int(l.maxRaiseTo - l.minRaiseTo + 1) };
    s = applyAction(s, action);
  }
  return s;
}

describe("projecting a hand up to any point", () => {
  it("after the last event, matches the engine's final state, for 1,500 random hands", () => {
    for (let i = 0; i < 1500; i++) {
      const stacks = [[200, 150, 300, 80, 200, 120], [40, 400, 100, 200], [100, 100], [7, 50, 200]][i % 4];
      const s = randomHand(`proj-${i}`, stacks);
      const d = projectEvents(s.config, s.events, s.events.length);
      expect(d.complete).toBe(true);
      expect(d.street).toBe("complete");
      expect(d.board).toEqual(s.board);
      expect(d.pot).toBe(0); // everything has been paid out
      expect(d.uncalled).toBeNull();
      for (const p of s.players) {
        if (!p) continue;
        const seat = d.seats[p.seat]!;
        expect(seat.stack).toBe(p.stack);
        expect(seat.folded).toBe(p.folded);
        expect(seat.bet).toBe(0);
      }
    }
  });

  it("shows other players' cards only after they are shown, and never before", () => {
    for (let i = 0; i < 300; i++) {
      const s = randomHand(`reveal-${i}`, [200, 150, 300, 80]);
      const firstShow = s.events.findIndex((e) => e.type === "show");
      for (let n = 0; n <= s.events.length; n++) {
        const d = projectEvents(s.config, s.events, n);
        const anyRevealed = d.seats.some((p) => p?.revealed);
        if (firstShow < 0 || n <= firstShow) expect(anyRevealed).toBe(false);
        else expect(anyRevealed).toBe(true);
      }
    }
  });

  it("the board grows 0, 3, 4, 5 and never shrinks", () => {
    const s = randomHand("board-growth", [100, 100, 100]);
    let prev = 0;
    for (let n = 0; n <= s.events.length; n++) {
      const len = projectEvents(s.config, s.events, n).board.length;
      expect([0, 3, 4, 5]).toContain(len);
      expect(len).toBeGreaterThanOrEqual(prev);
      prev = len;
    }
  });

  it("the pot shown while betting matches the engine's own pot figure", () => {
    const s = randomHand("pot-match", [200, 200, 200, 200]);
    for (let n = 1; n <= s.events.length; n++) {
      const last = s.events[n - 1];
      if (last.type === "pot_award" || last.type === "hand_end") continue;
      const d = projectEvents(s.config, s.events, n);
      const expected = potAfterEvent(s.events, n - 1).contested;
      const awardedBefore = s.events.slice(0, n).some((e) => e.type === "pot_award");
      if (!awardedBefore) expect(d.pot).toBe(expected);
    }
  });

  it("labels actions the way players read them", () => {
    let s = scenario({ stacks: [200, 200, 200] });
    s = play(s, [[0, "raise", 6], [1, "call"], [2, "fold"]]);
    // Look at the table just before the flop is dealt.
    const d = projectEvents(s.config, s.events, s.events.findIndex((e) => e.type === "deal_board"));
    expect(d.seats[0]!.lastAction).toBe("Raise to 6");
    expect(d.seats[1]!.lastAction).toBe("Call 5");
    expect(d.seats[2]!.lastAction).toBe("Fold");
  });

  it("clears the street's labels when a new street is dealt but keeps folds and all-ins", () => {
    let s = scenario({ stacks: [200, 200, 30] });
    s = play(s, [[0, "raise", 6], [1, "call"], [2, "raise", 30]]);
    s = play(s, [[0, "call"], [1, "call"]]);
    const flop = s.events.findIndex((e) => e.type === "deal_board");
    const d = projectEvents(s.config, s.events, flop + 1);
    expect(d.seats[2]!.lastAction).toBe("All-in 30");
    expect(d.seats[0]!.lastAction).toBeNull();
    expect(d.seats[0]!.bet).toBe(0);
  });

  it("holds an uncalled bet aside and returns it when its event arrives", () => {
    const s = play(scenario({ stacks: [1000, 100] }), [[0, "raise", 1000], [1, "call"]]);
    const flop = s.events.findIndex((e) => e.type === "deal_board");
    const at = projectEvents(s.config, s.events, flop + 1);
    expect(at.uncalled).toEqual({ seat: 0, amount: 900 });
    expect(at.pot).toBe(200);
    const returned = s.events.findIndex((e) => e.type === "uncalled_return");
    const after = projectEvents(s.config, s.events, returned + 1);
    expect(after.uncalled).toBeNull();
    expect(after.seats[0]!.stack).toBe(900);
  });

  it("reports the winning hand and chips won", () => {
    const s = play(scenario({ stacks: [100, 100], holes: { 0: "AsAd", 1: "KdKc" }, board: "2c 7d Jh 9s 3d" }), [[0, "raise", 100], [1, "call"]]);
    const d = projectEvents(s.config, s.events, s.events.length);
    expect(d.seats[0]!.won).toBe(200);
    expect(d.seats[0]!.winningHand).toBe("Pair of Aces");
    expect(d.seats[1]!.won).toBe(0);
    expect(d.seats[1]!.revealed).not.toBeNull();
  });
});

describe("hand records", () => {
  it("replays exactly from the stored cards, even after a JSON round trip", () => {
    for (let i = 0; i < 200; i++) {
      const s = randomHand(`record-${i}`, [200, 150, 300, 80, 200, 120]);
      const rec = recordHand(s, 0);
      const back = JSON.parse(JSON.stringify(rec));
      const replayed = replayRecord(back);
      expect(replayed.events).toEqual(s.events);
      expect(replayed.result).toEqual(s.result);
      expect(back.config.deck).toBeUndefined();
    }
  });

  it("notes who sat where and how each opponent was set up", () => {
    const s = randomHand("opponents", [200, 150, 300]);
    const rec = recordHand(s, 0, [null, "caller", "wild"]);
    expect(rec.opponents).toEqual([
      { seat: 0, name: "Ann", style: null },
      { seat: 1, name: "Ben", style: "caller" },
      { seat: 2, name: "Cat", style: "wild" },
    ]);
    expect(rec.heroSeat).toBe(0);
  });

  it("refuses to record a hand that is still going", () => {
    expect(() => recordHand(scenario({ stacks: [100, 100] }), 0)).toThrow();
  });

  // Not a feature yet: this only proves the record holds enough to review decisions later
  // (pot size, the price of a call, your cards and what you chose at each decision).
  it("contains everything needed to rebuild the pot odds at each decision the hero faced", () => {
    let s = scenario({ stacks: [200, 200, 200], holes: { 0: "AsKs", 1: "7d2c", 2: "QhJh" }, board: "Ah 9d 4c Kd 2h" });
    s = play(s, [[0, "raise", 6], [1, "call"], [2, "fold"]]);
    s = play(s, [[1, "check"], [0, "raise", 8], [1, "call"]]);
    s = play(s, [[1, "check"], [0, "check"]]);
    s = play(s, [[1, "check"], [0, "check"]]);
    const rec = recordHand(s, 0);
    const replay = replayRecord(rec);
    const decisions: Array<{ street: string; pot: number; toCall: number; potOdds: number | null; hole: readonly number[]; board: number; action: string }> = [];
    let state = startHand({ ...replay.config });
    for (const a of rec.actions) {
      if (a.seat === rec.heroSeat) {
        const l = legalActions(state)!;
        decisions.push({
          street: state.street,
          pot: l.pot,
          toCall: l.callAmount,
          potOdds: l.callAmount > 0 ? l.callAmount / (l.pot + l.callAmount) : null,
          hole: state.players[0]!.hole,
          board: state.board.length,
          action: a.type,
        });
      }
      state = applyAction(state, a);
    }
    expect(decisions.map((d) => d.street)).toEqual(["preflop", "flop", "turn", "river"]);
    expect(decisions[0]).toMatchObject({ street: "preflop", pot: 3, toCall: 2, action: "raise" });
    expect(decisions[1]).toMatchObject({ street: "flop", toCall: 0, action: "raise" });
    expect(decisions[0].hole).toHaveLength(2);
  });
});
