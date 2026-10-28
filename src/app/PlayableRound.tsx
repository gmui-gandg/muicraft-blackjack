import { useEffect, useId, useRef, useSyncExternalStore } from 'react';
import { HelpDialog } from '../components/HelpDialog';
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

const shortcuts = [
  { key: 'h', label: 'Hit', type: 'HIT' },
  { key: 's', label: 'Stand', type: 'STAND' },
  { key: 'd', label: 'Double', type: 'DOUBLE' },
  { key: 'p', label: 'Split', type: 'SPLIT' },
] as const;

function primary(
  state: GameState,
): { event: GameEvent; label: string } | undefined {
  switch (state.phase) {
    case 'BETTING':
      return { event: { type: 'DEAL' }, label: 'Deal' };
    case 'PLAYER_TURN':
      return { event: { type: 'HIT' }, label: 'Hit' };
    case 'ROUND_COMPLETE':
      return { event: { type: 'NEXT_HAND' }, label: 'Next Hand' };
  }
}

function dispatchLegal(session: PlaySession, event: GameEvent) {
  if (eligibility(session.getSnapshot().result.state, event).allowed)
    session.dispatch(event);
}

export function PlayableRound({ session }: { session: PlaySession }) {
  const { result, saved } = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
  );
  const repeatReasonId = useId();
  const repeat = session.repeatAvailability();
  const modalOpen = useRef(false);
  const confirming = useRef(false);
  useEffect(() => {
    const held = new Set<string>();
    function keydown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      const command = shortcuts.find((shortcut) => shortcut.key === key);
      if (!command && key !== 'enter') return;
      const code = event.code || key;
      const duplicate = held.has(code) || event.repeat;
      held.add(code);
      const target = event.target instanceof Element ? event.target : null;
      const editableRoot = target?.closest(
        '[contenteditable=""], [contenteditable="true" i], [contenteditable="plaintext-only" i], [contenteditable="false" i]',
      );
      const editor =
        target?.closest('input, textarea, select') ||
        (editableRoot &&
          editableRoot.getAttribute('contenteditable')?.toLowerCase() !==
            'false');
      const modified =
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.shiftKey ||
        event.isComposing ||
        event.keyCode === 229;
      if (duplicate || modified || event.defaultPrevented) {
        if (key === 'enter' && !editor && target?.closest('button'))
          event.preventDefault();
        return;
      }
      if (editor || modalOpen.current || confirming.current) return;
      if (
        key === 'enter' &&
        target?.closest('button, a, summary, [role="button"]')
      )
        return;
      const action = command
        ? { type: command.type }
        : primary(session.getSnapshot().result.state)?.event;
      if (action) {
        event.preventDefault();
        dispatchLegal(session, action);
      }
    }
    const keyup = (event: KeyboardEvent) =>
      held.delete(event.code || event.key.toLowerCase());
    const blur = () => held.clear();
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('keyup', keyup, true);
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('keyup', keyup, true);
      window.removeEventListener('blur', blur);
    };
  }, [session]);
  const state = result.state;
  const dispatch = (event: GameEvent) => dispatchLegal(session, event);
  const action = (label: string, event: GameEvent): Control => ({
    label,
    ...controlState(state, event),
    onActivate: () => dispatch(event),
  });
  const concealed = state.phase === 'PLAYER_TURN';
  const dealerCards = state.round?.dealer ?? [];
  const visibleDealer = concealed ? dealerCards.slice(0, 1) : dealerCards;
  function resetBankroll() {
    confirming.current = true;
    try {
      if (window.confirm('Reset Virtual Bankroll to 1,000 chips?'))
        session.reset(true);
    } finally {
      confirming.current = false;
    }
  }
  const depleted =
    (state.phase === 'BETTING' || state.phase === 'ROUND_COMPLETE') &&
    state.balance < WAGER_LIMITS.min;
  const actions: Control[] = [
    action('Deal', { type: 'DEAL' }),
    ...shortcuts.map(({ label, type }) => action(label, { type })),
    action('Next Hand', { type: 'NEXT_HAND' }),
    ...(depleted
      ? [
          {
            label: 'Reset Virtual Bankroll',
            enabled: true as const,
            onActivate: resetBankroll,
          },
        ]
      : []),
  ];
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
      <div aria-live="polite" aria-atomic="true" aria-label="Session notices">
        {saved.notices.map((notice) => (
          <p key={notice}>{notice}</p>
        ))}
      </div>
      <div className={styles.preferences}>
        <HelpDialog
          onOpenChange={(open) => {
            modalOpen.current = open;
          }}
          shortcuts={
            <ul>
              {shortcuts.map(({ key, label }) => (
                <li key={key}>
                  {key.toUpperCase()}: {label}
                </li>
              ))}
            </ul>
          }
        />
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
        <div className={styles.repeat}>
          <label>
            <input
              type="checkbox"
              checked={saved.preferences.sameBet}
              disabled={!repeat.enabled}
              aria-describedby={repeatReasonId}
              onChange={(event) => session.setSameBet(event.target.checked)}
            />
            Same bet on Next Hand
          </label>
          <p id={repeatReasonId} aria-live="polite">
            {saved.lastCompletedWager !== null && (
              <>Repeat amount: {saved.lastCompletedWager}. </>
            )}
            {!repeat.enabled && repeat.reason}
          </p>
        </div>
      </div>
      <p>
        Primary action: {primary(state)?.label ?? 'none'} (Enter on the page)
      </p>
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
