import { describe, expect, it } from 'vitest';
import type { GameState } from '../src/game/round.js';
import {
  AUDIO_SETTINGS,
  createSessionStorage,
  MOTION_SETTINGS,
  SESSION_KEY,
} from '../src/storage/session.js';

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

describe('settled session storage boundary', () => {
  it('defaults empty storage, commits 1015 and preserves wager 50 across recreation', () => {
    const f = fixture();
    const session = f.open();
    expect(session.snapshot()).toMatchObject({
      settledBankroll: 1000,
      dealWager: 10,
      notices: [],
    });
    expect(
      session.commitSettled({ phase: 'ROUND_COMPLETE', balance: 1015 }),
    ).toBe(true);
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
      ...record,
      settledBankroll: 1015,
      preferences: { ...record.preferences, selectedWager: 50 },
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
      expect(session.commitSettled({ phase, balance: 990 })).toBe(false);
      expect(f.data.get(SESSION_KEY)).toBe(before);
      session.updatePreferences({
        selectedWager: 50,
        motion: 'system',
        audio: 'muted',
      });
      expect(f.saved()).toEqual({
        ...record,
        roundPending: true,
        preferences: { ...record.preferences, selectedWager: 50 },
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
    s.commitSettled({ phase: 'ROUND_COMPLETE', balance: 990 });
    expect(f.open().snapshot()).toMatchObject({
      settledBankroll: 990,
      notices: [],
    });
    expect(f.saved()).toEqual({ ...record, settledBankroll: 990 });
  });

  it.each([-1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid settlement %s',
    (balance) => {
      const f = fixture();
      const s = f.open();
      s.beginRound();
      const before = f.data.get(SESSION_KEY);
      expect(s.commitSettled({ phase: 'ROUND_COMPLETE', balance })).toBe(false);
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
    JSON.stringify({ ...record, version: 2 }),
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
      s.commitSettled({ phase: 'ROUND_COMPLETE', balance: 1015 });
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
      expect(f.saved()).toEqual(record);
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
      s.commitSettled({ phase: 'ROUND_COMPLETE', balance: 1015 });
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
      s.commitSettled({ phase: 'ROUND_COMPLETE', balance: 0 });
      const before = f.data.get(SESSION_KEY);
      f.storage.setItem = () => {
        throw new DOMException('QuotaExceededError');
      };
      if (operation === 'begin') s.beginRound();
      if (operation === 'settle')
        s.commitSettled({ phase: 'ROUND_COMPLETE', balance: 1015 });
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
        operation === 'preferences' ? 50 : 10,
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
