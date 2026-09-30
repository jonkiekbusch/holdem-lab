import { describe, expect, it } from "vitest";
import { parseCards, newDeck } from "../../src/engine/cards.ts";
import { Category, categoryOf, describeScore, evaluate } from "../../src/engine/evaluator.ts";
import { createRng, shuffle } from "../../src/engine/rng.ts";
import { compareArrays, refBest } from "../helpers/refEval.ts";

const score = (text: string): number => evaluate(parseCards(text));

describe("hand categories and descriptions (known hands)", () => {
  const known: Array<[string, string, Category, string]> = [
    ["high card", "As Kd 9c 7h 5d 3c 2s", Category.HighCard, "Ace high"],
    ["high card, five cards", "Kd Qc 9h 5d 2c", Category.HighCard, "King high"],
    ["pair", "As Ad 9c 7h 5d 3c 2s", Category.Pair, "Pair of Aces"],
    ["pair of deuces", "2s 2d Kc Qh 9d 5c 3s", Category.Pair, "Pair of Twos"],
    ["two pair", "Ks Kd 9c 9h 3d 2c 7s", Category.TwoPair, "Two pair, Kings and Nines"],
    ["three pairs use the best two", "Ks Kd 9c 9h 3d 3c 7s", Category.TwoPair, "Two pair, Kings and Nines"],
    ["trips", "7s 7d 7c Kh 3d 2c 9s", Category.ThreeOfAKind, "Three of a kind, Sevens"],
    ["straight", "5s 6d 7c 8h 9d 2c Ks", Category.Straight, "Straight, Nine high"],
    ["wheel", "As 2d 3c 4h 5d 9c Ks", Category.Straight, "Straight, Five high"],
    ["broadway", "As Kd Qc Jh Td 2c 3s", Category.Straight, "Straight, Ace high"],
    ["six-high straight with a pair on board", "2s 3d 4c 5h 6d Kc Ks", Category.Straight, "Straight, Six high"],
    ["longest straight wins", "4s 5d 6c 7h 8d 9c Ts", Category.Straight, "Straight, Ten high"],
    ["straight beats trips", "5s 6d 7c 8h 9d 9c 9s", Category.Straight, "Straight, Nine high"],
    ["flush", "As Ks 9s 5s 3s 2d 7c", Category.Flush, "Flush, Ace high"],
    ["six-card flush uses the top five", "As Ks 9s 5s 3s 2s 7c", Category.Flush, "Flush, Ace high"],
    ["flush, king high", "Ks Qs 9s 5s 3s Ad 7c", Category.Flush, "Flush, King high"],
    ["flush beats a straight made of mixed suits", "As Ks Qs Js 9s Td 2c", Category.Flush, "Flush, Ace high"],
    ["full house", "Ks Kd Kc 9h 9d 2c 7s", Category.FullHouse, "Full house, Kings full of Nines"],
    ["two sets make a full house", "Ks Kd Kc 9h 9d 9c 7s", Category.FullHouse, "Full house, Kings full of Nines"],
    ["trips plus two pair", "Ks Kd Kc 9h 9d 7c 7s", Category.FullHouse, "Full house, Kings full of Nines"],
    ["trips plus higher pair", "7s 7d 7c Kh Kd 2c 3s", Category.FullHouse, "Full house, Sevens full of Kings"],
    ["quads", "9s 9d 9c 9h Kd 2c 7s", Category.FourOfAKind, "Four of a kind, Nines"],
    ["quads with trips", "9s 9d 9c 9h Kd Kc Ks", Category.FourOfAKind, "Four of a kind, Nines"],
    ["straight flush", "5s 6s 7s 8s 9s 2c Kd", Category.StraightFlush, "Straight flush, Nine high"],
    ["steel wheel", "As 2s 3s 4s 5s Kd 9c", Category.StraightFlush, "Straight flush, Five high"],
    ["royal flush", "As Ks Qs Js Ts 2c 3d", Category.StraightFlush, "Royal flush"],
    ["straight flush over a higher flush card", "Ks 5s 6s 7s 8s 9s 2c", Category.StraightFlush, "Straight flush, Nine high"],
    ["five-card straight", "5s 6d 7c 8h 9d", Category.Straight, "Straight, Nine high"],
    ["five-card flush", "2h 5h 9h Jh Kh", Category.Flush, "Flush, King high"],
    ["five-card full house", "Qs Qd Qc 2h 2d", Category.FullHouse, "Full house, Queens full of Twos"],
    ["not a straight: A-K-Q-J-9", "As Kd Qc Jh 9d", Category.HighCard, "Ace high"],
    ["not a wheel: A-2-3-4-6", "As 2d 3c 4h 6d", Category.HighCard, "Ace high"],
    ["no wraparound: Q-K-A-2-3", "Qs Kd Ac 2h 3d", Category.HighCard, "Ace high"],
    ["no wraparound: K-A-2-3-4", "Ks Ad 2c 3h 4d", Category.HighCard, "Ace high"],
  ];
  it.each(known)("%s", (_name, cards, category, description) => {
    const s = score(cards);
    expect(categoryOf(s)).toBe(category);
    expect(describeScore(s)).toBe(description);
  });
});

