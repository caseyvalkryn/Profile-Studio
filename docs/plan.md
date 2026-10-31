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
| Board | `src/board/`: the legacy SVG renderer ported one to one (three cameras, the layer registry). maplibre-gl was the MVP map; lane 9.2.6 removes it |
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
src/board/         pure TS port of the legacy renderer: scene adapter, cameras, symbols, layers, render
src/features/      shell/, library/, build/{board,rail,palette,menu,tip,inspector,readout,events,debrief}/,
                   strip/{timeline,chart}/, brief/{cards,notes}/, results/, report/  (phase 9 layout)
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

Plan from `docs/reference/vos.md` once the MVP passes phase 7 and phase 9.

### Phase 9. Port of the artifact interface (rewritten 2026-10-31)

Decision of 2026-10-31 (afternoon): the upgrade ports the legacy interface one to one onto the
MVP's engine, domain and state. It does not retrofit legacy behaviours onto the MapLibre board.
Reasons on record in `docs/reference/artifact-study.md` section 5. The first draft of this phase
(morning of the same day, a retrofit in six sub-phases with three.js) is replaced by this text.

Scope and decisions: `docs/reference/artifact-study.md` sections 3, 4 and 5; `docs/spec.md` as
amended on 2026-10-31; `docs/design-principles.md`. The integration branch stays `rebuild/mvp`.
Lanes branch from it as `lane/9.x.y`. Section 5 rules apply. Each sub-phase ends with a review
lane with a browser pass, a fix lane, and the user's approval before the merge to `rebuild/mvp`.
The user approves each npm install (a download): 9.1.1 needs one.

**What stays.** `src/domain`, `src/engine` (the frozen `sim/` transfer included), `src/state`,
`src/commands` (the registry), `src/ui`, `src/features/results`, `src/features/report`, and
their tests. Results and Report move into the ported shell unchanged.

**What goes.** `src/features/build/{map,assets,inspector,timeline,profile}`,
`src/features/library`, the MapLibre dependency and its mocks, and the current end-to-end
specs' selectors. Each is deleted in the wiring lane that replaces it, never earlier.

**The oracle.** The legacy app runs beside the port on the same dev server at
`/legacy/index.html` (verified 2026-10-31). Every UI lane ends with a parity check: the worker
opens the same seed profile in both apps (`CUAS-001` from `fixtures/legacy-derive/`, imported
through `src/domain/migrate.ts`), at the same camera, zoom and time, at 1440 x 900, and saves
the pair as `reviews/phase-9.<n>/<lane>-<view>-legacy.png` and `-port.png`. The report lists
every visible difference and marks each one intended (cite the spec line) or a defect. The
review lane reads the pairs; it does not retake them unless a pair is missing.

**The renderer contract.** `src/board/` is a pure TypeScript port of `legacy/js/40-cameras.js`,
`41-symbols.js`, `42-layers.js`, `43-layer-*.js` and `44-render.js`: no React, no store, no DOM.
Layers keep the legacy signature `draw(ctx)` and return SVG fragment strings, so
`legacy/test/cases/render.js` ports as the test. `ctx` keeps the legacy fields (`record`,
`derived`, `cam`, `t`, `sel`, `hover`, `focus`, `origin`, `hit()`), where `record` is a `Scene`
built by `src/board/scene.ts` from `Vignette` v6 (sensors, effectors and nodes as `systems`,
areas as `volumes`, threats as `aircraft` and `paths`), and `derived` is `src/engine/derived.ts`
built from `Preview`: the fields of `docs/reference/legacy-app.md` section 5 with F2T2EA stages
in place of the five-rung ladder. The board view mounts one `<g>` per layer and rewrites only
the layers whose inputs changed, so a time tick does not rebuild the scene (the legacy flaw in
`artifact-study.md` section 2, "What it does badly").

**Owned-file rule.** `src/commands/commands.ts`, `src/App.tsx`, `src/state/ui.ts` and the
composed workspace files (`BuildWorkspace.tsx`, `BriefWorkspace.tsx`) belong to one lane per
sub-phase: the shell lane in 9.1, the wiring lane after that. Other lanes export their commands
and panels from their own folder; the wiring lane registers and mounts them.

**References per lane.** Every brief names `docs/design-principles.md`, the spec sections the
lane implements, `docs/reference/artifact-study.md` section 2 for the behaviours it ports, and
`docs/reference/legacy-app.md` for the inventory. The legacy files to port are listed on each
lane; the worker reads them whole before it writes. The port is one to one: same behaviours,
same words, same numbers (delays, snap radii, clamps). A worker who changes one records it in
the report with the reason.

#### 9.1 Foundation (four lanes in parallel)

