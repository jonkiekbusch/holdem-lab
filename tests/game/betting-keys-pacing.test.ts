import { describe, expect, it } from "vitest";
import { IllegalActionError, applyAction, legalActions, startHand, type HandState } from "../../src/engine/hand.ts";
import { createRng } from "../../src/engine/rng.ts";
import { checkCallLabel, clampRaiseTo, potOddsPercent, quickSizes, raiseLabel } from "../../src/game/betting.ts";
import { commandForKey, type KeyContext } from "../../src/game/keys.ts";
import { FAST_THINK_MAX_MS, FAST_THINK_MIN_MS, nextHandDelayMs, revealDelayMs, thinkTimeMs, type ThinkContext } from "../../src/game/pacing.ts";
import { browserStore, loadSavedGame, saveGame, type KeyValueStore } from "../../src/game/storage.ts";
import { play, scenario, scenarioConfig } from "../helpers/scenario.ts";

const legal = (s: HandState) => legalActions(s)!;
const tos = (s: HandState) => quickSizes(legal(s), s.street).map((q) => [q.key, q.to]);

describe("quick-size buttons: the numbers", () => {
  it("after the flop, unbet pot of 12: 1/3, 1/2, 2/3, pot, all-in", () => {
    let s = play(scenario({ stacks: [200, 200] }), [[0, "raise", 6], [1, "call"]]);
    expect(s.street).toBe("flop");
    expect(tos(s)).toEqual([["1/3", 4], ["1/2", 6], ["2/3", 8], ["pot", 12], ["all-in", 194]]);
    s = play(s, [[1, "raise", 10]]);
    // Facing a bet of 10 into 12: the pot is 22, calling makes it 32. Raise sizes are measured on that 32.
    expect(legal(s).pot).toBe(22);
    expect(tos(s)).toEqual([["1/3", 21], ["1/2", 26], ["2/3", 31], ["pot", 42], ["all-in", 194]]);
  });

  it("before the flop, unopened: 2.5x, 3x, 4x the big blind, pot, all-in", () => {
    const s = scenario({ stacks: [200, 200, 200, 200, 200, 200] });
    expect(tos(s)).toEqual([["2.5x", 5], ["3x", 6], ["4x", 8], ["pot", 7], ["all-in", 200]]);
  });

  it("before the flop, facing an open to 6: 2.5x, 3x, 4x the bet", () => {
    const s = play(scenario({ stacks: [200, 200, 200, 200, 200, 200] }), [[3, "raise", 6]]);
    expect(tos(s)).toEqual([["2.5x", 15], ["3x", 18], ["4x", 24], ["pot", 21], ["all-in", 200]]);
  });

  it("clamps to the minimum raise and to the stack, and flags all-in", () => {
    // 30 chips behind: nearly every size is bigger than the stack
    const s = scenario({ stacks: [30, 200, 200, 200, 200, 200] }); // seat 0 is the button, acts after the blinds
    const p = play(s, [[3, "raise", 12], [4, "fold"], [5, "fold"]]);
    const sizes = quickSizes(legal(p), p.street);
    for (const q of sizes) {
      expect(q.to).toBeGreaterThanOrEqual(legal(p).minRaiseTo);
      expect(q.to).toBeLessThanOrEqual(legal(p).maxRaiseTo);
    }
    expect(sizes.at(-1)).toMatchObject({ key: "all-in", to: 30, isAllIn: true });
    expect(sizes.filter((q) => q.to === 30).every((q) => q.isAllIn)).toBe(true);
  });

  it("offers nothing when raising is not allowed", () => {
    const s = play(scenario({ stacks: [200, 500] }), [[0, "raise", 200]]);
    expect(legal(s).canRaise).toBe(false);
    expect(quickSizes(legal(s), s.street)).toEqual([]);
  });

  it("labels the buttons", () => {
    const s = scenario({ stacks: [200, 200, 200] });
    expect(checkCallLabel(legal(s))).toBe("Call 2");
    expect(raiseLabel(legal(s), 6)).toBe("Raise to 6");
    expect(raiseLabel(legal(s), 200)).toBe("All-in 200");
    const flop = play(scenario({ stacks: [200, 200] }), [[0, "call"], [1, "check"]]);
    expect(checkCallLabel(legal(flop))).toBe("Check");
    expect(raiseLabel(legal(flop), 10)).toBe("Bet 10");
  });

  it("calling for the whole stack says so", () => {
    // Seat 2 is the big blind with only 18 chips behind; seat 0 raises to 100 and seat 1 folds.
    const t = play(scenario({ stacks: [200, 200, 20] }), [[0, "raise", 100], [1, "fold"]]);
    expect(legal(t).seat).toBe(2);
    expect(legal(t).callAmount).toBe(18);
    expect(checkCallLabel(legal(t))).toBe("Call 18 (all-in)");
  });

  it("clampRaiseTo handles junk input", () => {
    const l = legal(scenario({ stacks: [200, 200, 200] }));
    expect(clampRaiseTo(l, Number.NaN)).toBe(l.minRaiseTo);
    expect(clampRaiseTo(l, -50)).toBe(l.minRaiseTo);
    expect(clampRaiseTo(l, 10_000)).toBe(l.maxRaiseTo);
    expect(clampRaiseTo(l, 7.6)).toBe(8);
    expect(clampRaiseTo(l, 199)).toBe(200); // near-all-in rule
  });
});

