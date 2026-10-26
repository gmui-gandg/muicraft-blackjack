// @vitest-environment jsdom
import '../test/setup';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { App } from './App';
import { PlayableRound } from './PlayableRound';
import { dispatchRound } from './dispatch';
import { eligibility, type GameEvent } from '../game/round';
import { roundCases, roundState } from '../test/round-fixtures';

const click = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }));
const balance = () => screen.getByText('Balance').nextElementSibling;

test('production offers gameplay and honestly explains reloads', () => {
  render(<App />);
  expect(
    screen.getByRole('heading', { name: 'MuiCraft Blackjack' }),
  ).toBeVisible();
  expect(screen.getByText(/Reload persistence is pending M3/)).toBeVisible();
  expect(screen.getByText(/For entertainment only/)).toBeVisible();
  expect(screen.queryByRole('button', { name: /Double|Split/ })).toBeNull();
  expect(screen.getByRole('button', { name: 'Deal' })).toBeDisabled();
  click('Add 10 chips');
  expect(screen.getByRole('button', { name: 'Deal' })).toBeEnabled();
});

for (const entry of roundCases) {
  test(`playable ${entry.name} ledger and explicit next hand`, () => {
    const initial = roundState(entry.ranks);
    const { container } = render(
      <PlayableRound initialState={() => initial} />,
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
    expect(screen.getByRole('status')).toHaveTextContent(
      `Return: ${entry.returned} · Net: ${entry.net}`,
    );
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
  render(<PlayableRound initialState={() => roundState([], 60)} />);
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
  render(<PlayableRound />);
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
    if (!allowed) expect(next).toBe(state);
    state = next;
    if (event.type !== 'PLACE_BET')
      expect(dispatchRound(state, event)).toBe(state);
  }
  expect(state.balance).toBe(1010);
});

test('depleted reset cancel preserves balance and confirm restores exactly 1000', () => {
  render(<PlayableRound initialState={() => roundState([], 5)} />);
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
    dispatchRound(betting, { type: 'PLACE_BET', amount: 10 }),
    { type: 'DEAL' },
  );
  const completed = dispatchRound(player, { type: 'STAND' });
  for (const state of [
    betting,
    player,
    completed,
    { ...betting, wager: 510 },
    { ...betting, balance: 50, wager: 60 },
  ]) {
    const view = render(<PlayableRound initialState={() => state} />);
    const controls: [string, GameEvent][] = [
      ['Deal', { type: 'DEAL' }],
      ['Hit', { type: 'HIT' }],
      ['Stand', { type: 'STAND' }],
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
