# Profile Studio MVP build plan

Date: 2026-10-30. This plan takes Profile Studio from the legacy ES5 app to the MVP in
`docs/spec.md`. An orchestrator can pick it up cold. Read in this order: `CLAUDE.md`,
`docs/design-principles.md`, `docs/spec.md`, this file, then the reference file each lane names.

## 1. Decisions

These are settled. Do not reopen them without the user.

| Decision | Choice | Reason |
| --- | --- | --- |
| Measures | DroneScore rows only | User: the gold standard |
| Kill chain display | F2T2EA over `stage_reached` | User confirmed 2026-10-30 |
| Design | First principles. rangeboard is a source of parts | User, 2026-10-30 |
| Product form | Installed production MVP, not a static page | User, 2026-10-30 |
| vos | Port after the MVP | `docs/reference/vos.md` |
| Sources | Local only, `~/Desktop/MASTER/VALKRYN` | User: no internet downloads |
| Engine | rangeboard engine transferred and modified into `src/engine` | Working C-UAS Monte Carlo; no shared package |

## 2. Stack

Chosen to match vos majors, so the later port stays medium effort.

| Need | Choice |
| --- | --- |
| UI | React 18.3.1, TypeScript ~5.6.3, Vite ^8.0.16 |
| State | Zustand ^5.0.2 with Immer patches for undo |
| Validation | zod |
| Map | maplibre-gl ^6.9.0, with a no-tile grid mode as the default |
| Menus, tooltips, dialogs | Radix primitives |
| Command palette | cmdk |
| Charts | recharts 2.15.2 |
| Styling | Tailwind 4.1.12 (`@tailwindcss/vite`) with tokens as CSS custom properties in `src/styles/tokens.css` |
| Storage | IndexedDB through `idb`, plus JSON import and export |
| Tests | Vitest for unit and engine, Playwright for end-to-end by user action |
| Lint and format | ESLint flat config and Prettier |

These are the vos versions (`docs/reference/vos.md`, 2026-10-30). Use the latest patch of the
other packages at scaffold time and pin exact versions in `package-lock.json`.

## 3. Layout

```text
legacy/            frozen ES5 app, runnable, the parity reference
fixtures/          golden outputs from legacy, seeds, test vignettes
src/engine/        pure TS: geo, preview, sim, pd, score, stats, sweep (no DOM, no React)
src/domain/        types, schema, catalog, templates, behaviors, migrate
src/workers/       sim.worker.ts
src/state/         stores: document (undo), ui, runs; persistence
src/commands/      the command registry
src/ui/            primitives: Button, Field, Kbd, Tooltip, Menu, ContextMenu, Palette, Dialog
src/features/      library/, build/{map,assets,inspector,timeline,profile}/, results/, report/
src/styles/        tokens.css, base.css
e2e/               Playwright suites, one per acceptance item in spec section 12
```

## 4. Gate

`npm run gate` runs typecheck, lint, unit tests and build. From phase 4, `npm run e2e` runs the
end-to-end suite. Phase 0 keeps `node legacy/test/smoke.js` green.

## 5. Orchestration rules

1. One agent per lane per round. A send-back is a new agent with the review file as input.
2. Lanes in one phase own disjoint files. Launch them in one message.
3. Every brief states: working directory, owned files, gate command, report shape, time budget.
4. A worker report is a claim. The orchestrator runs the gate and reads `git diff --stat`
   before it marks a lane done.
5. Each lane works on branch `lane/<id>` from `rebuild/mvp`. The orchestrator merges in plan
   order, then runs the gate once on `rebuild/mvp`.
6. After each phase, one review lane (`opus-high`) reviews the phase diff against the spec and
   the principles. Findings go to `reviews/<phase>.md`. Fixes are a new lane.
7. Screenshots and browser checks go to a worker. The orchestrator reads the report.
8. Commit, push and merge to `main` only with user approval.
9. A review lane is followed by a fix lane (`<phase>.F`) that owns the files the findings cite
   and reports per finding: fixed, partial, or declared loss.
10. When parallel lanes build parts of one screen, a wiring lane follows them (4.5, 5.3, 6.3). It
    owns `App.tsx`, the composed screen and the shared folders, and it dedupes what the parallel
    lanes each wrote locally (formatters, constants).
11. Every UI phase gets a real browser pass in its review. jsdom and the MapLibre mock passed 400
    tests while the map had zero height, a 404 worker and no right-click menu (phase 4).

