import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  type GameEvent,
  type GameState,
  transition,
} from '../src/game/round.js';
import { type Rank } from '../src/game/cards.js';
import { roundState } from '../src/test/round-fixtures.js';
import {
  AUDIO_SETTINGS,
  createSessionStorage,
  MOTION_SETTINGS,
  SESSION_KEY,
} from '../src/storage/session.js';

function step(state: GameState, type: 'DEAL' | 'STAND' | 'DEALER_TURN') {
  const result = transition(state, { type });
  if (!result.accepted) throw new Error(result.reason);
  return result.state;
}

function bet(state: GameState) {
  const result = transition(state, { type: 'PLACE_BET', amount: 10 });
  if (!result.accepted) throw new Error(result.reason);
  return result.state;
}

function completed(balance: 0 | 990 | 1015 = 1015) {
  const state = step(
    bet(
      roundState(
        balance === 1015 ? ['A', '9', 'K', '7'] : ['10', 'A', '8', 'K'],
        balance === 0 ? 10 : 1000,
      ),
    ),
    'DEAL',
  );
  if (state.phase !== 'ROUND_COMPLETE') throw new Error('Expected completion');
  expect(state.balance).toBe(balance);
  return state;
}

function unfinished(phase: GameState['phase']) {
  let state = bet(roundState(['10', '10', '6', '7']));
  if (phase === 'BETTING') return state;
  state = step(state, 'DEAL');
  if (phase === 'PLAYER_TURN') return state;
  state = step(state, 'STAND');
  if (phase === 'DEALER_TURN') return state;
  return step(state, 'DEALER_TURN');
}

function fixture() {
  const data = new Map<string, string>([['unrelated', 'keep']]);
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
  const open = () => createSessionStorage(() => storage);
  const saved = () => JSON.parse(data.get(SESSION_KEY) ?? 'null') as unknown;
  return { data, storage, open, saved };
}
const record = {
  version: 1,
  settledBankroll: 1000,
  preferences: { selectedWager: 10, motion: 'system', audio: 'muted' },
  roundPending: false,
};

const currentRecord = {
  ...record,
  version: 2,
  lastCompletedWager: null,
  preferences: { ...record.preferences, sameBet: false },
};

