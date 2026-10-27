// @vitest-environment jsdom
import '../test/setup';
import { StrictMode } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { PlayableRound } from './PlayableRound';
import { createPlaySession } from './session';
import { dispatchRound } from './dispatch';
import { createSessionStorage } from '../storage/session';
import { memoryStorage } from '../test/play-session';
import { roundState } from '../test/round-fixtures';
import type { GameState } from '../game/round';

const ranks = ['Q', 'A', 'Q', '6', '2', '3', '8', '7'] as const;
function player() {
  return dispatchRound({ ...roundState(ranks), wager: 10 }, { type: 'DEAL' })
    .state;
}
function mount(state = player()) {
  const storage = memoryStorage(state.balance);
  const attempts = vi.fn(dispatchRound);
  const session = createPlaySession(
    createSessionStorage(() => storage),
    () => state,
    attempts,
  );
  const dispatch = vi.spyOn(session, 'dispatch');
  const reset = vi.spyOn(session, 'reset');
  const view = render(
    <StrictMode>
      <PlayableRound session={session} />
    </StrictMode>,
  );
  return { ...view, session, dispatch, reset, attempts, storage };
}
const down = (
  key: string,
  init: KeyboardEventInit = {},
  target: Element = document.body,
) => fireEvent.keyDown(target, { key, ...init });
const up = (key: string) => fireEvent.keyUp(document, { key });
const press = (key: string) => {
  down(key);
  up(key);
};

for (const [key, type] of [
  ['h', 'HIT'],
  ['s', 'STAND'],
  ['d', 'DOUBLE'],
  ['p', 'SPLIT'],
] as const) {
  test(`${key} dispatches legal ${type} exactly once through real session under StrictMode`, () => {
    const { session, dispatch, attempts } = mount();
    press(key);
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type });
    expect(attempts).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().result.accepted).toBe(true);
    expect(
      session.getSnapshot().result.state.history.map((event) => event.type),
    ).toContain(type);
  });
}

test('primary Enter uses fresh state, release required across Deal, Hit and Next Hand', () => {
  const { session, dispatch } = mount({
    ...roundState(['2', '10', '3', '7', '2', '2']),
    wager: 10,
  });
  expect(
    screen.getByText('Primary action: Deal (Enter on the page)'),
  ).toBeVisible();
  down('Enter');
  down('Enter');
  down('Enter', { repeat: true });
  expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: 'DEAL' });
  expect(
    screen.getByText('Primary action: Hit (Enter on the page)'),
  ).toBeVisible();
  up('Enter');
  press('Enter');
  expect(dispatch).toHaveBeenLastCalledWith({ type: 'HIT' });
  press('s');
  expect(session.getSnapshot().result.state.phase).toBe('ROUND_COMPLETE');
  expect(
    screen.getByText('Primary action: Next Hand (Enter on the page)'),
  ).toBeVisible();
  press('Enter');
  expect(dispatch).toHaveBeenLastCalledWith({ type: 'NEXT_HAND' });
  expect(session.getSnapshot().result.state.phase).toBe('BETTING');
  expect(
    screen.getByText('Primary action: Deal (Enter on the page)'),
  ).toBeVisible();
  dispatch.mockClear();
  press('Enter');
  expect(dispatch).not.toHaveBeenCalled();
});

test('held letters cannot act on the next split hand; release re-arms', () => {
  const { session, dispatch } = mount();
  press('p');
  down('d');
  down('d');
  down('d', { repeat: true });
  expect(session.getSnapshot().result.state.activeHandIndex).toBe(1);
  expect(dispatch).toHaveBeenCalledTimes(2);
  up('d');
  press('d');
  expect(dispatch).toHaveBeenCalledTimes(3);
  expect(session.getSnapshot().result.state.balance).toBe(1040);
});

test('illegal shortcuts never reach dispatch across phase, rank, funding, card and shoe restrictions', () => {
  const pair = player();
  const split = dispatchRound(pair, { type: 'SPLIT' }).state;
  const third = dispatchRound(pair, { type: 'HIT' }).state;
  const aces = dispatchRound(
    { ...roundState(['A', '10', 'A', '7', 'K', '9']), wager: 10 },
    { type: 'DEAL' },
  ).state;
  const completed = dispatchRound(pair, { type: 'STAND' }).state;
  const cases: [GameState, string[]][] = [
    [roundState([]), ['h', 's', 'd', 'p', 'Enter']],
    [completed, ['h', 's', 'd', 'p']],
    [{ ...pair, balance: 0 }, ['d', 'p']],
    [
      dispatchRound(
        { ...roundState(['10', '10', 'J', '7']), wager: 10 },
        { type: 'DEAL' },
      ).state,
      ['p'],
    ],
    [split, ['p']],
    [third, ['d', 'p']],
    [dispatchRound(aces, { type: 'SPLIT' }).state, ['h', 's', 'd', 'p']],
    [{ ...pair, shoe: [] }, ['h', 'd', 'p']],
  ];
  for (const [state, keys] of cases) {
    const { dispatch, unmount } = mount(state);
    keys.forEach(press);
    expect(dispatch).not.toHaveBeenCalled();
    unmount();
  }
});

