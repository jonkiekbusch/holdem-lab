// Plays lots of hands with a deliberately unhinged random player, including attempts at
// illegal moves, to prove the rules engine never loses chips and never allows an illegal action.

import {
  IllegalActionError,
  actionsOf,
  applyAction,
  legalActions,
  replayHand,
  startHand,
  type Action,
  type HandState,
} from "../engine/hand.ts";
import { createRng, type Rng } from "../engine/rng.ts";
import { applyHandResult, createTable, prepareNextHand, type Table, type TableSeat } from "../engine/table.ts";
import { checkInvariants } from "./invariants.ts";

export interface RandomSimOptions {
  hands: number;
  seed: string;
  smallBlind?: number;
  bigBlind?: number;
  /** Called with every finished hand. */
  onHand?: (hand: HandState) => void;
  /** Replay every Nth hand from its action list and compare (0 = never). */
  replayEvery?: number;
}

export interface RandomSimStats {
  hands: number;
  actions: number;
  illegalAttempts: number;
  illegalRejected: number;
  showdowns: number;
  uncontested: number;
  sidePotHands: number;
  splitPotHands: number;
  oddChipHands: number;
  allInHands: number;
  shortAllInHands: number;
  deadButtonHands: number;
  headsUpHands: number;
  replaysChecked: number;
}

function illegalAttempts(state: HandState): Action[] {
  const legal = legalActions(state)!;
  const seat = legal.seat;
  const attempts: Action[] = [
    { seat: (seat + 1) % state.players.length, type: "check" },
    { seat, type: "raise" },
    { seat, type: "raise", to: Number.NaN },
    { seat, type: "raise", to: legal.maxRaiseTo + 1 },
    { seat, type: "raise", to: legal.minRaiseTo + 0.5 },
    { seat, type: "raise", to: -5 },
    { seat, type: "bogus" as never },
  ];
  if (!legal.canCheck) attempts.push({ seat, type: "check" });
  if (legal.canCheck) attempts.push({ seat, type: "call" });
  if (legal.canRaise && legal.minRaiseTo > legal.currentBet + 1) attempts.push({ seat, type: "raise", to: legal.minRaiseTo - 1 });
  if (!legal.canRaise) attempts.push({ seat, type: "raise", to: legal.maxRaiseTo });
  return attempts;
}

function randomAction(state: HandState, rng: Rng): Action {
  const legal = legalActions(state)!;
  const seat = legal.seat;
  const roll = rng.float();
  if (roll < 0.1 && !legal.canCheck) return { seat, type: "fold" };
  if (roll < 0.04) return { seat, type: "fold" };
  if (roll < 0.55 || !legal.canRaise) return legal.canCheck ? { seat, type: "check" } : { seat, type: "call" };
  const span = legal.maxRaiseTo - legal.minRaiseTo;
  const pick = rng.float();
  let to: number;
  if (pick < 0.25) to = legal.minRaiseTo;
  else if (pick < 0.45) to = legal.maxRaiseTo;
  else if (pick < 0.7) to = Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, legal.currentBet + legal.pot));
  else to = legal.minRaiseTo + rng.int(span + 1);
  return { seat, type: "raise", to };
}

export function playRandomHands(options: RandomSimOptions): RandomSimStats {
  const rng = createRng(`sim:${options.seed}`);
  const bigBlind = options.bigBlind ?? 2;
  const fresh = (): number => bigBlind * (rng.float() < 0.25 ? 5 + rng.int(25) : 20 + rng.int(281));
  const names = ["Ann", "Ben", "Cat", "Dan", "Eve", "Fay"];
  const seats: TableSeat[] = names.map((name) => ({ name, stack: fresh(), sittingOut: false }));
  let table: Table = createTable({ seed: options.seed, seats, smallBlind: options.smallBlind ?? 1, bigBlind, buttonSeat: rng.int(6) });

  const stats: RandomSimStats = {
    hands: 0,
    actions: 0,
    illegalAttempts: 0,
    illegalRejected: 0,
    showdowns: 0,
    uncontested: 0,
    sidePotHands: 0,
    splitPotHands: 0,
    oddChipHands: 0,
    allInHands: 0,
    shortAllInHands: 0,
    deadButtonHands: 0,
    headsUpHands: 0,
    replaysChecked: 0,
  };

  while (stats.hands < options.hands) {
    // Keep the table lively: players leave, sit out, join and rebuy.
    const seatsNow = table.seats.map((s, i) => {
      if (s && s.stack === 0) return rng.float() < 0.7 ? { ...s, stack: fresh() } : null;
      if (!s) return rng.float() < 0.35 ? { name: `New${i}`, stack: fresh(), sittingOut: false } : null;
      if (rng.float() < 0.02) return { ...s, sittingOut: !s.sittingOut };
      if (rng.float() < 0.01) return null;
      return s;
    });
    table = { ...table, seats: seatsNow };

    const next = prepareNextHand(table);
    if (!next) continue;
    table = next.table;

    const totalChips = next.config.seats.reduce((sum, s) => sum + (s?.stack ?? 0), 0);
    let hand = startHand(next.config);
    checkInvariants(hand, totalChips);

    const liveCount = next.config.seats.filter((s) => s && s.stack > 0).length;
    if (liveCount === 2) stats.headsUpHands++;
    if (next.config.smallBlindSeat === null || !table.seats[next.config.buttonSeat] || table.seats[next.config.buttonSeat]!.sittingOut) stats.deadButtonHands++;

    let guard = 0;
    while (hand.toAct >= 0) {
      if (++guard > 500) throw new Error("Hand did not finish");
      if (rng.float() < 0.15) {
        for (const bad of illegalAttempts(hand)) {
          const before = JSON.stringify(hand);
          stats.illegalAttempts++;
          let threw = false;
          try {
            applyAction(hand, bad);
          } catch (e) {
            if (!(e instanceof IllegalActionError)) throw e;
            threw = true;
          }
          if (!threw) throw new Error(`Illegal action was accepted: ${JSON.stringify(bad)} in hand ${hand.config.seed}`);
          if (JSON.stringify(hand) !== before) throw new Error("A rejected action changed the state");
          stats.illegalRejected++;
        }
      }
      hand = applyAction(hand, randomAction(hand, rng));
      stats.actions++;
      checkInvariants(hand, totalChips);
    }

    const result = hand.result!;
    stats.hands++;
    if (result.showdown) stats.showdowns++;
    else stats.uncontested++;
    if (result.pots.length > 1) stats.sidePotHands++;
    if (result.pots.some((p) => p.winners.length > 1)) stats.splitPotHands++;
    if (result.pots.some((p) => p.awards.some((a) => a.amount !== p.awards[0].amount))) stats.oddChipHands++;
    if (hand.players.some((p) => p?.allIn)) stats.allInHands++;
    if (hand.events.some((e) => e.type === "action" && e.allIn && (e.action === "raise" || e.action === "bet"))) stats.shortAllInHands++;

    if (options.replayEvery && stats.hands % options.replayEvery === 0) {
      const replayed = replayHand(next.config, actionsOf(hand));
      if (JSON.stringify(replayed) !== JSON.stringify(hand)) throw new Error(`Replay differs for hand ${hand.config.seed}`);
      stats.replaysChecked++;
    }

    options.onHand?.(hand);
    table = applyHandResult(table, hand);
  }
  return stats;
}
