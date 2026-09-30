// Runs a session of play: you against five bots. It owns the table, the bankroll, the pacing and the
// hand history, and has no screen code: the screen subscribes to it and draws whatever it is told.
// Timers come from an injected scheduler, so tests can run hundreds of hands without waiting.

import { placeholderAction, type PlaceholderStyle } from "../bots/placeholder.ts";
import {
  IllegalActionError,
  applyAction,
  startHand,
  type Action,
  type HandState,
  type LegalActions,
  type Street,
} from "../engine/hand.ts";
import type { Card } from "../engine/cards.ts";
import { formatHand } from "../engine/log.ts";
import { projectEvents, type DisplayHand } from "../engine/project.ts";
import { recordHand, type HandRecord } from "../engine/record.ts";
import { createRng, type Rng } from "../engine/rng.ts";
import { applyHandResult, createTable, prepareNextHand, type Table } from "../engine/table.ts";
import { viewFor } from "../engine/view.ts";
import { nextHandDelayMs, revealDelayMs, thinkTimeMs } from "./pacing.ts";
import { loadSavedGame, saveGame, type KeyValueStore } from "./storage.ts";
import { BIG_BLIND, DEFAULT_SETTINGS, SMALL_BLIND, STARTING_BANKROLL, type Settings } from "./settings.ts";

export const HERO_SEAT = 0;
export const SEAT_NAMES: readonly string[] = ["You", "Ben", "Cat", "Dan", "Eve", "Fay"];
/** Phase 3 opponents are placeholders that mostly call. The real personalities arrive in Phases 4 and 5. */
export const BOT_STYLES: readonly (PlaceholderStyle | null)[] = [null, "caller", "caller", "caller", "careful", "wild"];
export const MAX_HISTORY = 500;

export interface Scheduler {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export const browserScheduler: Scheduler = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface ControllerOptions {
  seed?: string;
  settings?: Partial<Settings>;
  scheduler?: Scheduler;
  store?: KeyValueStore | null;
  /** Start with this many chips at the table instead of a full buy-in (used to test busting out). */
  heroStack?: number;
  /** Override the pause between hands, in milliseconds (used by tests). */
  handGapMs?: number;
  /** Deal the next hand by itself after a pause (default true). */
  autoDeal?: boolean;
}

export interface GameSnapshot {
  version: number;
  settings: Settings;
  bigBlind: number;
  /** Chips you own that are not at the table. */
  wallet: number;
  /** Chips in front of you (as shown right now). */
  heroStack: number;
  /** Change in (wallet + stack) since this session began. */
  sessionNet: number;
  handsPlayed: number;
  display: DisplayHand | null;
  heroHole: readonly [Card, Card] | null;
  street: Street | null;
  heroCanAct: boolean;
  legal: LegalActions | null;
  thinkingSeat: number | null;
  /** You have no more decisions in this hand (folded, all-in, or it is over) and can move on. */
  canSkip: boolean;
  /** Between hands, or you are out of the hand: "Next hand" does something. */
  canDeal: boolean;
  handInProgress: boolean;
  waitingForRebuy: boolean;
  canRebuy: boolean;
  rebuyAmount: number;
  bankrollEmpty: boolean;
  /** The stack depth setting differs from the table's; it applies from the next hand. */
  depthChangePending: boolean;
  /** Set when the hand is over and fully shown. */
  result: { heroNet: number; lines: string[] } | null;
  log: string[];
}

type Listener = () => void;

export class GameController {
  readonly seed: string;
  private settings: Settings;
  private wallet: number;
  private table: Table;
  private tableDepth: number;
  private hand: HandState | null = null;
  private revealIndex = 0;
  private handFinished = false;
  private waitingForRebuy = false;
  private thinkingSeat: number | null = null;
  private handsPlayed = 0;
  private baseline: number;
  private timer: unknown = null;
  private listeners = new Set<Listener>();
  private version = 0;
  private snapshot: GameSnapshot;
  private readonly botRng: Rng;
  private readonly thinkRng: Rng;
  private readonly scheduler: Scheduler;
  private readonly store: KeyValueStore | null;
  private readonly handGapMs: number | undefined;
  private readonly autoDeal: boolean;
  readonly history: HandRecord[] = [];

