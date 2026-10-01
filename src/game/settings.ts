// The choices you can make in Settings, and the fixed table rules.

export type Speed = "realistic" | "fast" | "instant";
export const SPEEDS: readonly Speed[] = ["realistic", "fast", "instant"];
export const SPEED_LABELS: Record<Speed, string> = { realistic: "Realistic", fast: "Fast", instant: "Instant" };

export type StackDepth = 40 | 100 | 200;
export const STACK_DEPTHS: readonly StackDepth[] = [40, 100, 200];

export interface Settings {
  /** Starting stack in big blinds, for you and the bots. */
  stackDepth: StackDepth;
  /** How long bots pause: Fast (short pauses, the default), Realistic (slower), Instant (none). */
  speed: Speed;
  /** Show the share of the pot you must win to break even on a call, on the Call button. */
  potOdds: boolean;
}

export const DEFAULT_SETTINGS: Settings = { stackDepth: 100, speed: "fast", potOdds: true };

export const SMALL_BLIND = 1;
export const BIG_BLIND = 2;
/** Play money you start with. Buy-ins and rebuys come out of it. */
export const STARTING_BANKROLL = 10_000;

export function isSpeed(x: unknown): x is Speed {
  return x === "realistic" || x === "fast" || x === "instant";
}
export function isStackDepth(x: unknown): x is StackDepth {
  return x === 40 || x === 100 || x === 200;
}
