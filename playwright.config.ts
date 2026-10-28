import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  retries: 0,
  workers: 1,
  timeout: 30_000,
  reporter: 'list',
  use: { browserName: 'chromium', trace: 'retain-on-failure' },
  projects: [
    ...[320, 375, 390, 768, 1440].map((width) => ({
      name: `motion-${width}`,
      testMatch: /(?:motion|same-bet)\.spec\.ts/,
      use: {
        viewport: { width, height: 900 },
        hasTouch: width < 700,
        isMobile: width < 700,
      },
    })),
    ...[320, 375, 390, 768, 1440].map((width) => ({
      name: `chromium-${width}`,
      testMatch: 'shell.spec.ts',
      use: { viewport: { width, height: 900 } },
    })),
    {
      name: 'gameplay-desktop',
      testMatch: /(?:round|integration|accessibility)\.spec\.ts/,
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'gameplay-touch',
      testMatch: /(?:round|integration|accessibility)\.spec\.ts/,
      use: {
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
});
