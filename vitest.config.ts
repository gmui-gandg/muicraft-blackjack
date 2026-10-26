import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.tsx', 'tests/*.test.ts'],
    environment: 'node',
    reporters: ['default'],
    silent: false,
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 15_000,
  },
});
