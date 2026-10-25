import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  retries: 0,
  workers: 1,
  timeout: 30_000,
  reporter: 'list',
  use: { browserName: 'chromium', trace: 'retain-on-failure' },
  projects: [320, 375, 390, 768, 1440].map((width) => ({
    name: `chromium-${width}`,
    use: { viewport: { width, height: 900 } },
  })),
});