- **9.1.1 Type system, tokens, icons** (`opus-medium`, 1800 s, needs install approval:
  `@fontsource/archivo`, `@fontsource/jetbrains-mono`, `lucide-react`). Port
  `legacy/css/tokens.css` whole into `src/styles/tokens.css`: the two families, the five-step
  scale with line heights, weights 400 and 500, tabular numerals, caps tracking, three stroke
  weights, layout tokens (list column 232 px, right column 320 px, top bar 48 px, strip 112 px,
  control heights, row heights), the coarse-pointer sizes and the full-stage scale. The MVP
  palette and the single accent stay (study decision 4). `src/styles/base.css` and the Tailwind
  theme read the tokens; `src/ui/Icon.tsx` wraps Lucide with a label slot; the print
  stylesheets keep the light theme. Owned: `src/styles/`, `src/ui/Icon.tsx`, `index.html`,
  `package.json` (the install only). Gate: `npm run gate`; screenshots of Results and Report at
  1440 x 900 in both themes.
- **9.1.2 Domain v6** (`opus-high`, 2400 s, pure data). `src/domain/types.ts` and `schema.ts`
  per spec section 5: `planes`, `events`, `snapshots`, `cards`, `debrief`, `Area` bottom and
  top, `Threat.group`. Stamp `profile-studio/6`; v5 to v6 migration; the legacy v4 import keeps
  every one of those fields; export without loss. Test: each legacy seed and template in
  `legacy/js/12-seed.js` round-trips import, export, import with deep equality on the mapped
  fields (spec acceptance item 18 as a unit test). Legacy: `legacy/js/11-schema.js`,
  `12-seed.js`. Owned: `src/domain/`, `fixtures/`.
- **9.1.3 Shell, keys, dialogs** (`opus-high`, 3000 s). Port `legacy/css/app.css` (the
  columns: rail, centre, right; the strip; the overlay slots; the sheet),
  `legacy/js/51-panel-topbar.js` (mode segment, name field with inline rename, id and version,
  undo and redo with the pending label, Export, Import, theme, Help), `90-app.js` (theme cycle
  and persistence, undo toast "Undid: set R1 range.", mode enter and leave), `46-keys.js` (the
  full key table into the command registry with scopes per workspace, platform names),
  `51-panel-help.js` (the cheat sheet generated from the registry) and `51-panel-dialog.js`
  (export and import dialogs). Five workspaces: Library, Build, Results, Report, Brief; the
  Build and Brief centres are placeholders until 9.2 and 9.4. `ui` state: `view` (`plan`,
  `elevation`, `3d`), panel visibility (inspector I, both side panels \, strip tab R, layer
  chips, readout strip, events, debrief, snapshots; all hidden by default except the four
  default panels), `theme`, `units`. Results and Report mount in the new shell. Owned:
  `src/App.tsx`, `src/state/ui.ts`, `src/features/shell/`, `src/commands/`,
  `src/features/commands/`.
- **9.1.4 Library and New** (`opus-medium`, 2400 s). Port `legacy/js/51-panel-collect.js`:
  the grid grouped by collection, newest first; search by id, name, collection and purpose;
  the New split button (instant "Untitled profile" with the default site and one defended
  asset, open Build, focus the name field; the arrow offers the templates, Blank last);
  per-card Open, Brief, Duplicate, Export, Delete with an inline confirm row and undo;
  library-level Import (v6, v5, legacy v4) and Export as one JSON; thumbnails through
  `src/board` once 9.2 lands (a placeholder until then). Every user-facing "vignette" becomes
  "profile" across the app (`stat-te-terminology` check on the diff). Commands exported from
  the folder: `profile.new`, `profile.newFromTemplate`, `library.export`, `library.import`.
  Owned: `src/features/library/`, `src/state/persist.ts`. Tests: New in a fresh store, rename
  shows in the library, export and import round-trip.
- **9.1.R Review** (`opus-high`, with browser; parity pairs for Library and the top bar) and
  **9.1.F Fixes** (`opus-medium`). Merge order: 9.1.1, 9.1.2, 9.1.4, 9.1.3.

#### 9.2 Board (round A: 9.2.1 to 9.2.4 in parallel; round B: 9.2.5; then 9.2.6)

- **9.2.1 Engine parity** (`fable-medium`, 2400 s). `src/engine/derived.ts` builds the
  renderer's `derived` object from `Preview` (contract above). New engine files per spec
  section 6: `at.ts` (6.5), `tokens.ts` (6.6), `envelopes.ts` (`envelopesAt`, the sticky link
  graph and `splitTimes` where `preview.ts` lacks them), `trackLine.ts` (pending, unknown,
  identity, coast after `COAST_S`, lost), `crossings.ts`, `stops.ts` (events, stage times,
  splits, first sees), `rangeSeries` for the chart. Parity tests against
  `fixtures/legacy-derive/` and the cases in `legacy/test/cases/derive.js`. Legacy:
  `legacy/js/21-derive.js`, `20-geo.js`, `34-time.js` (`stops`). Owned: `src/engine/` except
  `sim/`; new files, plus exports added to `preview.ts`.
