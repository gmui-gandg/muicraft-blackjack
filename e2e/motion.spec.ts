import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from './app-test.js';
import { stressFixtures } from '../src/test/table-fixtures.js';

async function save(info: TestInfo, name: string, value: unknown) {
  const body = JSON.stringify(value, null, 2);
  await info.attach(name, { body, contentType: 'application/json' });
  if (process.env.M4_EVIDENCE_DIR) {
    await mkdir(process.env.M4_EVIDENCE_DIR, { recursive: true });
    await writeFile(
      join(process.env.M4_EVIDENCE_DIR, `${info.project.name}-${name}.json`),
      body,
    );
  }
}

async function dimensions(page: Page) {
  const measurement = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
    touch: navigator.maxTouchPoints,
    targets: [...document.querySelectorAll('button, select')]
      .filter((element) => element.checkVisibility())
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          label: element.getAttribute('aria-label') ?? element.textContent,
          width: rect.width,
          height: rect.height,
        };
      }),
  }));
  expect(measurement.scroll).toBeLessThanOrEqual(measurement.client);
  for (const target of measurement.targets) {
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
  }
  return measurement;
}

async function activeEffects(page: Page) {
  return page.evaluate(() =>
    document.getAnimations().map((animation) => ({
      name:
        animation instanceof CSSAnimation
          ? animation.animationName
          : animation instanceof CSSTransition
            ? animation.transitionProperty
            : '',
      timing: animation.effect?.getTiming(),
      currentTime: animation.currentTime,
      state: animation.playState,
    })),
  );
}

for (const mode of [
  'normal',
  'system-reduced',
  'explicit-reduced',
  'full-override',
] as const) {
  test(`ordinary gameplay and triggered motion: ${mode}`, async ({
    page,
    appURL,
    hasTouch,
  }, info) => {
    await page.emulateMedia({
      reducedMotion:
        mode === 'system-reduced' || mode === 'full-override'
          ? 'reduce'
          : 'no-preference',
    });
    await page.goto(
      `${appURL}/e2e/fixtures/integration.html?scenario=ordinary`,
    );
    if (mode === 'explicit-reduced' || mode === 'full-override') {
      await page
        .getByRole('combobox', { name: 'Motion', exact: true })
        .selectOption(mode === 'full-override' ? 'full' : 'reduced');
      await page.reload();
      await expect(
        page.getByRole('combobox', { name: 'Motion', exact: true }),
      ).toHaveValue(mode === 'full-override' ? 'full' : 'reduced');
    }
    await page.getByLabel('Selected wager').selectOption('10');
    const activate = async (name: string) => {
      const button = page.getByRole('button', { name, exact: true });
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeInViewport();
      if (hasTouch) await button.tap();
      else await button.click();
    };
    const before = await dimensions(page);
    expect(before.touch > 0).toBe(hasTouch === true);
    await activate('Deal');
    const dealEffects = await activeEffects(page);
    const dealt = await dimensions(page);
    if (process.env.M4_EVIDENCE_DIR && mode === 'normal') {
      await mkdir(process.env.M4_EVIDENCE_DIR, { recursive: true });
      await page.screenshot({
        path: join(
          process.env.M4_EVIDENCE_DIR,
          `${info.project.name}-dealt.png`,
        ),
        fullPage: true,
      });
    }
    const sequence = await page.getByRole('img').evaluateAll((cards) =>
      cards.map((card) => {
        const arrival = getComputedStyle(card.parentElement!);
        const face = getComputedStyle(card.firstElementChild!);
        return {
          label: card.getAttribute('aria-label'),
          duration: arrival.animationDuration,
          delay: arrival.animationDelay,
          flip: face.transitionDuration,
        };
      }),
    );
    for (const card of sequence) {
      const duration = parseFloat(card.duration) * 1000;
      if (mode === 'normal' || mode === 'full-override') {
        expect(duration).toBeGreaterThanOrEqual(150);
        expect(duration).toBeLessThanOrEqual(300);
      } else {
        expect(duration).toBeLessThanOrEqual(1);
        expect(parseFloat(card.delay) * 1000).toBeLessThanOrEqual(1);
        expect(parseFloat(card.flip) * 1000).toBeLessThanOrEqual(1);
      }
    }
    if (mode === 'normal' || mode === 'full-override')
      expect(sequence.map((card) => card.delay).sort()).toEqual([
        '0.06s',
        '0.12s',
        '0.18s',
        '0s',
      ]);
    // Let the concealed face establish its style before measuring the real reveal transition.
    await page
      .getByRole('img', { name: 'Concealed card' })
      .evaluate((card) => getComputedStyle(card.firstElementChild!).transform);
    await activate('Stand');
    const settlementEffects = await activeEffects(page);
    await expect(page.getByRole('status').first()).toHaveText(
      'Win · Return: 20 · Net: 10',
    );
    const settled = await dimensions(page);
    if (process.env.M4_EVIDENCE_DIR && mode === 'normal') {
      await page.screenshot({
        path: join(
          process.env.M4_EVIDENCE_DIR,
          `${info.project.name}-settled.png`,
        ),
        fullPage: true,
      });
    }
    const result = await page.evaluate(() => ({
      cards: [...document.querySelectorAll('[role="img"]')].map((card) =>
        card.getAttribute('aria-label'),
      ),
      results: [...document.querySelectorAll('[role="status"]')].map(
        (region) => region.textContent,
      ),
      balance: document.querySelector('dd')?.textContent,
      saved: localStorage.getItem('muicraft-blackjack.session'),
      effects: [
        ...document.querySelectorAll(
          '[class*="outcome"], [class*="settlement"]',
        ),
      ].map((element) => getComputedStyle(element).animationDuration),
    }));
    expect(result.balance).toBe('1010');
    expect(result.cards).toEqual([
      '10 of diamonds',
      '7 of clubs',
      '10 of clubs',
      '8 of clubs',
    ]);
    for (const effect of result.effects)
      expect(parseFloat(effect) * 1000).toBe(
        mode === 'normal' || mode === 'full-override' ? 200 : 0,
      );
    if (mode === 'normal' || mode === 'full-override') {
      expect(
        dealEffects.some(
          (effect) =>
            effect.name.includes('deal') && effect.state === 'running',
        ),
      ).toBe(true);
      for (const name of ['transform', 'outcome', 'settlement'])
        expect(
          settlementEffects.some(
            (effect) =>
              effect.name.includes(name) && effect.state === 'running',
          ),
        ).toBe(true);
    }
    await activate('Next Hand');
    await expect(page.getByRole('img')).toHaveCount(0);
    const next = await dimensions(page);
    expect(JSON.parse(result.saved!).settledBankroll).toBe(1010);
    expect(JSON.parse(result.saved!).roundPending).toBe(false);
    await save(info, mode, {
      kind: 'ordinary deterministic end-to-end gameplay',
      mode,
      hasTouch,
      before,
      dealt,
      sequence,
      settled,
      result,
      next,
      dealEffects,
      settlementEffects,
    });
  });
}

