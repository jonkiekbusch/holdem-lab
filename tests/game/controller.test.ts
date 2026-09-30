import { describe, expect, it } from "vitest";
import { HERO_SEAT, GameController, type ControllerOptions } from "../../src/game/controller.ts";
import { quickSizes } from "../../src/game/betting.ts";
import { createRng } from "../../src/engine/rng.ts";
import type { KeyValueStore } from "../../src/game/storage.ts";
import { ManualScheduler } from "../helpers/scheduler.ts";

type Policy = "calls" | "mixed" | "shove";

function setup(opts: ControllerOptions & { policy?: Policy } = {}) {
  const sched = new ManualScheduler();
  const ctrl = new GameController({ seed: "ctl", scheduler: sched, handGapMs: 0, ...opts });
  const rng = createRng(`hero-${opts.seed ?? "ctl"}`);
  const policy = opts.policy ?? "mixed";
  /** Chips added by bankroll resets (a reckless hero can go broke). */
  const injected = { total: 0 };

  /** Plays the hero's decision according to a simple policy, using only what the screen would offer. */
  const heroMove = (): void => {
    const snap = ctrl.getSnapshot();
    const l = snap.legal!;
    const sizes = quickSizes(l, snap.street!);
    const roll = rng.float();
    let result;
    if (policy === "shove" && l.canRaise) result = ctrl.heroAct({ type: "raise", to: l.maxRaiseTo });
    else if (policy === "calls" || roll < 0.45) result = ctrl.heroAct({ type: l.canCheck ? "check" : "call" });
    else if (roll < 0.6) result = ctrl.heroAct({ type: "fold" });
    else if (l.canRaise) result = ctrl.heroAct({ type: "raise", to: sizes[rng.int(sizes.length)].to });
    else result = ctrl.heroAct({ type: l.canCheck ? "check" : "call" });
    expect(result).toEqual({ ok: true });
  };

  const run = (until: () => boolean, maxSteps = 400_000): void => {
    let steps = 0;
    while (!until()) {
      const snap = ctrl.getSnapshot();
      if (snap.heroCanAct) {
        heroMove();
      } else if (snap.waitingForRebuy) {
        if (!ctrl.rebuy()) {
          const before = snap.wallet + snap.heroStack;
          if (!ctrl.resetBankroll()) throw new Error("Cannot continue after busting");
          const after = ctrl.getSnapshot();
          injected.total += after.wallet + after.heroStack - before;
        }
      } else if (!sched.step()) {
        throw new Error("The game stalled with nothing scheduled");
      }
      if (++steps > maxSteps) throw new Error("Too many steps");
    }
  };
  const playHands = (n: number): void => {
    if (ctrl.getSnapshot().handsPlayed === 0 && !ctrl.getSnapshot().display) ctrl.start();
    run(() => ctrl.getSnapshot().handsPlayed >= n);
  };
  return { ctrl, sched, run, playHands, injected };
}

const memory = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

describe("starting a session", () => {
  it("sits you down with a 100bb buy-in (200 chips) out of a 10,000 bankroll", () => {
    const { ctrl } = setup();
    const s = ctrl.getSnapshot();
    expect(s.heroStack).toBe(200);
    expect(s.wallet).toBe(9800);
    expect(s.sessionNet).toBe(0);
    expect(s.display).toBeNull();
    expect(s.settings).toEqual({ stackDepth: 100, speed: "fast" });
  });

  it("deals the first hand, shows your two cards, and never anyone else's", () => {
    const { ctrl, sched } = setup({ settings: { speed: "instant" } });
    ctrl.start();
    while (!ctrl.getSnapshot().heroCanAct && sched.step());
    const s = ctrl.getSnapshot();
    expect(s.heroHole).toHaveLength(2);
    expect(s.display!.seats.filter((p) => p && p.revealed)).toHaveLength(0);
    expect(s.display!.seats.filter((p) => p)).toHaveLength(6);
    expect(s.display!.street).toBe("preflop");
  });

  it("uses whatever you choose for the start: 40, 100 or 200 big blinds", () => {
    for (const [depth, chips] of [[40, 80], [100, 200], [200, 400]] as const) {
      const { ctrl, sched } = setup({ settings: { stackDepth: depth, speed: "instant" } });
      ctrl.start();
      while (!ctrl.getSnapshot().heroCanAct && sched.step());
      const seats = ctrl.getSnapshot().display!.seats;
      // blinds are already posted, so add the bets back
      const totals = seats.map((p) => (p ? p.stack + p.bet : 0));
      expect(totals).toEqual([chips, chips, chips, chips, chips, chips]);
    }
  });
});