- **9.2.2 Board renderer** (`opus-high`, 3600 s). `src/board/`: `scene.ts` (the adapter),
  `cameras.ts` (plan; elevation with the Along path and From asset modes, spec section 7;
  axon with orbit math, the pitch clamp 8 to 86 degrees, the yaw and pitch rates, and the
  "vertical x3 yaw -35 pitch 55" hint), `symbols.ts`, `layers.ts` (the registry and chip
  list), one file per layer under `layers/` (grid, volumes, planes, reach, systems, envelopes,
  paths, telemetry, events, tracks, handles, labels), `render.ts` (compose, card and thumbnail
  render, the hit list). Tests: `legacy/test/cases/render.js` ported; a snapshot of every seed
  in all three cameras. Legacy: `legacy/js/40-cameras.js`, `41-symbols.js`, `42-layers.js`,
  `43-layer-*.js`, `44-render.js`. Owned: `src/board/`.
- **9.2.3 Rail, palette, menu, tip** (`opus-high`, 3000 s). Port `legacy/js/51-panel-rail.js`
  (the asset list by group with values, the add buttons), `51-panel-palette.js` (quick add
  with search, group headers, catalog values per row, shortcut hints; A opens it, S, V and E
  open it on a group; the formation popover), `51-panel-menu.js` (`actionsFor` per kind: every
  item in `legacy-app.md` section 6, including Set top, Set bottom, Add height plane, Split
  here, Merge, Save card as a stub until 9.4) and `51-panel-tip.js` (400 ms stable hover, id,
  name and one or two facts, follows the pointer, flips from edges). The palette joins the
  MVP command palette as its Add group. Commands exported from each folder. Owned:
  `src/features/build/rail/`, `palette/`, `menu/`, `tip/`, `src/ui/Palette.tsx`.
- **9.2.4 Inspector and readout** (`opus-high`, 3600 s). Port
  `legacy/js/51-panel-inspector.js` (fields per kind in `legacy-app.md` section 6: threat with
  the waypoint table, sensor and effector with every limit, area with bottom, top and the
  vertex table, height plane, authored event with its warning, group, card; the profile block:
  name, id, class, collection, purpose, units, datum, site elevation, link distance; the
  telemetry block) and `51-panel-readout.js` (follows selection then hover, pin a baseline,
  deltas in colour during a drag against the pre-drag record, "Margin +0:12 (-0:04)"). The
  MVP's questions and hypotheses block moves into the inspector's profile section unchanged.
  Owned: `src/features/build/inspector/` (replaced), `src/features/build/readout/`.
- **9.2.5 Board view, gestures, tools** (`fable-medium`, 3600 s, after 9.2.2 merges). Port
  `legacy/js/51-panel-board.js` (select, drag with the pre-drag ghost, pan by middle button,
  Space or touch, pinch, wheel zoom at the cursor, axon orbit by drag, double-click, right-click
  and the 500 ms long press, the ruler, rectangle placement, the drag label with the largest
  downstream change) and `45-tools.js` (place, move, snap to grid, rings, vertices and edges
  within 8 px, 15 degree bearings with Shift, Alt bypass, the snap name and leg text on the
  ghost, clipboard, duplicate, reverse, formation, sector and omni, group split and merge,
  `saveCard`), with the board keys (nudge, Tab cycle, 0 fit, zoom keys, G, M). Mounts
  `src/board` one `<g>` per layer with memoized inputs. Hit testing through the legacy `hit`
  list. Owned: `src/features/build/board/`, `src/board/layers/handles.ts`.
- **9.2.6 Wiring** (`opus-high`, 2400 s, after 9.2.5). Composes `BuildWorkspace` from the
  rail, the board, the strip host (the MVP timeline stays mounted until 9.3), the readout and
  the inspector; registers every exported command; one Escape owner; deletes
  `src/features/build/{map,assets,profile}` and the MVP inspector, removes `maplibre-gl` and
  its mocks, repoints the Library thumbnails to `src/board`; updates the 12 end-to-end specs
  to the new DOM (selectors only, behaviour unchanged) so the gate stays green. Owned: the
  shell files, `src/features/build/BuildWorkspace.tsx`, `src/features/shared/`, `e2e/`,
  `package.json`.
- **9.2.R Review** (`opus-high`, with browser; parity pairs in all three views for every seed;
  acceptance items 2, 3, 4, 13, 14, 15) and **9.2.F Fixes**.

#### 9.3 Strip, events and debrief (9.3.1 to 9.3.3 in parallel; then 9.3.4)