for (const { scenario, outcome } of stressFixtures) {
  test(`separate stress component fixture: ${outcome}`, async ({
    page,
    appURL,
  }, info) => {
    await page.goto(`${appURL}/e2e/fixtures/table.html?scenario=${scenario}`);
    await expect(page.getByRole('alert')).toBeVisible();
    const boxes = [];
    for (const name of ['Hand 1', 'Hand 2 Active hand']) {
      const hand = page.getByRole('region', { name, exact: true });
      await expect(hand).toBeVisible();
      await expect(hand.getByText(/Total:/)).toBeVisible();
      const box = await hand.boundingBox();
      expect(box).not.toBeNull();
      if (!box) throw new Error('Missing hand');
      const width = await page.evaluate(
        () => document.documentElement.clientWidth,
      );
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      boxes.push({
        name,
        ...box,
        total: await hand.getByText(/Total:/).textContent(),
        cards: await hand.getByRole('img').count(),
      });
    }
    await expect(page.getByRole('status').first()).toContainText(outcome);
    for (const button of await page
      .getByRole('button', { name: /^(Hit|Stand|Double)$/ })
      .all()) {
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeInViewport();
    }
    if (process.env.M4_EVIDENCE_DIR) {
      await mkdir(process.env.M4_EVIDENCE_DIR, { recursive: true });
      await page.screenshot({
        path: join(
          process.env.M4_EVIDENCE_DIR,
          `${info.project.name}-stress-${outcome}.png`,
        ),
        fullPage: true,
      });
    }
    await save(info, `stress-${outcome}`, {
      kind: 'supplied component fixture; no engine journey',
      boxes,
      dimensions: await dimensions(page),
      notice: await page.getByRole('alert').textContent(),
    });
  });
}

test('native repeated click does not duplicate Hit during deal motion; fresh actions remain legal', async ({
  page,
  appURL,
}) => {
  await page.goto(`${appURL}/e2e/fixtures/integration.html?scenario=keyboard`);
  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  await page
    .getByRole('button', { name: 'Hit', exact: true })
    .dblclick({ delay: 10 });
  expect(
    await page.evaluate(
      () =>
        window.integrationEvidence.attempts.filter((type) => type === 'HIT')
          .length,
    ),
  ).toBe(1);
  await page.getByRole('button', { name: 'Hit', exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        window.integrationEvidence.attempts.filter((type) => type === 'HIT')
          .length,
    ),
  ).toBe(2);
  await page.getByRole('button', { name: 'Stand', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Next Hand' })).toBeEnabled();
});
