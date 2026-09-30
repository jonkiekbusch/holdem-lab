// Cards are plain numbers 0..51. rank = card >> 2 (0 = deuce ... 12 = ace), suit = card & 3.
export type Card = number;

export const RANK_CHARS = "23456789TJQKA";
export const SUIT_CHARS = "cdhs";
export const SUIT_SYMBOLS = ["♣", "♦", "♥", "♠"] as const;

export const rankOf = (card: Card): number => card >> 2;
export const suitOf = (card: Card): number => card & 3;
export const makeCard = (rank: number, suit: number): Card => (rank << 2) | suit;

/** "As", "Td", "2c" */
export function cardString(card: Card): string {
  return RANK_CHARS[rankOf(card)] + SUIT_CHARS[suitOf(card)];
}

/** "A♠", "T♦" — for the on-screen log. */
export function cardPretty(card: Card): string {
  return RANK_CHARS[rankOf(card)] + SUIT_SYMBOLS[suitOf(card)];
}

export function parseCard(text: string): Card {
  const rank = RANK_CHARS.indexOf(text[0]?.toUpperCase() ?? "");
  const suit = SUIT_CHARS.indexOf(text[1]?.toLowerCase() ?? "");
  if (text.length !== 2 || rank < 0 || suit < 0) throw new Error(`Bad card: "${text}"`);
  return makeCard(rank, suit);
}

/** "As Kd 7c" or "AsKd7c" */
export function parseCards(text: string): Card[] {
  const compact = text.replace(/\s+/g, "");
  if (compact.length % 2 !== 0) throw new Error(`Bad card list: "${text}"`);
  const cards: Card[] = [];
  for (let i = 0; i < compact.length; i += 2) cards.push(parseCard(compact.slice(i, i + 2)));
  return cards;
}

export function newDeck(): Card[] {
  return Array.from({ length: 52 }, (_, i) => i);
}
