import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['shared/**/*.test.ts', 'client/**/*.vitest.ts', 'server/**/*.vitest.ts'], testTimeout: 12000,
    coverage: { provider: 'v8', include: ['shared/**/*.ts'], exclude: ['shared/**/*.test.ts'],
      thresholds: { lines: 85, statements: 85 } } },
});
