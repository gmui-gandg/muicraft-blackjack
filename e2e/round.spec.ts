import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { test } from './app-test.js';
import { roundCases } from '../src/test/round-fixtures.js';
import { projectRoot } from '../tests/support/vite-process.js';

async function activate(page: Page, name: string, touch: boolean) {
  const button = page.getByRole('button', { name, exact: true });
  if (touch) await button.tap();
  else await button.click();
}

async function save(page: Page, info: TestInfo, name: string, result: object) {
  const targets = await page.getByRole('button').evaluateAll((buttons) =>
    buttons.map((button) => {
      const box = button.getBoundingClientRect();
      return {
        label: button.getAttribute('aria-label'),
        width: box.width,
        height: box.height,
      };
    }),
  );
  for (const target of targets) {
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
  }
  const dimensions = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
  result = { ...result, targets, dimensions };
  await info.attach(name, {
    body: JSON.stringify(result),
    contentType: 'application/json',
  });
  if (!process.env.M2_EVIDENCE_DIR) return;
  await mkdir(process.env.M2_EVIDENCE_DIR, { recursive: true });
  const prefix = join(
    process.env.M2_EVIDENCE_DIR,
    `${info.project.name}-${name}`,
  );
  await writeFile(`${prefix}.json`, JSON.stringify(result, null, 2));
  await page.screenshot({ path: `${prefix}.png`, fullPage: true });
}

for (const entry of roundCases) {
  test(`playable ${entry.name}`, async ({ page, appURL, hasTouch }, info) => {
    const touch = hasTouch === true;
    await page.goto(`${appURL}/e2e/fixtures/round.html?scenario=${entry.name}`);
    expect(await page.evaluate(() => navigator.maxTouchPoints > 0)).toBe(touch);
    const balance = page
      .locator('dl > div')
      .filter({ has: page.getByText('Balance', { exact: true }) })
      .locator('dd');
    await expect(
      page.getByRole('button', { name: 'Deal', exact: true }),
    ).toHaveAccessibleDescription('Choose wager chips before dealing.');
    await activate(page, 'Add 10 chips', touch);
    await activate(page, 'Deal', touch);
    if (!entry.name.includes('natural')) {
      await expect(balance).toHaveText('990');
      await expect(page.getByText('Stake: 10')).toBeVisible();
      const dealer = page.getByRole('region', { name: 'Dealer', exact: true });
      await expect(dealer.getByText('Visible total: 10')).toBeVisible();
      await expect(dealer.getByRole('img')).toHaveCount(2);
      const hidden = dealer.getByRole('img', { name: 'Concealed card' });
      expect(await hidden.evaluate((element) => element.outerHTML)).not.toMatch(
        /rank|suit|clubs|diamonds|hearts|spades|title|data-/i,
      );
      await save(page, info, `${entry.name}-concealed`, {
        balance: 990,
        stake: 10,
        visibleTotal: 10,
      });
      if (entry.hit) await activate(page, 'Hit', touch);
      await activate(page, 'Stand', touch);
    }
    await expect(balance).toHaveText(String(entry.balance));
    await expect(page.getByRole('status')).toHaveText(
      `${entry.net < 0 ? 'Loss' : entry.net === 0 ? 'Push' : 'Win'} · Return: ${entry.returned} · Net: ${entry.net}`,
    );
    await expect(page.getByRole('img', { name: 'Concealed card' })).toHaveCount(
      0,
    );
    for (const name of ['Hit', 'Stand', 'Deal'])
      await expect(
        page.getByRole('button', { name, exact: true }),
      ).toBeDisabled();
    await expect(page.getByText('Stake: 10')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await save(page, info, entry.name, {
      ...entry,
      input: touch ? 'touch tap' : 'desktop pointer click',
      hasTouch: touch,
    });
    await activate(page, 'Next Hand', touch);
    await expect(balance).toHaveText(String(entry.balance));
    await expect(page.getByRole('img')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Deal', exact: true }),
    ).toBeDisabled();
    await activate(page, 'Add 10 chips', touch);
    await expect(page.getByRole('img')).toHaveCount(0);
  });
}

test('rapid pointer/touch actions never double commit or settle', async ({
  page,
  appURL,
  hasTouch,
}) => {
  const touch = hasTouch === true;
  await page.goto(`${appURL}/e2e/fixtures/round.html?scenario=win`);
  await activate(page, 'Add 10 chips', touch);
  const deal = await page
    .getByRole('button', { name: 'Deal', exact: true })
    .boundingBox();
  if (!deal) throw new Error('Missing Deal target');
  const x = deal.x + deal.width / 2,
    y = deal.y + deal.height / 2;
  if (touch) {
    await page.touchscreen.tap(x, y);
    await page.touchscreen.tap(x, y);
  } else await page.mouse.dblclick(x, y, { delay: 20 });
  await expect(
    page.getByText('Balance').locator('..').locator('dd'),
  ).toHaveText('990');
  const stand = await page
    .getByRole('button', { name: 'Stand', exact: true })
    .boundingBox();
  if (!stand) throw new Error('Missing Stand target');
  if (touch) {
    await page.touchscreen.tap(
      stand.x + stand.width / 2,
      stand.y + stand.height / 2,
    );
    await page.touchscreen.tap(
      stand.x + stand.width / 2,
      stand.y + stand.height / 2,
    );
  } else
    await page.mouse.dblclick(
      stand.x + stand.width / 2,
      stand.y + stand.height / 2,
      { delay: 20 },
    );
  await expect(
    page.getByText('Balance').locator('..').locator('dd'),
  ).toHaveText('990');
  await expect(page.getByRole('img')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Next Hand' })).toBeEnabled();
});

test('reset native accessible confirmation cancel/confirm and wager eligibility', async ({
  page,
  appURL,
  hasTouch,
}, info) => {
  const touch = hasTouch === true;
  await page.goto(`${appURL}/e2e/fixtures/round.html?scenario=low`);
  await expect(
    page.getByRole('button', { name: 'Add 100 chips' }),
  ).toHaveAccessibleDescription('Not enough available chips for this wager.');
  await activate(page, 'Add 50 chips', touch);
  await activate(page, 'Add 10 chips', touch);
  for (const value of [10, 50, 100])
    await expect(
      page.getByRole('button', { name: `Add ${value} chips` }),
    ).toBeDisabled();
  await page.goto(`${appURL}/e2e/fixtures/round.html?scenario=reset`);
  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm');
    expect(dialog.message()).toBe('Reset Virtual Bankroll to 1,000 chips?');
    await dialog.dismiss();
  });
  await activate(page, 'Reset Virtual Bankroll', touch);
  await expect(
    page.getByText('Balance').locator('..').locator('dd'),
  ).toHaveText('5');
  page.once('dialog', (dialog) => dialog.accept());
  await activate(page, 'Reset Virtual Bankroll', touch);
  await expect(
    page.getByText('Balance').locator('..').locator('dd'),
  ).toHaveText('1000');
  await expect(
    page.getByRole('button', { name: 'Reset Virtual Bankroll' }),
  ).toHaveCount(0);
  await save(page, info, 'reset', {
    cancelledBalance: 5,
    confirmedBalance: 1000,
    hasTouch: touch,
  });
});