describe("playing many hands", () => {
  it("plays 300 hands with a mixed hero: nothing stalls and chips add up", () => {
    const { ctrl, playHands, injected } = setup();
    ctrl.setSettings({ speed: "instant" });
    playHands(300);
    const s = ctrl.getSnapshot();
    expect(s.handsPlayed).toBe(300);
    expect(ctrl.getHistory()).toHaveLength(300);
    // Everything you own is what you started with, plus what you won or lost, plus any bankroll resets.
    // Rebuys only move chips between the wallet and the stack.
    const nets = ctrl.getHistory().reduce((sum, h) => sum + (h.net[HERO_SEAT] ?? 0), 0);
    expect(s.wallet + s.heroStack).toBe(10000 + nets + injected.total);
    expect(s.heroStack).toBeGreaterThanOrEqual(0);
    expect(s.wallet).toBeGreaterThanOrEqual(0);
  });

  it("without a reset, your session result is exactly the sum of your hand results", () => {
    const { ctrl, playHands, injected } = setup({ policy: "calls", seed: "calm" });
    ctrl.setSettings({ speed: "instant" });
    playHands(120);
    expect(injected.total).toBe(0);
    const nets = ctrl.getHistory().reduce((sum, h) => sum + (h.net[HERO_SEAT] ?? 0), 0);
    expect(ctrl.getSnapshot().sessionNet).toBe(nets);
  });

  it("only lets you act on your turn, and refuses illegal moves without changing anything", () => {
    const { ctrl, sched } = setup({ settings: { speed: "instant" } });
    ctrl.start();
    expect(ctrl.heroAct({ type: "fold" }).ok).toBe(false); // nothing dealt yet
    while (!ctrl.getSnapshot().heroCanAct && sched.step());
    const before = ctrl.getSnapshot();
    for (const bad of [{ type: "check" as const }, { type: "raise" as const }, { type: "raise" as const, to: 1 }, { type: "raise" as const, to: 99_999 }, { type: "raise" as const, to: Number.NaN }]) {
      const l = before.legal!;
      if (bad.type === "check" && l.canCheck) continue;
      const r = ctrl.heroAct(bad);
      expect(r.ok).toBe(false);
    }
    expect(ctrl.getSnapshot().version).toBe(before.version); // state untouched
    expect(ctrl.getSnapshot().heroCanAct).toBe(true);
  });

  it("does not let you act while a bot is thinking", () => {
    const { ctrl, sched } = setup({ settings: { speed: "fast" } });
    ctrl.start();
    while (!ctrl.getSnapshot().heroCanAct && sched.step());
    ctrl.heroAct({ type: "fold" });
    // now the bots play on; it is never the hero's turn again this hand
    for (let i = 0; i < 6 && ctrl.getSnapshot().handInProgress; i++) {
      expect(ctrl.getSnapshot().heroCanAct).toBe(false);
      expect(ctrl.heroAct({ type: "check" }).ok).toBe(false);
      sched.step();
    }
  });

  it("shows a bot 'thinking' before it acts", () => {
    const { ctrl, sched } = setup({ settings: { speed: "fast" } });
    ctrl.start();
    let sawThinking = false;
    for (let i = 0; i < 200 && !sawThinking; i++) {
      const s = ctrl.getSnapshot();
      if (s.thinkingSeat !== null) sawThinking = true;
      if (s.heroCanAct) ctrl.heroAct({ type: s.legal!.canCheck ? "check" : "call" });
      else sched.step();
    }
    expect(sawThinking).toBe(true);
  });

  it("deals the same cards and plays the same hands for the same seed, at any speed", () => {
    const hands = (speed: "fast" | "instant" | "realistic") => {
      const { ctrl, playHands } = setup({ seed: "same-seed", settings: { speed } });
      playHands(30);
      return JSON.stringify(ctrl.getHistory());
    };
    const a = hands("instant");
    expect(hands("fast")).toBe(a);
    expect(hands("realistic")).toBe(a);
  });

  it("different seeds play different hands", () => {
    const one = setup({ seed: "one", settings: { speed: "instant" } });
    const two = setup({ seed: "two", settings: { speed: "instant" } });
    one.playHands(5);
    two.playHands(5);
    expect(JSON.stringify(one.ctrl.getHistory())).not.toBe(JSON.stringify(two.ctrl.getHistory()));
  });
});