describe("hand ordering", () => {
  // Each row: a hand that must beat a weaker one.
  const beats: Array<[string, string, string]> = [
    ["royal over straight flush", "As Ks Qs Js Ts", "9s 8s 7s 6s 5s"],
    ["straight flush over quads", "5s 6s 7s 8s 9s", "Ad Ac Ah As Kd"],
    ["quads over full house", "2s 2d 2c 2h 3d", "As Ad Ac Kh Kd"],
    ["full house over flush", "3s 3d 3c 2h 2d", "As Ks Qs Js 9s"],
    ["flush over straight", "2s 4s 6s 8s Ts", "As Kd Qc Jh Td"],
    ["straight over trips", "2s 3d 4c 5h 6d", "As Ad Ac Kh Qd"],
    ["trips over two pair", "2s 2d 2c 3h 4d", "As Ad Kc Kh Qd"],
    ["two pair over pair", "3s 3d 2c 2h 4d", "As Ad Kc Qh Jd"],
    ["pair over high card", "2s 2d 3c 4h 6d", "As Kd Qc Jh 9d"],
    ["higher pair", "Ks Kd 2c 3h 4d", "Qs Qd Ac Kh Jd"],
    ["pair kicker", "9s 9d Ac 3h 4d", "9c 9h Kc 3d 4s"],
    ["pair third kicker", "9s 9d Ac Kh 4d", "9c 9h Ad Ks 3s"],
    ["higher top pair in two pair", "Ks Kd 2c 2h 4d", "Qs Qd Jc Jh Ad"],
    ["second pair in two pair", "Ks Kd 9c 9h 4d", "Kc Kh 8c 8d Ad"],
    ["two pair kicker", "Ks Kd 9c 9h Ad", "Kc Kh 9d 9s Qd"],
    ["higher trips", "4s 4d 4c 2h 3d", "3s 3d 3c As Kd"],
    ["trips kicker", "4s 4d 4c Ah 3d", "4h 4c 4d Kh Qs"],
    ["six-high straight over wheel", "2s 3d 4c 5h 6d", "As 2d 3c 4h 5d"],
    ["higher straight", "9s Td Jc Qh Kd", "8s 9d Tc Jh Qd"],
    ["flush by highest card", "As 4s 6s 8s Ts", "Kd 9d 8d 7d 5d"],
    ["flush by second card", "As Ks 6s 8s Ts", "Ad Qd Jd 9d 8d"],
    ["flush by fifth card", "As Ks Qs Js 9s", "Ad Kd Qd Jd 8d"],
    ["full house by trips", "4s 4d 4c 2h 2d", "3s 3d 3c Ah Ad"],
    ["full house by pair", "4s 4d 4c Kh Kd", "4h 4c 4d Qh Qs"],
    ["quads by rank", "5s 5d 5c 5h 2d", "4s 4d 4c 4h Ad"],
    ["quads by kicker", "5s 5d 5c 5h Ad", "5s 5d 5c 5h Kd"],
    ["high card by kicker", "As Kd Qc Jh 9d", "As Kd Qc Jh 8d"],
    ["seven cards: best five only", "As Ad Kc Kh Qd 2c 3s", "As Ad Kc Qh Jd 2c 3s"],
  ];
  it.each(beats)("%s", (_name, a, b) => {
    expect(score(a)).toBeGreaterThan(score(b));
  });

  const ties: Array<[string, string, string]> = [
    ["same hand, different suits", "As Kd 9c 5h 3d 2c 7s", "Ad Ks 9h 5c 3s 2d 7h"],
    ["the board plays", "As Ks Qs Js Td 2c 3d", "As Ks Qs Js Td 4c 5d"],
    ["both wheels", "As 2d 3c 4h 5d Kc Qs", "Ad 2s 3h 4c 5h 9c 8s"],
    ["unused low cards do not matter", "Ks Kd Qc Jh 9d 4c 3s", "Kh Kc Qd Js 9c 5d 2s"],
  ];
  it.each(ties)("%s is a tie", (_name, a, b) => {
    expect(score(a)).toBe(score(b));
  });

});

describe("evaluator against an independent slow evaluator", () => {
  it("agrees on the category and ordering of 40,000 random 7-card hand pairs", () => {
    const rng = createRng("cross-check");
    for (let i = 0; i < 40000; i++) {
      const deck = shuffle(newDeck(), rng);
      const a = deck.slice(0, 7);
      const b = deck.slice(7, 14);
      const ra = refBest(a);
      const rb = refBest(b);
      const fa = evaluate(a);
      const fb = evaluate(b);
      expect(categoryOf(fa)).toBe(ra[0]);
      expect(categoryOf(fb)).toBe(rb[0]);
      expect(Math.sign(fa - fb)).toBe(compareArrays(ra, rb));
    }
  });

  it("agrees when both hands share the same board (how showdowns really work)", () => {
    const rng = createRng("shared-board");
    for (let i = 0; i < 20000; i++) {
      const deck = shuffle(newDeck(), rng);
      const board = deck.slice(0, 5);
      const a = [...deck.slice(5, 7), ...board];
      const b = [...deck.slice(7, 9), ...board];
      expect(Math.sign(evaluate(a) - evaluate(b))).toBe(compareArrays(refBest(a), refBest(b)));
    }
  });
});

describe("exact hand counts", () => {
  it("matches the known counts of all 2,598,960 five-card hands", () => {
    const counts = new Array<number>(9).fill(0);
    const hand = [0, 0, 0, 0, 0];
    let total = 0;
    for (let a = 0; a < 48; a++)
      for (let b = a + 1; b < 49; b++)
        for (let c = b + 1; c < 50; c++)
          for (let d = c + 1; d < 51; d++)
            for (let e = d + 1; e < 52; e++) {
              hand[0] = a;
              hand[1] = b;
              hand[2] = c;
              hand[3] = d;
              hand[4] = e;
              counts[categoryOf(evaluate(hand))]++;
              total++;
            }
    expect(total).toBe(2598960);
    expect(counts).toEqual([
      1302540, // high card
      1098240, // pair
      123552, // two pair
      54912, // three of a kind
      10200, // straight
      5108, // flush
      3744, // full house
      624, // four of a kind
      40, // straight flush, including 4 royal flushes
    ]);
  }, 120_000);
});