describe("pot odds", () => {
  it("is the call divided by the pot after calling, as a whole percent", () => {
    // Blinds 1/2 with a raise to 6: the pot is 9 and it costs 6 to call, so 6 / 15 = 40%.
    const s = play(scenario({ stacks: [200, 200, 200, 200, 200, 200] }), [[3, "raise", 6]]);
    expect(legal(s).pot).toBe(9);
    expect(potOddsPercent(legal(s))).toBe(40);
  });

  it.each([
    [10, 10, 33], // a pot-sized bet into 10: the pot is now 20, calling 10 makes 30, so 10/30
    [5, 10, 25], // a half-pot bet: pot 15, call 5, 5/20
    [20, 10, 40], // a double-pot bet: pot 30, call 20, 20/50
  ])("a bet of %i into a pot of %i needs %i%%", (bet, before, expected) => {
    // The pot figure already includes the bet being faced.
    expect(potOddsPercent({ callAmount: bet, pot: before + bet } as never)).toBe(expected);
  });

  it("is null when you can check", () => {
    const s = play(scenario({ stacks: [200, 200] }), [[0, "call"], [1, "check"]]);
    expect(potOddsPercent(legal(s))).toBeNull();
  });

  it("uses the capped call when you are short", () => {
    // Seat 2 has only 18 chips behind, so its call (and its odds) are measured on 18
    const t = play(scenario({ stacks: [200, 200, 20] }), [[0, "raise", 100], [1, "fold"]]);
    const l = legal(t);
    expect(l.callAmount).toBe(18);
    expect(potOddsPercent(l)).toBe(Math.round((100 * 18) / (l.pot + 18)));
  });
});

