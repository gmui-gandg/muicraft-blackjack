import { createPlaySession } from '../app/session';
import { createGame, type GameState } from '../game/round';
import { createSessionStorage, SESSION_KEY } from '../storage/session';

export function memoryStorage(balance = 1000) {
  let bytes: string | null = JSON.stringify({
    version: 1,
    settledBankroll: balance,
    preferences: { selectedWager: 10, motion: 'system', audio: 'muted' },
    roundPending: false,
  });
  const writes: string[] = [];
  return {
    writes,
    getItem: (key: string) => (key === SESSION_KEY ? bytes : null),
    setItem: (key: string, value: string) => {
      if (key !== SESSION_KEY) throw new Error('Unexpected storage key');
      bytes = value;
      writes.push(value);
    },
  };
}
export function testSession(initial: () => GameState = createGame) {
  const state = initial();
  const storage = memoryStorage(state.balance);
  return createPlaySession(
    createSessionStorage(() => storage),
    () => state,
  );
}
