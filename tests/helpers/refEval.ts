// A deliberately slow, independently written hand evaluator used to cross-check the fast one.
// It tries every 5-card subset and compares hands as plain arrays: [category, tiebreakers...].

import type { Card } from "../../src/engine/cards.ts";

export function eval5(cards: readonly Card[]): number[] {
  const ranks = cards.map((c) => c >> 2).sort((a, b) => b - a);
  const suits = cards.map((c) => c & 3);
  const flush = suits.every((s) => s === suits[0]);
  const unique = [...new Set(ranks)];
  let straightHigh = -1;
  if (unique.length === 5) {
    if (ranks[0] - ranks[4] === 4) straightHigh = ranks[0];
    else if (ranks.join() === "12,3,2,1,0") straightHigh = 3;
  }
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const shape = groups.map((g) => g[1]).join("");
  const byGroup = groups.map((g) => g[0]);

  if (straightHigh >= 0 && flush) return [8, straightHigh];
  if (shape === "41") return [7, ...byGroup];
  if (shape === "32") return [6, ...byGroup];
  if (flush) return [5, ...ranks];
  if (straightHigh >= 0) return [4, straightHigh];
  if (shape === "311") return [3, ...byGroup];
  if (shape === "221") return [2, ...byGroup];
  if (shape === "2111") return [1, ...byGroup];
  return [0, ...ranks];
}

export function compareArrays(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}

function* subsets(cards: readonly Card[], k: number, start = 0, chosen: Card[] = []): Generator<Card[]> {
  if (chosen.length === k) {
    yield chosen.slice();
    return;
  }
  for (let i = start; i < cards.length; i++) {
    chosen.push(cards[i]);
    yield* subsets(cards, k, i + 1, chosen);
    chosen.pop();
  }
}

export function refBest(cards: readonly Card[]): number[] {
  let best: number[] | null = null;
  for (const five of subsets(cards, 5)) {
    const v = eval5(five);
    if (best === null || compareArrays(v, best) > 0) best = v;
  }
  return best!;
}