for (const key of ['h', 's', 'd', 'p', 'Enter']) {
  test(`${key} ignores editors, modifiers, composition, prevented and repeated events`, () => {
    const { dispatch, container } = mount();
    for (const tag of ['input', 'textarea', 'select']) {
      const target = document.createElement(tag);
      container.append(target);
      down(key, {}, target);
      up(key);
      target.remove();
    }
    const editor = document.createElement('div');
    editor.contentEditable = 'true';
    editor.setAttribute('contenteditable', 'true');
    const child = document.createElement('span');
    editor.append(child);
    container.append(editor);
    down(key, {}, child);
    up(key);
    for (const init of [
      { ctrlKey: true },
      { altKey: true },
      { metaKey: true },
      { shiftKey: true },
      { isComposing: true },
      { keyCode: 229 },
      { repeat: true },
    ]) {
      down(key, init);
      up(key);
    }
    const prevented = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
    });
    prevented.preventDefault();
    fireEvent(document.body, prevented);
    up(key);
    expect(dispatch).not.toHaveBeenCalled();
  });
}

test('focused native controls keep Enter; repeated/modified native button Enter is canceled', () => {
  const { dispatch } = mount();
  for (const name of ['Stand', 'Double', 'Split', 'Help']) {
    const button = screen.getByRole('button', { name });
    expect(down('Enter', {}, button)).toBe(true);
    expect(down('Enter', {}, button)).toBe(false);
    up('Enter');
    expect(down('Enter', { ctrlKey: true }, button)).toBe(false);
    up('Enter');
  }
  expect(dispatch).not.toHaveBeenCalled();
});

function stubDialog() {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = true;
      },
    },
    close: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = false;
        this.dispatchEvent(new Event('close'));
      },
    },
  });
}

test('Help visibly explains every fixed-rule claim and opening-peek consequence', () => {
  stubDialog();
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Help' }));
  const help = within(screen.getByRole('dialog'));
  expect(
    help.getByRole('heading', { name: 'classic-six-deck-s17-v1' }),
  ).toBeVisible();
  for (const claim of [
    'For entertainment only — virtual chips, no cash value',
    'Local balances are editable by the player and are not verified scores.',
    '6 standard decks (312 cards). Shuffle at start; reshuffle before a new round at 78 or fewer cards remaining, never intentionally mid-round.',
    'Dealer hits through 16 and stands on all 17, including soft 17 (S17). Opening peeks check for dealer blackjack with an Ace or ten-value upcard before player actions.',
    'Aces count as 11 or 1; face cards count as 10. An unsplit opening Ace and ten-value card is a natural blackjack paying 3:2. Ordinary wins pay 1:1; losses forfeit the stake; pushes return it. Both opening naturals push; with only a dealer natural, the player loses.',
    'One funded same-rank split only, at most two hands. Q + Q qualifies; 10 + J does not. Split aces receive one card each then automatically stand. Split 21 pays ordinary 1:1, never natural 3:2.',
    'Double on the first two cards with funds for an equal additional stake, including non-ace split hands: draw exactly one card then automatically stand. Each split hand settles independently.',
    'Start with 1,000 virtual chips. Wagers: 10–500 in multiples of 10, capped by available balance. Presets add 10, 50 or 100 chips. No insurance, surrender or side bets.',
    '21 or bust ends the hand. Next Hand is explicit. A depleted bankroll requires confirmed Reset Virtual Bankroll.',
  ]) {
    expect(help.getByText(claim)).toBeVisible();
  }
});

test('Help contains focus and commands, restores opener and does not re-arm held keys', () => {
  stubDialog();
  const { dispatch } = mount();
  const opener = screen.getByRole('button', { name: 'Help' });
  opener.focus();
  fireEvent.click(opener);
  const close = screen.getByRole('button', { name: 'Close Help' });
  expect(close).toHaveFocus();
  expect(screen.getByRole('dialog')).toHaveAccessibleName(
    'Rules and keyboard controls',
  );
  expect(
    screen.getByText('For entertainment only — virtual chips, no cash value'),
  ).toBeVisible();
  for (const shiftKey of [false, true]) {
    fireEvent.keyDown(close, { key: 'Tab', shiftKey });
    expect(close).toHaveFocus();
  }
  for (const key of ['s', 'd', 'p', 'Enter']) press(key);
  down('h');
  fireEvent.click(close);
  expect(opener).toHaveFocus();
  down('h');
  expect(dispatch).not.toHaveBeenCalled();
  up('h');
  press('h');
  expect(dispatch).toHaveBeenCalledTimes(1);
  vi.restoreAllMocks();
});

