import { type Card } from "./cards.ts";

// A hand's strength is one integer: higher always wins, equal means a split.
// score = category << 20 | five 4-bit "slots" holding the ranks that matter, most important first.

export enum Category {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  ThreeOfAKind = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  FourOfAKind = 7,
  StraightFlush = 8,
}

export const CATEGORY_NAMES = [
  "High card",
  "Pair",
  "Two pair",
  "Three of a kind",
  "Straight",
  "Flush",
  "Full house",
  "Four of a kind",
  "Straight flush",
] as const;

const rc = new Uint8Array(13); // how many of each rank
const sm = new Uint16Array(4); // per suit: bitmask of ranks held
const sc = new Uint8Array(4); // per suit: how many cards

/** High card of the best straight in a 13-bit rank mask, or -1. The wheel (A-2-3-4-5) counts as five-high. */
function straightHigh(mask: number): number {
  for (let hi = 12; hi >= 4; hi--) {
    const m = 0x1f << (hi - 4);
    if ((mask & m) === m) return hi;
  }
  if ((mask & 0x100f) === 0x100f) return 3;
  return -1;
}

/** Writes the top `n` ranks of `mask` into score slots starting at `slot`. */
function withTop(score: number, slot: number, mask: number, n: number): number {
  for (let r = 12; r >= 0 && n > 0; r--) {
    if (mask & (1 << r)) {
      score |= r << (16 - 4 * slot);
      slot++;
      n--;
    }
  }
  return score;
}

/** Best five-card hand from 5 to 7 cards. */
export function evaluate(cards: readonly Card[]): number {
  rc.fill(0);
  sm.fill(0);
  sc.fill(0);
  let present = 0;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const r = c >> 2;
    const s = c & 3;
    rc[r]++;
    sm[s] |= 1 << r;
    sc[s]++;
    present |= 1 << r;
  }

  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (sc[s] >= 5) flushSuit = s;

  if (flushSuit >= 0) {
    const sh = straightHigh(sm[flushSuit]);
    if (sh >= 0) return (Category.StraightFlush << 20) | (sh << 16);
  }

  let quad = -1;
  let trips0 = -1;
  let trips1 = -1;
  let pair0 = -1;
  let pair1 = -1;
  for (let r = 12; r >= 0; r--) {
    const n = rc[r];
    if (n === 4) quad = r;
    else if (n === 3) {
      if (trips0 < 0) trips0 = r;
      else if (trips1 < 0) trips1 = r;
    } else if (n === 2) {
      if (pair0 < 0) pair0 = r;
      else if (pair1 < 0) pair1 = r;
    }
  }

  if (quad >= 0) {
    return withTop((Category.FourOfAKind << 20) | (quad << 16), 1, present & ~(1 << quad), 1);
  }
  if (trips0 >= 0 && (trips1 >= 0 || pair0 >= 0)) {
    const second = Math.max(trips1, pair0);
    return (Category.FullHouse << 20) | (trips0 << 16) | (second << 12);
  }
  if (flushSuit >= 0) return withTop(Category.Flush << 20, 0, sm[flushSuit], 5);

  const sh = straightHigh(present);
  if (sh >= 0) return (Category.Straight << 20) | (sh << 16);

  if (trips0 >= 0) {
    return withTop((Category.ThreeOfAKind << 20) | (trips0 << 16), 1, present & ~(1 << trips0), 2);
  }
  if (pair1 >= 0) {
    const rest = present & ~(1 << pair0) & ~(1 << pair1);
    return withTop((Category.TwoPair << 20) | (pair0 << 16) | (pair1 << 12), 2, rest, 1);
  }
  if (pair0 >= 0) {
    return withTop((Category.Pair << 20) | (pair0 << 16), 1, present & ~(1 << pair0), 3);
  }
  return withTop(Category.HighCard << 20, 0, present, 5);
}

export const categoryOf = (score: number): Category => score >> 20;
const slot = (score: number, i: number): number => (score >> (16 - 4 * i)) & 15;

const SINGULAR = ["Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Jack", "Queen", "King", "Ace"];
const PLURAL = ["Twos", "Threes", "Fours", "Fives", "Sixes", "Sevens", "Eights", "Nines", "Tens", "Jacks", "Queens", "Kings", "Aces"];

/** "Pair of Kings", "Full house, Aces full of Kings", ... */
export function describeScore(score: number): string {
  const cat = categoryOf(score);
  const a = slot(score, 0);
  const b = slot(score, 1);
  switch (cat) {
    case Category.HighCard:
      return `${SINGULAR[a]} high`;
    case Category.Pair:
      return `Pair of ${PLURAL[a]}`;
    case Category.TwoPair:
      return `Two pair, ${PLURAL[a]} and ${PLURAL[b]}`;
    case Category.ThreeOfAKind:
      return `Three of a kind, ${PLURAL[a]}`;
    case Category.Straight:
      return `Straight, ${SINGULAR[a]} high`;
    case Category.Flush:
      return `Flush, ${SINGULAR[a]} high`;
    case Category.FullHouse:
      return `Full house, ${PLURAL[a]} full of ${PLURAL[b]}`;
    case Category.FourOfAKind:
      return `Four of a kind, ${PLURAL[a]}`;
    case Category.StraightFlush:
      return a === 12 ? "Royal flush" : `Straight flush, ${SINGULAR[a]} high`;
  }
}

