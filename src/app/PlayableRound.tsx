import { useState } from 'react';
import { Table, type Control, type ControlState } from '../components/Table';
import {
  createGame,
  eligibility,
  type GameEvent,
  type GameState,
  type RejectionReason,
} from '../game/round';
import { scoreHand } from '../game/scoring';
import { dispatchRound } from './dispatch';

const reasons: Record<RejectionReason, string> = {
  WRONG_PHASE: 'This action is unavailable at this stage of the hand.',
  INVALID_WAGER: 'Wagers must be 10–500 chips in multiples of 10.',
  INSUFFICIENT_FUNDS: 'Not enough available chips for this wager.',
  WAGER_REQUIRED: 'Choose wager chips before dealing.',
  PAIR_REQUIRED: 'Split requires two cards of the same rank.',
  ALREADY_SPLIT: 'Only one split is allowed per round.',
  SHOE_EXHAUSTED: 'No cards remain in this shoe.',
  HAND_COMPLETE: 'This hand is already complete.',
  TWO_CARDS_REQUIRED: 'This action requires the first two cards.',
  SPLIT_ACES: 'Split aces receive only one additional card.',
};

function controlState(state: GameState, event: GameEvent): ControlState {
  const permission = eligibility(state, event);
  return permission.allowed
    ? { enabled: true }
    : { enabled: false, reason: reasons[permission.reason] };
}

export function PlayableRound({
  initialState = createGame,
}: {
  initialState?: () => GameState;
}) {
  const [state, setState] = useState(initialState);
  const dispatch = (event: GameEvent) =>
    setState((current) => dispatchRound(current, event));
  const action = (label: string, event: GameEvent): Control => ({
    label,
    ...controlState(state, event),
    onActivate: () => dispatch(event),
  });
  const hand = state.round?.hands[0];
  const concealed = state.phase === 'PLAYER_TURN';
  const dealerCards = state.round?.dealer ?? [];
  const visibleDealer = concealed ? dealerCards.slice(0, 1) : dealerCards;
  const actions = [
    action('Deal', { type: 'DEAL' }),
    action('Hit', { type: 'HIT' }),
    action('Stand', { type: 'STAND' }),
    action('Next Hand', { type: 'NEXT_HAND' }),
  ];
  if (
    (state.phase === 'BETTING' || state.phase === 'ROUND_COMPLETE') &&
    state.balance < 10
  ) {
    actions.push({
      label: 'Reset Virtual Bankroll',
      enabled: true,
      onActivate: () => {
        if (window.confirm('Reset Virtual Bankroll to 1,000 chips?'))
          setState(createGame());
      },
    });
  }
  return (
    <Table
      balance={state.balance}
      wager={state.wager}
      dealer={{
        label: 'Dealer',
        total: dealerCards.length
          ? `${concealed ? 'Visible total' : 'Total'}: ${scoreHand(visibleDealer).total}`
          : 'Waiting for a deal',
        cards: dealerCards.map((card, index) =>
          concealed && index === 1
            ? { concealed: true }
            : { concealed: false, rank: card.rank, suit: card.suit },
        ),
      }}
      players={[
        {
          label: 'Your hand',
          total: hand
            ? `Total: ${scoreHand(hand.cards).total}`
            : 'Your cards will appear here',
          cards:
            hand?.cards.map((card) => ({
              concealed: false,
              rank: card.rank,
              suit: card.suit,
            })) ?? [],
          ...(hand ? { stake: hand.stake } : {}),
          ...(state.phase === 'ROUND_COMPLETE'
            ? {
                outcome: {
                  label:
                    state.outcome === 'loss'
                      ? 'Loss'
                      : state.outcome === 'push'
                        ? 'Push'
                        : 'Win',
                  returned: state.returned,
                  net: state.returned - state.round.hands[0].stake,
                },
              }
            : {}),
        },
      ]}
      activeHand={state.activeHandIndex}
      chips={{
        10: controlState(state, {
          type: 'PLACE_BET',
          amount: state.wager + 10,
        }),
        50: controlState(state, {
          type: 'PLACE_BET',
          amount: state.wager + 50,
        }),
        100: controlState(state, {
          type: 'PLACE_BET',
          amount: state.wager + 100,
        }),
      }}
      onChip={(value) =>
        dispatch({ type: 'PLACE_BET', amount: state.wager + value })
      }
      actions={actions}
    />
  );
}
