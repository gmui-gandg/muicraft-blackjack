import { transition, type GameEvent, type GameState } from '../game/round';

export function dispatchRound(state: GameState, event: GameEvent): GameState {
  let result = transition(state, event);
  if (!result.accepted) return state;
  while (
    result.state.phase === 'DEALER_TURN' ||
    result.state.phase === 'SETTLEMENT'
  ) {
    const next = transition(result.state, {
      type: result.state.phase === 'DEALER_TURN' ? 'DEALER_TURN' : 'SETTLE',
    });
    if (!next.accepted) return next.state;
    result = next;
  }
  return result.state;
}
