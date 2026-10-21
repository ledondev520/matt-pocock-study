import { defineConfig } from '@playwright/test'

// Browser layout checks against the production build (run `npm run build` first).
// Kept out of `npm test` because it needs a Chromium download; CI runs it in its own job.
const port = Number(process.env.LAYOUT_PORT ?? 4310)
export default defineConfig({
  testDir: 'e2e',
  testMatch: /.*\.pw\.ts$/,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${port}` },
  webServer: { command: 'npx tsx server/index.ts', env: { PORT: String(port) }, url: `http://127.0.0.1:${port}/api/health`, reuseExistingServer: false, timeout: 60_000 },
})