  constructor(opts: ControllerOptions = {}) {
    this.seed = opts.seed ?? `session-${Math.random().toString(36).slice(2, 10)}`;
    this.scheduler = opts.scheduler ?? browserScheduler;
    this.store = opts.store === undefined ? null : opts.store;
    this.handGapMs = opts.handGapMs;
    this.autoDeal = opts.autoDeal ?? true;
    this.botRng = createRng(`${this.seed}:bots`);
    this.thinkRng = createRng(`${this.seed}:think`);

    const saved = opts.heroStack === undefined ? loadSavedGame(this.store) : null;
    this.settings = { ...DEFAULT_SETTINGS, ...(saved?.settings ?? {}), ...(opts.settings ?? {}) };
    const buyIn = this.settings.stackDepth * BIG_BLIND;
    let heroStack: number;
    if (opts.heroStack !== undefined) {
      heroStack = opts.heroStack;
      this.wallet = Math.max(0, STARTING_BANKROLL - heroStack);
    } else if (saved) {
      heroStack = saved.heroStack;
      this.wallet = saved.wallet;
    } else {
      heroStack = buyIn;
      this.wallet = STARTING_BANKROLL - buyIn;
    }
    // A fresh session after going broke starts with a new buy-in if the wallet allows it.
    if (heroStack === 0 && opts.heroStack === undefined && this.wallet > 0) {
      const amount = Math.min(buyIn, this.wallet);
      heroStack = amount;
      this.wallet -= amount;
    }
    this.baseline = this.wallet + heroStack;
    this.tableDepth = this.settings.stackDepth;
    this.table = this.buildTable(heroStack);
    this.snapshot = this.buildSnapshot();
  }

  // ---- subscribing -------------------------------------------------------------------------

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): GameSnapshot => this.snapshot;

  /** Every hero decision and result so far, most recent last. */
  getHistory(): readonly HandRecord[] {
    return this.history;
  }

  // ---- actions from the screen -----------------------------------------------------------------

  /** Deals the first hand. */
  start(): void {
    if (!this.hand) this.deal();
  }

  /** Deals the next hand now. If you are out of the current hand, the rest of it is played out first. */
  deal(): boolean {
    if (this.hand && !this.handFinished) {
      if (!this.heroIsDone()) return false;
      this.playOutHand();
    }
    this.clearTimer();
    this.applyPendingDepth();
    this.rebuyBots();
    if (this.heroStackAtTable() <= 0) {
      this.waitingForRebuy = true;
      this.emit();
      return false;
    }
    this.waitingForRebuy = false;
    const next = prepareNextHand(this.table);
    if (!next) return false;
    this.table = next.table;
    this.hand = startHand(next.config);
    this.revealIndex = 0;
    this.handFinished = false;
    this.thinkingSeat = null;
    this.emit();
    this.pump();
    return true;
  }

  heroAct(action: Omit<Action, "seat">): { ok: true } | { ok: false; error: string } {
    if (!this.canHeroAct()) return { ok: false, error: "It is not your turn" };
    try {
      this.hand = applyAction(this.hand!, { ...action, seat: HERO_SEAT });
    } catch (e) {
      if (e instanceof IllegalActionError) return { ok: false, error: e.message };
      throw e;
    }
    this.emit();
    this.pump();
    return { ok: true };
  }

  rebuy(): boolean {
    if (!this.canRebuyNow()) return false;
    const amount = this.rebuyAmount();
    if (amount <= 0) return false;
    this.wallet -= amount;
    this.setHeroStack(this.heroStackAtTable() + amount);
    const wasWaiting = this.waitingForRebuy;
    this.waitingForRebuy = false;
    this.persist();
    this.emit();
    if (wasWaiting) this.deal();
    return true;
  }

  /** Puts your bankroll back to the starting amount and sits you down with a fresh buy-in. */
  resetBankroll(): boolean {
    if (this.hand && !this.handFinished && !this.heroIsDone()) return false;
    if (this.hand && !this.handFinished) this.playOutHand();
    const buyIn = Math.min(this.settings.stackDepth * BIG_BLIND, STARTING_BANKROLL);
    this.wallet = STARTING_BANKROLL - buyIn;
    this.baseline = STARTING_BANKROLL;
    this.setHeroStack(buyIn);
    const wasWaiting = this.waitingForRebuy;
    this.waitingForRebuy = false;
    this.persist();
    this.emit();
    if (wasWaiting) this.deal();
    return true;
  }

