import { expect, type Page } from '@playwright/test';
import { test } from './app-test.js';
import { SESSION_KEY } from '../src/storage/session.js';

async function tabTo(page: Page, name: string) {
  const button = page.getByRole('button', { name, exact: true });
  for (let count = 0; count < 25; count++) {
    await page.keyboard.press('Tab');
    if (await button.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error(`Keyboard could not reach ${name}`);
}
const attempts = (page: Page) =>
  page.evaluate(() => window.integrationEvidence.attempts);

test('keyboard-only ordinary round: native chip/Deal/Hit, held keys, Stand and explicit Next Hand', async ({
  page,
  appURL,
}) => {
  await page.goto(`${appURL}/e2e/fixtures/integration.html?scenario=keyboard`);
  await tabTo(page, 'Add 10 chips');
  await page.keyboard.press('Enter');
  await expect.poll(() => attempts(page)).toEqual(['PLACE_BET']);
  await tabTo(page, 'Deal');
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await expect.poll(() => attempts(page)).toEqual(['PLACE_BET', 'DEAL']);
  const dealer = page.getByRole('region', { name: 'Dealer', exact: true });
  await expect(
    dealer.getByRole('img', { name: 'Concealed card' }),
  ).toBeVisible();
  await expect(dealer).toContainText('Visible total: 10');
  await expect(dealer).not.toContainText('Total: 17');
  await expect(dealer.getByRole('img', { name: '7 of clubs' })).toHaveCount(0);
  await expect(page.getByRole('status').first()).toBeEmpty();
  await tabTo(page, 'Hit');
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await page.keyboard.down('h');
  await page.keyboard.down('h');
  await page.keyboard.up('h');
  await page.keyboard.press('s');
  await expect
    .poll(() => attempts(page))
    .toEqual(['PLACE_BET', 'DEAL', 'HIT', 'HIT', 'STAND']);
  await expect(page.getByRole('status').first()).toHaveText(
    'Loss · Return: 0 · Net: -20',
  );
  await expect(page.getByRole('button', { name: 'Next Hand' })).toBeEnabled();
  await page.keyboard.press('Enter');
  await expect
    .poll(() => attempts(page))
    .toEqual(['PLACE_BET', 'DEAL', 'HIT', 'HIT', 'STAND', 'NEXT_HAND']);
  await expect(page.getByRole('img')).toHaveCount(0);
  await page.keyboard.press('Enter');
  expect(await attempts(page)).toHaveLength(6);
});

test('keyboard Help open/initial focus/containment/Escape/restore, held close and native non-primary Enter', async ({
  page,
  appURL,
}) => {
  await page.goto(`${appURL}/e2e/fixtures/integration.html?scenario=keyboard`);
  await tabTo(page, 'Help');
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', {
    name: 'Rules and keyboard controls',
  });
  const close = dialog.getByRole('button', { name: 'Close Help' });
  await expect(close).toBeFocused();
  await expect(
    dialog.getByText('For entertainment only — virtual chips, no cash value', {
      exact: true,
    }),
  ).toBeVisible();
  for (const key of ['Tab', 'Shift+Tab', 'Tab', 'Shift+Tab']) {
    await page.keyboard.press(key);
    await expect(close).toBeFocused();
  }
  for (const key of ['h', 's', 'd', 'p']) await page.keyboard.press(key);
  expect(await attempts(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Help', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Space');
  await expect(close).toBeFocused();
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await expect(dialog).not.toBeVisible();
  expect(await attempts(page)).toEqual([]);
  await tabTo(page, 'Deal');
  await page.keyboard.press('Enter');
  await tabTo(page, 'Stand');
  await page.keyboard.press('Enter');
  expect(await attempts(page)).toEqual(['DEAL', 'STAND']);
});

for (const scenario of ['ordinary', 'split']) {
  test(`keyboard ${scenario} Double/Split uses actual session with exact attempts`, async ({
    page,
    appURL,
  }) => {
    await page.goto(
      `${appURL}/e2e/fixtures/integration.html?scenario=${scenario}`,
    );
    await page.keyboard.press('Enter');
    if (scenario === 'split') {
      await page.keyboard.press('p');
      await page.keyboard.down('d');
      await page.keyboard.down('d');
      await page.keyboard.up('d');
      await expect(
        page.getByRole('region', {
          name: 'Your hand 2 Active hand',
          exact: true,
        }),
      ).toBeVisible();
      await page.keyboard.press('p');
      await page.keyboard.press('d');
      expect(await attempts(page)).toEqual([
        'DEAL',
        'SPLIT',
        'DOUBLE',
        'DOUBLE',
      ]);
      await expect(page.getByRole('status')).toHaveText([
        'Win · Return: 40 · Net: 20',
        'Win · Return: 40 · Net: 20',
      ]);
    } else {
      await page.keyboard.press('d');
      expect(await attempts(page)).toEqual(['DEAL', 'DOUBLE']);
      await expect(page.getByRole('status').first()).not.toBeEmpty();
    }
    for (const key of ['h', 's', 'd', 'p']) await page.keyboard.press(key);
    expect((await attempts(page)).length).toBe(scenario === 'split' ? 4 : 2);
  });
}

test('keyboard motion selection system/reduced survives real reload; editors keep native Enter', async ({
  page,
  appURL,
}) => {
  await page.goto(`${appURL}/e2e/fixtures/integration.html`);
  await tabTo(page, 'Help');
  await page.keyboard.press('Tab');
  const motion = page.getByRole('combobox', { name: /Motion/ });
  await expect(motion).toBeFocused();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(motion).toHaveValue('reduced');
  expect(await attempts(page)).toEqual([]);
  await page.reload();
  await expect(motion).toHaveValue('reduced');
  await expect(page.locator('[data-motion]')).toHaveCSS(
    '--control-motion-duration',
    '0ms',
  );
  await tabTo(page, 'Help');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expect(motion).toHaveValue('system');
  await page.reload();
  await expect(motion).toHaveValue('system');
  await expect(page.getByText('Audio: muted', { exact: true })).toBeVisible();
});

test('keyboard depleted confirmation cancel makes no writes/reset or post-close action; confirm resets once', async ({
  page,
  appURL,
}) => {
  await page.goto(appURL);
  await page.evaluate(
    (key) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          settledBankroll: 0,
          preferences: { selectedWager: 10, motion: 'system', audio: 'muted' },
          roundPending: false,
        }),
      ),
    SESSION_KEY,
  );
  await page.goto(`${appURL}/e2e/fixtures/integration.html`);
  await tabTo(page, 'Reset Virtual Bankroll');
  const before = await page.evaluate(
    (key) => localStorage.getItem(key),
    SESSION_KEY,
  );
  let confirmations = 0;
  page.on('dialog', async (dialog) => {
    confirmations++;
    await dialog.dismiss();
  });
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  expect(confirmations).toBe(1);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY),
  ).toBe(before);
  expect(await page.evaluate(() => window.integrationEvidence.writes)).toEqual(
    [],
  );
  expect(await attempts(page)).toEqual([]);
  page.removeAllListeners('dialog');
  page.once('dialog', async (dialog) => {
    confirmations++;
    await dialog.accept();
  });
  await page.keyboard.press('Enter');
  await expect(
    page.getByText('Balance', { exact: true }).locator('..').locator('dd'),
  ).toHaveText('1000');
  expect(confirmations).toBe(2);
  expect(
    await page.evaluate(() => window.integrationEvidence.writes.length),
  ).toBe(1);
  expect(await attempts(page)).toEqual([]);
  await page.reload();
  await expect(
    page.getByText('Balance', { exact: true }).locator('..').locator('dd'),
  ).toHaveText('1000');
});

test('primary Enter on page focus dispatches once across phases and requires release', async ({
  page,
  appURL,
}) => {
  await page.goto(`${appURL}/e2e/fixtures/integration.html?scenario=keyboard`);
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  expect(await attempts(page)).toEqual(['DEAL']);
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  expect(await attempts(page)).toEqual(['DEAL', 'HIT']);
  await page.keyboard.press('s');
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  expect(await attempts(page)).toEqual(['DEAL', 'HIT', 'STAND', 'NEXT_HAND']);
  await expect(page.getByRole('img')).toHaveCount(0);
});