describe('settled session storage boundary', () => {
  it('requires the full engine completion type at the settlement seam', () => {
    const session = fixture().open();
    expectTypeOf(session.commitSettled)
      .parameter(0)
      .toEqualTypeOf<Extract<GameState, { phase: 'ROUND_COMPLETE' }>>();
    expectTypeOf<{ phase: 'ROUND_COMPLETE'; balance: number }>().not.toExtend<
      Parameters<typeof session.commitSettled>[0]
    >();
  });
  it.each([
    'full fabrication',
    'phase and balance',
    'copy',
    'structured clone',
    'changed copy',
    'mutated original',
  ] as const)(
    'refuses %s without changing settled funds or pending marker',
    (kind) => {
      const f = fixture();
      const session = f.open();
      session.beginRound();
      const before = f.data.get(SESSION_KEY);
      const genuine = completed();
      const fabricated = {
        phase: 'ROUND_COMPLETE' as const,
        balance: 900000,
        wager: genuine.wager,
        shoe: genuine.shoe,
        discards: genuine.discards,
        history: genuine.history,
        round: genuine.round,
        activeHandIndex: null,
        outcome: genuine.outcome,
        returned: genuine.returned,
      };
      let result: boolean;
      if (kind === 'full fabrication') {
        // @ts-expect-error Only the engine can issue a branded completion.
        result = session.commitSettled(fabricated);
      } else if (kind === 'phase and balance') {
        // @ts-expect-error JavaScript callers can bypass the completion type.
        result = session.commitSettled({
          phase: 'ROUND_COMPLETE',
          balance: 900000,
        });
      } else if (kind === 'structured clone') {
        result = session.commitSettled(structuredClone(genuine));
      } else if (kind === 'mutated original') {
        Object.assign(genuine, { balance: 900000 });
        result = session.commitSettled(genuine);
      } else {
        result = session.commitSettled({
          ...genuine,
          balance: kind === 'copy' ? genuine.balance : 900000,
        });
      }
      expect(result).toBe(false);
      expect(session.snapshot().settledBankroll).toBe(1000);
      expect(f.data.get(SESSION_KEY)).toBe(before);
      expect(f.open().snapshot().notices).toContain(
        'Unfinished hand discarded. Restored the last settled bankroll.',
      );
    },
  );
  it.each<{
    name: string;
    ranks: Rank[];
    events: Exclude<GameEvent['type'], 'PLACE_BET'>[];
    balance: number;
  }>([
    {
      name: 'ordinary settlement',
      ranks: ['10', '10', '8', '7'],
      events: ['STAND', 'DEALER_TURN', 'SETTLE'],
      balance: 1010,
    },
    {
      name: 'all bust shortcut',
      ranks: ['10', '10', '6', '7', 'K'],
      events: ['HIT'],
      balance: 990,
    },
    {
      name: 'double',
      ranks: ['10', '10', '6', '7', '5'],
      events: ['DOUBLE', 'DEALER_TURN', 'SETTLE'],
      balance: 1020,
    },
    {
      name: 'split aces',
      ranks: ['A', '10', 'A', '7', 'K', '9'],
      events: ['SPLIT', 'DEALER_TURN', 'SETTLE'],
      balance: 1020,
    },
    {
      name: 'split all bust shortcut',
      ranks: ['8', '10', '8', '7', '6', '6', 'K', 'K'],
      events: ['SPLIT', 'HIT', 'HIT'],
      balance: 980,
    },
  ])(
    'accepts the engine-issued $name completion',
    ({ ranks, events, balance }) => {
      let state = step(bet(roundState(ranks)), 'DEAL');
      for (const type of events) {
        const result = transition(state, { type });
        if (!result.accepted) throw new Error(result.reason);
        state = result.state;
      }
      if (state.phase !== 'ROUND_COMPLETE')
        throw new Error('Expected completion');
      const f = fixture();
      const session = f.open();
      session.beginRound();
      expect(session.commitSettled(state)).toBe(true);
      expect(session.commitSettled(state)).toBe(true);
      expect(f.open().snapshot()).toMatchObject({
        settledBankroll: balance,
        notices: [],
      });
    },
  );
  it('defaults empty storage, commits 1015 and preserves wager 50 across recreation', () => {
    const f = fixture();
    const session = f.open();
    expect(session.snapshot()).toMatchObject({
      settledBankroll: 1000,
      dealWager: 10,
      notices: [],
    });
    expect(session.commitSettled(completed())).toBe(true);
    session.updatePreferences({
      selectedWager: 50,
      motion: 'system',
      audio: 'muted',
    });
    expect(f.open().snapshot()).toMatchObject({
      settledBankroll: 1015,
      dealWager: 50,
      notices: [],
    });
    expect(f.saved()).toEqual({
      ...currentRecord,
      settledBankroll: 1015,
      lastCompletedWager: 10,
      preferences: { ...currentRecord.preferences, selectedWager: 50 },
    });
    expect(f.data.get('unrelated')).toBe('keep');
  });

  it.each<GameState['phase']>([
    'BETTING',
    'PLAYER_TURN',
    'DEALER_TURN',
    'SETTLEMENT',
  ])(
    'refuses unfinished %s balance 990 without replacing settled funds or marker',
    (phase) => {
      const f = fixture();
      const session = f.open();
      session.beginRound();
      const before = f.data.get(SESSION_KEY);
      const state = { ...unfinished(phase), balance: 990 };
      expect(state.phase).toBe(phase);
      // Exercise runtime rejection even when a JavaScript caller bypasses the type.
      // @ts-expect-error Unfinished engine states are not settlement inputs.
      expect(session.commitSettled(state)).toBe(false);
      expect(f.data.get(SESSION_KEY)).toBe(before);
      session.updatePreferences({
        selectedWager: 50,
        motion: 'system',
        audio: 'muted',
      });
      expect(f.saved()).toEqual({
        ...currentRecord,
        roundPending: true,
        preferences: { ...currentRecord.preferences, selectedWager: 50 },
      });
      const recovered = f.open().snapshot();
      expect(recovered).toMatchObject({
        phase: 'BETTING',
        settledBankroll: 1000,
      });
      expect(recovered.notices).toEqual([
        'Unfinished hand discarded. Restored the last settled bankroll.',
      ]);
      expect(f.open().snapshot().notices).toEqual([]);
    },
  );

  it('clears interruption on settlement without fabricating a result', () => {
    const f = fixture();
    const s = f.open();
    s.beginRound();
    s.commitSettled(completed(990));
    expect(f.open().snapshot()).toMatchObject({
      settledBankroll: 990,
      notices: [],
    });
    expect(f.saved()).toEqual({
      ...currentRecord,
      lastCompletedWager: 10,
      settledBankroll: 990,
    });
  });

  it('rejects an engine-issued completion outside the safe financial domain', () => {
    const state = step(
      bet(roundState(['A', '9', 'K', '7'], Number.MAX_SAFE_INTEGER)),
      'DEAL',
    );
    if (state.phase !== 'ROUND_COMPLETE')
      throw new Error('Expected completion');
    const f = fixture();
    const session = f.open();
    session.beginRound();
    const before = f.data.get(SESSION_KEY);
    expect(session.commitSettled(state)).toBe(false);
    expect(session.snapshot().settledBankroll).toBe(1000);
    expect(f.data.get(SESSION_KEY)).toBe(before);
  });

  it.each([-1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid settlement %s',
    (balance) => {
      const f = fixture();
      const s = f.open();
      s.beginRound();
      const before = f.data.get(SESSION_KEY);
      expect(s.commitSettled({ ...completed(), balance })).toBe(false);
      expect(f.data.get(SESSION_KEY)).toBe(before);
      expect(s.snapshot().settledBankroll).toBe(1000);
    },
  );

  it.each([
    '{',
    'null',
    '[]',
    '1',
    '{}',
    JSON.stringify({ ...record, version: 99 }),
    JSON.stringify({ ...record, roundPending: 'yes' }),
    JSON.stringify({ ...record, cards: [] }),
    ...[-1, 1.5, null, '1000', Number.MAX_SAFE_INTEGER + 1].map(
      (settledBankroll) => JSON.stringify({ ...record, settledBankroll }),
    ),
    '{"version":1,"settledBankroll":1e400,"preferences":{"selectedWager":10,"motion":"system","audio":"muted"},"roundPending":false}',
    ...[
      { selectedWager: 0 },
      { selectedWager: 15 },
      { selectedWager: 510 },
      { selectedWager: '50' },
      { motion: 'automatic' },
      { audio: 'on' },
      { extra: true },
    ].map((prefs) =>
      JSON.stringify({
        ...record,
        preferences: { ...record.preferences, ...prefs },
      }),
    ),
  ])(
    'preserves untrusted bytes and offers explained new memory session: %s',
    (raw) => {
      const f = fixture();
      f.data.set(SESSION_KEY, raw);
      const s = f.open();
      expect(s.snapshot()).toMatchObject({
        settledBankroll: 1000,
        dealWager: 10,
        persistence: 'memory',
      });
      expect(s.snapshot().notices.join()).toContain(
        'invalid or uses an unsupported version',
      );
      s.beginRound();
      s.commitSettled(completed());
      s.updatePreferences({
        selectedWager: 50,
        motion: 'full',
        audio: 'muted',
      });
      expect(f.data.get(SESSION_KEY)).toBe(raw);
      expect(s.reset({})).toBe(false);
      expect(s.reset({ confirmed: false })).toBe(false);
      expect(f.data.get(SESSION_KEY)).toBe(raw);
      expect(s.reset({ confirmed: true })).toBe(true);
      expect(f.saved()).toEqual(currentRecord);
      expect(f.data.get('unrelated')).toBe('keep');
    },
  );

  it.each([0, 5, 9, 10, 15, 100])(
    'retains known balance %s and clamps Deal without adding funds',
    (balance) => {
      const f = fixture();
      f.data.set(
        SESSION_KEY,
        JSON.stringify({
          ...record,
          settledBankroll: balance,
          roundPending: true,
          preferences: { ...record.preferences, selectedWager: 500 },
        }),
      );
      const s = f.open();
      expect(s.snapshot().settledBankroll).toBe(balance);
      expect(s.snapshot().dealWager).toBe(
        balance < 10 ? null : Math.floor(balance / 10) * 10,
      );
      expect(f.open().snapshot().settledBankroll).toBe(balance);
      const before = f.data.get(SESSION_KEY);
      expect(s.reset({})).toBe(false);
      expect(s.reset({ confirmed: false })).toBe(false);
      expect(f.data.get(SESSION_KEY)).toBe(before);
      s.reset({ confirmed: true });
      expect(f.open().snapshot()).toMatchObject({
        settledBankroll: 1000,
        dealWager: 10,
        notices: [],
      });
    },
  );

  it.each(MOTION_SETTINGS)(
    'restores %s motion and muted audio; honors system unless overridden',
    (motion) => {
      const f = fixture();
      f.open().updatePreferences({
        selectedWager: 50,
        motion,
        audio: AUDIO_SETTINGS[0],
      });
      const s = f.open();
      for (const system of [true, false]) {
        expect(s.snapshot(system).reducedMotion).toBe(
          motion === 'system' ? system : motion === 'reduced',
        );
        expect(s.snapshot(system).preferences).toEqual({
          selectedWager: 50,
          sameBet: false,
          motion,
          audio: 'muted',
        });
      }
    },
  );

  it('validates runtime preference updates atomically', () => {
    const f = fixture();
    const s = f.open();
    s.beginRound();
    const before = f.data.get(SESSION_KEY);
    expect(
      s.updatePreferences({
        selectedWager: NaN,
        motion: 'system',
        audio: 'muted',
      }),
    ).toBe(false);
    expect(f.data.get(SESSION_KEY)).toBe(before);
  });

  it.each(['access', 'read', 'write'] as const)(
    'survives storage %s failure with usable memory state',
    (operation) => {
      const f = fixture();
      const fail = () => {
        throw new DOMException('Denied or quota exceeded');
      };
      if (operation === 'read') f.storage.getItem = fail;
      if (operation === 'write') f.storage.setItem = fail;
      const s = createSessionStorage(
        operation === 'access' ? fail : () => f.storage,
      );
      s.beginRound();
      expect(s.snapshot().persistence).toBe('memory');
      expect(s.snapshot().notices.join()).toContain(
        `Storage ${operation} failed`,
      );
      s.commitSettled(completed());
      s.updatePreferences({
        selectedWager: 50,
        motion: 'reduced',
        audio: 'muted',
      });
      expect(s.snapshot()).toMatchObject({
        settledBankroll: 1015,
        dealWager: 50,
      });
      expect(s.reset({ confirmed: false })).toBe(false);
      expect(s.snapshot().settledBankroll).toBe(1015);
      expect(s.reset({ confirmed: true })).toBe(true);
      expect(s.snapshot().settledBankroll).toBe(1000);
      expect(f.data.get('unrelated')).toBe('keep');
    },
  );

  it.each(['begin', 'settle', 'preferences', 'reset'] as const)(
    'retains the intended memory state when %s cannot write',
    (operation) => {
      const f = fixture();
      const s = f.open();
      s.commitSettled(completed(0));
      const before = f.data.get(SESSION_KEY);
      f.storage.setItem = () => {
        throw new DOMException('QuotaExceededError');
      };
      if (operation === 'begin') s.beginRound();
      if (operation === 'settle') s.commitSettled(completed());
      if (operation === 'preferences')
        s.updatePreferences({
          selectedWager: 50,
          motion: 'reduced',
          audio: 'muted',
        });
      if (operation === 'reset') s.reset({ confirmed: true });
      expect(s.snapshot().persistence).toBe('memory');
      expect(s.snapshot().notices.join()).toContain('Storage write failed');
      expect(s.snapshot().settledBankroll).toBe(
        operation === 'reset' ? 1000 : operation === 'settle' ? 1015 : 0,
      );
      expect(s.snapshot().preferences.selectedWager).toBe(
        operation === 'preferences' ? 50 : operation === 'reset' ? 10 : 0,
      );
      expect(f.data.get(SESSION_KEY)).toBe(before);
    },
  );

  it('reports failed recovery-marker clearing while preserving restored bankroll', () => {
    const f = fixture();
    f.data.set(
      SESSION_KEY,
      JSON.stringify({ ...record, settledBankroll: 0, roundPending: true }),
    );
    f.storage.setItem = () => {
      throw new Error('quota');
    };
    const s = f.open();
    expect(s.snapshot()).toMatchObject({
      settledBankroll: 0,
      dealWager: null,
      persistence: 'memory',
    });
    expect(s.snapshot().notices).toHaveLength(2);
  });

  it('has no import-time browser dependency and explains unavailable default storage', () => {
    expect(createSessionStorage().snapshot()).toMatchObject({
      persistence: 'memory',
      settledBankroll: 1000,
    });
  });
});

it('migrates v1 selection without inferring completed-round reference and writes only the v2 allowlist', () => {
  const f = fixture();
  f.data.set(
    SESSION_KEY,
    JSON.stringify({
      ...record,
      settledBankroll: 765,
      preferences: { selectedWager: 100, motion: 'reduced', audio: 'muted' },
    }),
  );
  const s = f.open();
  expect(s.snapshot()).toMatchObject({
    settledBankroll: 765,
    dealWager: 100,
    lastCompletedWager: null,
    preferences: {
      selectedWager: 100,
      sameBet: false,
      motion: 'reduced',
      audio: 'muted',
    },
  });
  s.updatePreferences({ motion: 'full' });
  expect(f.saved()).toEqual({
    version: 2,
    settledBankroll: 765,
    roundPending: false,
    lastCompletedWager: null,
    preferences: {
      selectedWager: 100,
      sameBet: false,
      motion: 'full',
      audio: 'muted',
    },
  });
});

it.each([undefined, null, 0, 15, 510, -10, '50', { cards: [] }])(
  'bad repeat reference %j preserves valid funds and other preferences',
  (reference) => {
    const f = fixture();
    f.data.set(
      SESSION_KEY,
      JSON.stringify({
        ...currentRecord,
        settledBankroll: 765,
        lastCompletedWager: reference,
        preferences: {
          selectedWager: 100,
          motion: 'reduced',
          audio: 'muted',
          sameBet: true,
        },
      }),
    );
    const s = f.open();
    expect(s.snapshot()).toMatchObject({
      settledBankroll: 765,
      dealWager: 100,
      lastCompletedWager: null,
      persistence: 'available',
      preferences: {
        selectedWager: 100,
        sameBet: false,
        motion: 'reduced',
        audio: 'muted',
      },
    });
    s.beginRound();
    expect(f.saved()).toEqual({
      version: 2,
      settledBankroll: 765,
      lastCompletedWager: null,
      roundPending: true,
      preferences: {
        selectedWager: 100,
        sameBet: false,
        motion: 'reduced',
        audio: 'muted',
      },
    });
  },
);

it.each([undefined, null, 'true', 1, {}])(
  'bad opt-in %j leaves valid completed reference and manual selection',
  (sameBet) => {
    const f = fixture();
    f.data.set(
      SESSION_KEY,
      JSON.stringify({
        ...currentRecord,
        settledBankroll: 100,
        lastCompletedWager: 50,
        preferences: {
          ...currentRecord.preferences,
          selectedWager: 100,
          sameBet,
        },
      }),
    );
    expect(f.open().snapshot()).toMatchObject({
      settledBankroll: 100,
      lastCompletedWager: 50,
      dealWager: 100,
      preferences: { sameBet: false },
    });
  },
);

it.each([49, 50])(
  'restores opt-in only when whole completed reference is affordable at %s',
  (balance) => {
    const f = fixture();
    f.data.set(
      SESSION_KEY,
      JSON.stringify({
        ...currentRecord,
        settledBankroll: balance,
        lastCompletedWager: 50,
        preferences: {
          ...currentRecord.preferences,
          selectedWager: 0,
          sameBet: true,
        },
      }),
    );
    expect(f.open().snapshot()).toMatchObject({
      settledBankroll: balance,
      lastCompletedWager: 50,
      dealWager: null,
      preferences: { sameBet: balance >= 50, selectedWager: 0 },
    });
  },
);