  setSettings(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    this.persist();
    this.emit();
    // New speed applies to the pause we are in the middle of.
    if (this.hand) this.pump();
  }

  /** Stops timers (when the screen goes away). */
  dispose(): void {
    this.clearTimer();
    this.listeners.clear();
  }

  // ---- internals ---------------------------------------------------------------------------------

  private buildTable(heroStack: number): Table {
    const depthChips = this.tableDepth * BIG_BLIND;
    const buttonSeat = createRng(`${this.seed}:button`).int(SEAT_NAMES.length);
    return createTable({
      seed: this.seed,
      seats: SEAT_NAMES.map((name, i) => ({ name, stack: i === HERO_SEAT ? heroStack : depthChips, sittingOut: false })),
      smallBlind: SMALL_BLIND,
      bigBlind: BIG_BLIND,
      buttonSeat,
    });
  }

  private heroStackAtTable(): number {
    return this.table.seats[HERO_SEAT]?.stack ?? 0;
  }

  private setHeroStack(stack: number): void {
    this.table = { ...this.table, seats: this.table.seats.map((s, i) => (i === HERO_SEAT && s ? { ...s, stack } : s)) };
  }

  private applyPendingDepth(): void {
    if (this.tableDepth === this.settings.stackDepth) return;
    this.tableDepth = this.settings.stackDepth;
    const depthChips = this.tableDepth * BIG_BLIND;
    // Cash out, then sit down again with a buy-in of the new depth.
    this.wallet += this.heroStackAtTable();
    const buyIn = Math.min(depthChips, this.wallet);
    this.wallet -= buyIn;
    this.table = {
      ...this.table,
      seats: this.table.seats.map((s, i) => (s ? { ...s, stack: i === HERO_SEAT ? buyIn : depthChips } : s)),
    };
    this.persist();
  }

  private rebuyBots(): void {
    const depthChips = this.tableDepth * BIG_BLIND;
    this.table = { ...this.table, seats: this.table.seats.map((s, i) => (s && i !== HERO_SEAT && s.stack === 0 ? { ...s, stack: depthChips } : s)) };
  }

  private heroIsDone(): boolean {
    const h = this.hand;
    if (!h) return true;
    const hero = h.players[HERO_SEAT];
    return h.street === "complete" || !hero || hero.folded || hero.allIn;
  }

  private canHeroAct(): boolean {
    const h = this.hand;
    return !!h && !this.handFinished && this.revealIndex === h.events.length && h.toAct === HERO_SEAT;
  }

  private rebuyAmount(): number {
    return Math.max(0, Math.min(this.tableDepth * BIG_BLIND - this.heroStackAtTable(), this.wallet));
  }

  private canRebuyNow(): boolean {
    const between = !this.hand || this.handFinished;
    return between && this.rebuyAmount() > 0;
  }

  private clearTimer(): void {
    if (this.timer !== null) this.scheduler.clear(this.timer);
    this.timer = null;
  }

  private schedule(ms: number, fn: () => void): void {
    this.timer = this.scheduler.set(() => {
      this.timer = null;
      fn();
    }, ms);
  }

  /** Decides what happens next and when: reveal the next event, let a bot act, wait for you, or deal again. */
  private pump(): void {
    this.clearTimer();
    const h = this.hand;
    if (!h) return;
    const speed = this.settings.speed;

    if (!this.handFinished && this.revealIndex < h.events.length) {
      const delay = revealDelayMs(h.events[this.revealIndex], speed);
      this.schedule(delay, () => {
        this.revealIndex++;
        this.emit();
        this.pump();
      });
      return;
    }

    if (!this.handFinished && h.toAct >= 0) {
      if (h.toAct === HERO_SEAT) {
        this.thinkingSeat = null;
        this.emit();
        return;
      }
      const seat = h.toAct;
      const view = viewFor(h, seat);
      const legal = view.legal!;
      const street = view.street === "complete" ? "river" : view.street;
      const delay = thinkTimeMs({ street, toCall: legal.callAmount, pot: view.pot, stack: legal.stack }, speed, this.thinkRng);
      this.thinkingSeat = seat;
      this.emit();
      this.schedule(delay, () => {
        this.thinkingSeat = null;
        this.botAct(seat);
        this.emit();
        this.pump();
      });
      return;
    }

    // The hand is over and everything has been shown.
    if (!this.handFinished) this.finishHand();
    if (this.heroStackAtTable() <= 0) {
      this.waitingForRebuy = true;
      this.emit();
      return;
    }
    if (this.autoDeal) this.schedule(this.handGapMs ?? nextHandDelayMs(speed), () => void this.deal());
  }

