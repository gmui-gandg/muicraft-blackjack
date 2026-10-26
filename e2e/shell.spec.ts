import {
  presentationFixtures,
  isOutcomeLabel,
} from '../src/test/table-fixtures.js';
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
  }, testInfo) => {
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
      page.getByRole('heading', { name: 'Table preview' }),
    ).toBeVisible();
    await expect(
      page.getByText(/Take a seat. Gameplay is not connected yet/),
    ).toBeVisible();
    await expect(
      page.getByText(/For entertainment only — virtual chips, no cash value/),
    ).toBeVisible();
    await expect(page.getByRole('button')).toHaveCount(9);
    await expect(
      page.getByText('Gameplay is not connected yet.', { exact: true }),
    ).toHaveCount(2);
    const previewTargets = [];
    for (const button of await page.getByRole('button').all()) {
      await expect(button).toBeDisabled();
      await expect(button).toHaveAccessibleDescription(
        'Gameplay is not connected yet.',
      );
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      if (!box) throw new Error('Missing preview target');
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      previewTargets.push({
        label: await button.getAttribute('aria-label'),
        ...box,
      });
    }
    await expect(page.getByRole('spinbutton')).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (process.env.M2_EVIDENCE_DIR && reducedMotion === 'no-preference') {
      const { mkdir, writeFile } = await import('node:fs/promises');
      const { join } = await import('node:path');
      await mkdir(process.env.M2_EVIDENCE_DIR, { recursive: true });
      await writeFile(
        join(
          process.env.M2_EVIDENCE_DIR,
          `${testInfo.project.name}-preview.json`,
        ),
        JSON.stringify(
          {
            targets: previewTargets,
            dimensions: await page.evaluate(() => ({
              scroll: document.documentElement.scrollWidth,
              client: document.documentElement.clientWidth,
            })),
            errors,
          },
          null,
          2,
        ),
      );
      await page.evaluate(() =>
        window.scrollTo(0, document.documentElement.scrollHeight),
      );
      await page.screenshot({
        path: join(
          process.env.M2_EVIDENCE_DIR,
          `${testInfo.project.name}-preview.png`,
        ),
        fullPage: true,
      });
    }
    expect(errors).toEqual([]);
  });
}

