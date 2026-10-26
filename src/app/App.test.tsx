// @vitest-environment jsdom
import '../test/setup';
import { render, screen, within } from '@testing-library/react';
import { expect, test } from 'vitest';
import { App } from './App';

test('renders the M0 shell', () => {
  render(<App />);
  const main = within(screen.getByRole('main'));
  expect(
    main.getByRole('heading', { level: 1, name: 'MuiCraft Blackjack' }),
  ).toBeVisible();
  expect(main.getByRole('heading', { name: 'Scaffold preview' })).toBeVisible();
  expect(
    main.getByText(/Gameplay is coming in a later milestone/),
  ).toBeVisible();
  expect(
    main.getByText(/For entertainment only — virtual chips, no cash value/),
  ).toBeVisible();
});

test('offers no game or wager controls before gameplay exists', () => {
  render(<App />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  expect(screen.queryByRole('slider')).not.toBeInTheDocument();
});