  private botAct(seat: number): void {
    const style = BOT_STYLES[seat];
    if (!style) throw new Error(`Seat ${seat} has no bot style`);
    const action = placeholderAction(viewFor(this.hand!, seat), style, this.botRng);
    this.hand = applyAction(this.hand!, action);
  }

  /** Plays the rest of the hand at once (used when you are out of it and want the next hand). */
  private playOutHand(): void {
    this.clearTimer();
    const h = this.hand!;
    let state = h;
    while (state.toAct >= 0) {
      if (state.toAct === HERO_SEAT) throw new Error("Cannot skip while it is the hero's turn");
      const seat = state.toAct;
      state = applyAction(state, placeholderAction(viewFor(state, seat), BOT_STYLES[seat]!, this.botRng));
    }
    this.hand = state;
    this.revealIndex = state.events.length;
    this.thinkingSeat = null;
    this.finishHand();
  }

  private finishHand(): void {
    const h = this.hand!;
    if (this.handFinished) return;
    this.handFinished = true;
    this.table = applyHandResult(this.table, h);
    this.handsPlayed++;
    this.history.push(recordHand(h, HERO_SEAT, BOT_STYLES));
    if (this.history.length > MAX_HISTORY) this.history.shift();
    this.persist();
    this.emit();
  }

  private persist(): void {
    saveGame(this.store, { version: 1, wallet: this.wallet, heroStack: this.heroStackAtTable(), settings: this.settings });
  }

  private emit(): void {
    this.version++;
    this.snapshot = this.buildSnapshot();
    for (const l of [...this.listeners]) l();
  }

  private buildSnapshot(): GameSnapshot {
    const h = this.hand;
    const display = h ? projectEvents(h.config, h.events, this.revealIndex) : null;
    const heroCanAct = this.canHeroAct();
    const legal = heroCanAct && h ? (viewFor(h, HERO_SEAT).legal ?? null) : null;
    const fullyShown = !!h && this.handFinished && this.revealIndex === h.events.length;
    const log = h ? formatHand(h, { upTo: this.revealIndex, youSeat: HERO_SEAT }) : [];
    const heroStack = display?.seats[HERO_SEAT]?.stack ?? this.heroStackAtTable();
    const inProgress = !!h && !this.handFinished;

    let result: GameSnapshot["result"] = null;
    if (fullyShown && h!.result) {
      result = {
        heroNet: h!.result.net[HERO_SEAT] ?? 0,
        lines: log.filter((l) => / (wins?|split) /.test(l)),
      };
    }
    return {
      version: this.version,
      settings: this.settings,
      bigBlind: BIG_BLIND,
      wallet: this.wallet,
      heroStack: this.handFinished || !h ? this.heroStackAtTable() : heroStack,
      sessionNet: this.wallet + (this.handFinished || !h ? this.heroStackAtTable() : heroStack) - this.baseline,
      handsPlayed: this.handsPlayed,
      display,
      heroHole: h && this.revealIndex > 0 ? (h.players[HERO_SEAT]?.hole ?? null) : null,
      street: h ? h.street : null,
      heroCanAct,
      legal,
      thinkingSeat: this.thinkingSeat,
      canSkip: inProgress && this.heroIsDone(),
      canDeal: !h || this.handFinished || (inProgress && this.heroIsDone()),
      handInProgress: inProgress,
      waitingForRebuy: this.waitingForRebuy,
      canRebuy: this.canRebuyNow(),
      rebuyAmount: this.rebuyAmount(),
      bankrollEmpty: (!h || this.handFinished) && this.heroStackAtTable() <= 0 && this.wallet <= 0,
      depthChangePending: this.tableDepth !== this.settings.stackDepth,
      result,
      log,
    };
  }
}