describe("the speed setting changes only the pauses", () => {
  const delaysFor = (speed: "fast" | "instant" | "realistic") => {
    const { sched, playHands, ctrl } = setup({ seed: "pace", settings: { speed } });
    playHands(12);
    ctrl.dispose();
    return sched.delays;
  };

  it("Instant never pauses", () => {
    expect(Math.max(...delaysFor("instant"))).toBe(0);
  });

  it("Fast pauses between 0.8 and 3 seconds for bot decisions and never longer than that", () => {
    const d = delaysFor("fast").filter((x) => x > 0);
    expect(d.length).toBeGreaterThan(20);
    expect(Math.max(...d)).toBeLessThanOrEqual(3000);
    // the decision pauses are all at least 0.8 s (board and result pauses are shorter or equal)
    expect(d.filter((x) => x >= 800).length).toBeGreaterThan(10);
  });

  it("Realistic pauses are noticeably longer than Fast", () => {
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    expect(sum(delaysFor("realistic"))).toBeGreaterThan(sum(delaysFor("fast")) * 1.7);
  });

  it("changing the speed mid-hand changes the very next pause", () => {
    const { ctrl, sched } = setup({ settings: { speed: "fast" } });
    ctrl.start();
    sched.step(); // the first reveal
    ctrl.setSettings({ speed: "instant" });
    const before = sched.delays.length;
    while (!ctrl.getSnapshot().heroCanAct && sched.step());
    expect(Math.max(...sched.delays.slice(before), 0)).toBe(0);
  });
});

