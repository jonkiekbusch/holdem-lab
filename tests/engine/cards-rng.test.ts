import { describe, expect, it } from "vitest";
import { cardPretty, cardString, newDeck, parseCard, parseCards, rankOf, suitOf } from "../../src/engine/cards.ts";
import { createRng, shuffle } from "../../src/engine/rng.ts";

describe("cards", () => {
  it("has 52 distinct cards", () => {
    const deck = newDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck).size).toBe(52);
  });

  it.each([
    ["2c", 0, 0],
    ["2d", 0, 1],
    ["2h", 0, 2],
    ["2s", 0, 3],
    ["Td", 8, 1],
    ["Kh", 11, 2],
    ["As", 12, 3],
  ])("parses %s as rank %i, suit %i", (text, rank, suit) => {
    const card = parseCard(text);
    expect(rankOf(card)).toBe(rank);
    expect(suitOf(card)).toBe(suit);
    expect(cardString(card)).toBe(text);
  });

  it("prints symbols for the on-screen log", () => {
    expect(cardPretty(parseCard("As"))).toBe("A♠");
    expect(cardPretty(parseCard("Td"))).toBe("T♦");
    expect(cardPretty(parseCard("7h"))).toBe("7♥");
    expect(cardPretty(parseCard("2c"))).toBe("2♣");
  });

  it("parses lists with or without spaces", () => {
    expect(parseCards("As Kd")).toEqual(parseCards("AsKd"));
    expect(parseCards("")).toEqual([]);
  });

  it.each(["", "A", "Ax", "1s", "Asd", "AA"])("rejects bad card %j", (text) => {
    expect(() => parseCard(text)).toThrow();
  });

  it("rejects odd-length lists", () => {
    expect(() => parseCards("AsK")).toThrow();
  });
});

describe("seedable random numbers", () => {
  it("gives the same sequence for the same seed", () => {
    const a = createRng("seed");
    const b = createRng("seed");
    for (let i = 0; i < 100; i++) expect(a.uint32()).toBe(b.uint32());
  });

  it.each([["a", "b"], ["seed1", "seed2"], ["x#1", "x#2"], ["", "0"]])("gives different sequences for %j and %j", (s1, s2) => {
    const a = createRng(s1);
    const b = createRng(s2);
    const same = Array.from({ length: 20 }, () => a.uint32() === b.uint32()).every(Boolean);
    expect(same).toBe(false);
  });

  it("keeps floats in [0, 1)", () => {
    const rng = createRng("floats");
    for (let i = 0; i < 10000; i++) {
      const x = rng.float();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it.each([1, 2, 3, 6, 52, 1000])("keeps int(%i) in range and hits every value", (n) => {
    const rng = createRng(`int${n}`);
    const seen = new Set<number>();
    for (let i = 0; i < Math.max(2000, n * 40); i++) {
      const x = rng.int(n);
      expect(Number.isInteger(x)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(n);
      seen.add(x);
    }
    expect(seen.size).toBe(n);
  });

  it.each([0, -1, 1.5, Number.NaN])("rejects int(%d)", (n) => {
    expect(() => createRng("x").int(n)).toThrow();
  });

  it("is roughly uniform", () => {
    const rng = createRng("uniform");
    const buckets = new Array<number>(10).fill(0);
    const draws = 100000;
    for (let i = 0; i < draws; i++) buckets[rng.int(10)]++;
    for (const count of buckets) expect(Math.abs(count - draws / 10)).toBeLessThan(draws * 0.01);
  });
});

describe("shuffling", () => {
  it("returns a permutation and leaves the input alone", () => {
    const deck = newDeck();
    const copy = deck.slice();
    const out = shuffle(deck, createRng("perm"));
    expect(deck).toEqual(copy);
    expect([...out].sort((a, b) => a - b)).toEqual(copy);
  });

  it("is repeatable from the seed and different across seeds", () => {
    expect(shuffle(newDeck(), createRng("same"))).toEqual(shuffle(newDeck(), createRng("same")));
    expect(shuffle(newDeck(), createRng("one"))).not.toEqual(shuffle(newDeck(), createRng("two")));
  });

  it("puts every card in every position about equally often", () => {
    const rng = createRng("fair");
    const runs = 52000;
    const first = new Array<number>(52).fill(0);
    const last = new Array<number>(52).fill(0);
    for (let i = 0; i < runs; i++) {
      const d = shuffle(newDeck(), rng);
      first[d[0]]++;
      last[d[51]]++;
    }
    for (const counts of [first, last]) for (const c of counts) expect(Math.abs(c - 1000)).toBeLessThan(200);
  });
});
