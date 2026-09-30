import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyAction, legalActions, startHand, type HandState } from "../../src/engine/hand.ts";
import { createRng } from "../../src/engine/rng.ts";
import { viewFor } from "../../src/engine/view.ts";
import { scenarioConfig } from "../helpers/scenario.ts";

function randomHand(seed: string): HandState[] {
  const rng = createRng(seed);
  let s = startHand(scenarioConfig({ stacks: [200, 150, 300, 80, 200, 120], seed, button: rng.int(6) }));
  const states = [s];
  while (s.toAct >= 0) {
    const l = legalActions(s)!;
    const roll = rng.float();
    const action =
      roll < 0.15 ? { seat: l.seat, type: "fold" as const }
      : roll < 0.6 || !l.canRaise ? (l.canCheck ? { seat: l.seat, type: "check" as const } : { seat: l.seat, type: "call" as const })
      : { seat: l.seat, type: "raise" as const, to: l.minRaiseTo + rng.int(l.maxRaiseTo - l.minRaiseTo + 1) };
    s = applyAction(s, action);
    states.push(s);
  }
  return states;
}

describe("fair play: what a bot is allowed to see", () => {
  it("only ever gets its own hole cards", () => {
    for (let h = 0; h < 200; h++) {
      for (const state of randomHand(`fair-${h}`)) {
        for (const p of state.players) {
          if (!p) continue;
          const view = viewFor(state, p.seat);
          expect(view.hole).toEqual(p.hole);
          const json = JSON.stringify(view);
          for (const other of state.players) {
            if (!other || other.seat === p.seat) continue;
            const shown = state.events.some((e) => e.type === "show" && e.seat === other.seat);
            if (!shown) expect(json).not.toContain(`[${other.hole[0]},${other.hole[1]}]`);
          }
        }
      }
    }
  });

  it("never contains the deck or anyone else's cards as a field", () => {
    const state = randomHand("fields")[0];
    const view = viewFor(state, 0) as unknown as Record<string, unknown>;
    expect(Object.keys(view).sort()).toEqual(
      ["seat", "hole", "board", "street", "pot", "currentBet", "lastRaiseSize", "toAct", "handNumber", "buttonSeat", "smallBlindSeat", "bigBlindSeat", "smallBlind", "bigBlind", "players", "legal", "events"].sort(),
    );
    for (const p of view.players as Array<Record<string, unknown> | null>) {
      if (p) expect(Object.keys(p)).not.toContain("hole");
    }
    expect(JSON.stringify(view)).not.toContain("deck");
  });

  it("does not reveal the future board", () => {
    const states = randomHand("board");
    const first = viewFor(states[0], 0);
    expect(first.board).toEqual([]);
    const final = states[states.length - 1];
    if (final.board.length === 5) {
      const beforeFlop = states.find((s) => s.street === "preflop")!;
      expect(viewFor(beforeFlop, 0).board).toHaveLength(0);
    }
  });

  it("shows other players' cards only after they show them", () => {
    const states = randomHand("reveal");
    const final = states[states.length - 1];
    const view = viewFor(final, 0);
    const shows = view.events.filter((e) => e.type === "show").length;
    const mucks = view.events.filter((e) => e.type === "muck").length;
    expect(shows + mucks === 0 || final.result!.showdown).toBe(true);
  });

  it("only gives legal actions to the player whose turn it is", () => {
    const state = startHand(scenarioConfig({ stacks: [200, 200, 200] }));
    for (const p of state.players) {
      const view = viewFor(state, p!.seat);
      if (p!.seat === state.toAct) expect(view.legal).not.toBeNull();
      else expect(view.legal).toBeNull();
    }
  });

  it("cannot be used to change the real hand", () => {
    const state = startHand(scenarioConfig({ stacks: [200, 200, 200] }));
    const before = JSON.stringify(state);
    const view = viewFor(state, 0);
    (view.events as unknown[]).length = 0;
    (view.board as number[]).push(5);
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe("the engine and bots contain no screen code", () => {
  const dirs = ["src/engine", "src/bots", "src/sim"];
  const files = dirs.flatMap((d) => {
    try {
      return readdirSync(d)
        .map((f) => join(d, f))
        .filter((f) => statSync(f).isFile() && f.endsWith(".ts"));
    } catch {
      return [];
    }
  });

  it.each(files)("%s", (file) => {
    const text = readFileSync(file, "utf8");
    expect(text).not.toMatch(/from\s+["']preact/);
    expect(text).not.toMatch(/\b(document|window|localStorage|navigator)\./);
    expect(text).not.toMatch(/from\s+["'][./]*\/?(ui|App)/);
    expect(text).not.toMatch(/\.tsx["']/);
  });
});
