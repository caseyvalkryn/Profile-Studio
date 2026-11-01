Run `npm run e2e`: one Playwright spec per live acceptance item in docs/spec.md section 12. Items retired in phase 10 have no spec.
The web server builds the production bundle and serves it with `vite preview` on port 5175 (strict; 5173 and 5174 belong to other servers).
Chromium only, the build Playwright 1.64.1 ships (1248); failure screenshots land in `e2e/__results__/`.
