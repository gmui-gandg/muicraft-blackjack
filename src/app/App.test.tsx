// @vitest-environment jsdom
import '../test/setup';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { App } from './App';
import { testSession } from '../test/play-session';
import { PlayableRound } from './PlayableRound';
import { dispatchRound } from './dispatch';
import {
  eligibility,
  transition,
  type GameEvent,
  type GameState,
} from '../game/round';
import { roundCases, roundState } from '../test/round-fixtures';

const click = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }));
const balance = () => screen.getByText('Balance').nextElementSibling;

test('production offers gameplay and honestly explains reloads', () => {
  render(<App session={testSession()} />);
  expect(
    screen.getByRole('heading', { name: 'MuiCraft Blackjack' }),
  ).toBeVisible();
  expect(screen.getByText(/Reload restores settled chips/)).toBeVisible();
  expect(
    screen.getByText('For entertainment only — virtual chips, no cash value.'),
  ).toBeVisible();
  for (const name of ['Double', 'Split'])
    expect(screen.getByRole('button', { name })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Deal' })).toBeDisabled();
  click('Add 10 chips');
  expect(screen.getByRole('button', { name: 'Deal' })).toBeEnabled();
});

for (const entry of roundCases) {
  test(`playable ${entry.name} ledger and explicit next hand`, () => {
    const initial = roundState(entry.ranks);
    const { container } = render(
      <PlayableRound session={testSession(() => initial)} />,
    );
    click('Add 10 chips');
    click('Deal');
    if (!entry.name.includes('natural')) {
      expect(balance()).toHaveTextContent('990');
      expect(screen.getByText('Stake: 10')).toBeVisible();
      const dealer = screen.getByRole('region', {
        name: 'Dealer',
      });
      expect(within(dealer).getAllByRole('img')).toHaveLength(2);
      expect(
        within(dealer).getByRole('img', { name: 'Concealed card' }),
      ).toBeVisible();
      const hole = initial.shoe[3]!;
      expect(dealer.outerHTML).not.toContain(`${hole.rank} of ${hole.suit}`);
      expect(within(dealer).getByText('Visible total: 10')).toBeVisible();
      expect(
        screen
          .getByRole('region', { name: 'Your hand Active hand' })
          .querySelectorAll('[role="img"]'),
      ).toHaveLength(2);
      if (entry.hit) click('Hit');
      click('Stand');
    }
    expect(balance()).toHaveTextContent(String(entry.balance));
    expect(screen.getAllByRole('status')[0]!).toHaveTextContent(
      `Return: ${entry.returned} · Net: ${entry.net}`,
    );
    expect(screen.getAllByRole('status')).toHaveLength(2);
    expect(screen.getAllByRole('status')[1]!).toBeEmptyDOMElement();
    expect(screen.queryByRole('img', { name: 'Concealed card' })).toBeNull();
    if (entry.name === 'dealer-bust')
      expect(
        within(screen.getByRole('region', { name: 'Dealer' })).getByText(
          'Total: 26',
          { exact: true },
        ),
      ).toBeVisible();
    for (const name of ['Hit', 'Stand', 'Deal'])
      expect(screen.getByRole('button', { name })).toBeDisabled();
    const before = container.innerHTML;
    expect(before).toContain('Stake: 10');
    click('Next Hand');
    expect(balance()).toHaveTextContent(String(entry.balance));
    expect(screen.queryAllByRole('img')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Deal' })).toBeDisabled();
  });
}

test('each preset reflects engine amount eligibility at balance and max boundaries', () => {
  render(<PlayableRound session={testSession(() => roundState([], 60))} />);
  expect(
    screen.getByRole('button', { name: 'Add 100 chips' }),
  ).toHaveAccessibleDescription('Not enough available chips for this wager.');
  click('Add 50 chips');
  click('Add 10 chips');
  for (const value of [10, 50, 100])
    expect(
      screen.getByRole('button', { name: `Add ${value} chips` }),
    ).toBeDisabled();
  expect(screen.getByText('Wager').nextElementSibling).toHaveTextContent('60');
});

test('500 maximum and stale/repeated lifecycle commands cannot commit or pay twice', () => {
  render(<PlayableRound session={testSession()} />);
  for (let index = 0; index < 5; index++) click('Add 100 chips');
  for (const value of [10, 50, 100])
    expect(
      screen.getByRole('button', { name: `Add ${value} chips` }),
    ).toHaveAccessibleDescription(
      'Wagers must be 10–500 chips in multiples of 10.',
    );
  let state = roundState(['10', '10', '5', '7', '6']);
  const events: GameEvent[] = [
    { type: 'PLACE_BET', amount: 10 },
    { type: 'DEAL' },
    { type: 'HIT' },
    { type: 'STAND' },
    { type: 'SETTLE' },
    { type: 'DEALER_TURN' },
  ];
  for (const event of events) {
    const allowed = eligibility(state, event).allowed;
    const next = dispatchRound(state, event);
    expect(next.accepted).toBe(allowed);
    if (!allowed) expect(next.state).toBe(state);
    state = next.state;
    if (event.type !== 'PLACE_BET') {
      const repeated = dispatchRound(state, event);
      expect(repeated.accepted).toBe(false);
      expect(repeated.state).toBe(state);
    }
  }
  expect(state.balance).toBe(1010);
});

test('depleted reset cancel preserves balance and confirm restores exactly 1000', () => {
  render(<PlayableRound session={testSession(() => roundState([], 5))} />);
  const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(false);
  click('Reset Virtual Bankroll');
  expect(balance()).toHaveTextContent('5');
  confirmation.mockReturnValue(true);
  click('Reset Virtual Bankroll');
  expect(confirmation).toHaveBeenCalledWith(
    'Reset Virtual Bankroll to 1,000 chips?',
  );
  expect(balance()).toHaveTextContent('1000');
  expect(
    screen.queryByRole('button', { name: 'Reset Virtual Bankroll' }),
  ).toBeNull();
  confirmation.mockRestore();
});

test('rendered control eligibility agrees with engine in betting, player turn and completed states', () => {
  const betting = roundState(['10', '10', '8', '7']);
  const player = dispatchRound(
    dispatchRound(betting, { type: 'PLACE_BET', amount: 10 }).state,
    { type: 'DEAL' },
  ).state;
  const completed = dispatchRound(player, { type: 'STAND' }).state;
  for (const state of [
    betting,
    player,
    completed,
    { ...betting, wager: 510 },
    { ...betting, balance: 50, wager: 60 },
  ]) {
    const view = render(<PlayableRound session={testSession(() => state)} />);
    const controls: [string, GameEvent][] = [
      ['Deal', { type: 'DEAL' }],
      ['Hit', { type: 'HIT' }],
      ['Stand', { type: 'STAND' }],
      ['Double', { type: 'DOUBLE' }],
      ['Split', { type: 'SPLIT' }],
      ['Next Hand', { type: 'NEXT_HAND' }],
      ...([10, 50, 100] as const).map((value): [string, GameEvent] => [
        `Add ${value} chips`,
        { type: 'PLACE_BET', amount: state.wager + value },
      ]),
    ];
    for (const [name, event] of controls) {
      const button = screen.getByRole('button', { name });
      if (eligibility(state, event).allowed) expect(button).toBeEnabled();
      else {
        expect(button).toBeDisabled();
        expect(button).toHaveAccessibleDescription();
      }
    }
    view.unmount();
  }
});

test.each([0, 1])(
  'Split preserves typed dealer exhaustion with %i cards left',
  (remaining) => {
    const betting = transition(
      roundState(['A', '5', 'A', '6', 'K', '9', '2']),
      {
        type: 'PLACE_BET',
        amount: 10,
      },
    ).state;
    const dealt = transition(betting, { type: 'DEAL' }).state;
    const player = { ...dealt, shoe: dealt.shoe.slice(0, 2 + remaining) };
    const before = structuredClone(player);
    const split = transition(player, { type: 'SPLIT' });
    expect(split.accepted).toBe(true);
    expect(split.state.phase).toBe('DEALER_TURN');
    const failure = transition(split.state, { type: 'DEALER_TURN' });
    expect(failure).toEqual({
      accepted: false,
      reason: 'SHOE_EXHAUSTED',
      state: split.state,
    });
    const result = dispatchRound(player, { type: 'SPLIT' });
    expect(result).toEqual(failure);
    expect(player).toEqual(before);
    expect(result.state.balance).toBe(980);
    expect(result.state.shoe).toHaveLength(remaining);
    expect(result.state.round?.hands.map((hand) => hand.cards.length)).toEqual([
      2, 2,
    ]);
    expect(result.state.round?.dealer).toBe(player.round?.dealer);
    expect(result.state.discards).toBe(player.discards);
    const owned = (state: GameState) => [
      ...state.shoe,
      ...state.discards,
      ...(state.round?.hands.flatMap((hand) => hand.cards) ?? []),
      ...(state.round?.dealer ?? []),
    ];
    const originalCards = owned(player);
    const retainedCards = owned(result.state);
    expect(retainedCards).toHaveLength(originalCards.length);
    expect(new Set(retainedCards).size).toBe(originalCards.length);
    for (const card of originalCards) expect(retainedCards).toContain(card);
    expect(result.state.history.map((event) => event.type)).toEqual([
      'PLACE_BET',
      'DEAL',
      'SPLIT',
    ]);
  },
);

test('dispatcher preserves the typed initial rejection and input identity', () => {
  const state = roundState([]);
  const result = dispatchRound(state, { type: 'SPLIT' });
  expect(result).toEqual({ accepted: false, reason: 'WRONG_PHASE', state });
  expect(result.state).toBe(state);
});

test('playable caller displays a failed dealer advance without claiming settlement', () => {
  const betting = dispatchRound(roundState(['10', '5', '8', '6']), {
    type: 'PLACE_BET',
    amount: 10,
  }).state;
  const player = dispatchRound(betting, { type: 'DEAL' }).state;
  render(
    <PlayableRound session={testSession(() => ({ ...player, shoe: [] }))} />,
  );
  click('Stand');
  expect(screen.getByRole('alert')).toHaveTextContent(
    'No cards remain in this shoe.',
  );
  expect(balance()).toHaveTextContent('990');
  screen
    .getAllByRole('status')
    .forEach((region) => expect(region).toBeEmptyDOMElement());
  expect(screen.getByRole('button', { name: 'Next Hand' })).toBeDisabled();
  expect(
    within(screen.getByRole('region', { name: 'Dealer' })).getAllByRole('img'),
  ).toHaveLength(2);
});