describe("every button offers only legal moves (thousands of real decisions)", () => {
  function decisionStates(seed: string, stacks: number[]): HandState[] {
    const rng = createRng(seed);
    const out: HandState[] = [];
    let s = startHand(scenarioConfig({ stacks, seed, button: rng.int(stacks.length) }));
    while (s.toAct >= 0) {
      out.push(s);
      const l = legal(s);
      const roll = rng.float();
      const sizes = quickSizes(l, s.street);
      s = applyAction(
        s,
        roll < 0.15 ? { seat: l.seat, type: "fold" }
        : roll < 0.6 || !l.canRaise ? (l.canCheck ? { seat: l.seat, type: "check" } : { seat: l.seat, type: "call" })
        : { seat: l.seat, type: "raise", to: sizes[rng.int(sizes.length)].to },
      );
    }
    return out;
  }

  it("fold, check/call, raise range, and all five quick sizes, in 2,500 hands", () => {
    let decisions = 0;
    let quickChecked = 0;
    for (let i = 0; i < 2500; i++) {
      const stacks = [[200, 80, 400, 120, 200, 60], [80, 80, 80, 80, 80, 80], [400, 400, 400, 400, 400, 400], [20, 200, 35, 200]][i % 4];
      for (const s of decisionStates(`btn-${i}`, stacks)) {
        decisions++;
        const l = legal(s);
        const seat = l.seat;
        const accepts = (a: Parameters<typeof applyAction>[1]) => {
          try {
            applyAction(s, a);
            return true;
          } catch (e) {
            if (e instanceof IllegalActionError) return false;
            throw e;
          }
        };
        expect(accepts({ seat, type: "fold" })).toBe(true);
        // Check and call are never both on offer, and the one offered works.
        expect(accepts({ seat, type: "check" })).toBe(l.canCheck);
        expect(accepts({ seat, type: "call" })).toBe(!l.canCheck);
        if (l.canCheck) expect(l.callAmount).toBe(0);
        else expect(l.callAmount).toBeGreaterThan(0);
        // The raise range edges are legal, and one chip outside is not.
        expect(accepts({ seat, type: "raise", to: l.minRaiseTo })).toBe(l.canRaise);
        expect(accepts({ seat, type: "raise", to: l.maxRaiseTo })).toBe(l.canRaise);
        expect(accepts({ seat, type: "raise", to: l.maxRaiseTo + 1 })).toBe(false);
        // Every quick size is a legal amount, whole chips, and never leaves a sliver behind.
        const sizes = quickSizes(l, s.street);
        expect(sizes.length).toBe(l.canRaise ? 5 : 0);
        for (const q of sizes) {
          quickChecked++;
          expect(Number.isInteger(q.to)).toBe(true);
          expect(q.to).toBeGreaterThanOrEqual(l.minRaiseTo);
          expect(q.to).toBeLessThanOrEqual(l.maxRaiseTo);
          expect(accepts({ seat, type: "raise", to: q.to })).toBe(true);
          const left = l.maxRaiseTo - q.to;
          expect(left === 0 || left >= l.snapBehind).toBe(true);
          expect(q.isAllIn).toBe(q.to === l.maxRaiseTo);
        }
        if (l.canRaise && s.street !== "preflop") {
          const postflop = sizes.map((q) => q.to);
          expect([...postflop].sort((a, b) => a - b)).toEqual(postflop); // 1/3 <= 1/2 <= 2/3 <= pot <= all-in
        }
      }
    }
    expect(decisions).toBeGreaterThan(15000);
    expect(quickChecked).toBeGreaterThan(30000);
  }, 120_000);
});

