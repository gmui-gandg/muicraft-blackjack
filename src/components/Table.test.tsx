// @vitest-environment jsdom
import '../test/setup';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { outcomeLabels } from '../test/table-fixtures';
import { ActionButton, PlayingCard, Table } from './Table';
import {
  bettingFixture,
  outcomeFixture,
  splitFixture,
} from '../test/table-fixtures';

test('renders supplied betting values and dispatches each chip denomination', () => {
  const onChip = vi.fn();
  const onActivate = vi.fn();
  render(
    <Table
      {...bettingFixture}
      onChip={onChip}
      actions={[{ label: 'Deal', enabled: true, onActivate }]}
    />,
  );
  expect(screen.getByText('1000')).toBeVisible();
  expect(screen.getByText('50', { selector: 'dd' })).toBeVisible();
  for (const value of [10, 50, 100])
    fireEvent.click(screen.getByRole('button', { name: `Add ${value} chips` }));
  expect(onChip.mock.calls).toEqual([[10], [50], [100]]);
  fireEvent.click(screen.getByRole('button', { name: 'Deal' }));
  expect(onActivate).toHaveBeenCalledExactlyOnceWith();
});

test('concealed presentation has no hidden rank or suit data', () => {
  const concealedInput = {
    concealed: true,
    rank: 'Q',
    suit: 'hearts',
  } as const;
  const { container } = render(<PlayingCard card={concealedInput} />);
  expect(screen.getByRole('img', { name: 'Concealed card' })).toBeVisible();
  expect(container.innerHTML).not.toMatch(
    /rank|suit|clubs|diamonds|hearts|spades|title|data-/i,
  );
  expect(container.textContent).toBe('◇');
});

test('renders two supplied hands with one active label and a visible dealer total', () => {
  render(<Table {...splitFixture} />);
  expect(screen.getAllByText('Active hand')).toHaveLength(1);
  expect(
    within(screen.getByRole('region', { name: /Hand 2/ })).getByText(
      'Active hand',
    ),
  ).toBeVisible();
  expect(screen.getByText('Visible total: 6')).toBeVisible();
  for (const name of [
    '6 of clubs',
    '8 of hearts',
    'K of clubs',
    '8 of spades',
    '3 of diamonds',
  ])
    expect(screen.getByRole('img', { name })).toBeVisible();
});

for (const label of outcomeLabels) {
  test(`displays supplied ${label} settlement values without computing them`, () => {
    const fixture = outcomeFixture(label);
    const hand = fixture.players[0];
    render(
      <Table
        {...fixture}
        players={[
          { ...hand, stake: 73, outcome: { label, returned: 123, net: -9 } },
        ]}
      />,
    );
    expect(screen.getByText('Stake: 73')).toBeVisible();
    expect(screen.getAllByRole('status')).toHaveLength(2);
    expect(screen.getAllByRole('status')[1]!).toBeEmptyDOMElement();
    expect(screen.getAllByRole('status')[0]!).toHaveTextContent(
      `${label} · Return: 123 · Net: -9`,
    );
  });
}

for (const label of ['Deal', 'Hit', 'Stand', 'Double', 'Split', 'Next Hand']) {
  test(`${label} dispatches only when enabled and explains rejection`, () => {
    const onActivate = vi.fn();
    const { rerender } = render(
      <ActionButton control={{ label, enabled: true, onActivate }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(onActivate).toHaveBeenCalledTimes(1);
    rerender(
      <ActionButton
        control={{ label, enabled: false, reason: 'Not eligible', onActivate }}
      />,
    );
    const button = screen.getByRole('button', { name: label });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Not eligible');
    fireEvent.click(button);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });
}

test('disabled chips dispatch no callbacks', () => {
  const onChip = vi.fn();
  render(<Table {...splitFixture} onChip={onChip} />);
  for (const value of [10, 50, 100]) {
    const chip = screen.getByRole('button', { name: `Add ${value} chips` });
    expect(chip).toBeDisabled();
    expect(chip).toHaveAccessibleDescription(
      'Wagers are closed for this hand.',
    );
    fireEvent.click(chip);
  }
  expect(onChip).not.toHaveBeenCalled();
});

test('groups shared reasons while preserving distinct disabled explanations', () => {
  const onActivate = vi.fn();
  render(
    <Table
      {...splitFixture}
      actions={[
        { label: 'Hit', enabled: false, reason: 'Hand finished.', onActivate },
        {
          label: 'Stand',
          enabled: false,
          reason: 'Hand finished.',
          onActivate,
        },
        {
          label: 'Double',
          enabled: false,
          reason: 'Insufficient chips.',
          onActivate,
        },
        { label: 'Next Hand', enabled: true, onActivate },
      ]}
    />,
  );
  expect(screen.getAllByText('Wagers are closed for this hand.')).toHaveLength(
    1,
  );
  expect(screen.getAllByText('Hand finished.')).toHaveLength(1);
  expect(screen.getAllByText('Insufficient chips.')).toHaveLength(1);
  for (const label of ['Hit', 'Stand', 'Double']) {
    const button = screen.getByRole('button', { name: label });
    expect(button).toHaveAccessibleDescription(
      label === 'Double' ? 'Insufficient chips.' : 'Hand finished.',
    );
    fireEvent.click(button);
  }
  expect(onActivate).not.toHaveBeenCalled();
  const next = screen.getByRole('button', { name: 'Next Hand' });
  expect(next).not.toHaveAttribute('aria-describedby');
  fireEvent.click(next);
  expect(onActivate).toHaveBeenCalledExactlyOnceWith();
});