Worker types are in `~/.claude/rules/delegation.md`. Default: `opus-medium`.

## 6. Phases and lanes

### Phase 0. Baseline (orchestrator, needs user approval)

- **0.1 Baseline commit.** Commit the current tree to `main` as the legacy v4 baseline. Branch
  `rebuild/mvp`.
- **0.2 Move legacy.** Move `index.html`, `js/`, `css/`, `test/` to `legacy/`. Fix the test path.
  Gate: `node legacy/test/smoke.js`.
- **0.3 Golden fixtures** (`opus-medium`, 600 s). Write `legacy/test/golden.js`. It writes the
  derive output of the 4 seeds and 5 templates to `fixtures/legacy-derive/*.json`. Owned:
  that script and `fixtures/legacy-derive/`.

### Phase 1. Scaffold (`opus-medium`, 1200 s)

- **1.1** Vite, React, TypeScript, Tailwind, ESLint, Prettier, Vitest, Playwright, `npm run gate`.
  `src/styles/tokens.css` from the principles: four surfaces, one accent, two radii, mono for
  data, light and dark. App shell with the four workspaces as empty routes. ESLint fence: no
  `react`, `react-dom`, `window` or `document` in `src/engine/`. Owned: root config files,
  `src/main.tsx`, `src/App.tsx`, `src/styles/`. Gate: `npm run gate`.

### Phase 2. Domain and engine

- **2.1 Domain** (`opus-medium`, 1200 s, first). `src/domain/`: types and zod schema from spec
  section 5, catalog from legacy (`docs/reference/legacy-app.md` section 3), DroneScore measure
  table as data with source classes from spec section 4, legacy v4 import. Tests: every legacy
  seed imports and validates. Gate: `npm run gate`.
- **2.2 Preview** (`fable-medium`, 1800 s, after 2.1). `src/engine/geo.ts`, `preview.ts`. Port
  legacy geo and derive. Parity test against `fixtures/legacy-derive/` for coverage windows,
  first detection and area entry. Replace `splitTimes` with an incremental method. Perf test:
  40 threats and 15 sensors under 100 ms. Reference: `docs/reference/legacy-app.md` section 5.
- **2.3a Engine transfer** (`opus-high`, 2400 s, parallel with 2.1). Copy the 59-file headless
  trial closure (about 16,300 lines) listed in `docs/reference/rangeboard-parts.md` section 2 into
  `src/engine/sim/`. Keep the logic as it is. Fix imports and types to compile under the fence.
  Copy the rangeboard tests for those files. Gate: `npm run gate` and one seeded `runTrial` in
  Node gives the same result as in rangeboard.
- **2.3b Run and score** (`fable-medium`, 2400 s, after 2.1 and 2.3a, parallel with 2.2).
  `src/engine/adapter.ts` (vignette to rangeboard scenario), `src/engine/run.ts`, `score.ts`,
  `sweep.ts`, `src/workers/sim.worker.ts`. Emit `RunRow` per spec section 5 from the rangeboard
  gates (detect, track, identify, target, engage, effect; `src/analysis/requirements.ts`). The
  rangeboard `target` gate gives the F2T2EA Target time; `RunRow` stores only DroneScore fields.
  Range and altitude at each stage are new logic. Score per spec section 6. Fixed-seed tests.
  Remove transferred code that nothing reaches.
- **2.R Review** (`fable-high`, 1200 s). Adversarial review of engine semantics: stage
  definitions against DroneScore, interval math, determinism. Output `reviews/phase-2.md`.

### Phase 3. State, commands, primitives

- **3.1 State and commands** (`opus-medium`, 1500 s). `src/state/`, `src/commands/`. Document
  store with patch undo, a drag as one step. UI store. Runs store calling the worker. IndexedDB
  persistence. Command registry per spec section 8 with tests that every command has a label,
  a reason when disabled, and no shortcut collision.
- **3.2 UI primitives** (`opus-medium`, 1500 s, parallel). `src/ui/`. Tooltip timing per spec
  section 8, menus and context menu showing shortcuts and disabled reasons, command palette
  reading the registry (stub registry until 3.1 merges), Field with unit suffix, Kbd.

### Phase 4. Build workspace

All lanes parallel. Each owns one folder under `src/features/build/`.

