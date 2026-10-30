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
- **4.R Review** (`opus-high`). Also one browser check worker for spec acceptance items 2 to 4.

### Phase 5. Results and report

- **5.1 Results** (`opus-medium`, 1800 s). `src/features/results/`. Scorecard by F2T2EA, source
  class, interval, evaluation. Run compare. Sweep charts. Chart frame with PNG and SVG export.
- **5.2 Report** (`opus-medium`, 1800 s). `src/features/report/`. AAR sections in spec order,
  hypothesis lock at first run, print stylesheet, CSV and JSON export.

### Phase 6. Library and templates

- **6.1 Library screen** (`opus-medium`, 1200 s). `src/features/library/`.
- **6.2 Templates and behaviors** (`fable-medium`, 1800 s). `src/domain/templates/`,
  `src/domain/behaviors.ts`. The templates in spec section 9, each ready to run, each with a
  test that it runs and scores its main measures.

### Phase 7. Acceptance

- **7.1 End-to-end** (`opus-medium`, 1800 s). One Playwright suite per spec section 12 item.
- **7.2 First-use audit** (`opus-medium` with browser, 1200 s). A first-time-user walk of the
  first-use goal in spec section 1. Report friction ranked. Fixes are new lanes.
- **7.3 Budgets** (`opus-medium`, 900 s). Measure every spec section 11 budget. Report numbers.

### Phase 8. vos port (after the MVP, separate plan)

Plan from `docs/reference/vos.md` once the MVP passes phase 7.

## 7. Status

The orchestrator updates this table at each merge.

| Lane | Status | Branch | Head | Notes |
| --- | --- | --- | --- | --- |
| 0.1 | done | main | a8e0331 | Legacy v4 baseline, approved by user |
| 0.2 | done | rebuild/mvp | 189a6c0 | Legacy app in `legacy/`; smoke green |
| 0.3 | done | rebuild/mvp | 6d81756 | 9 fixtures; `golden.js --check` green; `Date` fixed to 2026-01-01Z in the vm; templates have no paths, so parity rests on the 4 seeds |
| 1.1 | done | rebuild/mvp | f147f73 | Gate green; bundle 59 kB gzip; root stays CommonJS for the legacy smoke, so Vite and Playwright configs are `.mts`; Tailwind 4.3.3, zod 4.x |
| 2.1 | done | rebuild/mvp | a7bae7f | 67 measure rows; 4 seeds and 5 templates import and validate; 24 tests. Open: site lat/lon import as 0 (legacy has no origin); MOP text goes to a question note, not to measure ids; sensor model planning defaults in `catalog.ts` need review by 2.2 and 2.3b |
| 2.3a | done | rebuild/mvp | 687b842 | 59 files, 16.1k lines, logic unchanged (only `!` for noUncheckedIndexedAccess); seed 4821 `runTrial` byte-identical to rangeboard 87a6579, frozen in `src/engine/sim/__fixtures__`; 19 of 44 rangeboard tests copied, 25 dropped (deps outside the closure: seed.ts, store, persist); headless Node run OK |
| 2.2 | done | rebuild/mvp | c38ec67 | Parity on 4 seeds (windows, first, vols, daEntry, timed, splits); 17 ms median at 40x15; 48 tests. For 2.R: Assess = max(engage+tte, effector window start) with no clip (follows legacy source, not legacy-app.md); Engage without a Target falls back to first effector reach; group membership via `opts.groupKeys` since migrate keeps path groups only as notes |
| 2.3b | done | rebuild/mvp | c2aaeaf | adapter, run (RunRow + RunTrace), score (Wilson, seeded bootstrap), sweep (5 factors), worker and client; 224 tests, engine suite 1.1 s. Null with note: 2.1.1, 3a.2 (no classify stage), 2.1.4 (identified_ok never false), 5.3, 5.8 (no inputs). Logistic width lost for non-radar (hard threshold at r50); waypoint holds not modelled; worker untested in a browser; nothing in `src/engine/sim` was unreachable |
| 2.R | next | | | |
| 3.1 to 7.3 | not started | | | |

## 8. Handoff

State on 2026-10-30: phases 0 and 1 are done on `rebuild/mvp`. The tree is clean. Nothing is pushed.
Lanes run in git worktrees under `.worktrees/<id>` (ignored by git, ESLint and Prettier).

**Next action.** Run 2.1 and 2.3a in parallel. Then run 2.2 and 2.3b in
parallel, then 2.R. The lane text in section 6 is the brief. Add the standard brief items from
section 5 rule 3 when you launch it.

**Approval.** The user approved phase 0 commits. Ask the user before the first commit of phase 1,
and before any push or merge to `main`.

**Known problems for the team.**

1. The local port and the browser. In an earlier session the sandbox blocked local port binding,
   and Claude in Chrome could not open `file://` pages. A browser check needs `npm run dev`
   reachable. If binding fails, the user can set `sandbox.network.allowLocalBinding: true`.
2. The internet. The user does not allow downloads. The JIATF 401 handbook and the C4 criteria are
   local in `~/Desktop/MASTER/VALKRYN/01 - C-UAS Doctrine and Operations/`. Plain-text copies
   need `pdftotext`. The C4 text has broken letter spacing. Remove the spaces before you search it.
3. DroneScore wins over C4. DroneScore leaves out some C4 rows and adds the `INT-` rows. Follow
   DroneScore (`docs/reference/jiatf-401.md` section b). C4 prints the ID 5.5 twice. DroneScore
   uses 5.5b for the second.
4. The rangeboard engine. `src/playback/killChain.ts` is a sensor to C2 to effector routing graph.
   It is not the stage ladder. The stages are in `src/analysis/requirements.ts`. One trial needs
   59 files (`docs/reference/rangeboard-parts.md` section 2).
5. Parity. The templates have no flight paths. Lane 2.2 parity rests on the 4 seeds.
   `legacy/test/golden.js` fixes `Date` in its vm, because templates stamp the wall clock.
6. vos is read-only. Its work is on the unpushed branch `casey/diu-demo-local`. Do not edit vos.
7. Words. User-facing T&E text uses the `stat-te-terminology` skill. Run its banned-term check
   on the UI copy and the AAR template.

