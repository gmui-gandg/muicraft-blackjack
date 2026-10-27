import type { GameState } from '../game/round.js';

export const SESSION_KEY = 'muicraft-blackjack.session';
export const MOTION_SETTINGS = ['system', 'reduced', 'full'] as const;
export const AUDIO_SETTINGS = ['muted'] as const;
export type Preferences = Readonly<{
  selectedWager: number;
  motion: (typeof MOTION_SETTINGS)[number];
  audio: (typeof AUDIO_SETTINGS)[number];
}>;
type RecordV1 = Readonly<{
  version: 1;
  settledBankroll: number;
  preferences: Preferences;
  roundPending: boolean;
}>;
export type StorageBoundary = Pick<Storage, 'getItem' | 'setItem'>;

const defaults = (): RecordV1 => ({
  version: 1,
  settledBankroll: 1000,
  preferences: { selectedWager: 10, motion: 'system', audio: 'muted' },
  roundPending: false,
});

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function sameKeys(value: Record<string, unknown>, example: object): boolean {
  const keys = Object.keys(example);
  return (
    Object.keys(value).length === keys.length && keys.every((k) => k in value)
  );
}
function member<T extends string>(
  values: readonly T[],
  value: unknown,
): value is T {
  return values.some((candidate) => candidate === value);
}
function bankroll(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function preferences(value: unknown): value is Preferences {
  return (
    object(value) &&
    sameKeys(value, defaults().preferences) &&
    typeof value.selectedWager === 'number' &&
    Number.isInteger(value.selectedWager) &&
    value.selectedWager >= 10 &&
    value.selectedWager <= 500 &&
    value.selectedWager % 10 === 0 &&
    member(MOTION_SETTINGS, value.motion) &&
    member(AUDIO_SETTINGS, value.audio)
  );
}
function validRecord(value: unknown): value is RecordV1 {
  return (
    object(value) &&
    sameKeys(value, defaults()) &&
    value.version === 1 &&
    bankroll(value.settledBankroll) &&
    preferences(value.preferences) &&
    typeof value.roundPending === 'boolean'
  );
}

export function createSessionStorage(
  getStorage: () => StorageBoundary = () => window.localStorage,
) {
  let record = defaults();
  let storage: StorageBoundary | undefined;
  const notices: string[] = [];

  function unavailable(operation: string) {
    storage = undefined;
    notices.push(
      `Storage ${operation} failed. This session continues in memory; changes may not survive reload.`,
    );
  }
  function persist() {
    if (!storage) return;
    try {
      storage.setItem(SESSION_KEY, JSON.stringify(record));
    } catch {
      unavailable('write');
    }
  }

  try {
    storage = getStorage();
  } catch {
    unavailable('access');
  }
  if (storage) {
    let raw: string | null = null;
    try {
      raw = storage.getItem(SESSION_KEY);
    } catch {
      unavailable('read');
    }
    if (raw !== null) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = undefined;
      }
      if (validRecord(parsed)) {
        record = parsed;
      } else {
        storage = undefined;
        notices.push(
          'Saved session is invalid or uses an unsupported version. A new 1,000-chip in-memory session is available; the saved record is preserved until confirmed reset.',
        );
      }
    }
  }
  if (record.roundPending) {
    notices.push(
      'Unfinished hand discarded. Restored the last settled bankroll.',
    );
    record = { ...record, roundPending: false };
    persist();
  }

  return {
    snapshot(systemReducedMotion = false) {
      const eligible = Math.min(
        record.preferences.selectedWager,
        Math.floor(record.settledBankroll / 10) * 10,
      );
      return {
        phase: 'BETTING' as const,
        settledBankroll: record.settledBankroll,
        preferences: { ...record.preferences },
        dealWager: eligible >= 10 ? eligible : null,
        reducedMotion:
          record.preferences.motion === 'system'
            ? systemReducedMotion
            : record.preferences.motion === 'reduced',
        persistence: storage ? ('available' as const) : ('memory' as const),
        notices: [...notices],
      };
    },
    beginRound() {
      record = { ...record, roundPending: true };
      persist();
    },
    commitSettled(state: Pick<GameState, 'phase' | 'balance'>): boolean {
      if (state.phase !== 'ROUND_COMPLETE' || !bankroll(state.balance))
        return false;
      record = {
        ...record,
        settledBankroll: state.balance,
        roundPending: false,
      };
      persist();
      return true;
    },
    updatePreferences(next: Preferences): boolean {
      if (!preferences(next)) return false;
      record = { ...record, preferences: { ...next } };
      persist();
      return true;
    },
    reset(intent: Readonly<{ confirmed?: boolean }>): boolean {
      if (intent.confirmed !== true) return false;
      record = defaults();
      try {
        storage = getStorage();
      } catch {
        unavailable('access');
      }
      persist();
      return true;
    },
  };
}
