import { defineConfig } from '@playwright/test';

// End-to-end suite: one spec per acceptance item in docs/spec.md section 12. Runs against the
// production bundle on port 5175 (5173 and 5174 belong to other servers). Playwright gives each
// test a fresh browser context, so IndexedDB starts empty in every test.
// E2E_PORT lets parallel lane worktrees run the gate at once (one preview server each).
const PORT = Number(process.env.E2E_PORT ?? 5175);

export default defineConfig({
  testDir: './e2e',
  // Budget measurements (lane 7.3) run on their own config: e2e/perf/playwright.perf.config.mts.
  testIgnore: ['perf/**'],
  outputDir: './e2e/__results__',
  fullyParallel: true,
  workers: 4,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'off',
  },
  // No device preset: its Windows user agent would make the app read Mod as Ctrl on a mac host.
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
