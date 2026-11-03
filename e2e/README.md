Run `npm run e2e`: Playwright specs named by acceptance item in docs/spec.md section 12 (2, 3, 4, 9, 10, 12, 19, 26, 27, 28) plus the timeline and slice specs. Retired items have no spec.
The web server builds the production bundle and serves it with `vite preview` on port 5175 (strict; 5173 and 5174 belong to other servers).
Chromium only, the build Playwright 1.64.1 ships (1248); failure screenshots land in `e2e/__results__/`.
`e2e/perf/budgets.spec.ts` measures the section 11 budgets with its own config, `e2e/perf/playwright.perf.config.mts`, outside the gate.
