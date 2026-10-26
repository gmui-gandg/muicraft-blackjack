// @vitest-environment jsdom
import '../test/setup';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { App } from './App';

test('mounts an honest table preview with disabled gameplay', () => {
  const { container } = render(<App />);
  expect(
    screen.getByRole('heading', { level: 1, name: 'MuiCraft Blackjack' }),
  ).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Table preview' })).toBeVisible();
  expect(screen.getByRole('region', { name: 'Blackjack table' })).toBeVisible();
  expect(
    screen.getByText(/Take a seat. Gameplay is not connected yet/),
  ).toBeVisible();
  expect(
    screen.getByText(/For entertainment only — virtual chips, no cash value/),
  ).toBeVisible();
  for (const name of ['Wager chips', 'Table actions']) {
    expect(screen.getByRole('group', { name })).toHaveTextContent(
      'Gameplay is not connected yet.',
    );
  }
  expect(
    screen.getAllByText('Gameplay is not connected yet.', { exact: true }),
  ).toHaveLength(2);
  const before = container.innerHTML;
  expect(screen.getAllByRole('button')).toHaveLength(9);
  for (const button of screen.getAllByRole('button')) {
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(
      'Gameplay is not connected yet.',
    );
    fireEvent.click(button);
  }
  expect(container.innerHTML).toBe(before);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  expect(screen.queryByRole('slider')).not.toBeInTheDocument();
});
