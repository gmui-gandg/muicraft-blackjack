import { describe, expect, test, vi } from 'vitest';
import { createCards, type Rank } from '../src/game/cards.js';
import {
  createGame,
  eligibility,
  transition,
  type GameEvent,
  type GameState,
} from '../src/game/round.js';
import { Shoe } from '../src/game/shoe.js';

function fixture(...ranks: Rank[]): GameState {
  return fixtureWithSize(79, ...ranks);
}

function fixtureWithSize(size: number, ...ranks: Rank[]): GameState {
  const remaining = createCards();
  const opening = ranks.map((rank) => {
    const index = remaining.findIndex((card) => card.rank === rank);
    const card = remaining.splice(index, 1)[0];
    if (!card) throw new Error(`Missing fixture rank ${rank}`);
    return card;
  });
  return createGame(new Shoe([...opening, ...remaining].slice(0, size)));
}

function act(state: GameState, event: GameEvent): GameState {
  const before = structuredClone(state);
  const result = transition(state, event, () => 0);
  expect(state).toEqual(before);
  expect(result.accepted).toBe(true);
  return result.state;
}

function deal(...ranks: Rank[]): GameState {
  return act(act(fixture(...ranks), { type: 'PLACE_BET', amount: 10 }), {
    type: 'DEAL',
  });
}

function finish(state: GameState): GameState {
  return act(act(act(state, { type: 'STAND' }), { type: 'DEALER_TURN' }), {
    type: 'SETTLE',
  });
}

function reject(state: GameState, event: GameEvent, reason: string) {
  const before = structuredClone(state);
  const rng = vi.fn(() => 0);
  const result = transition(state, event, rng);
  expect(result).toEqual({ accepted: false, state, reason });
  expect(result.state).toBe(state);
  expect(state).toEqual(before);
  expect(rng).not.toHaveBeenCalled();
}

function owned(state: GameState) {
  return [
    ...state.shoe,
    ...state.discards,
    ...(state.round?.hands[0].cards ?? []),
    ...(state.round?.dealer ?? []),
  ];
}

describe('wagers and deal ownership', () => {
  test.each([10, 20, 500])(
    'selects %i without committing; Deal commits once',
    (amount) => {
      const initial = fixture('9', '6', '8', '10');
      expect(initial.balance).toBe(1000);
      const bet = act(initial, { type: 'PLACE_BET', amount });
      expect(bet.balance).toBe(1000);
      expect(bet.shoe).toBe(initial.shoe);
      const state = act(bet, { type: 'DEAL' });
      expect(state.balance).toBe(1000 - amount);
      expect(state.round?.hands[0]).toMatchObject({
        stake: amount,
        complete: false,
      });
      expect(state.round?.hands[0].cards).toEqual([
        initial.shoe[0],
        initial.shoe[2],
      ]);
      expect(state.round?.dealer).toEqual([initial.shoe[1], initial.shoe[3]]);
      expect(state.activeHandIndex).toBe(0);
      expect(owned(state)).toHaveLength(79);
      expect(new Set(owned(state)).size).toBe(79);
      reject(state, { type: 'DEAL' }, 'WRONG_PHASE');
    },
  );
  test.each([0, 15, 510, -10, NaN, Infinity, 10.5])(
    'rejects invalid wager %s',
    (amount) => {
      reject(fixture(), { type: 'PLACE_BET', amount }, 'INVALID_WAGER');
    },
  );
  test('caps wagers by funds and requires a selected wager', () => {
    const state = { ...fixture(), balance: 20 };
    reject(state, { type: 'PLACE_BET', amount: 30 }, 'INSUFFICIENT_FUNDS');
    expect(act(state, { type: 'PLACE_BET', amount: 20 }).wager).toBe(20);
    reject(state, { type: 'DEAL' }, 'WAGER_REQUIRED');
    reject({ ...state, wager: 30 }, { type: 'DEAL' }, 'INSUFFICIENT_FUNDS');
    reject({ ...state, wager: 15 }, { type: 'DEAL' }, 'INVALID_WAGER');
  });
});

