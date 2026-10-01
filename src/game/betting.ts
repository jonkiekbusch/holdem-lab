// Bet sizing for the action bar: the quick-size buttons and what amounts are allowed.
// Pure functions, tested separately from the screen.

import { snapRaiseTo, type LegalActions, type Street } from "../engine/hand.ts";

export interface QuickSize {
  /** "1/3", "1/2", "2/3", "pot", "2.5x", "3x", "4x" or "all-in" */
  key: string;
  /** Total the player would raise to. Always a legal amount. */
  to: number;
  isAllIn: boolean;
}

/** Puts an amount inside the legal range, whole chips, with the near-all-in rule applied. */
export function clampRaiseTo(legal: LegalActions, to: number): number {
  const whole = Number.isFinite(to) ? Math.round(to) : legal.minRaiseTo;
  return snapRaiseTo(legal, Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, whole)));
}

const FRACTIONS: ReadonlyArray<readonly [string, number]> = [
  ["1/3", 1 / 3],
  ["1/2", 1 / 2],
  ["2/3", 2 / 3],
];
const PREFLOP_MULTIPLES: ReadonlyArray<readonly [string, number]> = [
  ["2.5x", 2.5],
  ["3x", 3],
  ["4x", 4],
];

/**
 * The five quick buttons. After the flop: 1/3, 1/2, 2/3 pot, pot, all-in.
 * Before the flop: 2.5x, 3x, 4x the current bet (the big blind if nobody has raised), pot, all-in.
 * A "pot" raise is: call first, then raise by the size of the pot including that call.
 */
export function quickSizes(legal: LegalActions, street: Street): QuickSize[] {
  if (!legal.canRaise) return [];
  const potAfterCall = legal.pot + legal.callAmount;
  const build = (key: string, to: number): QuickSize => {
    const clamped = clampRaiseTo(legal, to);
    return { key, to: clamped, isAllIn: clamped === legal.maxRaiseTo };
  };
  const sizes: QuickSize[] =
    street === "preflop"
      ? PREFLOP_MULTIPLES.map(([key, m]) => build(key, m * legal.currentBet))
      : FRACTIONS.map(([key, f]) => build(key, legal.currentBet + f * potAfterCall));
  sizes.push(build("pot", legal.currentBet + potAfterCall));
  sizes.push({ key: "all-in", to: legal.maxRaiseTo, isAllIn: true });
  return sizes;
}

/** "Bet 10", "Raise to 30" or "All-in 200" */
export function raiseLabel(legal: LegalActions, to: number): string {
  if (to === legal.maxRaiseTo) return `All-in ${to}`;
  return legal.currentBet === 0 ? `Bet ${to}` : `Raise to ${to}`;
}

/**
 * Pot odds as a whole percent: the share of the final pot you must win for a call to break even,
 * i.e. call / (pot + call). Null when there is nothing to call.
 */
export function potOddsPercent(legal: LegalActions): number | null {
  if (legal.callAmount <= 0) return null;
  return Math.round((100 * legal.callAmount) / (legal.pot + legal.callAmount));
}

export function checkCallLabel(legal: LegalActions): string {
  if (legal.canCheck) return "Check";
  return legal.callAmount >= legal.stack ? `Call ${legal.callAmount} (all-in)` : `Call ${legal.callAmount}`;
}