- **9.3.1 Timeline and authored events** (`fable-medium`, 3600 s). Port
  `legacy/js/51-panel-timeline.js` (scrub on the axis, Shift-drag loop range, Ctrl-wheel time
  zoom at the pointer, the overview bar, double-click clears the range, bead drag with
  `snapBead` to a geometry crossing within 3 s and Alt bypass, one undo step "Move e3",
  tooltips) onto the spec's rows: one row per threat, the six F2T2EA lanes, planned beads with
  letter glyphs, simulated stage times from the latest run's `RunTrace`, flown times from the
  debrief when present (a documented store field that 9.3.3 fills). `src/engine/events.ts`
  (`checkEvents`, spec 6.7) with the legacy warning text; warning triangles; Move to geometry;
  Add event here on a path and on the timeline; the hidden event list. Owned:
  `src/features/strip/timeline/`, `src/features/build/events/`, `src/engine/events.ts`.
- **9.3.2 Time engine and chart strip** (`opus-medium`, 2400 s). Port `legacy/js/34-time.js`
  (one frame per tick, the 0.25 s clamp, the rate menu, loop, `playTo`, the time cursor T,
  `[` and `]` through `stops`, Home and End) into `src/state/time.ts` and `usePlayback`; port
  `51-panel-chart.js` (range and closing speed at t, click to seek, hover detail); the strip
  tabs timeline, chart and readout with R to cycle. Owned: `src/features/strip/` except
  `timeline/`, `src/state/time.ts`.
- **9.3.3 Debrief** (`opus-high`, 2400 s). `src/engine/debrief.ts` (`resample`, spec 6.8; the
  TSPI text parser from `legacy/js/33-persist.js` and a CSV parser with t, x, y, z per path).
  The debrief panel: paste or load, source note, per-threat mapping, clear. The flown samples
  and frame in the telemetry layer (`legacy/js/43-layer-telemetry.js`, already ported; this
  lane adds the flown branch). The flown stage times in the store field 9.3.1 reads. Owned:
  `src/engine/debrief.ts`, `src/features/build/debrief/`, `src/board/layers/telemetry.ts`.
- **9.3.4 Wiring** (`opus-medium`, 1500 s). Mounts the strip, registers the commands, deletes
  `src/features/build/timeline`, reconciles the flown field. Owned: the shell files.
- **9.3.R Review** (`opus-high`, with browser; acceptance items 16 and 17) and **9.3.F Fixes**.

#### 9.4 Brief (9.4.1 first; then 9.4.2 and 9.4.3 in parallel; then 9.4.4)

- **9.4.1 Cards store and card commands** (`opus-medium`, 1800 s). The cards slice of the
  document store: save with the legacy defaults, reorder, duplicate, delete, one undo step per
  field edit. Save card (C) fills the 9.2.3 stub; the card menu (Apply view, Open in Brief,
  Up, Down, Delete); card thumbnails through `src/board` `render.card`. Legacy:
  `legacy/js/45-tools.js` (`saveCard`, `saveClip`), `30-store.js` (card reducers). Owned:
  `src/state/document.ts` (cards slice), `src/features/brief/cards/`.
- **9.4.2 Stage and presenter** (`fable-medium`, 3600 s, after 9.4.1). Port
  `legacy/js/51-panel-stage.js`, `51-panel-cards.js` (`brief.begin`, `end`, `enter`, `step`)
  and the `card.*` actions of `90-app.js`: the card strip, the stage that drives the board at
  the card's view and time with its timeline strip, the caption with resolved tokens, the
  readout strip (K), the head ("n. Name", "n of m", the view, `t+m:ss`), the aids (next card
  thumbnail, elapsed clock, "Last card"), full stage (F) with the larger scale, blank stage
  (B), hints that fade after 3 s, clip playback with beats through `playTo`, Space, Right,
  Left, Home, End, 1 to 9, N, Up, Down, the phone layout with swipe. Enter and leave restore
  the Build view. Owned: `src/features/brief/` except `cards/` and `notes/`.
- **9.4.3 Notes, capture, attachments, export** (`opus-high`, 2400 s, parallel with 9.4.2).
  Port `legacy/js/51-panel-notes.js` (notes and caption with live token preview and reasons,
  the clip fields with the legacy parse rules and error text, the inline delete row), writing
  every field to the store on input. Capture: the stage SVG to a PNG blob in a session store,
  never persisted; attach an image file; `brief.css` print stylesheet, one page per card; card
  PNG; the report embed of a card. Owned: `src/features/brief/notes/`,
  `src/features/brief/capture.ts`, `src/features/brief/brief.css`, `src/features/report/`
  (embed only).
- **9.4.4 Wiring** (`opus-medium`, 1500 s). Mounts Brief, scopes the Brief keys, registers
  the card commands, `stat-te-terminology` check on all new copy. Owned: the shell files.
- **9.4.R Review** (`opus-high`, with browser; parity pairs for the stage with each seed's
  cards; acceptance item 19) and **9.4.F Fixes**.

#### 9.5 Acceptance

- **9.5.1 End-to-end** (`opus-medium`, 2400 s). One Playwright spec per spec section 12 item
  12 to 19. Items 1 to 11 stay green.
