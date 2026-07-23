import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath: '/opt/pw-browsers/chromium' } },
    },
  ],
  webServer: [
    {
      command: 'node dist/main.js',
      cwd: resolve(REPO_ROOT, 'apps/api'),
      url: 'http://localhost:3001/api/healthz',
      env: { NODE_ENV: 'test' },
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'pnpm dev',
      cwd: resolve(REPO_ROOT, 'apps/web'),
      url: 'http://localhost:3000',
      env: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3001/api/v1' },
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
