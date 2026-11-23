import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 45000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://127.0.0.1:3000',
    browserName: 'chromium',
    headless: true,
  },
  webServer: {
    command: 'node dist/server/src/index.js',
    url: 'http://127.0.0.1:3000/ready',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
