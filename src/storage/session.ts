import {
  type GameState,
  isValidWager,
  settledBankroll,
  STARTING_BANKROLL,
  WAGER_LIMITS,
} from '../game/round.js';

export const SESSION_KEY = 'muicraft-blackjack.session';
export const MOTION_SETTINGS = ['system', 'reduced', 'full'] as const;
export const AUDIO_SETTINGS = ['muted'] as const;
export type Preferences = Readonly<{
  selectedWager: number;
  sameBet: boolean;
  motion: (typeof MOTION_SETTINGS)[number];
  audio: (typeof AUDIO_SETTINGS)[number];
}>;
type SessionRecord = Readonly<{
  version: 2;
  lastCompletedWager: number | null;
  settledBankroll: number;
  preferences: Preferences;
  roundPending: boolean;
}>;
export type StorageBoundary = Pick<Storage, 'getItem' | 'setItem'>;

const defaults = (): SessionRecord => ({
  version: 2,
  lastCompletedWager: null,
  settledBankroll: STARTING_BANKROLL,
  preferences: {
    selectedWager: WAGER_LIMITS.min,
    sameBet: false,
    motion: 'system',
    audio: 'muted',
  },
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
    (value.selectedWager === 0 || isValidWager(value.selectedWager)) &&
    typeof value.sameBet === 'boolean' &&
    member(MOTION_SETTINGS, value.motion) &&
    member(AUDIO_SETTINGS, value.audio)
  );
}
function readRecord(value: unknown): SessionRecord | undefined {
  if (!object(value) || !object(value.preferences)) return;
  const legacy = value.version === 1;
  if (!legacy && value.version !== 2) return;
  const { sameBet, ...oldPreferences } = value.preferences;
  const oldRecord = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== 'lastCompletedWager'),
  );
  const expected = {
    version: 1,
    settledBankroll: 0,
    preferences: {},
    roundPending: false,
  };
  if (
    !sameKeys(legacy ? value : oldRecord, expected) ||
    !sameKeys(legacy ? value.preferences : oldPreferences, {
      selectedWager: 10,
      motion: 'system',
      audio: 'muted',
    }) ||
    !bankroll(value.settledBankroll) ||
    typeof value.roundPending !== 'boolean' ||
    (legacy && !isValidWager(oldPreferences.selectedWager))
  )
    return;
  const lastCompletedWager =
    !legacy && isValidWager(value.lastCompletedWager)
      ? value.lastCompletedWager
      : null;
  const nextPreferences = { ...oldPreferences, sameBet: false };
  if (!preferences(nextPreferences)) return;
  return {
    version: 2,
    settledBankroll: value.settledBankroll,
    roundPending: value.roundPending,
    lastCompletedWager,
    preferences: {
      ...nextPreferences,
      sameBet:
        !legacy &&
        sameBet === true &&
        lastCompletedWager !== null &&
        value.settledBankroll >= lastCompletedWager,
    },
  };
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
      const restored = readRecord(parsed);
      if (restored) {
        record = restored;
      } else {
        storage = undefined;
        notices.push(
          `Saved session is invalid or uses an unsupported version. A new ${STARTING_BANKROLL.toLocaleString('en-US')}-chip in-memory session is available; the saved record is preserved until confirmed reset.`,
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
        Math.floor(record.settledBankroll / WAGER_LIMITS.step) *
          WAGER_LIMITS.step,
      );
      return {
        phase: 'BETTING' as const,
        settledBankroll: record.settledBankroll,
        preferences: { ...record.preferences },
        lastCompletedWager: record.lastCompletedWager,
        dealWager: eligible >= WAGER_LIMITS.min ? eligible : null,
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
    commitSettled(
      state: Extract<GameState, { phase: 'ROUND_COMPLETE' }>,
    ): boolean {
      const balance = settledBankroll(state);
      if (!bankroll(balance)) return false;
      record = {
        ...record,
        settledBankroll: balance,
        roundPending: false,
        lastCompletedWager: state.wager,
        preferences: {
          ...record.preferences,
          sameBet: record.preferences.sameBet && balance >= state.wager,
          selectedWager:
            balance < state.wager ? 0 : record.preferences.selectedWager,
        },
      };
      persist();
      return true;
    },
    updatePreferences(changes: Partial<Preferences>): boolean {
      const next = { ...record.preferences, ...changes };
      if (!preferences(next)) return false;
      if (
        next.sameBet &&
        (record.lastCompletedWager === null ||
          record.settledBankroll < record.lastCompletedWager)
      )
        return false;
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
