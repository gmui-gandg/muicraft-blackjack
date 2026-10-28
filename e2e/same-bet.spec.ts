import { expect, type Page } from '@playwright/test';
import { test } from './app-test.js';
import { SESSION_KEY } from '../src/storage/session.js';

const selection = (page: Page) =>
  page.getByRole('combobox', { name: 'Selected wager' });
const toggle = (page: Page) =>
  page.getByRole('checkbox', { name: 'Same bet on Next Hand' });
const balance = (page: Page) =>
  page.getByText('Balance', { exact: true }).locator('..').locator('dd');
async function seed(
  page: Page,
  url: string,
  funds: number,
  reference: number | null,
  sameBet: boolean,
) {
  await page.goto(url);
  await page.evaluate(
    ({ key, funds, reference, sameBet }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 2,
          settledBankroll: funds,
          lastCompletedWager: reference,
          preferences: {
            selectedWager: 50,
            sameBet,
            motion: 'reduced',
            audio: 'muted',
          },
          roundPending: false,
        }),
      ),
    { key: SESSION_KEY, funds, reference, sameBet },
  );
}

test.afterEach(async ({ page }) => {
  const dimensions = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
});

test('native checkbox hit area, Space/Enter filtering, pointer/touch Next Hand and persisted zero', async ({
  page,
  appURL,
  hasTouch,
}, info) => {
  await seed(page, appURL, 100, null, false);
  await page.goto(`${appURL}/e2e/fixtures/integration.html?scenario=ordinary`);
  const activate = async (name: string) => {
    const button = page.getByRole('button', { name, exact: true });
    if (hasTouch) await button.tap();
    else await button.click();
  };
  await expect(toggle(page)).toBeDisabled();
  await expect(toggle(page)).toHaveAccessibleDescription(
    'Complete a round to choose Same bet.',
  );
  await activate('Deal');
  await expect(toggle(page)).toBeDisabled();
  await activate('Stand');
  await expect(balance(page)).toHaveText('150');
  await expect(toggle(page)).toBeEnabled();
  await expect(toggle(page)).not.toBeChecked();
  await expect(toggle(page)).toHaveAccessibleDescription('Repeat amount: 50.');
  const label = toggle(page).locator('..');
  const rect = await label.boundingBox();
  expect(rect!.height).toBeGreaterThanOrEqual(44);
  expect(rect!.width).toBeGreaterThanOrEqual(44);
  await toggle(page).focus();
  await page.keyboard.press('Space');
  await expect(toggle(page)).toBeChecked();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Next Hand' })).toBeEnabled();
  await expect(balance(page)).toHaveText('150');
  await expect(toggle(page)).toBeFocused();
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await page.getByRole('button', { name: 'Close Help', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Help', exact: true }),
  ).toBeFocused();
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await page.keyboard.press('Enter');
  await expect(selection(page)).toHaveValue('50');
  await expect(page.getByRole('img')).toHaveCount(0);
  await expect(balance(page)).toHaveText('150');
  await expect(
    page.getByRole('button', { name: 'Deal', exact: true }),
  ).toBeEnabled();
  await label.click();
  await expect(toggle(page)).not.toBeChecked();
  await expect(selection(page)).toHaveValue('50');
  await page.reload();
  await activate('Deal');
  await expect(toggle(page)).toBeDisabled();
  await activate('Stand');
  await activate('Next Hand');
  await expect(selection(page)).toHaveValue('0');
  await expect(
    page.getByRole('button', { name: 'Deal', exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(selection(page)).toHaveValue('0');
  await expect(toggle(page)).not.toBeChecked();
  const dimensions = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
  await info.attach('same-bet-layout', {
    body: JSON.stringify({ rect, dimensions }),
    contentType: 'application/json',
  });
});

test('49 forces off immediately at settlement and survives reload without reduced repeat', async ({
  page,
  appURL,
  hasTouch,
}) => {
  await seed(page, appURL, 99, 50, true);
  await page.goto(`${appURL}/e2e/fixtures/integration.html?scenario=loss`);
  const deal = page.getByRole('button', { name: 'Deal', exact: true });
  if (hasTouch) await deal.tap();
  else await deal.click();
  await expect(balance(page)).toHaveText('49');
  await expect(toggle(page)).not.toBeChecked();
  await expect(toggle(page)).toBeDisabled();
  await expect(toggle(page)).toHaveAccessibleDescription(
    'Repeat amount: 50. Not enough chips to repeat 50; choose a wager manually.',
  );
  await expect(
    page.getByRole('status', { name: 'Your hand result' }),
  ).toHaveText('Loss · Return: 0 · Net: -50');
  await page.getByRole('button', { name: 'Next Hand' }).click();
  await expect(selection(page)).toHaveValue('0');
  await expect(balance(page)).toHaveText('49');
  await page.reload();
  await expect(selection(page)).toHaveValue('0');
  await expect(toggle(page)).toBeDisabled();
  await selection(page).selectOption('10');
  await expect(toggle(page)).toBeDisabled();
  await expect(toggle(page)).not.toBeChecked();
});

test('50 original survives split and two doubles without mid-round forced-off or automatic Deal', async ({
  page,
  appURL,
  hasTouch,
}) => {
  await seed(page, appURL, 200, 50, true);
  await page.goto(`${appURL}/e2e/fixtures/integration.html?scenario=split`);
  const activate = async (name: string) => {
    const button = page.getByRole('button', { name, exact: true });
    if (hasTouch) await button.tap();
    else await button.click();
  };
  await activate('Deal');
  await activate('Split');
  await activate('Double');
  await expect(balance(page)).toHaveText('50');
  await expect(toggle(page)).toBeDisabled();
  await expect(toggle(page)).toBeChecked();
  await expect(toggle(page)).toHaveAccessibleDescription(
    'Repeat amount: 50. Available after the round completes.',
  );
  for (const status of await page.getByRole('status').all())
    await expect(status).toBeEmpty();
  await activate('Double');
  await expect(balance(page)).toHaveText('400');
  await expect(toggle(page)).toBeEnabled();
  await expect(toggle(page)).toBeChecked();
  await activate('Next Hand');
  await expect(selection(page)).toHaveValue('50');
  await expect(balance(page)).toHaveText('400');
  await expect(page.getByRole('img')).toHaveCount(0);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      SESSION_KEY,
    ),
  ).toEqual({
    version: 2,
    settledBankroll: 400,
    lastCompletedWager: 50,
    roundPending: false,
    preferences: {
      selectedWager: 50,
      sameBet: true,
      motion: 'reduced',
      audio: 'muted',
    },
  });
});
