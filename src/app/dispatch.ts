import {
  transition,
  type GameEvent,
  type GameState,
  type Transition,
} from '../game/round';

export function dispatchRound(state: GameState, event: GameEvent): Transition {
  let result = transition(state, event);
  if (!result.accepted) return result;
  while (
    result.state.phase === 'DEALER_TURN' ||
    result.state.phase === 'SETTLEMENT'
  ) {
    const next = transition(result.state, {
      type: result.state.phase === 'DEALER_TURN' ? 'DEALER_TURN' : 'SETTLE',
    });
    if (!next.accepted) return next;
    result = next;
  }
  return result;
}
