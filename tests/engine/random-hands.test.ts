import { describe, expect, it } from "vitest";
import { evaluate } from "../../src/engine/evaluator.ts";
import type { HandState } from "../../src/engine/hand.ts";
import { playRandomHands } from "../../src/sim/randomSim.ts";
import { compareArrays, refBest } from "../helpers/refEval.ts";

/** For every showdown pot, the winners must be exactly the best hands among the players in that pot. */
function checkWinners(hand: HandState): void {
  const r = hand.result!;
  for (const pot of r.pots) {
    if (pot.eligible.length < 2) continue;
    const best = pot.eligible.map((seat) => ({ seat, ref: refBest([...hand.players[seat]!.hole, ...hand.board]) }));
    let top = best[0].ref;
    for (const b of best) if (compareArrays(b.ref, top) > 0) top = b.ref;
    const expected = best.filter((b) => compareArrays(b.ref, top) === 0).map((b) => b.seat).sort((a, b) => a - b);
    expect([...pot.winners].sort((a, b) => a - b)).toEqual(expected);
    for (const seat of pot.eligible) expect(evaluate([...hand.players[seat]!.hole, ...hand.board])).toBeGreaterThan(-1);
  }
}

describe("random hands: chips are never created or lost, illegal actions never get through", () => {
  it("plays 10,000 hands with random play, random stack sizes and players coming and going", () => {
    let checked = 0;
    const stats = playRandomHands({
      hands: 10000,
      seed: "phase2-main",
      replayEvery: 20,
      onHand: (hand) => {
        if (hand.result!.showdown && checked++ % 4 === 0) checkWinners(hand);
      },
    });
    console.log("10,000-hand run:", JSON.stringify(stats));
    expect(stats.hands).toBe(10000);
    expect(stats.illegalAttempts).toBeGreaterThan(5000);
    expect(stats.illegalRejected).toBe(stats.illegalAttempts);
    // The run must actually have exercised the tricky parts, or passing would mean nothing.
    expect(stats.showdowns).toBeGreaterThan(1500);
    expect(stats.uncontested).toBeGreaterThan(500);
    expect(stats.allInHands).toBeGreaterThan(1000);
    expect(stats.sidePotHands).toBeGreaterThan(100);
    expect(stats.splitPotHands).toBeGreaterThan(20);
    expect(stats.oddChipHands).toBeGreaterThan(5);
    expect(stats.shortAllInHands).toBeGreaterThan(100);
    expect(stats.deadButtonHands).toBeGreaterThan(50);
    expect(stats.headsUpHands).toBeGreaterThan(50);
    expect(stats.replaysChecked).toBe(500);
  }, 300_000);

  it.each([
    ["seed-a", 5, 10, 2500],
    ["seed-b", 1, 3, 2500],
    ["seed-c", 0, 2, 2500],
  ])("also holds with other blinds (%s, %i/%i)", (seed, sb, bb, hands) => {
    const stats = playRandomHands({ hands, seed, smallBlind: sb, bigBlind: bb, replayEvery: 50 });
    expect(stats.hands).toBe(hands);
    expect(stats.illegalRejected).toBe(stats.illegalAttempts);
  }, 120_000);
});
