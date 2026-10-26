import { describe, expect, test, vi } from 'vitest';
import {
  createCards,
  RANKS,
  SUITS,
  type Card,
  type Rank,
} from '../src/game/cards.js';
import { CLASSIC_DECKS, CLASSIC_RULES } from '../src/game/rules.js';
import { cryptoUint32, randomIndex, shuffle } from '../src/game/random.js';
import { isNatural, scoreHand } from '../src/game/scoring.js';
import { Shoe } from '../src/game/shoe.js';

const cards = createCards();
function identity(card: Card) {
  return `${card.deck}:${card.suit}:${card.rank}`;
}

function hand(...ranks: Rank[]) {
  const available = [...cards];
  return ranks.map((rank) => {
    const index = available.findIndex((card) => card.rank === rank);
    const card = available.splice(index, 1)[0];
    if (!card) throw new Error(`Missing fixture card: ${rank}`);
    return card;
  });
}

function drain(shoe: Shoe) {
  const drawn = [];
  for (let card = shoe.draw(); card; card = shoe.draw()) drawn.push(card);
  return drawn;
}

describe('six-deck cards and settings', () => {
  test('has exactly six of each standard rank/suit and 312 unique identities', () => {
    expect(cards).toHaveLength(312);
    expect(new Set(cards.map(identity)).size).toBe(312);
    for (const rank of RANKS) {
      for (const suit of SUITS) {
        const matching = cards.filter(
          (card) => card.rank === rank && card.suit === suit,
        );
        expect(matching.map((card) => card.deck)).toEqual([0, 1, 2, 3, 4, 5]);
      }
    }
    expect(CLASSIC_RULES).toEqual({
      id: 'classic-six-deck-s17-v1',
      deckCount: 6,
      reshuffleAtRemaining: 78,
    });
    expect(Object.isFrozen(CLASSIC_RULES)).toBe(true);
    expect(Object.isFrozen(CLASSIC_DECKS)).toBe(true);
    expect(cards.every(Object.isFrozen)).toBe(true);
  });
});