test('canceling reset calls zero resets/writes, suppresses commands during confirmation and held Enter afterward', () => {
  const { dispatch, reset, storage } = mount(roundState([], 0));
  const confirmation = vi.spyOn(window, 'confirm').mockImplementation(() => {
    for (const key of ['h', 's', 'd', 'p']) press(key);
    down('Enter');
    return false;
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Reset Virtual Bankroll' }),
  );
  down('Enter');
  expect(dispatch).not.toHaveBeenCalled();
  expect(reset).not.toHaveBeenCalled();
  expect(storage.writes).toHaveLength(0);
  up('Enter');
  confirmation.mockReturnValue(true);
  fireEvent.click(
    screen.getByRole('button', { name: 'Reset Virtual Bankroll' }),
  );
  expect(reset).toHaveBeenCalledExactlyOnceWith(true);
  expect(storage.writes).toHaveLength(1);
  confirmation.mockRestore();
});

test('stable per-hand live results do not mutate on Help, preferences or rerender; reload is empty', async () => {
  stubDialog();
  const { session, rerender, unmount, storage } = mount();
  const region = screen.getAllByRole('status')[0]!;
  expect(region).toBeEmptyDOMElement();
  press('s');
  expect(region).toHaveTextContent('Win · Return: 20 · Net: 10');
  const mutations = vi.fn();
  const observer = new MutationObserver(mutations);
  observer.observe(region, {
    subtree: true,
    childList: true,
    characterData: true,
  });
  act(() => session.setMotion('reduced'));
  fireEvent.click(screen.getByRole('button', { name: 'Help' }));
  fireEvent.click(screen.getByRole('button', { name: 'Close Help' }));
  rerender(
    <StrictMode>
      <PlayableRound session={session} />
    </StrictMode>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  expect(mutations).not.toHaveBeenCalled();
  observer.disconnect();
  unmount();
  render(
    <PlayableRound
      session={createPlaySession(createSessionStorage(() => storage))}
    />,
  );
  expect(screen.getAllByRole('status')[0]!).toBeEmptyDOMElement();
  vi.restoreAllMocks();
});

test('storage failure notices are accessible and play remains possible', () => {
  const session = createPlaySession(
    createSessionStorage(() => {
      throw new Error('denied');
    }),
    () => ({ ...roundState(['10', '10', '8', '7']), wager: 10 }),
  );
  render(<PlayableRound session={session} />);
  expect(screen.getByLabelText('Session notices')).toHaveAttribute(
    'aria-live',
    'polite',
  );
  expect(screen.getByLabelText('Session notices')).toHaveTextContent(/Storage/);
  press('Enter');
  press('s');
  expect(screen.getAllByRole('status')[0]!).toHaveTextContent('Net: 10');
});

test('release at another target and window blur re-arm keys; unmount removes the listener', () => {
  const initial = {
    ...roundState(['2', '10', '3', '7', '2', '2', '2']),
    wager: 10,
  };
  const { dispatch, unmount } = mount(initial);
  press('Enter');
  down('h');
  fireEvent.keyUp(screen.getByRole('button', { name: 'Stand' }), {
    key: 'h',
  });
  down('h');
  expect(dispatch).toHaveBeenCalledTimes(3);
  fireEvent(window, new Event('blur'));
  down('h');
  expect(dispatch).toHaveBeenCalledTimes(4);
  unmount();
  up('h');
  press('s');
  expect(dispatch).toHaveBeenCalledTimes(4);
});

for (const raw of ['{broken', JSON.stringify({ version: 99 })]) {
  test(`invalid saved bytes ${raw} remain explained and playable in a polite notice region`, () => {
    const write = vi.fn();
    const session = createPlaySession(
      createSessionStorage(() => ({ getItem: () => raw, setItem: write })),
      () => ({ ...roundState(['10', '10', '8', '7']), wager: 10 }),
    );
    render(<PlayableRound session={session} />);
    expect(screen.getByLabelText('Session notices')).toHaveTextContent(
      'saved record is preserved until confirmed reset',
    );
    press('Enter');
    press('s');
    expect(screen.getAllByRole('status')[0]!).toHaveTextContent(
      'Win · Return: 20 · Net: 10',
    );
    expect(write).not.toHaveBeenCalled();
  });
}

test('both split-ace live regions exist empty before the immediately settled Split and retain identity', () => {
  const state = dispatchRound(
    { ...roundState(['A', '10', 'A', '7', 'K', '9']), wager: 10 },
    { type: 'DEAL' },
  ).state;
  const { session } = mount(state);
  const before = screen.getAllByRole('status');
  expect(before).toHaveLength(2);
  before.forEach((region) => expect(region).toBeEmptyDOMElement());
  press('p');
  expect(session.getSnapshot().result.state.phase).toBe('ROUND_COMPLETE');
  const after = screen.getAllByRole('status');
  after.forEach((region, index) => expect(region).toBe(before[index]));
  expect(after[0]).toHaveTextContent('Win · Return: 20 · Net: 10');
  expect(after[1]).toHaveTextContent('Win · Return: 20 · Net: 10');
});