for (const { scenario } of presentationFixtures) {
  test(`presentation fixture: ${scenario}`, async ({
    page,
    appURL,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    if (scenario === 'betting')
      await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${appURL}/e2e/fixtures/table.html?scenario=${scenario}`);
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    const table = page.getByRole('region', { name: 'Blackjack table' });
    await expect(table).toBeVisible();
    const palette = await table.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        felt: style.getPropertyValue('--felt').trim(),
        gold: style.getPropertyValue('--gold').trim(),
        ivory: style.getPropertyValue('--ivory').trim(),
        ink: style.getPropertyValue('--ink').trim(),
        red: style.getPropertyValue('--red').trim(),
        background: getComputedStyle(document.documentElement).backgroundColor,
      };
    });
    expect(palette).toEqual({
      felt: '#0c5a43',
      gold: '#d9be7a',
      ivory: '#faf9f5',
      ink: '#182323',
      red: '#bd373c',
      background: 'rgb(11, 31, 28)',
    });
    const surface = table.locator(':scope > div').filter({
      has: page.getByRole('region', { name: 'Dealer', exact: true }),
    });
    await expect(surface).toHaveCSS('background-color', 'rgb(12, 90, 67)');
    const surfaceBackground = await surface.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    const dimensions = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
    const targets = await page.getByRole('button').evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          name: button.getAttribute('aria-label'),
          width: rect.width,
          height: rect.height,
        };
      }),
    );
    for (const target of targets) {
      expect(target.width).toBeGreaterThanOrEqual(44);
      expect(target.height).toBeGreaterThanOrEqual(44);
    }
    const cards = await page.getByRole('img').evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          name: element.getAttribute('aria-label'),
          width: rect.width,
          height: rect.height,
        };
      }),
    );
    for (const card of cards)
      expect(card.width / card.height).toBeCloseTo(5 / 7, 2);
    let layout = null;
    if (scenario === 'two-hands') {
      const hand1 = page.getByRole('region', { name: 'Hand 1', exact: true });
      const hand2 = page.getByRole('region', { name: 'Hand 2 Active hand' });
      await expect(hand1).toBeVisible();
      await expect(hand2).toBeVisible();
      await expect(page.getByText('Active hand', { exact: true })).toHaveCount(
        1,
      );
      await expect(page.getByText('Visible total: 6')).toBeVisible();
      const hidden = page.getByRole('img', { name: 'Concealed card' });
      const concealedMarkup = await hidden.evaluate(
        (element) => element.outerHTML,
      );
      expect(concealedMarkup).not.toMatch(
        /rank|suit|clubs|diamonds|hearts|spades|title|data-/i,
      );
      const dealer = await page
        .getByRole('region', { name: 'Dealer', exact: true })
        .boundingBox();
      const first = await hand1.boundingBox();
      const second = await hand2.boundingBox();
      const actions = await page
        .getByRole('group', { name: 'Table actions' })
        .boundingBox();
      expect(dealer).not.toBeNull();
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(actions).not.toBeNull();
      if (!dealer || !first || !second || !actions)
        throw new Error('Missing layout box');
      expect(dealer.y + dealer.height).toBeLessThanOrEqual(first.y);
      for (const hand of [first, second]) {
        expect(hand.x).toBeGreaterThanOrEqual(0);
        expect(hand.x + hand.width).toBeLessThanOrEqual(dimensions.client);
      }
      if (dimensions.client === 1440)
        expect(actions.y).toBeGreaterThanOrEqual(
          Math.max(first.y + first.height, second.y + second.height),
        );
      if (dimensions.client < 700) {
        expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
        for (const hand of [first, second]) {
          expect(hand.y).toBeGreaterThanOrEqual(0);
          expect(hand.y + hand.height).toBeLessThanOrEqual(actions.y);
        }
        expect(
          await page
            .getByRole('group', { name: 'Table actions' })
            .evaluate((element) => getComputedStyle(element).position),
        ).toBe('sticky');
      }
      layout = { dealer, first, second, actions, concealedMarkup };
    }
    if (isOutcomeLabel(scenario)) {
      const expected = {
        Win: 'Win · Return: 100 · Net: 50',
        Loss: 'Loss · Return: 0 · Net: -50',
        Push: 'Push · Return: 50 · Net: 0',
      };
      await expect(page.getByRole('status')).toHaveText(expected[scenario]);
      await expect(page.getByText('Stake: 50')).toBeVisible();
    }
    await page.keyboard.press('Tab');
    const focus = await page.locator(':focus').evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        label: element.getAttribute('aria-label'),
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        outlineColor: style.outlineColor,
        transitionDuration: style.transitionDuration,
      };
    });
    expect(focus.label).toBe(
      scenario === 'betting'
        ? 'Add 10 chips'
        : scenario === 'two-hands'
          ? 'Hit'
          : 'Next Hand',
    );
    if (scenario === 'betting') expect(focus.transitionDuration).toBe('0s');
    expect(focus.outlineStyle).toBe('solid');
    expect(parseFloat(focus.outlineWidth)).toBeGreaterThanOrEqual(3);
    const observation = {
      scenario,
      palette,
      surfaceBackground,
      dimensions,
      targets,
      cards,
      layout,
      focus,
      errors,
    };
    await testInfo.attach('browser-observations', {
      body: JSON.stringify(observation, null, 2),
      contentType: 'application/json',
    });
    if (process.env.M2_EVIDENCE_DIR) {
      const { mkdir, writeFile } = await import('node:fs/promises');
      const { join } = await import('node:path');
      await mkdir(process.env.M2_EVIDENCE_DIR, { recursive: true });
      const prefix = join(
        process.env.M2_EVIDENCE_DIR,
        `${testInfo.project.name}-${scenario}`,
      );
      await writeFile(`${prefix}.json`, JSON.stringify(observation, null, 2));
      await page.evaluate(() =>
        window.scrollTo(0, document.documentElement.scrollHeight),
      );
      await page.screenshot({ path: `${prefix}.png`, fullPage: true });
    }
    expect(errors).toEqual([]);
  });
}
