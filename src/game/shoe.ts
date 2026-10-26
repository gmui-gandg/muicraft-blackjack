import { createCards, type Card } from './cards.js';
import { cryptoUint32, shuffle, type Uint32Source } from './random.js';
import { CLASSIC_RULES } from './rules.js';

export class Shoe {
  #cards: Card[];

  constructor(cards: readonly Card[] = shuffle(createCards())) {
    for (const card of cards) {
      if (card.id !== `${card.deck}:${card.suit}:${card.rank}`) {
        throw new Error('A card identity must match its deck, suit, and rank');
      }
    }
    if (new Set(cards.map((card) => card.id)).size !== cards.length) {
      throw new Error('A shoe cannot contain duplicate card identities');
    }
    this.#cards = [...cards];
  }

  get remaining(): number {
    return this.#cards.length;
  }

  draw(): Card | undefined {
    return this.#cards.shift();
  }

  prepareForRound(nextUint32: Uint32Source = cryptoUint32): void {
    if (this.remaining <= CLASSIC_RULES.reshuffleAtRemaining) {
      this.#cards = shuffle(createCards(), nextUint32);
    }
  }
}
