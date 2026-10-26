import { CLASSIC_RULES } from './rules.js';

export const RANKS = [
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
] as const;
export const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];
export type Deck = 0 | 1 | 2 | 3 | 4 | 5;
export type Card = Readonly<{
  deck: Deck;
  rank: Rank;
  suit: Suit;
  id: `${Deck}:${Suit}:${Rank}`;
}>;

export function createCards(): Card[] {
  const decks: readonly Deck[] = [0, 1, 2, 3, 4, 5];
  return decks.slice(0, CLASSIC_RULES.deckCount).flatMap((deck) =>
    SUITS.flatMap((suit) =>
      RANKS.map((rank): Card =>
        Object.freeze({
          deck,
          suit,
          rank,
          id: `${deck}:${suit}:${rank}`,
        }),
      ),
    ),
  );
}

export function cardValue(rank: Rank): number {
  if (rank === 'A') return 11;
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return Number(rank);
}