describe("bankroll, buy-ins and rebuys", () => {
  it("busting out stops the game until you rebuy, and a rebuy comes out of the wallet", () => {
    const { ctrl, sched, run } = setup({ heroStack: 6, policy: "shove", settings: { speed: "instant" } });
    ctrl.start();
    run(() => ctrl.getSnapshot().waitingForRebuy);
    let s = ctrl.getSnapshot();
    expect(s.heroStack).toBe(0);
    expect(s.waitingForRebuy).toBe(true);
    expect(s.canRebuy).toBe(true);
    expect(s.rebuyAmount).toBe(200);
    expect(sched.pending).toBe(0); // nothing is dealt until you decide
    const walletBefore = s.wallet;
    const handsBefore = s.handsPlayed;
    expect(ctrl.rebuy()).toBe(true);
    s = ctrl.getSnapshot();
    expect(s.wallet).toBe(walletBefore - 200);
    expect(s.waitingForRebuy).toBe(false);
    expect(s.handInProgress).toBe(true); // the next hand is dealt straight away
    expect(s.handsPlayed).toBe(handsBefore);
    expect(s.heroStack + s.display!.seats[0]!.bet).toBe(200);
  });

  it("rebuy does nothing in the middle of a hand, or when already at the full stack", () => {
    const { ctrl, sched } = setup({ settings: { speed: "instant" } });
    expect(ctrl.rebuy()).toBe(false); // already full
    ctrl.start();
    while (!ctrl.getSnapshot().heroCanAct && sched.step());
    expect(ctrl.getSnapshot().canRebuy).toBe(false);
    expect(ctrl.rebuy()).toBe(false);
  });

  it("tops a short stack back up to the chosen depth, but no further", () => {
    const { ctrl } = setup({ heroStack: 50 });
    const s = ctrl.getSnapshot();
    expect(s.canRebuy).toBe(true);
    expect(s.rebuyAmount).toBe(150);
    ctrl.rebuy();
    expect(ctrl.getSnapshot().heroStack).toBe(200);
    expect(ctrl.getSnapshot().wallet).toBe(10000 - 50 - 150);
  });

  it("an empty bankroll offers a reset, and the reset gives a fresh 10,000", () => {
    const store = memory();
    store.data.set("holdem-lab:game", JSON.stringify({ version: 1, wallet: 0, heroStack: 0, settings: { stackDepth: 100, speed: "instant" } }));
    const { ctrl } = setup({ store });
    ctrl.start();
    let s = ctrl.getSnapshot();
    expect(s.waitingForRebuy).toBe(true);
    expect(s.bankrollEmpty).toBe(true);
    expect(s.canRebuy).toBe(false);
    expect(ctrl.resetBankroll()).toBe(true);
    s = ctrl.getSnapshot();
    expect(s.bankrollEmpty).toBe(false);
    expect(s.wallet + 200).toBe(10000);
    expect(s.sessionNet).toBe(0);
    expect(s.handInProgress).toBe(true);
  });

  it("remembers your bankroll and settings on this device", () => {
    const store = memory();
    const first = setup({ store, settings: { speed: "instant", stackDepth: 40 } });
    first.playHands(15);
    const s1 = first.ctrl.getSnapshot();
    first.ctrl.dispose();

    const second = new GameController({ seed: "later", store, scheduler: new ManualScheduler() });
    const s2 = second.getSnapshot();
    expect(s2.settings).toEqual({ stackDepth: 40, speed: "instant" });
    expect(s2.wallet).toBe(s1.wallet);
    expect(s2.heroStack).toBe(s1.heroStack);
  });

  it("works without any storage at all", () => {
    const { ctrl, playHands } = setup({ store: null, settings: { speed: "instant" } });
    expect(() => playHands(5)).not.toThrow();
    expect(ctrl.getSnapshot().handsPlayed).toBe(5);
  });
});

describe("stack depth", () => {
  it("a new depth applies from the next hand: everyone gets a fresh stack, and your chips are conserved", () => {
    const { ctrl, playHands, sched, run } = setup({ settings: { speed: "instant", stackDepth: 100 } });
    playHands(3);
    const worth = () => ctrl.getSnapshot().wallet + ctrl.getSnapshot().heroStack;
    run(() => !ctrl.getSnapshot().handInProgress || ctrl.getSnapshot().heroCanAct);
    // finish the current hand, then change the depth before the next one is dealt
    const s0 = ctrl.getSnapshot();
    if (s0.heroCanAct) ctrl.heroAct({ type: "fold" });
    run(() => ctrl.getSnapshot().canDeal && !ctrl.getSnapshot().handInProgress);
    const worthBefore = worth();
    ctrl.setSettings({ stackDepth: 200 });
    expect(ctrl.getSnapshot().depthChangePending).toBe(true);
    ctrl.deal();
    while (!ctrl.getSnapshot().heroCanAct && sched.step());
    const seats = ctrl.getSnapshot().display!.seats;
    expect(seats.map((p) => (p ? p.stack + p.bet : 0))).toEqual([400, 400, 400, 400, 400, 400]);
    expect(ctrl.getSnapshot().depthChangePending).toBe(false);
    expect(ctrl.getSnapshot().wallet + 400 + (ctrl.getSnapshot().display!.seats[0]!.bet * 0)).toBe(worthBefore);
  });

  it("40bb gives 80-chip stacks", () => {
    const { ctrl, sched } = setup({ settings: { speed: "instant", stackDepth: 40 } });
    ctrl.start();
    while (!ctrl.getSnapshot().heroCanAct && sched.step());
    const hero = ctrl.getSnapshot().display!.seats[0]!;
    expect(hero.stack + hero.bet).toBe(80);
  });
});

