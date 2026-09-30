// How long things take on screen. Only the pauses change with the speed setting;
// the decisions and the cards never do.
//   Fast (default): short pauses, roughly 1-3 seconds for a bot decision, a little longer for big ones.
//   Realistic: the slower opt-in mode. For now it is the same shape, stretched; the human-like
//              lognormal think times arrive in Phase 7.
//   Instant: no pauses.

import type { HandEvent } from "../engine/hand.ts";
import type { Rng } from "../engine/rng.ts";
import type { Speed } from "./settings.ts";

export interface ThinkContext {
  street: "preflop" | "flop" | "turn" | "river";
  /** Chips the bot must put in to call (0 if it can check). */
  toCall: number;
  /** Chips in the middle, including the bet being faced. */
  pot: number;
  stack: number;
}

const STREET_INDEX = { preflop: 0, flop: 1, turn: 2, river: 3 } as const;

export const FAST_THINK_MIN_MS = 800;
export const FAST_THINK_MAX_MS = 3000;
const REALISTIC_SCALE = 2.2;
const REALISTIC_THINK_MAX_MS = 9000;

export function thinkTimeMs(ctx: ThinkContext, speed: Speed, rng: Rng): number {
  if (speed === "instant") return 0;
  const facing = ctx.toCall > 0;
  const pressure = facing ? Math.min(1, ctx.toCall / Math.max(ctx.pot, 1)) : 0;
  const allInPressure = facing && ctx.toCall >= ctx.stack ? 1 : 0;
  const fast = Math.min(
    FAST_THINK_MAX_MS,
    FAST_THINK_MIN_MS + 700 * pressure + 350 * allInPressure + 250 * STREET_INDEX[ctx.street] + 450 * rng.float(),
  );
  if (speed === "fast") return Math.round(fast);
  return Math.round(Math.min(REALISTIC_THINK_MAX_MS, fast * REALISTIC_SCALE));
}

/** Pause before an event that is not a player's own action becomes visible. */
export function revealDelayMs(event: HandEvent, speed: Speed): number {
  if (speed === "instant") return 0;
  let ms = 0;
  switch (event.type) {
    case "deal_board":
      ms = event.street === "flop" ? 800 : 700;
      break;
    case "show":
      ms = 900;
      break;
    case "muck":
      ms = 350;
      break;
    case "uncalled_return":
      ms = 500;
      break;
    case "pot_award":
      ms = 800;
      break;
    default:
      ms = 0;
  }
  return speed === "realistic" ? Math.round(ms * 1.8) : ms;
}

/** How long the result stays on screen before the next hand is dealt. */
export function nextHandDelayMs(speed: Speed): number {
  return speed === "fast" ? 2800 : speed === "realistic" ? 4500 : 700;
}