- **9.5.2 First-use re-walk** (`opus-medium` with browser, 1200 s). Item 20. Friction ranked;
  fixes are new lanes.
- **9.5.3 Budgets** (`opus-medium`, 900 s). Item 21: every section 11 row, with numbers in
  `reviews/phase-9-budgets.md`.
- **9.5.R Review** (`opus-high`): the whole upgrade against the principles, with one parity
  pair per legacy panel; then **9.5.F**.

#### Deferred, not in phase 9

- Imagery underlay: a raster tile image under the plan camera from a configurable URL, on when
  online with a one-line message when not. One lane after 9.5, only when the user asks.
- Perspective 3D with terrain (three.js): an open item. The ported axon view is the 3D view of
  this phase. Reopen only if the user wants perspective and terrain.
- The ladder table: out (study section 3). The scorecard by F2T2EA replaces it.

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
| 6.3 | done | 26074c3 | Library on `/` with the 8 templates; dev vignette removed; empty state on Build, Results, Report without a document; 445 tests |
| 6.R | done | e053836 | `reviews/phase-6.md`: 2 blockers (Results unscoped to the document, no sweep control), 3 majors, 7 minors, 6 notes; 16 screenshots |
| 6.F | done | f5d8f5b | all 16 worked findings fixed; F-15 (labels, F2T2EA lanes) and F-17 (chunk size) stand; 7 browser screenshots; 462 tests |
| 7.2 | done | see `reviews/phase-7-first-use.md` | first-use goal met (76 s of tool time, under 10 min); 2 major and 8 minor friction items; F-15 stands; 23 screenshots |
| 7.1 | done | 39342af | 12 Playwright specs (section 12 items 1 to 10, phase 6 F-01 and F-04) on `vite preview` port 5175; item 11 as `src/engine/headless.test.ts`; `npm run gate` now ends with `npm run e2e`; 463 unit tests |
| 7.3 | done | c2e6699 | `reviews/phase-7-budgets.md`: all 5 section 11 budgets pass on an M4 Pro; run 200 x 6 at 2.3 s has the least margin; perf spec in `e2e/perf/` outside the gate |
| 7.4 | done | dfd06d1 | templates: laydowns spread (25 px or more apart at the default view), unit-free questions, hover limit in plain words (FR-01, FR-04, 6b); no threshold changed |
| 7.5 | done | dc57e29 | map: stacked-hit cycling on repeat click, area interior hits, label collision avoidance (FR-01, FR-05, 3c); FR-10 not reproduced, declared loss |
| 7.6 | done | d58dbbc | timeline: six labelled F2T2EA lanes per threat row, 96 px gutter, 64 px rows (F-15, 3b) |
| 7.7 | done | 38e0e8f | top bar: run-done note stays until Results or a user edit; sweep progress as test points done of total (FR-03, FR-09) |
| 7.8 | done | 76e4d98 | commands: "Measure from here" shows `M` through a display-only `shortcutFrom` (1a) |
| 7.9 | done | 0540850 | report: asset positions from the site in the factor table and scope of inference; simulation limits generated from the vignette (FR-02, 6b) |
| 7.10 | done | 5f8cf3b | results: value and limits print apart, up to 4 decimals; sweep y-axis title `<ID>, <unit>` (FR-06, FR-08) |
| 7.11 | done | 1be3e17 | library: a template copy saves after its first edit, not on open (FR-07) |
| 7.R | done | cabd251 | `reviews/phase-7-fixes.md`: 0 blockers, 3 majors (hover limit stated three times, non-DroneScore measure names in template text, 4-decimal float noise), 11 minors, 6 notes; 26 screenshots; FR-01 to FR-09, 1a, 3b, 3c confirmed fixed in the browser |
| 7.F | done | 6d3ac25 | 17 fixed; F-11 (Swarm start stack, inspector header) and F-19 ("at the site" wording) partial; F-18 stands by design; 7 browser screenshots (`reviews/phase-7-fixes/after-7F-*.jpg`); 526 tests |
| 7.G | done | bdbd9b9 | 7.F follow-ups: inspector "n of m" header while cycling a stack and Swarm starts 420 m apart (F-11); "at the site" for a zero offset (F-19); sweep note in `src/state/runs.ts` (F-12); small-area label obstacle tests; report limits state the logistic width and minimum range losses, delta wing note no longer repeats the altitude limit; 9 browser screenshots (`after-7G-*.jpg`); 536 tests |
| 9.1.1 | done | 22c891d | Archivo and JetBrains Mono bundled from `@fontsource` (400, 500); legacy type and layout tokens in `src/styles/tokens.css` with the MVP palette kept; `src/ui/Icon.tsx` over Lucide; entry 80.8 kB gzip; 538 tests |
| 9.1.2 | done | 0613db2 | domain v6: `planes`, `events`, `snapshots`, `cards`, `debrief`, `Threat.group`; stamp `profile-studio/6`; v5 to v6 migration inside `parseVignette`; legacy v4 import keeps planes, events, snapshots, cards, data list, debrief and collection (as `site.name` when empty); nine fixture round-trips; 552 tests |
| 9.1.4 | done | 5c03126 | Library ported from `51-panel-collect.js`: grid by site, search, New split button (instant "Untitled profile", templates Blank last), inline delete confirm with undo, `exportLibrary`; `libraryCommands` exported, registered after 9.1.3; "profile" wording in Results, Report, runs; stored v5 records migrate on load; 564 tests |
| 9.1.3 | done | 875d920 | shell ported from `app.css`, `51-panel-topbar.js`, `90-app.js`, `46-keys.js`, `51-panel-help.js`, `51-panel-dialog.js`: five workspaces, top bar with New split button and inline rename, workspace-scoped key table (spec section 8 wins over legacy keys), sheet generated from the registry, export and import dialogs, theme cycle under `profileStudio.ui`, undo toast; stubs with a reason for every later-lane key; `profile.new` and `profile.newFromTemplate` wired from the Library after merge; 584 tests |