test('built production entry starts a real round without fixture controls', async ({
  page,
  hasTouch,
}) => {
  const identity = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: projectRoot,
    encoding: 'utf8',
  }).trim();
  expect(await readFile(join(projectRoot, 'dist/build-id'), 'utf8')).toBe(
    identity,
  );
  const html = await readFile(join(projectRoot, 'dist/index.html'), 'utf8');
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)].map(
    (match) => match[1]!,
  );
  for (const asset of assets.filter((path) => path.endsWith('.js'))) {
    expect(
      await readFile(join(projectRoot, 'dist', asset), 'utf8'),
    ).not.toMatch(
      /Development gameplay fixture|player-natural|round-fixture|integrationEvidence|Test-only simulated unload/,
    );
  }
  const server = createServer(async (request, response) => {
    const path = request.url === '/' ? '/index.html' : (request.url ?? '');
    if (
      path !== '/index.html' &&
      path !== '/build-id' &&
      !assets.includes(path)
    ) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader(
      'Content-Type',
      path.endsWith('.js')
        ? 'text/javascript'
        : path.endsWith('.css')
          ? 'text/css'
          : path.endsWith('.html')
            ? 'text/html'
            : 'text/plain',
    );
    response.end(await readFile(join(projectRoot, 'dist', path)));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing static smoke address');
    await page.goto(`http://127.0.0.1:${address.port}/`);
    await expect(
      page.getByRole('heading', { name: 'MuiCraft Blackjack' }),
    ).toBeVisible();
    await activate(page, 'Add 10 chips', hasTouch === true);
    await activate(page, 'Deal', hasTouch === true);
    await expect(page.getByRole('img')).toHaveCount(4);
    if (
      await page.getByRole('button', { name: 'Stand', exact: true }).isEnabled()
    )
      await activate(page, 'Stand', hasTouch === true);
    await expect(page.getByRole('button', { name: 'Next Hand' })).toBeEnabled();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
