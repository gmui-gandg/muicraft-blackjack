// @vitest-environment jsdom
import '../test/setup';
import { StrictMode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { createPlaySession } from './session';
import { PlayableRound } from './PlayableRound';
import { createSessionStorage } from '../storage/session';
import { memoryStorage } from '../test/play-session';
import { roundState } from '../test/round-fixtures';
import { dispatchRound } from './dispatch';
import { settledBankroll, transition } from '../game/round';

const ranks = ['Q', 'A', 'Q', '6', '2', '3', '8', '7'] as const;
const read = (storage: ReturnType<typeof memoryStorage>) =>
  JSON.parse(storage.getItem('muicraft-blackjack.session')!);

test('rejected unsafe settlement is explained visibly and preserves the last settled bytes', () => {
  const storage = memoryStorage(Number.MAX_SAFE_INTEGER);
  const session = createPlaySession(
    createSessionStorage(() => storage),
    (saved) => ({
      ...roundState(['A', '9', 'K', '7'], saved.settledBankroll),
      wager: saved.dealWager ?? 0,
    }),
  );
  const view = render(<PlayableRound session={session} />);
  fireEvent.click(screen.getByRole('button', { name: 'Deal' }));
  expect(session.getSnapshot().result.state.phase).toBe('ROUND_COMPLETE');
  expect(Number.isSafeInteger(session.getSnapshot().result.state.balance)).toBe(
    false,
  );
  expect(screen.getByText(/Settlement could not be saved/)).toBeVisible();
  expect(read(storage)).toMatchObject({
    settledBankroll: Number.MAX_SAFE_INTEGER,
    roundPending: true,
  });
  expect(storage.writes).toHaveLength(1);
  session.dispatch({ type: 'SETTLE' });
  expect(storage.writes).toHaveLength(1);
  expect(session.getSnapshot().saved.notices).toHaveLength(1);
  view.unmount();
  const recreated = createPlaySession(createSessionStorage(() => storage));
  expect(recreated.getSnapshot().result.state.balance).toBe(
    Number.MAX_SAFE_INTEGER,
  );
  expect(recreated.getSnapshot().saved.notices).toEqual([
    'Unfinished hand discarded. Restored the last settled bankroll.',
  ]);
});

test('startup and confirmed depleted reset project saved bankroll and affordable wager', () => {
  const storage = memoryStorage(19);
  const adapter = createSessionStorage(() => storage);
  adapter.updatePreferences({
    selectedWager: 50,
    motion: 'reduced',
    audio: 'muted',
  });
  expect(createPlaySession(adapter).getSnapshot().result.state).toMatchObject({
    phase: 'BETTING',
    balance: 19,
    wager: 10,
  });
  for (const complete of [false, true]) {
    const depleted = memoryStorage(0);
    const session = createPlaySession(
      createSessionStorage(() => depleted),
      complete
        ? () =>
            dispatchRound(
              { ...roundState(['10', 'A', '8', 'K'], 10), wager: 10 },
              { type: 'DEAL' },
            ).state
        : undefined,
    );
    if (!complete) expect(session.getSnapshot().result.state.wager).toBe(0);
    session.reset(false);
    expect(depleted.writes).toHaveLength(0);
    session.reset(true);
    const recreated = createPlaySession(createSessionStorage(() => depleted));
    expect(session.getSnapshot().result.state).toMatchObject({
      phase: 'BETTING',
      balance: 1000,
      wager: 10,
    });
    expect(session.getSnapshot().saved).toEqual(recreated.getSnapshot().saved);
    expect(recreated.getSnapshot().result.state).toMatchObject({
      phase: 'BETTING',
      balance: 1000,
      wager: 10,
    });
  }
});

test('StrictMode replay and remount recover once and never duplicate a financial write', () => {
  const storage = memoryStorage();
  const adapter = createSessionStorage(() => storage);
  adapter.beginRound();
  const session = createPlaySession(
    createSessionStorage(() => storage),
    (saved) => ({
      ...roundState(ranks),
      balance: saved.settledBankroll,
      wager: saved.dealWager ?? 0,
    }),
  );
  expect(storage.writes).toHaveLength(2);
  const mount = () =>
    render(
      <StrictMode>
        <PlayableRound session={session} />
      </StrictMode>,
    );
  let view = mount();
  view.rerender(
    <StrictMode>
      <PlayableRound session={session} />
    </StrictMode>,
  );
  expect(screen.getByText(/Unfinished hand discarded/)).toBeVisible();
  expect(storage.writes).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Deal' }));
  session.dispatch({ type: 'DEAL' });
  session.dispatch({ type: 'SPLIT' });
  session.dispatch({ type: 'DOUBLE' });
  session.setMotion('reduced');
  expect(read(storage)).toMatchObject({
    settledBankroll: 1000,
    roundPending: true,
  });
  session.dispatch({ type: 'DOUBLE' });
  const completion = session.getSnapshot().result.state;
  if (completion.phase !== 'ROUND_COMPLETE')
    throw new Error('Completion required');
  expect(settledBankroll(completion)).toBe(1040);
  expect(completion.results).toEqual([
    { outcome: 'win', returned: 40, net: 20 },
    { outcome: 'win', returned: 40, net: 20 },
  ]);
  const count = storage.writes.length;
  for (const type of [
    'DOUBLE',
    'SPLIT',
    'SETTLE',
    'DEALER_TURN',
    'STAND',
  ] as const)
    session.dispatch({ type });
  view.unmount();
  view = mount();
  expect(storage.writes).toHaveLength(count);
  expect(read(storage)).toMatchObject({
    settledBankroll: 1040,
    roundPending: false,
  });
  const recreated = createPlaySession(createSessionStorage(() => storage));
  expect(recreated.getSnapshot().result.state).toMatchObject({
    phase: 'BETTING',
    balance: 1040,
    wager: 10,
  });
  expect(recreated.getSnapshot().saved.notices).toEqual([]);
  view.unmount();
});

for (const stop of [
  'DEALING',
  'PLAYER_TURN',
  'DEALER_TURN',
  'SETTLEMENT',
] as const) {
  test(`production lifecycle interruption checkpoint ${stop} restores pre-round funds`, () => {
    const storage = memoryStorage();
    const unload = new Error('test unload');
    const session = createPlaySession(
      createSessionStorage(() => storage),
      (saved) => ({ ...roundState(ranks), wager: saved.dealWager ?? 0 }),
      (state, event) => {
        if (stop === 'DEALING') throw unload;
        return dispatchRound(state, event, (next) => {
          if (next.phase === stop) throw unload;
        });
      },
    );
    if (stop === 'DEALING' || stop === 'PLAYER_TURN')
      expect(() => session.dispatch({ type: 'DEAL' })).toThrow(unload);
    else {
      session.dispatch({ type: 'DEAL' });
      session.dispatch({ type: 'SPLIT' });
      session.dispatch({ type: 'DOUBLE' });
      expect(() => session.dispatch({ type: 'DOUBLE' })).toThrow(unload);
    }
    expect(read(storage)).toMatchObject({
      settledBankroll: 1000,
      roundPending: true,
    });
    const recovered = createPlaySession(createSessionStorage(() => storage));
    expect(recovered.getSnapshot().result.state).toMatchObject({
      phase: 'BETTING',
      balance: 1000,
    });
    expect(recovered.getSnapshot().saved.notices).toEqual([
      'Unfinished hand discarded. Restored the last settled bankroll.',
    ]);
  });
}

test('reset guard rejects funded betting, player turn, dealer turn and funded completion; cancellation never writes', () => {
  const storage = memoryStorage();
  const session = createPlaySession(createSessionStorage(() => storage));
  const before = storage.writes.length;
  session.reset(true);
  session.reset(false);
  expect(storage.writes).toHaveLength(before);
  for (const phase of [
    'PLAYER_TURN',
    'DEALER_TURN',
    'SETTLEMENT',
    'ROUND_COMPLETE',
  ] as const) {
    let state = dispatchRound(
      { ...roundState(['10', '10', '8', '7']), wager: 10 },
      { type: 'DEAL' },
    ).state;
    if (phase === 'ROUND_COMPLETE')
      state = dispatchRound(state, { type: 'STAND' }).state;
    else if (phase !== 'PLAYER_TURN') {
      state = transition(state, { type: 'STAND' }).state;
      if (phase === 'SETTLEMENT')
        state = transition(state, { type: 'DEALER_TURN' }).state;
    }
    const owned = createPlaySession(
      createSessionStorage(() => storage),
      () => (phase === 'ROUND_COMPLETE' ? state : { ...state, balance: 0 }),
    );
    const count = storage.writes.length;
    owned.reset(false);
    owned.reset(true);
    expect(storage.writes).toHaveLength(count);
  }
});

test('denied writes stay playable and preferences never persist an in-round balance', () => {
  const storage = memoryStorage();
  const fail = vi.fn(() => {
    throw new Error('denied');
  });
  const session = createPlaySession(
    createSessionStorage(() => ({ getItem: storage.getItem, setItem: fail })),
    () => ({ ...roundState(['10', '10', '8', '7']), wager: 10 }),
  );
  session.dispatch({ type: 'DEAL' });
  session.setMotion('reduced');
  session.dispatch({ type: 'STAND' });
  expect(session.getSnapshot().result.state.balance).toBe(1010);
  expect(session.getSnapshot().saved.notices.join(' ')).toContain(
    'Storage write failed',
  );
  expect(session.getSnapshot().saved.preferences).toEqual({
    selectedWager: 10,
    motion: 'reduced',
    audio: 'muted',
  });
  expect(fail).toHaveBeenCalledTimes(1);
});