## 8. Handoff

State on 2026-10-31, end of the sixth session (a planning session, no code lane). The MVP is
done: phases 0 to 7 and their fix lanes are merged on `rebuild/mvp` with the gate green (69 unit
test files, 536 tests, 12 Playwright specs on `vite preview`, build), and `main` is at the
fourth-session merge (21e96c2) on `origin`. The fifth session (morning) wrote
`docs/reference/artifact-study.md`, amended the spec and the principles, and drafted phase 9 as
a retrofit of the MVP board with three.js. The sixth session (afternoon) compared both apps side
by side and replaced that draft: phase 9 is now a one-to-one port of the legacy interface onto
the MVP engine (section 6, phase 9; study section 5 for the reasons). The spec, the principles,
the study, CLAUDE.md and sections 2 and 3 of this file were amended to match. No lane is in
flight; no worktree exists. `rebuild/mvp` is ahead of `origin` until the user approves a push.

**Orchestrator prompt.** Paste this to start the next session:

```text
You are the orchestrator for Profile Studio at /Users/caseytalbot/Projects/profile-studio,
branch rebuild/mvp. Read CLAUDE.md, docs/design-principles.md, docs/spec.md, then docs/plan.md
sections 5, 6 (phase 9), 7 and 8, then docs/reference/artifact-study.md and
docs/reference/legacy-app.md. Run `npm run gate` to confirm the baseline: 69 unit files, 536
tests, 12 e2e specs, build green.
If `git status` shows CLAUDE.md and the four planning docs modified, that is the sixth
session's phase 9 rewrite: ask me, then commit it before any lane.

Phase 9 is the work: a one-to-one port of the legacy interface (legacy/) onto the MVP engine,
in five sub-phases, each ending with a review lane with a browser pass and parity pairs, a fix
lane, and my approval before its merge to rebuild/mvp. Start with sub-phase 9.1: ask me to
approve the npm install for 9.1.1, then launch 9.1.1, 9.1.2, 9.1.3 and 9.1.4 in one message,
each in its own worktree. Section 5 rules apply: one worker per lane in a worktree under
.worktrees/<id>, workers do not commit, gate and git diff --stat before each --no-ff merge,
gate on rebuild/mvp after, worktree removed, status table and section 8 updated. The renderer
contract, the owned-file rule, the parity check and the references per lane in section 6
phase 9 go into every brief, with the legacy files the lane ports named in full.

Ask me before any download (npm install included), any push, and any merge to main.
```

**Start here.** Read `CLAUDE.md`, the principles, the spec, this file (sections 5 to 8), the
study and the legacy inventory. Run `npm run gate` once to confirm the baseline (69 unit files,
536 tests, 12 e2e). Then:

1. Sub-phase 9.1. Ask the user to approve the install for 9.1.1 (`@fontsource/archivo`,
   `@fontsource/jetbrains-mono`, `lucide-react`). Launch the four 9.1 lanes in one message.
   9.1.2 is pure data and conflicts with nothing. 9.1.3 owns the shell files and
   `src/commands/`; 9.1.4 exports its commands from `src/features/library/`; 9.1.1 owns
   `src/styles/`. Merge in order 9.1.1, 9.1.2, 9.1.4, 9.1.3, gate after each. Then 9.1.R with a
   browser pass on port 5174 and the legacy app at `/legacy/index.html`, then 9.1.F, then the
   user's approval.
2. Sub-phases 9.2 to 9.5 follow the same rhythm. 9.2 has two rounds (9.2.5 waits for 9.2.2).
   Record each merge in section 7 and each phase review in `reviews/phase-9.<n>.md`, with the
   parity pairs under `reviews/phase-9.<n>/`.
3. Phase 8 (vos port) is a separate plan, after phase 9. Any item under "Open items" and the
   deferred items at the end of phase 9 run as their own lane only when the user asks.