describe('unbiased injected randomness', () => {
  test('rejects the incomplete modulo bucket including its exact boundary', () => {
    const source = vi
      .fn()
      .mockReturnValueOnce(4_294_967_295)
      .mockReturnValueOnce(4_294_967_290)
      .mockReturnValueOnce(4_294_967_289);
    expect(randomIndex(10, source)).toBe(9);
    expect(source).toHaveBeenCalledTimes(3);
    for (let value = 0; value < 10; value += 1)
      expect(randomIndex(10, () => value)).toBe(value);
  });

  test('accepts the full range for power-of-two bounds', () => {
    expect(randomIndex(1, () => 0xffffffff)).toBe(0);
    expect(randomIndex(256, () => 0xffffffff)).toBe(255);
    expect(randomIndex(2 ** 32, () => 0xffffffff)).toBe(0xffffffff);
  });

  test.each([0, -1, 1.5, NaN, Infinity, 2 ** 32 + 1])(
    'rejects invalid bound %s before consuming randomness',
    (bound) => {
      const source = vi.fn(() => 0);
      expect(() => randomIndex(bound, source)).toThrow(RangeError);
      expect(source).not.toHaveBeenCalled();
    },
  );
  test.each([-1, 0.5, NaN, Infinity, 2 ** 32])(
    'rejects invalid source value %s',
    (value) => {
      expect(() => randomIndex(10, () => value)).toThrow(RangeError);
    },
  );

  test('production adapter obtains unsigned words from Web Crypto', () => {
    const spy = vi
      .spyOn(globalThis.crypto, 'getRandomValues')
      .mockImplementation((array) => {
        if (!(array instanceof Uint32Array))
          throw new Error('Expected uint32 buffer');
        array[0] = 0xffffffff;
        return array;
      });
    try {
      expect(cryptoUint32()).toBe(0xffffffff);
      expect(randomIndex(256)).toBe(255);
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
  });

  test('Fisher–Yates has reproducible swaps, preserves every card, and leaves input alone', () => {
    const original = [...cards];
    const source = vi.fn(() => 0);
    const shuffled = shuffle(cards, source);
    expect(shuffled).toEqual([...cards.slice(1), cards[0]]);
    expect(source).toHaveBeenCalledTimes(311);
    expect(shuffled).toEqual(shuffle(cards, () => 0));
    expect(shuffled.map(identity).sort()).toEqual(cards.map(identity).sort());
    expect(cards).toEqual(original);
    expect(shuffle(['a', 'b', 'c', 'd'], () => 1)).toEqual([
      'a',
      'c',
      'd',
      'b',
    ]);
    expect(shuffle([], source)).toEqual([]);
    expect(shuffle(['a'], source)).toEqual(['a']);
    expect(source).toHaveBeenCalledTimes(311);
  });
});

describe('hand scoring and naturals', () => {
  test.each<[Rank[], number, boolean, boolean]>([
    [[], 0, false, false],
    [['A', '6'], 17, true, false],
    [['A', '5'], 16, true, false],
    [['A', '9', '5'], 15, false, false],
    [['A', 'A', '9'], 21, true, false],
    [['K', 'Q', '2'], 22, false, true],
    [['A', 'A', 'A', '9'], 12, false, false],
    [['A', 'A', 'K', 'K'], 22, false, true],
  ])('scores %j', (ranks, total, soft, bust) => {
    expect(scoreHand(hand(...ranks))).toEqual({ total, soft, bust });
  });
  test('recomputes Ace values at every addition without changing the hand', () => {
    const fixture = hand('A', '6', 'A', '9', 'K');
    expect(
      fixture.map((_, index) => scoreHand(fixture.slice(0, index + 1))),
    ).toEqual([
      { total: 11, soft: true, bust: false },
      { total: 17, soft: true, bust: false },
      { total: 18, soft: true, bust: false },
      { total: 17, soft: false, bust: false },
      { total: 27, soft: false, bust: true },
    ]);
    expect(fixture.map((card) => card.rank)).toEqual(['A', '6', 'A', '9', 'K']);
  });
  test.each<Rank>(['10', 'J', 'Q', 'K'])(
    'detects original Ace + %s in either order but rejects split 21',
    (rank) => {
      const fixture = hand('A', rank);
      expect(isNatural(fixture, 'original')).toBe(true);
      expect(isNatural([...fixture].reverse(), 'original')).toBe(true);
      expect(isNatural(fixture, 'split')).toBe(false);
    },
  );
  test('rejects three-card 21 and non-naturals', () => {
    for (const fixture of [
      hand('A', '5', '5'),
      hand('K', 'Q'),
      hand('A'),
      hand(),
    ]) {
      expect(isNatural(fixture, 'original')).toBe(false);
    }
  });
});

describe('shoe ownership and round boundaries', () => {
  test('copies injected order and transfers each identity once; exhaustion returns undefined', () => {
    const injected = [...cards];
    const shoe = new Shoe(injected);
    injected.reverse();
    expect(shoe.remaining).toBe(312);
    expect(drain(shoe)).toEqual(cards);
    expect(shoe.remaining).toBe(0);
    expect(shoe.draw()).toBeUndefined();
    expect(shoe.draw()).toBeUndefined();
  });
  test('rejects duplicate injected identities', () => {
    const fixture = hand('A');
    expect(
      () => new Shoe([...fixture, ...fixture.map((card) => ({ ...card }))]),
    ).toThrow('duplicate card identities');
  });
  test.each([78, 77, 0])(
    'replenishes only at explicit round boundary with %i remaining',
    (remaining) => {
      const shoe = new Shoe(cards.slice(0, remaining));
      const source = vi.fn(() => 0);
      shoe.prepareForRound(source);
      expect(shoe.remaining).toBe(312);
      expect(source).toHaveBeenCalledTimes(311);
      expect(drain(shoe)).toEqual(shuffle(cards, () => 0));
    },
  );
  test('retains order at 79 and crosses 78/77 mid-round without reshuffling', () => {
    const fixture = cards.slice(0, 79);
    const shoe = new Shoe(fixture);
    const source = vi.fn(() => 0);
    shoe.prepareForRound(source);
    expect(source).not.toHaveBeenCalled();
    expect(shoe.remaining).toBe(79);
    expect(shoe.draw()).toEqual(fixture[0]);
    expect(shoe.remaining).toBe(78);
    expect(shoe.draw()).toEqual(fixture[1]);
    expect(shoe.remaining).toBe(77);
    expect(drain(shoe)).toEqual(fixture.slice(2));
  });
  test('fresh production shoe delegates its shuffle to Web Crypto', () => {
    const spy = vi.spyOn(globalThis.crypto, 'getRandomValues');
    try {
      const drawn = drain(new Shoe());
      expect(spy).toHaveBeenCalled();
      expect(drawn.map(identity).sort()).toEqual(cards.map(identity).sort());
    } finally {
      spy.mockRestore();
    }
  });
});
