# Profile Studio

Counter-UAS test-profile planner: create a profile on a board, iterate it in three views (Plan,
Elevation, 3D), save cards and brief it. It plans real tests as interactive mockups; it does not
run or score them. React, TypeScript and Vite in `src/`. The design direction is the v3 mockup
`legacy/mockup-v3.html` (served at `/legacy/mockup-v3.html` on the dev server).

## Commands

- `npm run gate`: typecheck, lint, unit tests, build, Playwright on `vite preview` (port 5175).
  Run it before you call any change done. Baseline on 2026-11-03: 64 unit files, 612 tests,
  12 e2e specs (14 tests), entry 252.03 kB gzip (budget 300).
- `npm run dev -- --port 5174 --strictPort` (also `.claude/launch.json` "dev"). Port 5173 is
  the user's rangeboard server; do not take it.
- `npm run legacy:smoke`: the frozen ES5 app's cases in `legacy/test/cases/`.
- ESLint is part of the gate; Prettier is not. `npm run format:check` checks formatting and
  `npm run format` fixes it.

## Layout

- `src/engine/` pure geometry, preview and derived values (no DOM). `src/domain/` types, zod
  schema (stamp `profile-studio/8`), catalog, templates, migrations, `siteFile.ts` (KML, KMZ).
- `src/state/` document store with patch undo, ui store, IndexedDB persistence.
  `src/commands/` the command registry. `src/board/` the SVG renderer (cameras, layers; the
  `coverage` layer draws the sensor volumes under the Reach toggle).
- `src/features/` shell, library, build (board, rail, palette, menu, inspector, timeline), brief.
- `e2e/` Playwright specs named by spec acceptance item; `e2e/perf/` the budgets, outside the
  gate. `fixtures/` legacy derive goldens and synthetic KML. `legacy/` the frozen v4 app and
  the mockup; `src/board/render.test.ts` compares bytes with the legacy renderer, so keep it.
- `docs/spec.md` what is built (section 12 acceptance, section 13 known gaps);
  `docs/design-principles.md`; `docs/decisions.md` the user's settled choices;
  `docs/reference/` the DroneScore measures, JIATF-401 conventions and the local source list.
- `profiles/jiop/` the JIOPs four-camera test profiles (JSON) and their Python generator.
- `profiles/saved/` the profiles to import, one JSON per profile and `library.json`. Not
  generated: its JIOP records merge the card edits made in the app with the camera review.

## The standard

DroneScore measures are the naming standard: every measure of performance carries its
DroneScore ID and name under one F2T2EA step (Find, Fix, Track, Target, Engage, Assess). Read
`docs/reference/dronescore-measures.md` before you add, rename or compute a measure, and
`docs/reference/jiatf-401.md` for the C4 conventions. DroneScore wins over C4. Read
`docs/design-principles.md` before any UI, chart or export change. User-facing T&E wording
follows the `stat-te-terminology` skill ("Envelopes" and "C2 and TSPI" are allowed exceptions).

## Conventions

- Metres in the world frame; display units convert at the boundary (`src/features/shared/units`).
- References between records use `key`, never `id` or an array index. Ids are display only.
- One committed `edit(label, recipe)` is one undo step and one version. Drags use
  `beginDrag`, `updateDrag`, `endDrag`.
- One accent marks selection (principle 5.2). Colour means state, not category.
- Toasts are one short sentence with a full stop.

## Gotchas

- No downloads without the user (npm install included). Sources are local in
  `~/Desktop/MASTER/VALKRYN`. rangeboard (`~/projects/rangeboard`) and vos are read-only.
- Autosave writes IndexedDB for `localhost:5174`; clear site data between browser checks when
  it matters. The mockup keeps its own `profileStudio.v3` in localStorage.
- Playwright cannot drive native HTML5 drag; build a `DataTransfer` in the page.
- The reach layer also emits `data-k="system"`; scope selectors to `g[data-layer="systems"]`.
- The two real site files (TST Ranch, UAS Fly Area) live in the user's Downloads and stay out
  of the repo.

## Git

`main` is the only branch. Commit, push and merge only on the user's word.
