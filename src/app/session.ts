import {
  createGame,
  eligibility,
  WAGER_LIMITS,
  type GameEvent,
  type GameState,
  type Transition,
} from '../game/round';
import { createSessionStorage, type Preferences } from '../storage/session';
import { dispatchRound } from './dispatch';

export function createPlaySession(
  storage = createSessionStorage(),
  initialGame: (saved: ReturnType<typeof storage.snapshot>) => GameState = (
    saved,
  ) => ({
    ...createGame(),
    balance: saved.settledBankroll,
    wager: saved.dealWager ?? 0,
  }),
  dispatch: typeof dispatchRound = dispatchRound,
) {
  const recovered = storage.snapshot();
  function bettingState(): GameState {
    const saved = storage.snapshot();
    return {
      ...createGame(),
      balance: saved.settledBankroll,
      wager: saved.dealWager ?? 0,
    };
  }
  const initial = initialGame(recovered);
  let snapshot: { result: Transition; saved: typeof recovered } = {
    result: { accepted: true, state: initial },
    saved: recovered,
  };
  const listeners = new Set<() => void>();
  function publish(result: Transition) {
    snapshot = { result, saved: storage.snapshot() };
    listeners.forEach((listener) => listener());
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch(event: GameEvent) {
      const state = snapshot.result.state;
      if (event.type === 'DEAL' && eligibility(state, event).allowed)
        storage.beginRound();
      const result = dispatch(state, event);
      if (result.state !== state && result.state.phase === 'ROUND_COMPLETE') {
        storage.commitSettled(result.state);
      }
      if (result.accepted && event.type === 'PLACE_BET') {
        storage.updatePreferences({
          ...storage.snapshot().preferences,
          selectedWager: result.state.wager,
        });
      }
      publish(result);
    },
    setMotion(motion: Preferences['motion']) {
      if (
        storage.updatePreferences({ ...storage.snapshot().preferences, motion })
      )
        publish(snapshot.result);
    },
    reset(confirmed: boolean) {
      const state = snapshot.result.state;
      if (
        (state.phase === 'BETTING' || state.phase === 'ROUND_COMPLETE') &&
        state.balance < WAGER_LIMITS.min &&
        storage.reset({ confirmed })
      ) {
        publish({ accepted: true, state: bettingState() });
      }
    },
  };
}
export type PlaySession = ReturnType<typeof createPlaySession>;