describe('opening natural ledger and peeks', () => {
  test.each<{
    cards: Rank[];
    balance: number;
    outcome: string;
    peeked: boolean;
  }>([
    {
      cards: ['A', '9', 'K', '7'],
      balance: 1015,
      outcome: 'blackjack',
      peeked: false,
    },
    {
      cards: ['A', 'A', 'K', 'K'],
      balance: 1000,
      outcome: 'push',
      peeked: true,
    },
    {
      cards: ['9', 'A', '7', 'K'],
      balance: 990,
      outcome: 'loss',
      peeked: true,
    },
    {
      cards: ['9', 'K', '7', 'A'],
      balance: 990,
      outcome: 'loss',
      peeked: true,
    },
  ])(
    '$cards settles immediately at $balance',
    ({ cards, balance, outcome, peeked }) => {
      const state = deal(...cards);
      expect(state).toMatchObject({
        phase: 'ROUND_COMPLETE',
        balance,
        outcome,
        activeHandIndex: null,
      });
      expect(state.round?.peeked).toBe(peeked);
      expect(state.round?.hands[0].complete).toBe(true);
      expect(state.shoe).toHaveLength(75);
      for (const type of ['HIT', 'STAND', 'SETTLE'] as const)
        reject(state, { type }, 'WRONG_PHASE');
    },
  );
  test.each<Rank>(['A', '10', 'J', 'Q', 'K'])(
    'peeks at %s even without a natural',
    (upcard) => {
      const state = deal('8', upcard, '9', '6');
      expect(state.phase).toBe('PLAYER_TURN');
      expect(state.round?.peeked).toBe(true);
    },
  );
});

describe('ordinary transitions and ledger', () => {
  test.each<{
    cards: Rank[];
    balance: number;
    outcome: string;
    dealerCount: number;
  }>([
    {
      cards: ['10', '10', '8', '7'],
      balance: 1010,
      outcome: 'win',
      dealerCount: 2,
    },
    {
      cards: ['10', '10', '7', '7'],
      balance: 1000,
      outcome: 'push',
      dealerCount: 2,
    },
    {
      cards: ['10', '10', '6', '7'],
      balance: 990,
      outcome: 'loss',
      dealerCount: 2,
    },
    {
      cards: ['10', '10', '8', '6', 'K'],
      balance: 1010,
      outcome: 'win',
      dealerCount: 3,
    },
    {
      cards: ['10', 'A', '8', '6'],
      balance: 1010,
      outcome: 'win',
      dealerCount: 2,
    },
    {
      cards: ['10', 'A', '8', '5', '2'],
      balance: 1000,
      outcome: 'push',
      dealerCount: 3,
    },
  ])(
    '$cards -> $outcome, balance $balance',
    ({ cards, balance, outcome, dealerCount }) => {
      const start = deal(...cards);
      const state = finish(start);
      expect(state).toMatchObject({
        phase: 'ROUND_COMPLETE',
        balance,
        outcome,
      });
      expect(state.round?.dealer).toHaveLength(dealerCount);
      expect(state.shoe).toHaveLength(79 - 2 - dealerCount);
      expect(owned(state)).toEqual(expect.arrayContaining(owned(start)));
      expect(state.history.map((event) => event.type)).toEqual([
        'PLACE_BET',
        'DEAL',
        'STAND',
        'DEALER_TURN',
        'SETTLE',
      ]);
      reject(state, { type: 'SETTLE' }, 'WRONG_PHASE');
    },
  );
  test('hit to 21 completes, pays ordinary 1:1, and refuses further Hit', () => {
    const state = act(deal('10', '10', '5', '7', '6'), { type: 'HIT' });
    expect(state.phase).toBe('DEALER_TURN');
    expect(state.round?.hands[0].complete).toBe(true);
    reject(state, { type: 'HIT' }, 'WRONG_PHASE');
    const end = act(act(state, { type: 'DEALER_TURN' }), { type: 'SETTLE' });
    expect(end).toMatchObject({ balance: 1010, outcome: 'win' });
  });
  test('bust settles without any extra dealer card', () => {
    const start = deal('10', 'A', '6', '5', 'K');
    const state = act(start, { type: 'HIT' });
    expect(state).toMatchObject({
      phase: 'ROUND_COMPLETE',
      balance: 990,
      outcome: 'loss',
    });
    expect(state.round?.dealer).toEqual(start.round?.dealer);
    expect(state.shoe).toEqual(start.shoe.slice(1));
    reject(state, { type: 'HIT' }, 'WRONG_PHASE');
  });
  test('recomputes an Ace after a Hit without ending a playable hand', () => {
    const state = act(deal('A', '9', '9', '8', '5'), { type: 'HIT' });
    expect(state.phase).toBe('PLAYER_TURN');
    expect(state.round?.hands[0].complete).toBe(false);
    expect(eligibility(state, { type: 'HIT' })).toEqual({ allowed: true });
  });
});

