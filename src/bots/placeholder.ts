// Simple stand-in opponents for the Phase 2 watch page and Phase 3 table.
// They only look at their PlayerView (never the real hand), and they are NOT the real bots:
// the personality-driven bots arrive in Phases 4 and 5.

import type { Action } from "../engine/hand.ts";
import type { Rng } from "../engine/rng.ts";
import type { PlayerView } from "../engine/view.ts";

export type PlaceholderStyle = "caller" | "wild" | "careful";

export function placeholderAction(view: PlayerView, style: PlaceholderStyle, rng: Rng): Action {
  const legal = view.legal;
  if (!legal) throw new Error("Not this bot's turn");
  const seat = view.seat;
  const passive = (): Action => (legal.canCheck ? { seat, type: "check" } : { seat, type: "call" });
  const raiseTo = (to: number): Action => ({
    seat,
    type: "raise",
    to: Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, Math.round(to))),
  });
  const roll = rng.float();
  const facingBet = !legal.canCheck;

  switch (style) {
    case "caller": {
      if (facingBet && legal.callAmount > legal.stack * 0.4 && roll < 0.3) return { seat, type: "fold" };
      if (legal.canRaise && roll > 0.94) return raiseTo(legal.minRaiseTo);
      return passive();
    }
    case "wild": {
      if (facingBet && roll < 0.1) return { seat, type: "fold" };
      if (legal.canRaise && roll > 0.65) {
        if (roll > 0.92) return raiseTo(legal.maxRaiseTo);
        return raiseTo(legal.currentBet + legal.pot * (0.4 + rng.float() * 0.8));
      }
      return passive();
    }
    case "careful": {
      if (facingBet && roll < 0.5) return { seat, type: "fold" };
      if (legal.canRaise && roll > 0.85) return raiseTo(legal.currentBet + legal.pot * 0.66);
      return passive();
    }
  }
}
