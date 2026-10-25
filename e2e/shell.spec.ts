import { execFileSync } from 'node:child_process';
import { test as base, expect } from '@playwright/test';
import { launchVite, projectRoot } from '../tests/support/vite-process.js';

const test = base.extend<{ appURL: string }>({
  appURL: async ({ request }, use) => {
    const identity = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: projectRoot,
      encoding: 'utf8',
    }).trim();
    const server = await launchVite(identity);
    try {
      await server.ready();
      const response = await request.get(`${server.baseURL}/build-id`, {
        maxRedirects: 0,
      });
      expect(response.status()).toBe(200);
      expect(await response.text()).toBe(identity);
      await use(server.baseURL);
    } finally {
      await server.stop();
    }
  },
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`renders the honest responsive shell with motion=${reducedMotion}`, async ({
    page,
    appURL,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('requestfailed', (request) =>
      errors.push(`${request.url()}: ${request.failure()?.errorText}`),
    );
    page.on('response', (response) => {
      if (response.status() >= 400)
        errors.push(`${response.status()} ${response.url()}`);
    });
    await page.emulateMedia({ reducedMotion });
    await page.goto(appURL);
    await expect(page).toHaveTitle('MuiCraft Blackjack');
    await expect(page.getByRole('main')).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 1, name: 'MuiCraft Blackjack' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Scaffold preview' }),
    ).toBeVisible();
    await expect(
      page.getByText(/Gameplay is coming in a later milestone/),
    ).toBeVisible();
    await expect(
      page.getByText(/For entertainment only — virtual chips, no cash value/),
    ).toBeVisible();
    await expect(page.getByRole('button')).toHaveCount(0);
    await expect(page.getByRole('spinbutton')).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}