describe("keyboard shortcuts", () => {
  const base: KeyContext = { inTextInput: false, heroTurn: true, canRaise: true, sizing: false, canDeal: false };
  const cmd = (key: string, ctx: Partial<KeyContext> = {}, extra: { repeat?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean } = {}) =>
    commandForKey({ key, ...extra }, { ...base, ...ctx });

  it.each([
    ["f", { kind: "fold" }],
    ["F", { kind: "fold" }],
    ["c", { kind: "checkcall" }],
    ["C", { kind: "checkcall" }],
    ["r", { kind: "raiseMode" }],
    ["R", { kind: "raiseMode" }],
    ["ArrowUp", { kind: "adjust", bigBlinds: 1 }],
    ["ArrowDown", { kind: "adjust", bigBlinds: -1 }],
    ["1", { kind: "quick", index: 0 }],
    ["2", { kind: "quick", index: 1 }],
    ["3", { kind: "quick", index: 2 }],
    ["4", { kind: "quick", index: 3 }],
    ["5", { kind: "quick", index: 4 }],
  ])("on your turn, %s does the right thing", (key, expected) => {
    expect(cmd(key)).toEqual(expected);
  });

  it("Enter confirms only once the amount is open; Escape cancels only then", () => {
    expect(cmd("Enter")).toBeNull();
    expect(cmd("Enter", { sizing: true })).toEqual({ kind: "confirm" });
    expect(cmd("Escape")).toBeNull();
    expect(cmd("Escape", { sizing: true })).toEqual({ kind: "cancel" });
  });

  it.each(["f", "c", "r", "1", "5", "Enter", "ArrowUp", "Escape"])("%s does nothing when it is not your turn", (key) => {
    expect(cmd(key, { heroTurn: false, sizing: true })).toBeNull();
  });

  it("raise keys do nothing when raising is not allowed, but fold and call still work", () => {
    expect(cmd("r", { canRaise: false })).toBeNull();
    expect(cmd("1", { canRaise: false })).toBeNull();
    expect(cmd("ArrowUp", { canRaise: false })).toBeNull();
    expect(cmd("f", { canRaise: false })).toEqual({ kind: "fold" });
    expect(cmd("c", { canRaise: false })).toEqual({ kind: "checkcall" });
  });

  it("ignores keys typed into a text box, except Enter and Escape for the amount", () => {
    for (const key of ["f", "c", "r", "1", "n", "ArrowUp"]) expect(cmd(key, { inTextInput: true })).toBeNull();
    expect(cmd("Enter", { inTextInput: true, sizing: true })).toEqual({ kind: "confirm" });
    expect(cmd("Enter", { inTextInput: true, sizing: false })).toBeNull();
    expect(cmd("Escape", { inTextInput: true, sizing: true })).toEqual({ kind: "cancel" });
  });

  it("ignores browser shortcuts like Ctrl+R (reload) and Ctrl+F (find)", () => {
    for (const mod of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      for (const key of ["r", "f", "c", "1", "n"]) expect(cmd(key, { canDeal: true }, mod)).toBeNull();
    }
  });

  it("a held-down key does not repeat an action, but the arrows keep adjusting", () => {
    expect(cmd("f", {}, { repeat: true })).toBeNull();
    expect(cmd("c", {}, { repeat: true })).toBeNull();
    expect(cmd("Enter", { sizing: true }, { repeat: true })).toBeNull();
    expect(cmd("ArrowUp", {}, { repeat: true })).toEqual({ kind: "adjust", bigBlinds: 1 });
  });

  it("N and Enter deal the next hand when that is possible", () => {
    expect(cmd("n", { heroTurn: false, canDeal: true })).toEqual({ kind: "nextHand" });
    expect(cmd("N", { heroTurn: false, canDeal: true })).toEqual({ kind: "nextHand" });
    expect(cmd("Enter", { heroTurn: false, canDeal: true })).toEqual({ kind: "nextHand" });
    expect(cmd("n", { heroTurn: false, canDeal: false })).toBeNull();
    expect(cmd("n", { heroTurn: true, canDeal: false })).toBeNull();
  });
});

