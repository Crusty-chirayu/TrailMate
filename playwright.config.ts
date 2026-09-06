import { defineConfig, devices } from '@playwright/test'

// E2E runs against the production build. The server is launched by
// `scripts/e2e/serve.mjs` (see `npm run e2e:serve`), which builds with
// placeholder credentials and then starts `next start` WITHOUT them so the
// auth proxy fails closed toward /login deterministically.
const port = Number(process.env.E2E_PORT || 3100)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run e2e:serve',
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    cwd: process.cwd(),
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
