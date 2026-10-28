// @vitest-environment jsdom
import '../test/setup';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { createPlaySession } from './session';
import { PlayableRound } from './PlayableRound';
import { createSessionStorage, SESSION_KEY } from '../storage/session';
import { roundState } from '../test/round-fixtures';
import type { Rank } from '../game/cards';
import type { GameEvent } from '../game/round';

function setup(
  balance = 100,
  ranks: readonly Rank[] = ['10', '10', '7', '7'],
  reference: number | null = 50,
  sameBet = true,
) {
  let bytes = JSON.stringify({
    version: 2,
    settledBankroll: balance,
    preferences: {
      selectedWager: 50,
      motion: 'reduced',
      audio: 'muted',
      sameBet,
    },
    lastCompletedWager: reference,
    roundPending: false,
  });
  const writes: string[] = [];
  const boundary = {
    getItem: () => bytes,
    setItem: (key: string, value: string) => {
      expect(key).toBe(SESSION_KEY);
      bytes = value;
      writes.push(value);
    },
  };
  const open = () => createSessionStorage(() => boundary);
  const adapter = open();
  const session = createPlaySession(adapter, (saved) => ({
    ...roundState(ranks, saved.settledBankroll),
    wager: saved.dealWager ?? 0,
  }));
  const act = (...types: Exclude<GameEvent['type'], 'PLACE_BET'>[]) =>
    types.forEach((type) => session.dispatch({ type }));
  return {
    session,
    act,
    writes,
    open,
    saved: () => JSON.parse(bytes),
    state: () => session.getSnapshot().result.state,
  };
}

for (const checked of [false, true])
  test(`Next Hand checked=${checked} selects only, stale activation does not write/deal`, () => {
    const f = setup(100, undefined, 50, checked);
    f.act('DEAL', 'STAND');
    expect(f.state()).toMatchObject({
      phase: 'ROUND_COMPLETE',
      balance: 100,
      wager: 50,
    });
    f.act('NEXT_HAND');
    expect(f.state()).toMatchObject({
      phase: 'BETTING',
      balance: 100,
      wager: checked ? 50 : 0,
      round: null,
    });
    const count = f.writes.length;
    f.act('NEXT_HAND', 'SETTLE');
    expect(f.writes).toHaveLength(count);
    expect(f.open().snapshot().dealWager).toBe(checked ? 50 : null);
    if (!checked) {
      f.act('DEAL');
      expect(f.state()).toMatchObject({
        phase: 'BETTING',
        balance: 100,
        wager: 0,
      });
      expect(f.session.getSnapshot().result.accepted).toBe(false);
    }
    expect(f.saved()).toEqual({
      version: 2,
      settledBankroll: 100,
      lastCompletedWager: 50,
      preferences: {
        selectedWager: checked ? 50 : 0,
        motion: 'reduced',
        audio: 'muted',
        sameBet: checked,
      },
      roundPending: false,
    });
  });

for (const final of [50, 49, 5])
  test(`whole-round settlement affordability ${final}`, () => {
    const f = setup(final + 50, ['10', 'A', '8', 'K']);
    f.act('DEAL');
    expect(f.state()).toMatchObject({
      phase: 'ROUND_COMPLETE',
      balance: final,
      wager: 50,
    });
    expect(f.session.getSnapshot().saved.preferences.sameBet).toBe(final >= 50);
    expect(f.session.repeatAvailability().enabled).toBe(final >= 50);
    expect(f.saved().preferences.selectedWager).toBe(final >= 50 ? 50 : 0);
    f.act('NEXT_HAND');
    expect(f.state()).toMatchObject({
      balance: final,
      wager: final >= 50 ? 50 : 0,
    });
    const restored = createPlaySession(f.open());
    expect(restored.getSnapshot().result.state.wager).toBe(
      final >= 50 ? 50 : 0,
    );
  });

