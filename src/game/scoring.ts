import { cardValue, type Card } from './cards.js';

export type HandOrigin = 'original' | 'split';
export type HandScore = Readonly<{
  total: number;
  soft: boolean;
  bust: boolean;
}>;

export function scoreHand(cards: readonly Card[]): HandScore {
  let total = 0;
  let highAces = 0;
  for (const card of cards) {
    total += cardValue(card.rank);
    if (card.rank === 'A') highAces += 1;
  }
  while (total > 21 && highAces > 0) {
    total -= 10;
    highAces -= 1;
  }
  return { total, soft: highAces > 0, bust: total > 21 };
}

export function isNatural(cards: readonly Card[], origin: HandOrigin): boolean {
  return (
    origin === 'original' && cards.length === 2 && scoreHand(cards).total === 21
  );
}