- **4.1 Map** (`opus-high`, 2400 s). MapLibre surface, grid mode, layers for areas, reach rings
  and sectors, flight paths, threats at time t, labels. Handles per spec section 8. Right-click
  menus from the registry. 60 fps drag test.
- **4.2 Assets** (`opus-medium`, 1500 s). Asset library panel, drag ghost, drop at cursor, armed
  click placement, path drawing.
- **4.3 Inspector** (`opus-medium`, 1500 s). Fields per kind with units and entered-value source
  notes.
- **4.4 Timeline and profile** (`opus-medium`, 1800 s). F2T2EA lanes, play, scrub, loop. Profile
  view along the selected path.
- **4.5 Wiring** (`opus-high`, 2400 s, after 4.1 to 4.4). `BuildWorkspace`, root wiring
  (`TooltipProvider`, `bindKeys`, autosave, palette, shortcut sheet), one command adapter in
  `src/features/commands/`, shared units in `src/features/shared/`, one Escape owner.
- **4.R Review** (`opus-high`). Also one browser check worker for spec acceptance items 2 to 4.
- **4.F Fixes** (`opus-medium`). The 4.R findings, with a browser re-check.

### Phase 5. Results and report

- **5.1 Results** (`opus-medium`, 1800 s). `src/features/results/`. Scorecard by F2T2EA, source
  class, interval, evaluation. Run compare. Sweep charts. Chart frame with PNG and SVG export.
- **5.2 Report** (`opus-medium`, 1800 s). `src/features/report/`. AAR sections in spec order,
  hypothesis lock at first run, print stylesheet, CSV and JSON export.
- **5.3 Wiring** (`opus-medium`, 1500 s, after 5.1 and 5.2). Mount Results and Report, inject
  charts into the report, `RunSummary.predictions`, `ReportDraft.sections`, worker cancel handle.

### Phase 6. Library and templates

- **6.1 Library screen** (`opus-medium`, 1200 s). `src/features/library/`.
- **6.2 Templates and behaviors** (`fable-medium`, 1800 s). `src/domain/templates/`,
  `src/domain/behaviors.ts`. The templates in spec section 9, each ready to run, each with a
  test that it runs and scores its main measures.
- **6.3 Wiring** (`opus-medium`, 1200 s, after 6.1 and 6.2). Mount `LibraryScreen` with
  `TEMPLATES` on `/`, remove the dev vignette hack (`src/features/build/devVignette.*`), open
  the library when no vignette is stored, and run the `stat-te-terminology` check on all UI copy.
- **6.R Review** (`opus-high`, with browser). Phases 5 and 6 together: scorecard numbers against
  the engine, report sections, library flows, acceptance items 1, 5 to 9. Then **6.F**.

### Phase 7. Acceptance

- **7.1 End-to-end** (`opus-medium`, 1800 s). One Playwright suite per spec section 12 item.
- **7.2 First-use audit** (`opus-medium` with browser, 1200 s). A first-time-user walk of the
  first-use goal in spec section 1. Report friction ranked. Fixes are new lanes.
- **7.3 Budgets** (`opus-medium`, 900 s). Measure every spec section 11 budget. Report numbers.

### Phase 8. vos port (after the MVP, separate plan)

Plan from `docs/reference/vos.md` once the MVP passes phase 7.

## 7. Status

The orchestrator updates this table at each merge. `Head` is the `rebuild/mvp` commit after the
merge. Open items live in section 8, not here.

