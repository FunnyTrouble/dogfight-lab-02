import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', timeout: 45000, retries: process.env.CI ? 2 : 0,
  use: { baseURL: 'http://127.0.0.1:5173', browserName: 'chromium', headless: true },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI, timeout: 120000 },
});
