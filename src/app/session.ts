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

function bettingState(
  saved: ReturnType<ReturnType<typeof createSessionStorage>['snapshot']>,
): GameState {
  return {
    ...createGame(),
    balance: saved.settledBankroll,
    wager: saved.dealWager ?? 0,
  };
}

export function createPlaySession(
  storage = createSessionStorage(),
  initialGame: (
    saved: ReturnType<typeof storage.snapshot>,
  ) => GameState = bettingState,
  dispatch: typeof dispatchRound = dispatchRound,
) {
  const recovered = storage.snapshot();
  const initial = initialGame(recovered);
  let snapshot: { result: Transition; saved: typeof recovered } = {
    result: { accepted: true, state: initial },
    saved: recovered,
  };
  let settlementNotice: string | undefined;
  const listeners = new Set<() => void>();
  function publish(result: Transition) {
    const saved = storage.snapshot();
    if (settlementNotice) saved.notices.push(settlementNotice);
    snapshot = { result, saved };
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
        settlementNotice = storage.commitSettled(result.state)
          ? undefined
          : 'Settlement could not be saved. Reload will restore the last saved bankroll.';
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
        settlementNotice = undefined;
        publish({ accepted: true, state: bettingState(storage.snapshot()) });
      }
    },
  };
}
export type PlaySession = ReturnType<typeof createPlaySession>;