describe("pacing", () => {
  const contexts: ThinkContext[] = [];
  for (const street of ["preflop", "flop", "turn", "river"] as const)
    for (const toCall of [0, 2, 10, 40, 200])
      for (const pot of [3, 20, 100, 400]) contexts.push({ street, toCall, pot: Math.max(pot, toCall), stack: 200 });

  const samples = (speed: "fast" | "realistic" | "instant", filter: (c: ThinkContext) => boolean = () => true) => {
    const rng = createRng(`pace-${speed}`);
    const out: number[] = [];
    for (let i = 0; i < 40; i++) for (const c of contexts) if (filter(c)) out.push(thinkTimeMs(c, speed, rng));
    return out;
  };
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  it("Fast: every think is between 0.8 and 3 seconds", () => {
    const xs = samples("fast");
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(FAST_THINK_MIN_MS);
    expect(Math.max(...xs)).toBeLessThanOrEqual(FAST_THINK_MAX_MS);
  });

  it("Fast: easy decisions are quick and big ones take longer", () => {
    const easy = mean(samples("fast", (c) => c.street === "preflop" && c.toCall <= 2));
    const hard = mean(samples("fast", (c) => c.street === "river" && c.toCall >= 40));
    expect(easy).toBeLessThan(1500);
    expect(hard).toBeGreaterThan(easy + 700);
  });

  it("Fast: later streets take longer than preflop, and facing all-in takes longer than a small bet", () => {
    expect(mean(samples("fast", (c) => c.street === "river"))).toBeGreaterThan(mean(samples("fast", (c) => c.street === "preflop")));
    const rng = createRng("allin");
    const small = mean(Array.from({ length: 200 }, () => thinkTimeMs({ street: "flop", toCall: 4, pot: 60, stack: 200 }, "fast", rng)));
    const all = mean(Array.from({ length: 200 }, () => thinkTimeMs({ street: "flop", toCall: 200, pot: 260, stack: 200 }, "fast", rng)));
    expect(all).toBeGreaterThan(small);
  });

  it("Instant: no pause at all", () => {
    expect(samples("instant").every((x) => x === 0)).toBe(true);
    for (const e of [{ type: "deal_board", street: "flop", cards: [1, 2, 3] }, { type: "hand_end" }, { type: "pot_award" }] as never[]) {
      expect(revealDelayMs(e, "instant")).toBe(0);
    }
  });

  it("Realistic is clearly slower than Fast, and still capped", () => {
    const fast = mean(samples("fast"));
    const real = mean(samples("realistic"));
    expect(real).toBeGreaterThan(fast * 1.8);
    expect(Math.max(...samples("realistic"))).toBeLessThanOrEqual(9000);
  });

  it("gives the same pauses for the same seed", () => {
    const a = createRng("same");
    const b = createRng("same");
    const c = contexts[7];
    expect(thinkTimeMs(c, "fast", a)).toBe(thinkTimeMs(c, "fast", b));
  });

  it("reveal and between-hand pauses scale with speed", () => {
    const flop = { type: "deal_board", street: "flop", cards: [1, 2, 3] } as never;
    expect(revealDelayMs(flop, "fast")).toBeGreaterThan(0);
    expect(revealDelayMs(flop, "realistic")).toBeGreaterThan(revealDelayMs(flop, "fast"));
    expect(revealDelayMs({ type: "action" } as never, "fast")).toBe(0);
    expect(nextHandDelayMs("realistic")).toBeGreaterThan(nextHandDelayMs("fast"));
    expect(nextHandDelayMs("fast")).toBeGreaterThan(nextHandDelayMs("instant"));
  });
});

describe("saving to the device", () => {
  const memory = (): KeyValueStore & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  };

  it("round-trips the bankroll and settings", () => {
    const store = memory();
    saveGame(store, { version: 1, wallet: 9500, heroStack: 300, settings: { stackDepth: 200, speed: "realistic", potOdds: false } });
    expect(loadSavedGame(store)).toEqual({ version: 1, wallet: 9500, heroStack: 300, settings: { stackDepth: 200, speed: "realistic", potOdds: false } });
  });

  it("returns null when nothing is saved, or the data is junk", () => {
    const store = memory();
    expect(loadSavedGame(store)).toBeNull();
    for (const junk of ["not json", "{}", "null", '{"version":2,"wallet":1,"heroStack":1}', '{"version":1,"wallet":-5,"heroStack":1}', '{"version":1,"wallet":1.5,"heroStack":1}', '{"version":1,"wallet":"9","heroStack":1}']) {
      store.data.set("holdem-lab:game", junk);
      expect(loadSavedGame(store)).toBeNull();
    }
  });

  it("falls back to default settings when saved ones are invalid", () => {
    const store = memory();
    store.data.set("holdem-lab:game", JSON.stringify({ version: 1, wallet: 10, heroStack: 20, settings: { stackDepth: 55, speed: "warp" } }));
    expect(loadSavedGame(store)!.settings).toEqual({ stackDepth: 100, speed: "fast", potOdds: true });
  });

  it("survives a browser that blocks storage", () => {
    const blocked: KeyValueStore = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadSavedGame(blocked)).toBeNull();
    expect(() => saveGame(blocked, { version: 1, wallet: 1, heroStack: 1, settings: { stackDepth: 100, speed: "fast", potOdds: true } })).not.toThrow();
    expect(() => saveGame(null, { version: 1, wallet: 1, heroStack: 1, settings: { stackDepth: 100, speed: "fast", potOdds: true } })).not.toThrow();
    expect(loadSavedGame(null)).toBeNull();
    expect(browserStore()).toBeNull(); // no localStorage in the test environment
  });
});