| Lane | Status | Head | Result |
| --- | --- | --- | --- |
| 0.1 to 0.3 | done | 6d81756 | Legacy baseline on `main`; legacy app in `legacy/`; 9 golden derive fixtures |
| 1.1 | done | f147f73 | Vite, React 18.3.1, TS 5.6.3, Tailwind 4.3.3, ESLint 10, Vitest 5, Playwright; tokens; shell; engine fence; `npm run gate` |
| 2.1 | done | a7bae7f | `src/domain`: types, zod, ids, catalog, 67-row DroneScore table, legacy v4 import |
| 2.2 | done | c38ec67 | `src/engine/{geo,preview}.ts`: parity with the 4 legacy seeds; 17 ms at 40 threats x 15 sensors |
| 2.3a | done | 687b842 | rangeboard 59-file trial closure in `src/engine/sim`, logic unchanged, seed 4821 byte-identical |
| 2.3b | done | c2aaeaf | adapter, run (RunRow + RunTrace), score (Wilson, bootstrap), sweep, worker and client |
| 2.R, 2.F | done | 0c8f46e | `reviews/phase-2.md`: 2 blockers, 2 majors, 8 minors; all fixed except two declared losses |
| 3.1, 3.2 | done | 6669667 | document store with patch undo, ui, runs, persist, 51 commands; 9 UI primitives |
| 3.R, 3.F | done | 343ffcc | `reviews/phase-3.md`: 1 blocker, 4 majors, 8 minors; all 13 fixed |
| 4.1 to 4.4 | done | 2c68b24 | map, assets panel, inspector, timeline and profile |
| 4.5 | done | f36b9a6 | Build workspace wired; one command adapter; shared units; entry 169 kB gzip, map chunk 296 kB |
| 5.1, 5.2 | done | f52238a | results (scorecard, charts, compare, sweep, export) and report (7 AAR sections, CSV, JSON, print) |
| 6.1 | done | 025da17 | library screen: template cards, saved vignettes, search, import, delete with undo |
| 5.3 | done | 8a832c1 | Results and Report mounted; `RunSummary.predictions`; `ReportDraft.sections`; worker cancel |
| 6.2 | done | 9a4f864 | behaviours and the 8 templates, each runs and scores (table in section 8) |
| 4.R | done | see `reviews/phase-4.md` | browser check: 3 blockers (map height, worker 404, no right-click menu), 4 majors, 8 minors |
| 4.F | done | 405bae4 | all 15 fixed; F-01 to F-07 browser-verified (`reviews/phase-4/after-4F.png`); 442 tests |
| 6.3 | next | | library wiring and dev-vignette removal |
| 6.R, 6.F | not started | | |
| 7.1 to 7.3 | not started | | |

## 8. Handoff

State on 2026-10-30, end of the first orchestration session. Phases 0 to 6 are merged on
`rebuild/mvp` with the gate green (63 test files, 442 tests) and the legacy smoke green. Nothing is
pushed. `main` holds only the legacy baseline. The tree is clean; no lane is in flight.

**Start here.** Read `CLAUDE.md`, this file (sections 5 to 8), `reviews/phase-4.md`, then the
"Open items" below. Run `npm run gate` once to confirm the baseline. Then:

1. Run 6.3 (wiring). Its brief is in section 6.
2. Run 6.R with a browser pass, then 6.F.
3. Run 7.1 to 7.3. 7.1 needs `npx playwright install chromium` (one download; ask the user first,
   the user does not allow downloads without asking). The gate gains `npm run e2e` at that point.
4. Ask the user before any push or merge to `main`.

**Approvals on record.** The user approved the phase 0 commits and the first phase 1 commit on
2026-10-30. Later lane commits on `rebuild/mvp` followed from that. Push and merge to `main` are
not approved.

**How to run a lane.** `git worktree add .worktrees/<id> -b lane/<id> rebuild/mvp`, then
`npm ci` there. The brief states: working directory, owned files, gate, report shape, time
budget, and the lanes running in parallel with their folders. The worker does not commit. The
orchestrator runs `npm run gate` in the worktree, commits on the lane branch, merges with
`--no-ff` into `rebuild/mvp`, runs the gate there, removes the worktree and deletes the branch,
then updates section 7. Workers are picked by `~/.claude/rules/delegation.md`.

**Open items.** Grouped by area. Each came from a worker report or a review; none is a guess.

Engine (`src/engine`):
- Declared losses in `adapter.ts` `LOSSES`: the Monte Carlo flies flat at the first waypoint
  altitude; waypoint holds are not flown; non-radar sensors use a hard threshold at r50 (the
  logistic width is lost); `minRangeM` is a row-side filter only.
- `RunRow` has no detecting-sensor field, so the fiber FPV template's "1.1.1 by sensor" scores the
  layer, not each sensor. Proposal: `detect_sensor: string | null` and a by-sensor split in score.
- Null-with-note rows: 2.1.1 and 3a.2 (no classify stage), 2.1.4 (`identified_ok` never false),
  5.3 and 5.8 (no inputs). A shot the engine releases on proximity without a declaration counts as
  stage `track`, outcome No Attempt.
- Preview semantics kept on review advice: Assess is unclipped (show a negative margin instead);
  Engage without a Target falls back to first effector reach and should be labelled "geometry
  only" in the UI.
- `CONFIRMED_DECLARE_FACTOR` halves `decisionS` when two phenomenologies confirm; it is a
  declared default, not shown in the UI.

