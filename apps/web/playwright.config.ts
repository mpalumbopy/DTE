import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  globalSetup: require.resolve('./e2e/support/global-setup.ts'),
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Solo se fija un executablePath explícito si PLAYWRIGHT_CHROMIUM_PATH está seteado (el
        // sandbox de desarrollo lo usa para apuntar al Chromium preinstalado en
        // PLAYWRIGHT_BROWSERS_PATH, cuya versión no coincide con la que buscaría `playwright
        // install`). En CI (GitHub Actions) o cualquier entorno sin esa variable, se deja que
        // Playwright resuelva el binario que `playwright install --with-deps chromium` instaló en
        // su ubicación default — hardcodear la ruta del sandbox rompería CI real.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : {},
      },
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