**Brief shape for phase 9 lanes.** Working directory (`.worktrees/<id>`); the lane text from
section 6 verbatim; the legacy files to port, read whole before writing; the renderer contract
and the owned-file rule; the files it must not touch; the spec sections and acceptance items
it serves; the gate (`E2E_PORT=<port> npm run gate`); the parity check and where the pairs go;
the report shape (what changed, every difference from the legacy behaviour with its reason,
tests added, what is open, screenshots); the time budget from section 6; the lanes running in
parallel and their folders. Workers write user-facing text in the `stat-te-terminology`
vocabulary and the principles' words (profile, card, clip, beat, capture, Elevation, 3D).

**Approvals on record.** The user approved the phase 0 commits, the first phase 1 commit, one
merge to `main` with a push, and the Playwright Chromium download, all on 2026-10-30. At the
end of the third session the user approved a second push and merge to `main`, and at the end
of the fourth session a third (both 2026-10-30). Each later push or merge to `main` needs its
own approval.

**How to run a lane.** `git worktree add .worktrees/<id> -b lane/<id> rebuild/mvp`, then
`npm ci` there. Parallel lanes each run the full gate with their own preview port:
`E2E_PORT=<port> npm run gate` (`playwright.config.mts` reads it; 5181 to 5189 were used).
`*.tsbuildinfo` is ignored since the third session; two such files slipped into lane commits
before that and were removed. The brief states: working directory, owned files, gate, report shape, time
budget, and the lanes running in parallel with their folders. The worker does not commit. The
orchestrator runs `npm run gate` in the worktree, commits on the lane branch, merges with
`--no-ff` into `rebuild/mvp`, runs the gate there, removes the worktree and deletes the branch,
then updates section 7. Workers are picked by `~/.claude/rules/delegation.md`.

**Open items.** Grouped by area. Each came from a worker report or a review; none is a guess.

Deferred from phase 9 (section 6): the imagery underlay for the plan camera, perspective 3D with
terrain (three.js), and the ladder table. Each runs only when the user asks.

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
- Entered-class measures (2.3 Track Quantity on the Swarm template) score from the asset's
  entered value with no interval (6.F F-05). The sweep factor lives on `Vignette.sweep`.
- Lane 7.4 (2026-10-30) spread every laydown so point assets are 24 px or more apart at the
  default Build view (rule and spacing test in `src/domain/templates/build.ts` and
  `templates.test.ts`). No threshold changed. At n 100, seed 1 every main measure still Meets;
  point defence 2.1.3 fell from 3637 to 2992 m (threshold 2000 m), delta wing 3.1.3 is 2257 m
  and seed-sensitive (Meets at 2 of 5 seeds, inconclusive at the others, as before the move).
  The n 10 figures below predate the move.
- Template thresholds at n 10, seed 1 (before 7.4): point defence 1.1.2 3979 m, 2.1.3 3250 m, 3.1.2 100 %
  inconclusive (Wilson at n 10 cannot clear 80 %); hover 1.2.2 99.6 %; swarm 1.2.1 100 %, 3.1.1
  100 %; delta wing 1.1.2 8975 m, 3.1.3 2038 m, 3.1.4 20.6 s; fiber FPV 1.1.1 100 % inconclusive at
  n 10; surrogate 1.2.3 9.8 m; sweep baseline 1.1.2 3972 m. Proportion thresholds of 80 to 90 %
  need n of about 30 or more to be conclusive; the Run default is n 100.

State and commands (`src/state`, `src/commands`):
- `toggleCompare` counts compare keys from other vignettes against `MAX_COMPARE`, so hidden keys
  can block compare checkboxes (6.F report).
- Undo and redo never change a locked hypothesis (`keepLocked` in `document.ts`, 6.F F-04).
- The prediction lock and the run append go through `useDocument.apply` (no undo step).
- `importJson` returns `Vignette[]`; records with no schema stamp are refused.
- IndexedDB itself is untested (no `fake-indexeddb`); the persistence tests use a mock db.
- The spec has no right-click row for C2 and TSPI nodes; Duplicate and Delete were added.

Build workspace (`src/features/build`):
- Labels are an HTML overlay because a blank MapLibre style has no glyphs offline.
- Time-dependent layers update every 100 ms during a drag (the preview budget), per frame
  otherwise.
- `reviews/phase-4.md` notes F-16 and F-17 stand (snap invisible at working zoom, map focus
  ring uses the accent). Label overlap and the missing F2T2EA timeline lanes (phase 6 F-15) were
  fixed by lanes 7.5, 7.6 and 7.F; `reviews/phase-7-fixes.md` records the browser evidence.
- Map labels avoid other labels, markers and small areas (`src/features/build/map/labels.ts`
  `areaObstacle`, unit-tested in 7.G), but still cross sector and ring lines.
