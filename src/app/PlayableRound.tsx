import { useSyncExternalStore } from 'react';
import type { HandView } from '../components/Table';
import type { PlaySession } from './session';
import { MOTION_SETTINGS } from '../storage/session';
import styles from './PlayableRound.module.css';
import { Table, type Control, type ControlState } from '../components/Table';
import {
  eligibility,
  WAGER_LIMITS,
  type GameEvent,
  type GameState,
  type RejectionReason,
} from '../game/round';
import { scoreHand } from '../game/scoring';

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

export function PlayableRound({ session }: { session: PlaySession }) {
  const { result, saved } = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
  );
  const state = result.state;
  const dispatch = session.dispatch;
  const action = (label: string, event: GameEvent): Control => ({
    label,
    ...controlState(state, event),
    onActivate: () => dispatch(event),
  });
  const concealed = state.phase === 'PLAYER_TURN';
  const dealerCards = state.round?.dealer ?? [];
  const visibleDealer = concealed ? dealerCards.slice(0, 1) : dealerCards;
  const actions = [
    action('Deal', { type: 'DEAL' }),
    action('Hit', { type: 'HIT' }),
    action('Stand', { type: 'STAND' }),
    action('Double', { type: 'DOUBLE' }),
    action('Split', { type: 'SPLIT' }),
    action('Next Hand', { type: 'NEXT_HAND' }),
  ];
  if (
    (state.phase === 'BETTING' || state.phase === 'ROUND_COMPLETE') &&
    state.balance < WAGER_LIMITS.min
  ) {
    actions.push({
      label: 'Reset Virtual Bankroll',
      enabled: true,
      onActivate: () => {
        session.reset(window.confirm('Reset Virtual Bankroll to 1,000 chips?'));
      },
    });
  }
  const playerView = (index: 0 | 1): HandView => {
    const hand = state.round?.hands[index];
    const result =
      state.phase === 'ROUND_COMPLETE' ? state.results[index] : undefined;
    return {
      label:
        state.round?.hands.length === 2
          ? `Your hand ${index + 1}`
          : 'Your hand',
      total: hand
        ? `Total: ${scoreHand(hand.cards).total}${hand.complete ? ' · Complete' : ''}`
        : 'Your cards will appear here',
      cards:
        hand?.cards.map((card) => ({
          concealed: false,
          rank: card.rank,
          suit: card.suit,
        })) ?? [],
      ...(hand ? { stake: hand.stake } : {}),
      ...(result
        ? ({
            outcome: {
              label:
                result.outcome === 'loss'
                  ? 'Loss'
                  : result.outcome === 'push'
                    ? 'Push'
                    : 'Win',
              returned: result.returned,
              net: result.net,
            },
          } as const)
        : {}),
    };
  };
  const players: readonly [HandView] | readonly [HandView, HandView] =
    state.round?.hands.length === 2
      ? [playerView(0), playerView(1)]
      : [playerView(0)];
  return (
    <div className={styles.game} data-motion={saved.preferences.motion}>
      {saved.notices.map((notice) => (
        <p key={notice}>{notice}</p>
      ))}
      <div className={styles.preferences}>
        <label>
          Motion{' '}
          <select
            value={saved.preferences.motion}
            onChange={(event) => {
              const motion = MOTION_SETTINGS.find(
                (value) => value === event.target.value,
              );
              if (motion) session.setMotion(motion);
            }}
          >
            {MOTION_SETTINGS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <span>Audio: muted</span>
        <label>
          Selected wager{' '}
          <select
            disabled={
              state.phase !== 'BETTING' || state.balance < WAGER_LIMITS.min
            }
            value={state.wager}
            onChange={(event) =>
              dispatch({
                type: 'PLACE_BET',
                amount: Number(event.target.value),
              })
            }
          >
            {state.wager === 0 && <option value={0}>Choose wager</option>}
            {Array.from(
              {
                length: Math.floor(
                  Math.min(WAGER_LIMITS.max, state.balance) / WAGER_LIMITS.step,
                ),
              },
              (_, index) => (index + 1) * WAGER_LIMITS.step,
            )
              .concat(state.wager > state.balance ? [state.wager] : [])
              .map((amount) => (
                <option key={amount} value={amount}>
                  {amount}
                </option>
              ))}
          </select>
        </label>
      </div>
      {!result.accepted && <p role="alert">{reasons[result.reason]}</p>}
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
        players={players}
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
    </div>
  );
}