describe("moving on when you are out of a hand", () => {
  it("after you fold, 'next hand' plays out the rest instantly and deals again", () => {
    const { ctrl, sched } = setup({ settings: { speed: "fast" } });
    ctrl.start();
    while (!ctrl.getSnapshot().heroCanAct && sched.step());
    expect(ctrl.getSnapshot().canSkip).toBe(false);
    expect(ctrl.deal()).toBe(false); // you still have to act
    ctrl.heroAct({ type: "fold" });
    expect(ctrl.getSnapshot().canSkip).toBe(true);
    expect(ctrl.getSnapshot().canDeal).toBe(true);
    ctrl.deal();
    const s = ctrl.getSnapshot();
    expect(s.handsPlayed).toBe(1);
    expect(s.display!.handNumber).toBe(2);
    expect(ctrl.getHistory()).toHaveLength(1);
  });

  it("you can move on once you are all-in, too", () => {
    const { ctrl, sched } = setup({ settings: { speed: "fast" }, policy: "shove" });
    ctrl.start();
    while (!ctrl.getSnapshot().heroCanAct && sched.step());
    const l = ctrl.getSnapshot().legal!;
    ctrl.heroAct({ type: "raise", to: l.maxRaiseTo });
    expect(ctrl.getSnapshot().canSkip).toBe(true);
  });
});

describe("the hand as it is shown", () => {
  it("reveals the flop, turn and river one at a time, not all at once", () => {
    const { ctrl, sched } = setup({ settings: { speed: "fast" }, policy: "calls" });
    ctrl.start();
    const boards = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const s = ctrl.getSnapshot();
      boards.add(s.display?.board.length ?? 0);
      if (s.handsPlayed >= 1) break;
      if (s.heroCanAct) ctrl.heroAct({ type: s.legal!.canCheck ? "check" : "call" });
      else sched.step();
    }
    // with everyone calling down, every step of the board was shown on its own
    expect([...boards].sort()).toEqual([0, 3, 4, 5]);
  });

  it("shows a result when the hand is over, matching your real win or loss", () => {
    const { ctrl, playHands } = setup({ settings: { speed: "instant" }, autoDeal: false });
    ctrl.start();
    const rng = createRng("r");
    for (let i = 0; i < 40; i++) {
      let guard = 0;
      while (!ctrl.getSnapshot().result && guard++ < 500) {
        const s = ctrl.getSnapshot();
        if (s.heroCanAct) ctrl.heroAct({ type: s.legal!.canCheck ? "check" : rng.float() < 0.3 ? "fold" : "call" });
        else (ctrl as unknown as { scheduler: ManualScheduler }).scheduler.step();
      }
      const s = ctrl.getSnapshot();
      expect(s.result).not.toBeNull();
      expect(s.result!.heroNet).toBe(ctrl.getHistory().at(-1)!.net[HERO_SEAT]);
      expect(s.result!.lines.length).toBeGreaterThan(0);
      if (!s.heroStack) break;
      ctrl.deal();
    }
    expect(playHands).toBeTypeOf("function");
  });

  it("the log only grows as events are revealed, and never shows a bot's hole cards before a showdown", () => {
    const { ctrl, sched } = setup({ settings: { speed: "fast" }, policy: "calls" });
    ctrl.start();
    let last = 0;
    for (let i = 0; i < 400; i++) {
      const s = ctrl.getSnapshot();
      expect(s.log.length).toBeGreaterThanOrEqual(last);
      last = s.log.length;
      expect(s.log.some((l) => l.startsWith("Cards:"))).toBe(false);
      if (s.handsPlayed >= 1) break;
      if (s.heroCanAct) ctrl.heroAct({ type: s.legal!.canCheck ? "check" : "call" });
      else sched.step();
    }
    expect(last).toBeGreaterThan(10);
  });

  it("writes the log in the second person for you", () => {
    const { ctrl, sched } = setup({ settings: { speed: "instant" } });
    ctrl.start();
    while (!ctrl.getSnapshot().heroCanAct && sched.step());
    ctrl.heroAct({ type: "fold" });
    while (!ctrl.getSnapshot().log.some((l) => l.startsWith("You fold")) && sched.step());
    const log = ctrl.getSnapshot().log.join("\n");
    expect(log).toContain("You fold");
    expect(log).not.toContain("You folds");
  });
});
