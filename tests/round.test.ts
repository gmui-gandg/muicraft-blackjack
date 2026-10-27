import { describe, expect, expectTypeOf, test, vi } from 'vitest';
import { createCards, type Rank } from '../src/game/cards.js';
import {
  createGame,
  eligibility,
  transition,
  type GameEvent,
  type GameState,
  type PlayerHand,
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
  if (['HIT', 'STAND', 'DOUBLE'].includes(event.type))
    expect(eligibility(state, event)).toEqual({ allowed: false, reason });
  expect(result.state).toBe(state);
  expect(state).toEqual(before);
  expect(rng).not.toHaveBeenCalled();
}

function owned(state: GameState) {
  return [
    ...state.shoe,
    ...state.discards,
    ...(state.round?.hands.flatMap((hand) => hand.cards) ?? []),
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
  }>([
    {
      cards: ['A', '9', 'K', '7'],
      balance: 1015,
      outcome: 'blackjack',
    },
    {
      cards: ['A', 'A', 'K', 'K'],
      balance: 1000,
      outcome: 'push',
    },
    {
      cards: ['9', 'A', '7', 'K'],
      balance: 990,
      outcome: 'loss',
    },
    {
      cards: ['9', 'K', '7', 'A'],
      balance: 990,
      outcome: 'loss',
    },
  ])(
    '$cards settles immediately at $balance',
    ({ cards, balance, outcome }) => {
      const state = deal(...cards);
      expect(state).toMatchObject({
        phase: 'ROUND_COMPLETE',
        balance,
        outcome,
        activeHandIndex: null,
      });
      expect(state.round?.hands[0].complete).toBe(true);
      expect(state.shoe).toHaveLength(75);
      for (const type of ['HIT', 'STAND', 'SETTLE'] as const)
        reject(state, { type }, 'WRONG_PHASE');
    },
  );
  test.each<Rank>(['A', '10', 'J', 'Q', 'K'])(
    'allows player actions after checking a non-natural %s opening',
    (upcard) => {
      const state = deal('8', upcard, '9', '6');
      expect(state.phase).toBe('PLAYER_TURN');
      expect(eligibility(state, { type: 'HIT' })).toEqual({ allowed: true });
      expect(eligibility(state, { type: 'STAND' })).toEqual({ allowed: true });
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
  test('rejects every out-of-phase event and keeps Split unavailable', () => {
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
      PLAYER_TURN: ['HIT', 'STAND', 'DOUBLE'],
      DEALER_TURN: ['DEALER_TURN'],
      SETTLEMENT: ['SETTLE'],
      ROUND_COMPLETE: ['NEXT_HAND'],
    };
    for (const state of states) {
      for (const event of events) {
        if (event.type === 'SPLIT') reject(state, event, 'NOT_IMPLEMENTED');
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
    const expected = expectedShoe.snapshot();
    expect(result.state.round?.hands[0].cards).toEqual([
      expected[0],
      expected[2],
    ]);
    expect(result.state.round?.dealer).toEqual([expected[1], expected[3]]);
    expect(result.state.shoe).toEqual(expected.slice(4));
    expect(owned(result.state)).toEqual(expect.arrayContaining([...expected]));
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

describe('funded two-card Double', () => {
  test('singleton rounds cannot carry split-ace restrictions', () => {
    type InvalidRound = {
      hands: readonly [PlayerHand & { readonly splitAces: true }];
      dealer: PlayerHand['cards'];
    };
    expectTypeOf<InvalidRound>().not.toExtend<
      NonNullable<GameState['round']>
    >();
    const start = deal('5', '10', '6', '7', '2');
    expect(start.round?.hands).toHaveLength(1);
    expect(start.round?.hands[0].splitAces).toBe(false);
    for (const type of ['HIT', 'STAND', 'DOUBLE'] as const)
      expect(eligibility(start, { type })).toEqual({ allowed: true });
  });

  test.each([
    { draw: '7', outcome: 'win', returned: 40, balance: 1020 },
    { draw: '6', outcome: 'push', returned: 20, balance: 1000 },
    { draw: '2', outcome: 'loss', returned: 0, balance: 980 },
  ] as const)(
    '$outcome: commits 20, returns $returned and settles at $balance',
    ({ draw, outcome, returned, balance }) => {
      const start = deal('5', '10', '6', '7', draw);
      expect(eligibility(start, { type: 'DOUBLE' })).toEqual({ allowed: true });
      const doubled = act(start, { type: 'DOUBLE' });
      expect(doubled).toMatchObject({
        balance: 980,
        phase: 'DEALER_TURN',
        activeHandIndex: null,
      });
      expect(doubled.round?.hands[0]).toEqual({
        ...start.round!.hands[0],
        cards: [...start.round!.hands[0].cards, start.shoe[0]],
        stake: 20,
        complete: true,
      });
      expect(doubled.shoe).toEqual(start.shoe.slice(1));
      expect(doubled.discards).toBe(start.discards);
      expect(doubled.round?.dealer).toBe(start.round?.dealer);
      expect(doubled.history).toEqual([...start.history, { type: 'DOUBLE' }]);
      expect(owned(doubled)).toHaveLength(owned(start).length);
      expect(new Set(owned(doubled))).toEqual(new Set(owned(start)));
      for (const type of ['HIT', 'STAND', 'DOUBLE'] as const)
        reject(doubled, { type }, 'WRONG_PHASE');
      const end = act(act(doubled, { type: 'DEALER_TURN' }), {
        type: 'SETTLE',
      });
      expect(end).toMatchObject({ outcome, returned, balance });
      const betting = act(end, { type: 'NEXT_HAND' });
      expect(new Set(owned(betting))).toEqual(new Set(owned(start)));
      expect(betting.discards).toHaveLength(5);
    },
  );

  test('exact additional funds allow Double; one chip short rejects atomically', () => {
    const start = deal('5', '10', '6', '7', '2');
    reject({ ...start, balance: 9 }, { type: 'DOUBLE' }, 'INSUFFICIENT_FUNDS');
    const exact = { ...start, balance: 10 };
    expect(eligibility(exact, { type: 'DOUBLE' })).toEqual({ allowed: true });
    expect(act(exact, { type: 'DOUBLE' })).toMatchObject({ balance: 0 });
  });

  test('third card and exhausted shoe reject without consuming or recording anything', () => {
    const start = deal('5', '10', '6', '7', '2');
    reject(
      act(start, { type: 'HIT' }),
      { type: 'DOUBLE' },
      'TWO_CARDS_REQUIRED',
    );
    reject({ ...start, shoe: [] }, { type: 'DOUBLE' }, 'SHOE_EXHAUSTED');
  });

  test.each([
    { ranks: ['10', '10', '6', '7', 'K'], balance: 980, outcome: 'loss' },
    { ranks: ['5', '10', '6', '7', '10'], balance: 1020, outcome: 'win' },
  ] satisfies { ranks: Rank[]; balance: number; outcome: string }[])(
    '$ranks: Double bust skips dealer draws; 21 pays ordinary stakes',
    ({ ranks, balance, outcome }) => {
      const start = deal(...ranks);
      let state = act(start, { type: 'DOUBLE' });
      if (state.phase === 'DEALER_TURN')
        state = act(act(state, { type: 'DEALER_TURN' }), { type: 'SETTLE' });
      expect(state).toMatchObject({
        phase: 'ROUND_COMPLETE',
        balance,
        outcome,
      });
      expect(state.shoe).toEqual(start.shoe.slice(1));
      expect(state.round?.dealer).toEqual(start.round?.dealer);
    },
  );
});

// Unit hand-state fixtures only: SPLIT and the Split→Double journey remain deferred.
function splitFixture(activeHandIndex: 0 | 1, aces = false): GameState {
  const state = aces
    ? deal('A', '10', '5', '7', 'A', '6', '2')
    : deal('8', '10', '5', '7', '8', '6', '2');
  if (state.phase !== 'PLAYER_TURN') throw new Error('Expected player fixture');
  return {
    ...state,
    balance: 980,
    activeHandIndex,
    shoe: state.shoe.slice(2),
    round: {
      dealer: state.round.dealer,
      hands: [
        {
          ...state.round.hands[0],
          splitAces: aces,
          complete: activeHandIndex === 1,
        },
        {
          cards: state.shoe.slice(0, 2),
          stake: 10,
          splitAces: aces,
          complete: false,
        },
      ],
    },
  };
}

describe('split hand-state unit coverage (no Split operation or integration journey)', () => {
  test.each(['HIT', 'DOUBLE'] as const)(
    '%s: two busted unit hands settle without dealer draws',
    (type) => {
      const source = fixture('10', '6', '10', '6', '2', '3', 'K', 'K');
      const start: GameState = {
        ...source,
        phase: 'PLAYER_TURN',
        balance: 980,
        wager: 10,
        activeHandIndex: 0,
        shoe: source.shoe.slice(6),
        round: {
          dealer: source.shoe.slice(4, 6),
          hands: [
            {
              cards: source.shoe.slice(0, 2),
              stake: 10,
              complete: false,
              splitAces: false,
            },
            {
              cards: source.shoe.slice(2, 4),
              stake: 10,
              complete: false,
              splitAces: false,
            },
          ],
        },
      };
      const first = act(start, { type });
      expect(first).toMatchObject({ phase: 'PLAYER_TURN', activeHandIndex: 1 });
      expect(first.round?.hands[0].complete).toBe(true);
      expect(first.round?.hands[1]).toBe(start.round?.hands[1]);
      const end = act(first, { type });
      expect(end).toMatchObject({
        phase: 'ROUND_COMPLETE',
        activeHandIndex: null,
        outcome: 'loss',
        returned: 0,
        balance: type === 'DOUBLE' ? 960 : 980,
      });
      expect(end.round?.hands.every((hand) => hand.complete)).toBe(true);
      expect(end.round?.hands.map((hand) => hand.stake)).toEqual(
        type === 'DOUBLE' ? [20, 20] : [10, 10],
      );
      expect(end.round?.dealer).toBe(start.round?.dealer);
      expect(end.shoe).toEqual(start.shoe.slice(2));
      expect(end.discards).toBe(start.discards);
      expect(end.history).toEqual([...start.history, { type }, { type }]);
      expect(owned(end)).toHaveLength(owned(start).length);
      expect(new Set(owned(end))).toEqual(new Set(owned(start)));
    },
  );

  test.each([0, 1] as const)(
    'Double on active non-ace split hand %i',
    (index) => {
      const start = splitFixture(index);
      expect(eligibility(start, { type: 'DOUBLE' })).toEqual({ allowed: true });
      const next = act(start, { type: 'DOUBLE' });
      expect(next.balance).toBe(970);
      expect(next.round?.hands[index]).toEqual({
        ...start.round!.hands[index],
        cards: [...start.round!.hands[index]!.cards, start.shoe[0]],
        stake: 20,
        complete: true,
      });
      const other = index === 0 ? 1 : 0;
      expect(next.round?.hands[other]).toBe(start.round?.hands[other]);
      expect(next.activeHandIndex).toBe(index === 0 ? 1 : null);
      expect(next.phase).toBe(index === 0 ? 'PLAYER_TURN' : 'DEALER_TURN');
      expect(next.shoe).toEqual(start.shoe.slice(1));
      expect(next.discards).toBe(start.discards);
      expect(next.round?.dealer).toBe(start.round?.dealer);
      expect(next.history).toEqual([...start.history, { type: 'DOUBLE' }]);
      expect(owned(next)).toHaveLength(79);
      expect(new Set(owned(next))).toEqual(new Set(owned(start)));
    },
  );

  test.each([0, 1] as const)(
    'split aces at active index %i refuse all player actions',
    (index) => {
      const start = splitFixture(index, true);
      for (const type of ['HIT', 'STAND', 'DOUBLE'] as const)
        reject(start, { type }, 'SPLIT_ACES');
    },
  );

  test('completed and already doubled hands refuse all player actions', () => {
    const start = splitFixture(0);
    const doubled = act(start, { type: 'DOUBLE' });
    if (doubled.phase !== 'PLAYER_TURN') throw new Error('Expected next hand');
    const repeated = { ...doubled, activeHandIndex: 0 as const };
    const complete = splitFixture(1);
    if (complete.phase !== 'PLAYER_TURN')
      throw new Error('Expected split state');
    const completed = { ...complete, activeHandIndex: 0 as const };
    for (const state of [repeated, completed])
      for (const type of ['HIT', 'STAND', 'DOUBLE'] as const)
        reject(state, { type }, 'HAND_COMPLETE');
  });

  test('unit settlement and discard retain both hands and treat split 21 as ordinary', () => {
    const source = fixture('A', 'K', '8', '6', '10', '7', '2');
    const state: GameState = {
      ...source,
      phase: 'PLAYER_TURN',
      balance: 980,
      wager: 10,
      activeHandIndex: 1,
      shoe: source.shoe.slice(6),
      round: {
        dealer: source.shoe.slice(4, 6),
        hands: [
          {
            cards: source.shoe.slice(0, 2),
            splitAces: false,
            stake: 10,
            complete: true,
          },
          {
            cards: source.shoe.slice(2, 4),
            splitAces: false,
            stake: 10,
            complete: false,
          },
        ],
      },
    };
    const doubled = act(state, { type: 'DOUBLE' });
    const end = act(act(doubled, { type: 'DEALER_TURN' }), { type: 'SETTLE' });
    expect(end).toMatchObject({
      phase: 'ROUND_COMPLETE',
      outcome: 'mixed',
      returned: 20,
      balance: 990,
    });
    expect(end.round?.hands.map((hand) => hand.stake)).toEqual([10, 20]);
    expect(end.round?.hands.every((hand) => hand.complete)).toBe(true);
    const betting = act(end, { type: 'NEXT_HAND' });
    expect(betting.discards).toHaveLength(7);
    expect(owned(betting)).toHaveLength(79);
    expect(new Set(owned(betting))).toEqual(new Set(owned(state)));
  });

  test.each(['HIT', 'STAND'] as const)(
    '%s respects active hand and preserves its sibling',
    (type) => {
      const start = splitFixture(1);
      const next = act(start, { type });
      expect(next.round?.hands[0]).toBe(start.round?.hands[0]);
      expect(next.round?.hands[1]?.stake).toBe(10);
      expect(next.balance).toBe(start.balance);
      expect(next.activeHandIndex).toBe(type === 'HIT' ? 1 : null);
      expect(next.shoe).toEqual(
        type === 'HIT' ? start.shoe.slice(1) : start.shoe,
      );
    },
  );
});
