import { RANK_CHARS, SUIT_SYMBOLS, rankOf, suitOf, type Card as CardId } from "../engine/cards.ts";

// Four-color deck: each suit has its own color, so they are easy to tell apart on a small screen.
// The suit shapes differ too, so color is never the only clue.
const SUIT_CLASS = ["clubs", "diamonds", "hearts", "spades"] as const;
const SUIT_NAMES = ["clubs", "diamonds", "hearts", "spades"] as const;
const RANK_NAMES = ["two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "jack", "queen", "king", "ace"];

export type CardSize = "board" | "hole" | "mini";

export function CardFace({ card, size }: { card: CardId; size: CardSize }) {
  const rank = rankOf(card);
  const suit = suitOf(card);
  return (
    <span class={`card face ${size} ${SUIT_CLASS[suit]}`} role="img" aria-label={`${RANK_NAMES[rank]} of ${SUIT_NAMES[suit]}`}>
      <span class="rank">{rank === 8 ? "10" : RANK_CHARS[rank]}</span>
      <span class="suit">{SUIT_SYMBOLS[suit]}</span>
    </span>
  );
}

export function CardBack({ size }: { size: CardSize }) {
  return <span class={`card back ${size}`} aria-hidden="true" />;
}

export function CardSlot({ size }: { size: CardSize }) {
  return <span class={`card slot ${size}`} aria-hidden="true" />;
}