test('500 to 100 stays off after manual 10 until a new completed round; then enabled but unchecked', () => {
  const f = setup(600, ['10', 'A', '8', 'K', 'A', '9', 'K', '7'], 500);
  f.session.dispatch({ type: 'PLACE_BET', amount: 500 });
  f.act('DEAL', 'NEXT_HAND');
  expect(f.state()).toMatchObject({ balance: 100, wager: 0 });
  f.session.dispatch({ type: 'PLACE_BET', amount: 10 });
  f.session.setSameBet(true);
  expect(f.session.repeatAvailability().enabled).toBe(false);
  expect(f.session.getSnapshot().saved.lastCompletedWager).toBe(500);
  f.act('DEAL');
  expect(f.state()).toMatchObject({ phase: 'ROUND_COMPLETE', balance: 115 });
  expect(f.session.repeatAvailability().enabled).toBe(true);
  expect(f.session.getSnapshot().saved).toMatchObject({
    lastCompletedWager: 10,
    preferences: { sameBet: false },
  });
  f.act('NEXT_HAND');
  expect(f.state().wager).toBe(0);
});

for (const split of [false, true])
  test(`original 50 survives ${split ? 'split and two doubles committing 200' : 'double committing 100'} and partial completion`, () => {
    const f = setup(
      split ? 200 : 100,
      split
        ? ['Q', 'A', 'Q', '6', '2', '3', '8', '7']
        : ['10', '10', '6', '7', '5'],
    );
    f.act('DEAL');
    if (split) f.act('SPLIT');
    f.session.setSameBet(false);
    expect(f.session.getSnapshot().saved.preferences.sameBet).toBe(true);
    expect(f.session.repeatAvailability().enabled).toBe(false);
    f.act('DOUBLE');
    if (split) {
      expect(f.state()).toMatchObject({
        phase: 'PLAYER_TURN',
        balance: 50,
        activeHandIndex: 1,
      });
      expect(f.session.getSnapshot().saved).toMatchObject({
        settledBankroll: 200,
        lastCompletedWager: 50,
        preferences: { sameBet: true },
      });
      f.act('DOUBLE');
    }
    expect(f.state()).toMatchObject({
      phase: 'ROUND_COMPLETE',
      balance: split ? 400 : 200,
      wager: 50,
    });
    expect(f.state().round?.hands.map((hand) => hand.stake)).toEqual(
      split ? [100, 100] : [100],
    );
    f.act('NEXT_HAND');
    expect(f.state()).toMatchObject({ wager: 50, balance: split ? 400 : 200 });
  });

for (const { ranks, balance } of [
  { ranks: ['A', '9', 'K', '7'], balance: 1075 },
  { ranks: ['A', 'A', 'K', 'K'], balance: 1000 },
  { ranks: ['10', 'A', '8', 'K'], balance: 950 },
  { ranks: ['10', '10', '6', '7', 'K'], balance: 950 },
  { ranks: ['Q', '6', 'Q', '5', '7', '6', '6'], balance: 950 },
] satisfies { ranks: Rank[]; balance: number }[])
  test(`completion updates original wager for ${ranks.join(',')}`, () => {
    const f = setup(1000, ranks);
    f.act('DEAL');
    if (ranks[0] === 'Q') f.act('SPLIT', 'STAND', 'STAND');
    else if (ranks[0] === '10' && ranks[1] === '10') f.act('HIT');
    expect(f.state()).toMatchObject({ phase: 'ROUND_COMPLETE', balance });
    expect(f.saved().lastCompletedWager).toBe(50);
    f.act('NEXT_HAND');
    expect(f.state().wager).toBe(50);
  });

test('manual selection establishes new reference only on completed accepted Deal; toggle never changes selection', () => {
  const f = setup(500, ['10', '10', '7', '7']);
  f.session.dispatch({ type: 'PLACE_BET', amount: 100 });
  f.session.setSameBet(false);
  f.session.setSameBet(true);
  expect(f.state().wager).toBe(100);
  expect(f.saved().lastCompletedWager).toBe(50);
  f.session.dispatch({ type: 'PLACE_BET', amount: 0 });
  f.act('NEXT_HAND');
  expect(f.state().wager).toBe(100);
  f.act('DEAL');
  f.session.dispatch({ type: 'PLACE_BET', amount: 200 });
  expect(f.saved().lastCompletedWager).toBe(50);
  f.act('STAND', 'NEXT_HAND');
  expect(f.state()).toMatchObject({ balance: 500, wager: 100 });
  expect(f.saved().lastCompletedWager).toBe(100);
});