describe('phase enforcement and next round', () => {
  test('rejects every out-of-phase event and keeps Double/Split unavailable', () => {
    const player = deal('10', '10', '8', '7');
    const dealer = act(player, { type: 'STAND' });
    const settlement = act(dealer, { type: 'DEALER_TURN' });
    const complete = act(settlement, { type: 'SETTLE' });
    const states = [fixture(), player, dealer, settlement, complete];
    const events: GameEvent[] = [
      { type: 'PLACE_BET', amount: 10 },
      { type: 'DEAL' },
      { type: 'HIT' },
      { type: 'STAND' },
      { type: 'DEALER_TURN' },
      { type: 'SETTLE' },
      { type: 'NEXT_HAND' },
      { type: 'DOUBLE' },
      { type: 'SPLIT' },
    ];
    const phases: Record<string, string[]> = {
      BETTING: ['PLACE_BET', 'DEAL'],
      PLAYER_TURN: ['HIT', 'STAND'],
      DEALER_TURN: ['DEALER_TURN'],
      SETTLEMENT: ['SETTLE'],
      ROUND_COMPLETE: ['NEXT_HAND'],
    };
    for (const state of states) {
      for (const event of events) {
        if (event.type === 'DOUBLE' || event.type === 'SPLIT')
          reject(state, event, 'NOT_IMPLEMENTED');
        else if (!phases[state.phase]!.includes(event.type))
          reject(state, event, 'WRONG_PHASE');
      }
    }
  });
  test('Next Hand consumes nothing; subsequent Deal alone applies threshold policy', () => {
    const complete = finish(deal('10', '10', '8', '7'));
    expect(eligibility(complete, { type: 'NEXT_HAND' })).toEqual({
      allowed: true,
    });
    const betting = act(complete, { type: 'NEXT_HAND' });
    expect(betting).toMatchObject({
      phase: 'BETTING',
      wager: 0,
      round: null,
      balance: 1010,
    });
    expect(betting.shoe).toBe(complete.shoe);
    expect(owned(betting)).toEqual(expect.arrayContaining(owned(complete)));
    expect(betting.discards).toHaveLength(4);
    const bet = act(betting, { type: 'PLACE_BET', amount: 10 });
    const rng = vi.fn(() => 0);
    const result = transition(bet, { type: 'DEAL' }, rng);
    expect(result.accepted).toBe(true);
    expect(rng).toHaveBeenCalledTimes(311);
    expect(result.state.shoe).toHaveLength(308);
    expect(result.state.discards).toEqual([]);
    const expectedShoe = new Shoe(bet.shoe);
    expectedShoe.prepareForRound(() => 0);
    expect(owned(result.state)).toEqual(
      expect.arrayContaining([...expectedShoe.snapshot()]),
    );
  });
  test('above threshold Deal retains order and does not use RNG', () => {
    const betting = act(fixture('10', '9', '8', '7'), {
      type: 'PLACE_BET',
      amount: 10,
    });
    const rng = vi.fn(() => 0);
    const result = transition(betting, { type: 'DEAL' }, rng);
    expect(result.state.shoe).toEqual(betting.shoe.slice(4));
    expect(rng).not.toHaveBeenCalled();
  });
  test('retains discards across rounds until a boundary shuffle', () => {
    const full = fixtureWithSize(312, '10', '10', '8', '7');
    const complete = finish(
      act(act(full, { type: 'PLACE_BET', amount: 10 }), { type: 'DEAL' }),
    );
    const betting = act(complete, { type: 'NEXT_HAND' });
    const next = act(act(betting, { type: 'PLACE_BET', amount: 10 }), {
      type: 'DEAL',
    });
    expect(next.discards).toEqual(betting.discards);
    expect(next.discards).toHaveLength(4);
    expect(owned(next)).toHaveLength(312);
    expect(new Set(owned(next)).size).toBe(312);
  });
  test('exhaustion rejects Hit or an incomplete dealer turn atomically', () => {
    const player = deal('10', '2', '8', '3', '2');
    reject({ ...player, shoe: [] }, { type: 'HIT' }, 'SHOE_EXHAUSTED');
    const dealer = act(player, { type: 'STAND' });
    reject(
      { ...dealer, shoe: dealer.shoe.slice(0, 1) },
      { type: 'DEALER_TURN' },
      'SHOE_EXHAUSTED',
    );
  });
  test('shoe snapshot is independent of later draws', () => {
    const shoe = new Shoe(createCards());
    const state = createGame(shoe);
    const snapshot = shoe.snapshot();
    shoe.draw();
    expect(state.shoe).toHaveLength(312);
    expect(snapshot).toHaveLength(312);
    expect(shoe.remaining).toBe(311);
  });
});
