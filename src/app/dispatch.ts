import {
  transition,
  type GameEvent,
  type GameState,
  type Transition,
} from '../game/round';

export function dispatchRound(
  state: GameState,
  event: GameEvent,
  onTransition?: (state: GameState) => void,
): Transition {
  let result = transition(state, event);
  if (!result.accepted) return result;
  onTransition?.(result.state);
  while (
    result.state.phase === 'DEALER_TURN' ||
    result.state.phase === 'SETTLEMENT'
  ) {
    const next = transition(result.state, {
      type: result.state.phase === 'DEALER_TURN' ? 'DEALER_TURN' : 'SETTLE',
    });
    if (!next.accepted) return next;
    result = next;
    onTransition?.(result.state);
  }
  return result;
}