test('interruption restores only completed reference and funds, even after selecting a different opening wager', () => {
  const f = setup(500);
  f.session.dispatch({ type: 'PLACE_BET', amount: 100 });
  f.act('DEAL');
  const recovered = createPlaySession(f.open());
  expect(recovered.getSnapshot()).toMatchObject({
    result: { state: { phase: 'BETTING', balance: 500, wager: 100 } },
    saved: { lastCompletedWager: 50, preferences: { sameBet: true } },
  });
  expect(recovered.getSnapshot().saved.notices.join()).toContain(
    'Unfinished hand discarded',
  );
});

test('depleted cancel preserves bytes and confirm clears repeat/reference with existing initial selection', () => {
  const f = setup(55, ['10', 'A', '8', 'K']);
  f.act('DEAL');
  const before = f.saved();
  f.session.reset(false);
  expect(f.saved()).toEqual(before);
  f.session.reset(true);
  expect(f.state()).toMatchObject({ balance: 1000, wager: 10 });
  expect(f.open().snapshot()).toMatchObject({
    lastCompletedWager: null,
    preferences: { sameBet: false, selectedWager: 10 },
  });
});

test('native labeled checkbox explains unknown, toggles without gameplay, disables through round, and preserves result announcements', () => {
  const f = setup(100, undefined, null, false);
  render(<PlayableRound session={f.session} />);
  const checkbox = screen.getByRole('checkbox', {
    name: 'Same bet on Next Hand',
  });
  expect(checkbox).toBeDisabled();
  expect(checkbox).toHaveAccessibleDescription(
    'Complete a round to choose Same bet.',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Deal' }));
  fireEvent.click(screen.getByRole('button', { name: 'Stand' }));
  expect(checkbox).toBeEnabled();
  fireEvent.click(checkbox);
  expect(checkbox).toBeChecked();
  expect(f.state().phase).toBe('ROUND_COMPLETE');
  fireEvent.click(screen.getByRole('button', { name: 'Next Hand' }));
  expect(f.state()).toMatchObject({
    phase: 'BETTING',
    wager: 50,
    balance: 100,
  });
});

for (const failure of ['access', 'write'])
  test(`Same bet remains usable in memory after denied ${failure}`, () => {
    const fail = () => {
      throw new Error('denied');
    };
    const adapter = createSessionStorage(
      failure === 'access'
        ? fail
        : () => ({ getItem: () => null, setItem: fail }),
    );
    const session = createPlaySession(adapter, () => ({
      ...roundState(['10', '10', '7', '7']),
      wager: 50,
    }));
    session.setSameBet(true);
    expect(session.getSnapshot().saved.preferences.sameBet).toBe(false);
    session.dispatch({ type: 'DEAL' });
    session.dispatch({ type: 'STAND' });
    session.setSameBet(true);
    session.dispatch({ type: 'NEXT_HAND' });
    expect(session.getSnapshot()).toMatchObject({
      result: { state: { phase: 'BETTING', balance: 1000, wager: 50 } },
      saved: {
        persistence: 'memory',
        lastCompletedWager: 50,
        preferences: { sameBet: true },
      },
    });
    expect(session.getSnapshot().saved.notices.join()).toContain(
      `Storage ${failure} failed`,
    );
  });

test('first split bust with zero available funds preserves opt-in until the second hand settles', () => {
  const f = setup(100, ['8', '10', '8', '7', '6', '6', 'K', 'K']);
  f.act('DEAL', 'SPLIT', 'HIT');
  expect(f.state()).toMatchObject({
    phase: 'PLAYER_TURN',
    activeHandIndex: 1,
    balance: 0,
  });
  expect(f.saved()).toMatchObject({
    settledBankroll: 100,
    lastCompletedWager: 50,
    roundPending: true,
    preferences: { sameBet: true, selectedWager: 50 },
  });
  f.act('HIT');
  expect(f.state()).toMatchObject({ phase: 'ROUND_COMPLETE', balance: 0 });
  expect(f.saved()).toMatchObject({
    settledBankroll: 0,
    lastCompletedWager: 50,
    roundPending: false,
    preferences: { sameBet: false, selectedWager: 0 },
  });
  f.act('NEXT_HAND');
  expect(f.state()).toMatchObject({ balance: 0, wager: 0 });
});
