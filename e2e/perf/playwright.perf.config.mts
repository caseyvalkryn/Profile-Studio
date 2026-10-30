import { defineConfig } from '@playwright/test';

// Budget measurements for docs/spec.md section 11 (lane 7.3). Not part of the gate: the default
// config ignores e2e/perf. Run with `npx playwright test -c e2e/perf/playwright.perf.config.mts`.
// One worker, so the timings do not compete. Port 5177 (5173 to 5175 belong to other servers).
const PORT = 5177;

export default defineConfig({
  testDir: '.',
  outputDir: '../__results__/perf',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  timeout: 300_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: 'off',
    headless: process.env.PERF_HEADED ? false : true,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
