import { CLASSIC_DECKS } from './rules.js';

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
export type Deck = (typeof CLASSIC_DECKS)[number];
export type Card = Readonly<{
  deck: Deck;
  rank: Rank;
  suit: Suit;
}>;

export function createCards(): Card[] {
  return CLASSIC_DECKS.flatMap((deck) =>
    SUITS.flatMap((suit) =>
      RANKS.map((rank): Card =>
        Object.freeze({
          deck,
          suit,
          rank,
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