Domain (`src/domain`):
- Legacy import sets site lat/lon to 0 and maps MOP text to a question note; `DEFAULT_MEASURES`
  seeds 1.1.1, 1.1.2, 2.1.2, 3.1.2; a "Target time not set" note is appended.
- `Area` has only `pts`; circles draw as polygons and the inspector guesses a circle at 16 or
  more vertices. Proposal: a `circle` field.
- `Hypothesis.value` is assumed to be in the measure's canonical unit (m, s, percent). The schema
  does not state it.
- Template thresholds at n 10, seed 1: point defence 1.1.2 3979 m, 2.1.3 3250 m, 3.1.2 100 %
  inconclusive (Wilson at n 10 cannot clear 80 %); hover 1.2.2 99.6 %; swarm 1.2.1 100 %, 3.1.1
  100 %; delta wing 1.1.2 8975 m, 3.1.3 2038 m, 3.1.4 20.6 s; fiber FPV 1.1.1 100 % inconclusive at
  n 10; surrogate 1.2.3 9.8 m; sweep baseline 1.1.2 3972 m. Proportion thresholds of 80 to 90 %
  need n of about 30 or more to be conclusive; the Run default is n 100.

State and commands (`src/state`, `src/commands`):
- The prediction lock and the run append go through `useDocument.apply` (no undo step).
- `importJson` returns `Vignette[]`; records with no schema stamp are refused.
- IndexedDB itself is untested (no `fake-indexeddb`); the persistence tests use a mock db.
- The spec has no right-click row for C2 and TSPI nodes; Duplicate and Delete were added.

Build workspace (`src/features/build`):
- `devVignette.*` opens a legacy template at startup when nothing is stored. Remove in 6.3.
- Labels are an HTML overlay because a blank MapLibre style has no glyphs offline.
- Time-dependent layers update every 100 ms during a drag (the preview budget), per frame
  otherwise.
- `reviews/phase-4.md` notes F-16 to F-19 stand (snap invisible at working zoom, map focus ring
  uses the accent, dev vignette hack, circle areas and timeline lanes not exercised).

Results and report (`src/features/results`, `src/features/report`):
- PNG export is untested (no canvas in jsdom); needs the 6.R browser pass.
- The one `@media print` light-token rule lives in `results.css` and covers both screens; it has
  no light values for `--state-covered` and `--state-warning`.
- Picked report charts render as nested `<figure>` elements.
- Stored runs older than 5.3 have no `predictions` snapshot and show `[]`.

Build and budgets:
- Entry 169 kB gzip; MapView chunk 296 kB gzip (lazy); Vite warns on the chunk size. First-load
  interactive in 2 s is not yet measured (7.3).
- The root `package.json` stays CommonJS so `legacy/test/smoke.js` runs; Vite and Playwright
  configs are `.mts`.

**Known problems for the team.**

1. Ports and the browser. Port 5173 is the user's rangeboard dev server; use
   `npm run dev -- --port 5174 --strictPort`. Local binding worked in this session. Claude in
   Chrome cannot drive native HTML5 drag; use click-to-arm then click, and say so in the report.
   A browser GIF export is a download and did not work.
2. The internet. The user does not allow downloads without asking. The JIATF 401 handbook and
   the C4 criteria are local in `~/Desktop/MASTER/VALKRYN/01 - C-UAS Doctrine and Operations/`.
   Plain-text copies need `pdftotext`. The C4 text has broken letter spacing.
3. DroneScore wins over C4. Follow DroneScore (`docs/reference/jiatf-401.md` section b). C4 prints
   the ID 5.5 twice. DroneScore uses 5.5b for the second.
4. The rangeboard engine is frozen in `src/engine/sim`. `playback/killChain.ts` is a routing
   graph, not the stage ladder. `parity.test.ts` must stay green; do not edit the transfer.
   rangeboard itself (`~/projects/rangeboard`) is read-only.
5. vos is read-only. Its work is on the unpushed branch `casey/diu-demo-local`. Do not edit vos.
6. Words. User-facing T&E text uses the `stat-te-terminology` skill. Lane 5.2 ran its check on
   the report copy; 6.3 runs it on the rest.
7. Autosave writes to IndexedDB for `localhost:5174`; a browser check leaves vignettes behind
   that the app opens on the next load. Clear site data between checks when it matters.