- Wheel zoom drift (7.2 FR-10) did not reproduce in 7.5 or 7.R: the point under the pointer
  stayed within 1 px over 4 wheel steps. No code changed. Re-check with a physical wheel.
- Stacked-hit cycling: a repeat plain click at the same pixel selects the next target in the
  stack (`hit.ts` `hitAll`, `pickHit`, `nextHit`). The controller writes the stack position to
  `ui.stack` and the inspector header shows "n of m" from the first click into a stack of two
  or more; Escape, undo and an outside selection end the cycle (7.G). Swarm starts are 420 m
  apart (29 px at the default 1440 x 900 view, about 17 px at 1200 x 863). A Swarm start that
  lies on the RF-1 ring still shares a stack of 3 with the ring; the cycle reaches each once.
- The run-done and sweep-done notes both live in `src/state/runs.ts` (`sweepNoteKey`,
  `dismissDoneNote`); one edit subscription clears both, and opening Results clears both (7.G).
- The timeline shows six labelled F2T2EA lanes per threat row (row 64 px, gutter 96 px) with a
  sticky axis; the panel is 181 px and fits two rows.
- The inspector hypothesis row truncates at the default inspector width; the threshold is only
  visible in the tooltip (6.F report).
- Assets at the origin overlap at the default zoom, so the radar is hard to click (6.F report).

Library (`src/features/library`):
- `LibraryScreen` calls `listVignettes` and `loadVignette` with no catch; in a private window with
  no IndexedDB the saved list stays empty with no message (6.3 report).
- A template copy is saved 500 ms after its first edit, not on open (`src/state/persist.ts`,
  lane 7.11 and 7.F F-06). A run alone writes nothing; `flushAutosave` runs before the Library
  list.

Results and report (`src/features/results`, `src/features/report`):
- `ReportWorkspace.tsx` keeps a "No vignette open." branch that `App` now handles first (6.3).
- PNG export is untested (no canvas in jsdom); needs the 6.R browser pass.
- The one `@media print` light-token rule lives in `results.css` and covers both screens; it has
  no light values for `--state-covered` and `--state-warning`.
- Picked report charts render as nested `<figure>` elements.
- Stored runs older than 5.3 have no `predictions` snapshot and show `[]`.
- Factor rows carry each asset's position from the site (`src/features/report/factors.ts`);
  an asset whose offsets both print as zero reads "at the site" (7.G). The CSV and JSON exports
  do not carry the factor table.
- `src/features/report/limits.ts` generates the "Simulation limits" lines from the vignette:
  holds not flown, flat altitude, a sharp detection edge at r50 for each sensor with a logistic
  Pd model, and the minimum-range filter for each sensor with `minRangeM` above 0 (7.G). A
  radar-only vignette with no holds and no altitude change prints no limits list.
- Value and interval decimals grow to a cap of 4 until value, low and high print apart
  (`units.ts` `decimalsFor`, 7.10 and 7.F F-03); the sweep y axis is titled `<ID>, <unit>`.

Build and budgets:
- Measured 2026-10-30 (`reviews/phase-7-budgets.md`, M4 Pro): entry 77.8 kB gzip plus a shared
  116.7 kB chunk loaded on `/` (211 kB before the first click); MapView 286.5 kB gzip (lazy, Vite
  warns). First load interactive: `/` 73 ms, `/build` with 40 x 15 assets 785 ms (1.2 s at 4x CPU
  throttle). Run 200 x 6: 2.3 s in the browser, 3.05 s headless; a machine 1.6x slower misses 5 s.
  Likely cost: one store patch and rerender per replicate (`src/state/runs.ts:188`).
- The Run dialog has no replicate field; Run sends `DEFAULT_RUN_N` 100 (`commands.ts:422`).
- `e2e/perf/budgets.spec.ts` reruns the measurements: `npx playwright test -c
  e2e/perf/playwright.perf.config.mts`, `PERF_HEADED=1` for the GPU run.
- The root `package.json` stays CommonJS so `legacy/test/smoke.js` runs; Vite and Playwright
  configs are `.mts`.

**Fix lanes proposed by 7.2**: done in the third session as lanes 7.4 to 7.11, reviewed in
`reviews/phase-7-fixes.md` (7.R), fixed in 7.F, and the 7.F follow-ups closed in 7.G (fourth
session). From that review only F-18 stands, by design.

**Known problems for the team.**

1. Ports and the browser. Port 5173 is the user's rangeboard dev server; use
   `npm run dev -- --port 5174 --strictPort` for browser checks. Playwright serves `vite preview`
   on 5175 (`playwright.config.mts`) and the perf spec on 5177. In the fourth session a Vite dev
   server started from the main checkout already held 5174, so the 7.G worker used 5182; check
   `lsof -i :5174` before a browser pass. Claude in Chrome cannot drive native HTML5 drag; use click-to-arm then click, and say so in the report.
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
