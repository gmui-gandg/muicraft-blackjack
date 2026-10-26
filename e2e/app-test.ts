import { execFileSync } from 'node:child_process';
import { test as base, expect } from '@playwright/test';
import { launchVite, projectRoot } from '../tests/support/vite-process.js';

export const test = base.extend<{ appURL: string }>({
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
