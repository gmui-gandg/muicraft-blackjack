import type { IntegrationEvidence } from '../src/test/integration-evidence.js';
import { expect, type Page } from '@playwright/test';
import { test } from './app-test.js';
import { SESSION_KEY } from '../src/storage/session.js';

const balance = (page: Page) =>
  page.getByText('Balance', { exact: true }).locator('..').locator('dd');
async function activate(page: Page, name: string, touch?: boolean) {
  const button = page.getByRole('button', { name, exact: true });
  if (touch) await button.tap();
  else await button.click();
}
const bytes = (page: Page) =>
  page.evaluate((key) => localStorage.getItem(key), SESSION_KEY);
async function saved(page: Page) {
  return JSON.parse((await bytes(page))!);
}
async function seed(page: Page, appURL: string, bankroll: number) {
  await page.goto(appURL);
  await page.evaluate(
    ({ key, bankroll }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          settledBankroll: bankroll,
          preferences: { selectedWager: 10, motion: 'system', audio: 'muted' },
          roundPending: false,
        }),
      ),
    { key: SESSION_KEY, bankroll },
  );
}
async function recovered(page: Page, appURL: string, bankroll = 1000) {
  await page.goto(appURL);
  await expect(balance(page)).toHaveText(String(bankroll));
  await expect(
    page.getByText(
      'Unfinished hand discarded. Restored the last settled bankroll.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('img')).toHaveCount(0);
  expect(await saved(page)).toEqual({
    version: 1,
    settledBankroll: bankroll,
    preferences: { selectedWager: 10, motion: 'system', audio: 'muted' },
    roundPending: false,
  });
  await page.reload();
  await expect(balance(page)).toHaveText(String(bankroll));
  await expect(page.getByText(/Unfinished hand discarded/)).toHaveCount(0);
}

test('Q+Q split double both hands commits 40 once, shared S17, settled reload', async ({
  page,
  appURL,
  hasTouch,
}, info) => {
  await page.goto(`${appURL}/e2e/fixtures/integration.html?scenario=split`);
  await expect(balance(page)).toHaveText('1000');
  await activate(page, 'Deal', hasTouch);
  await activate(page, 'Split', hasTouch);
  await expect(
    page.getByRole('region', { name: 'Your hand 1 Active hand', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Your hand 2', exact: true }),
  ).toBeVisible();
  await expect(balance(page)).toHaveText('980');
  await activate(page, 'Double', hasTouch);
  await expect(balance(page)).toHaveText('970');
  await expect(
    page.getByRole('region', { name: 'Your hand 2 Active hand', exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Your hand 1', exact: true })
      .getByRole('img'),
  ).toHaveCount(3);
  for (const result of await page.getByRole('status').all())
    await expect(result).toBeEmpty();
  expect(await saved(page)).toEqual({
    version: 1,
    settledBankroll: 1000,
    preferences: { selectedWager: 10, motion: 'system', audio: 'muted' },
    roundPending: true,
  });
  await activate(page, 'Double', hasTouch);
  await expect(balance(page)).toHaveText('1040');
  await expect(page.getByRole('status')).toHaveCount(2);
  for (const result of await page.getByRole('status').allTextContents())
    expect(result).toBe('Win · Return: 40 · Net: 20');
  const evidence: IntegrationEvidence = await page.evaluate(
    () => window.integrationEvidence,
  );
  expect(
    evidence.transitions.some(
      (state) => state.phase === 'DEALER_TURN' && state.balance === 960,
    ),
  ).toBe(true);
  const end = evidence.transitions.at(-1)!;
  expect(end.history.filter((event) => event === 'DEALER_TURN')).toHaveLength(
    1,
  );
  expect(end.history.filter((event) => event === 'SETTLE')).toHaveLength(1);
  expect(end.hands).toEqual([3, 3]);
  expect(end.dealer).toBe(2);
  expect(evidence.writes.map((raw) => JSON.parse(raw))).toEqual([
    {
      version: 1,
      settledBankroll: 1000,
      preferences: { selectedWager: 10, motion: 'system', audio: 'muted' },
      roundPending: true,
    },
    {
      version: 1,
      settledBankroll: 1040,
      preferences: { selectedWager: 10, motion: 'system', audio: 'muted' },
      roundPending: false,
    },
  ]);
  expect(evidence.controls.length).toBeGreaterThan(0);
  for (const control of evidence.controls)
    expect(control.disabled).toBe(!control.allowed);
  await info.attach('split-ledger-and-storage', {
    body: JSON.stringify(evidence, null, 2),
    contentType: 'application/json',
  });
  await page.reload();
  await expect(balance(page)).toHaveText('1040');
  await expect(
    page.getByRole('combobox', { name: 'Selected wager' }),
  ).toHaveValue('10');
  await expect(page.getByText(/Unfinished hand discarded/)).toHaveCount(0);
  await expect(page.getByRole('img')).toHaveCount(0);
});

test('ordinary settled reload preserves wager and motion; system default follows reduced motion', async ({
  page,
  appURL,
  hasTouch,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${appURL}/e2e/fixtures/integration.html?scenario=ordinary`);
  const deal = page.getByRole('button', { name: 'Deal', exact: true });
  expect(
    await deal.evaluate(
      (element) => getComputedStyle(element).transitionDuration,
    ),
  ).toBe('0s');
  await page.getByRole('combobox', { name: 'Motion' }).selectOption('full');
  expect(
    await deal.evaluate(
      (element) => getComputedStyle(element).transitionDuration,
    ),
  ).toBe('0.15s');
  await page.getByRole('combobox', { name: 'Motion' }).selectOption('reduced');
  await page
    .getByRole('combobox', { name: 'Selected wager' })
    .selectOption('50');
  await activate(page, 'Deal', hasTouch);
  await activate(page, 'Stand', hasTouch);
  await expect(balance(page)).toHaveText('1050');
  expect(await saved(page)).toEqual({
    version: 1,
    settledBankroll: 1050,
    preferences: { selectedWager: 50, motion: 'reduced', audio: 'muted' },
    roundPending: false,
  });
  await page.goto(appURL);
  await expect(balance(page)).toHaveText('1050');
  await expect(
    page.getByRole('combobox', { name: 'Selected wager' }),
  ).toHaveValue('50');
  await expect(page.getByRole('combobox', { name: 'Motion' })).toHaveValue(
    'reduced',
  );
  await expect(page.getByText('Audio: muted')).toBeVisible();
  expect(
    await page
      .getByRole('button', { name: 'Deal', exact: true })
      .evaluate((element) => getComputedStyle(element).transitionDuration),
  ).toBe('0s');
  await expect(page.getByText(/Unfinished hand discarded/)).toHaveCount(0);
});

for (const scenario of ['ordinary', 'split']) {
  test(`interrupted ${scenario} player turn reload discards stakes without partial payout`, async ({
    page,
    appURL,
    hasTouch,
  }) => {
    await page.goto(
      `${appURL}/e2e/fixtures/integration.html?scenario=${scenario}`,
    );
    await activate(page, 'Deal', hasTouch);
    if (scenario === 'split') {
      await activate(page, 'Split', hasTouch);
      await activate(page, 'Double', hasTouch);
      await expect(balance(page)).toHaveText('970');
      await expect(
        page.getByRole('region', { name: 'Your hand 2 Active hand' }),
      ).toBeVisible();
    }
    expect(await saved(page)).toMatchObject({
      settledBankroll: 1000,
      roundPending: true,
    });
    await recovered(page, appURL);
  });
}

for (const phase of ['DEALING', 'DEALER_TURN', 'SETTLEMENT']) {
  test(`test-only unload at synchronous ${phase} checkpoint uses production recovery`, async ({
    page,
    appURL,
    hasTouch,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(
      `${appURL}/e2e/fixtures/integration.html?scenario=split&interrupt=${phase}`,
    );
    await activate(page, 'Deal', hasTouch);
    if (phase !== 'DEALING') {
      await activate(page, 'Split', hasTouch);
      await activate(page, 'Double', hasTouch);
      await activate(page, 'Double', hasTouch);
    }
    await expect
      .poll(() => errors)
      .toContain(`Test-only simulated unload: ${phase}`);
    expect(await saved(page)).toMatchObject({
      settledBankroll: 1000,
      roundPending: true,
    });
    await info.attach('interruption-checkpoint', {
      body: JSON.stringify({
        phase,
        errors,
        persisted: await bytes(page),
        transitions: await page.evaluate(
          () => window.integrationEvidence.transitions,
        ),
      }),
      contentType: 'application/json',
    });
    await recovered(page, appURL);
  });
}

for (const scenario of ['aces', 'split-21']) {
  test(`${scenario} auto-finishes two cards and pays ordinary 1:1 per hand`, async ({
    page,
    appURL,
    hasTouch,
  }) => {
    await page.goto(
      `${appURL}/e2e/fixtures/integration.html?scenario=${scenario}`,
    );
    await activate(page, 'Deal', hasTouch);
    await activate(page, 'Split', hasTouch);
    await expect(balance(page)).toHaveText('1020');
    for (const index of [1, 2]) {
      const hand = page.getByRole('region', {
        name: `Your hand ${index}`,
        exact: true,
      });
      await expect(hand.getByRole('img')).toHaveCount(2);
      await expect(hand.getByRole('status')).toHaveText(
        'Win · Return: 20 · Net: 10',
      );
    }
    for (const name of ['Double', 'Split', 'Hit', 'Stand'])
      await expect(
        page.getByRole('button', { name, exact: true }),
      ).toBeDisabled();
    expect((await saved(page)).settledBankroll).toBe(1020);
  });
}

test('10+J and insufficient funds expose engine reasons and no enabled rejected action', async ({
  page,
  appURL,
  hasTouch,
}) => {
  await page.goto(
    `${appURL}/e2e/fixtures/integration.html?scenario=different-ranks`,
  );
  await activate(page, 'Deal', hasTouch);
  await expect(
    page.getByRole('button', { name: 'Split', exact: true }),
  ).toHaveAccessibleDescription('Split requires two cards of the same rank.');
  await expect(
    page.getByRole('button', { name: 'Split', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Double', exact: true }),
  ).toBeEnabled();
  await seed(page, appURL, 19);
  await page.goto(
    `${appURL}/e2e/fixtures/integration.html?scenario=insufficient`,
  );
  await activate(page, 'Deal', hasTouch);
  for (const name of ['Split', 'Double']) {
    await expect(
      page.getByRole('button', { name, exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name, exact: true }),
    ).toHaveAccessibleDescription('Not enough available chips for this wager.');
  }
  await activate(page, 'Stand', hasTouch);
  await expect(page.getByRole('button', { name: 'Next Hand' })).toBeEnabled();
  const evidence: IntegrationEvidence = await page.evaluate(
    () => window.integrationEvidence,
  );
  for (const control of evidence.controls)
    expect(control.disabled).toBe(!control.allowed);
});

test('denied storage displays explanation while real gameplay remains usable', async ({
  page,
  appURL,
  hasTouch,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('test denied');
      },
    }),
  );
  await page.goto(`${appURL}/e2e/fixtures/integration.html?scenario=ordinary`);
  await expect(
    page.getByText(/Storage access failed.*continues in memory/),
  ).toBeVisible();
  await activate(page, 'Deal', hasTouch);
  await activate(page, 'Stand', hasTouch);
  await expect(balance(page)).toHaveText('1010');
  await expect(page.getByRole('button', { name: 'Next Hand' })).toBeEnabled();
});

test('depleted reset cancellation and confirmation survive genuine recreation', async ({
  page,
  appURL,
  hasTouch,
}) => {
  await seed(page, appURL, 5);
  await page.reload();
  page.once('dialog', (dialog) => dialog.dismiss());
  await activate(page, 'Reset Virtual Bankroll', hasTouch);
  await expect(balance(page)).toHaveText('5');
  expect((await saved(page)).settledBankroll).toBe(5);
  await page.reload();
  await expect(balance(page)).toHaveText('5');
  page.once('dialog', (dialog) => dialog.accept());
  await activate(page, 'Reset Virtual Bankroll', hasTouch);
  await expect(balance(page)).toHaveText('1000');
  expect((await saved(page)).settledBankroll).toBe(1000);
  await page.reload();
  await expect(balance(page)).toHaveText('1000');
});

test('mixed split outcomes display each hand return without aggregate duplication', async ({
  page,
  appURL,
  hasTouch,
}) => {
  await page.goto(`${appURL}/e2e/fixtures/integration.html?scenario=mixed`);
  await activate(page, 'Deal', hasTouch);
  await activate(page, 'Split', hasTouch);
  await activate(page, 'Stand', hasTouch);
  for (const result of await page.getByRole('status').all())
    await expect(result).toBeEmpty();
  await activate(page, 'Stand', hasTouch);
  await expect(balance(page)).toHaveText('990');
  await expect(
    page
      .getByRole('region', { name: 'Your hand 1', exact: true })
      .getByRole('status'),
  ).toHaveText('Push · Return: 10 · Net: 0');
  await expect(
    page
      .getByRole('region', { name: 'Your hand 2', exact: true })
      .getByRole('status'),
  ).toHaveText('Loss · Return: 0 · Net: -10');
  expect((await saved(page)).settledBankroll).toBe(990);
});
