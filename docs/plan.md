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
| Engine | rangeboard engine transferred and modified into `src/engine` | Working C-UAS Monte Carlo; no shared package. Phase 10 decision 1 removes the run and score surface |
| Purpose | A polished profile mockup tool: create, iterate and brief test profiles. Not a place to run tests | User, 2026-11-01 (phase 10) |
| Run and score code | Deleted in lane 10.1 (phase 10 decision 1); tag `pre-pivot` keeps it one checkout away | User, 2026-11-01 |

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

> Sub-phases 9.3, 9.4 and 9.5 are superseded by phase 10 (the pivot of 2026-11-01). The text
> stays for reference.

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

### Phase 10. The profile mockup tool (pivot of 2026-11-01)

Decision of 2026-11-01 (user): Profile Studio is a tool to create, iterate and brief
counter-UAS test profiles as interactive, detailed mockups. It plans real tests; it does not
run them. The functionality stays simple for the user. The direction is the v3 mockup
`legacy/mockup-v3.html` (the artifact `M4Jr3utqfsvt5cEgCHbeB2`, 541 lines, served on the dev
server beside the legacy app): three modes, one board with three cameras, a whole-scene
inspector, cards and a brief. The build is a more polished version of that mockup, on the
engine, domain, state and board the rebuild already has.

Sub-phases 9.3, 9.4 and 9.5 above are superseded by this phase. Their text stays for
reference; no lane from them runs unless this phase names it.

**What the mockup has and the build lacks** (read `legacy/mockup-v3.html` at the line):

| Mockup feature | Where in the mockup | Build today |
| --- | --- | --- |
| Time off by default ("full run"), one checkbox and a scrub | `.scrub`, line 390 | 9.2.F1 adds the T toggle; the scrub is the MVP timeline |
| Thumbnails of the other two cameras under the stage, click to switch | `drawStage`, line 396 | none |
| Five layer toggles in view: Reach, Events, Envelopes, Telemetry, Labels | `LAYER_DEFS`, line 386 | 12 chips, hidden (Shift+1 to 8) |
| Save as card, one click | `t-card`, line 431 | stub until 9.4.1 |
| Whole-scene inspector: every object listed under its section, the selected one expanded | `drawInspector`, lines 407 to 420 | selection-only inspector plus the profile form |
| Purpose block: question, class, collection | line 408 | name, id, collection, purpose, units, site elevation, link distance, latitude, longitude, questions and hypotheses, chain time |
| Aircraft rows with the archetype's facts and source link | line 409 | archetype on the threat |
| Data products and Measures of performance lists | lines 418, 419 | `report.dataSources` in Report; measures as hypotheses |
| Brief: card strip with thumbnails, stage, caption, Previous and Next, arrow keys, notes panel | lines 491 to 509 | placeholder |
| Collect: grid by collection, per card Compose, Brief, Duplicate, Export, Delete; thumbnail from the first card; "id v3 · class · n cards · n paths" | lines 511 to 522 | Library: Open, Duplicate, Export, Delete; grouped by site |
| Export with resolved waypoint times (`timed`) for VAL | line 525 | v6 JSON |

**What the build has that the product does not need** (the user's words: this is not a place
for real testing): the Run button and dialog, Results, Report, hypotheses and predictions,
chain time, compare, sweep, the Monte Carlo worker and `src/engine/sim` (18.3k lines), `run`,
`score`, `sweep`, `adapter`, `src/state/runs.ts`, recharts, and the end-to-end specs 12-01,
12-05 to 12-08, phase6-f01 and phase6-f04. DroneScore stays as the naming standard for the
measures of performance list (`docs/reference/dronescore-measures.md`, the 67-row table in
`src/domain`); the scorecard goes.

**Decisions the user takes before 10.1 runs** (each is a line in section 1 once taken):

1. Delete the run and score code, or hide it behind a flag. Decided 2026-11-01: delete. Git
   keeps it (tag `pre-pivot` at d1f56d1). A hidden workspace is not simple, and the entry
   chunk and the gate both shrink.
2. Mode names. Spec: Library, Build, Brief. Mockup: Collect, Compose, Brief. Proposal: keep
   Library, Build, Brief (approved in 9.1; the mockup sets the direction, not the words).
3. Palette. The mockup and the legacy app use warm paper and graphite with affiliation inks
   (`legacy/css/tokens.css`, `legacy/mockup-v3.html` `:root`). The port kept the MVP cool
   palette (study decision 4). Proposal: adopt the warm palette; it is the look the user
   prefers and the tokens already exist.
4. The whole-scene inspector replaces the selection inspector, or sits beside it. Proposal:
   replace. The selection still expands its own row; nothing is lost.

**Rules.** Section 5 applies. Lanes branch from `rebuild/mvp` as `lane/10.x`. The renderer
contract and the owned-file rule from phase 9 stay. The oracle for every UI lane is the mockup
at `/legacy/mockup-v3.html` beside the legacy app at `/legacy/index.html`: the worker opens the
same seed (CUAS-001) in the mockup and the port, saves the pair under `reviews/phase-10/`, and
lists every difference as intended (cite the spec line) or a defect. Parity with the legacy v4
app is no longer the bar; the mockup's simplicity is. Budgets: entry under 300 kB gzip after
10.1; the spec section 11 rows stay.

#### 10.1 Cut (`opus-high`, 3000 s; done 2026-11-01, merged at 59eb86f)

Remove the run and score surface: `src/engine/sim/`, `adapter.ts`, `run.ts`, `score.ts`,
`sweep.ts`, `headless.test.ts`, `src/workers/`, `src/state/runs.ts`, `src/features/results/`,
`src/features/report/`, the Run button, the run-done note, the hypotheses and chain time blocks
in the inspector, the `run.*`, `results.*`, `report.*` and sweep commands, `recharts` (offline
uninstall, nothing fetched), and the seven end-to-end specs above. Keep: the domain's
`Hypothesis` and `RunSummary` types only where the v6 schema needs them to parse stored records
(mark them deprecated; v7 drops them in 10.5). Keep the DroneScore table and `measures.ts`.
Three workspaces in the shell: Library, Build, Brief (decision 2). Spec sections 1, 4, 6, 7,
11 and 12 amended in the same lane: section 4 becomes "One question, one profile, one brief";
section 6 keeps geo, preview and derived; the first-use goal becomes "opens a template, moves
one sensor, saves a card and briefs it in under 10 minutes"; acceptance items 1, 5 to 8 and
11 are retired, item 19 (Brief) and a new item (Save as card) stay. `docs/design-principles.md`
section 4 is rewritten to the same effect. Owned: the files above, `src/App.tsx`,
`src/commands/commands.ts`, `docs/spec.md`, `docs/design-principles.md`, `e2e/`. Gate green
with the remaining specs; entry size in the report.

#### 10.2 Whole-scene inspector (`opus-high`, 3600 s, parallel with 10.3 and 10.4)

Port `drawInspector` (`legacy/mockup-v3.html` lines 407 to 420) onto the v6 document: Purpose
(question, class, collection), Aircraft (one row per archetype in use: id, archetype select,
cruise, the catalog facts and source link), Paths (one row per threat with the waypoint table:
x, y, altitude, hold; add and remove; the selected path expanded; the hint text), Systems
(sensors, effectors, nodes: id, kind, position, reach, field of view, bearing), Volumes (label,
kind, top, vertices), Reference planes, Events (time, type, label, path, the time slider),
Telemetry (truth source, interval, stations, snapshots), Data products, Measures of
performance (a DroneScore picker: ID and name, F2T2EA step shown). The selected object's row
expands; clicking a row selects it on the board. Every field writes to the document store on
input, one undo step per field (the legacy rule). The MVP profile form's units, site elevation,
link distance, latitude and longitude move to a "Site" disclosure at the end, closed by
default. Owned: `src/features/build/inspector/`. Tests: each section renders from CUAS-001;
a waypoint edit is one undo step; the picker lists 67 rows.

#### 10.3 Board bar, layers, time, thumbnails, Save as card (`opus-medium`, 3000 s)

The Build bar becomes the mockup's: the view segment (Plan, Elevation, 3D), Add waypoints
(the existing path placement, as a pressed toggle), the five layer toggles in view (map the 12
board layers onto Reach, Events, Envelopes, Telemetry, Labels; the other seven follow Labels or
stay on), Save as card (C) and the one-line readout. Under the board: the time checkbox, the
scrub and "full run" (the MVP timeline strip is deleted; the authored events draw as beads on
the scrub), then the two thumbnails of the other cameras, click to switch. Fit, Ref and the
units toggle move to the palette. Owned: `src/features/build/BuildWorkspace.tsx`,
`src/features/build/board/` (bar and strip only), `src/features/build/timeline/` (deleted),
`src/state/document.ts` (the cards slice: save with the view, layers, time and focus;
reorder; delete; one undo step), the `card.*` commands. Tests: Save as card stores the view;
the thumbnails render the other two cameras; the scrub turns time on.

#### 10.4 Brief (`fable-medium`, 3600 s)

Port `drawBrief`, `drawCardStrip`, `drawBriefStage` and `drawNotes` (`legacy/mockup-v3.html`
lines 491 to 509): the card strip with thumbnails (`render.card` in thumb mode), the stage
rendering the card's view through `src/board` at its time and layers with its focus ids drawn
strong and the rest dim, the head ("n of m · id"), the caption, Previous and Next, Left,
Right and Space, the notes panel (name, camera, yaw and pitch, time, focus ids, layers,
caption, presenter notes, Up, Down, Delete), "Add card from current scene" when the deck is
empty. Entering Brief stashes the Build view and leaving restores it. Print stylesheet: one
page per card with its render, caption and notes (PDF through print). Clips, beats, caption
tokens, presenter aids, capture and the phone stage are not in this lane; each returns only
when the user asks. Owned: `src/features/brief/`, `src/App.tsx` (mount only), the Brief keys
in `src/commands/commands.ts`. Tests: a card opens at its view and time; arrows move; print
has one page per card.

#### 10.5 Collect polish and export (`opus-medium`, 2400 s, after 10.2 to 10.4)

Library per the mockup's Collect: grouped by collection (a `collection` field on the profile;
`site.name` migrates into it in v7), per card Open, Brief, Duplicate, Export, Delete; the
thumbnail from the first card when one exists; the metadata line "id v3 · class · n cards · n
paths"; a `version` counter that bumps on each committed edit; a `class` field (Counter-UAS,
Multi-aircraft, One-way attack, Surrogate, Custom). Export adds the resolved waypoint times
(`timed`: x, y, z, arrive, depart) per path, as the mockup does for VAL. v7 schema drops the
run fields. Owned: `src/features/library/`, `src/domain/`, `src/state/persist.ts`. Tests:
round-trip v6 to v7; export carries `timed`.

#### 10.6 Palette and polish (`opus-medium`, 2400 s, after decision 3)

The warm paper and graphite palette from `legacy/css/tokens.css` into `src/styles/tokens.css`
(both themes), the affiliation inks on the board, the mockup's control sizes (28, 26, 24 px),
the top bar at widths under 900 px, and the `stat-te-terminology` check on every string the
phase added. Owned: `src/styles/`, `src/board/board.css`, `src/features/shell/`.

#### 10.R Review and 10.F Fixes

`opus-high` with the browser at 1440 x 900: the port beside the mockup for every seed in
`fixtures/legacy-derive/` in all three views and in Brief; the first-use goal re-walked; the
budgets measured. Then the fix lane and the user's approval.

#### Deferred from phase 10

Clips and beats, caption tokens, presenter aids, capture and attachments, the phone stage,
the debrief overlay, the timeline with F2T2EA lanes, the chart strip, the readout strip with
drag deltas, the quick-add palette's catalog rows, the target menu's long tail, snap to
geometry. Each exists in `legacy/` and returns as its own lane only when the user asks.

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
| 9.1.R | done | 80d15fa | `reviews/phase-9.1.md`: 1 blocker (route request never cleared, every link bounced to Build), 3 majors (name focus re-fired, dialog import did not refresh the Library, I \ R keys had no effect), 12 minors, 9 notes; 26 browser screenshots; budgets pass (entry 56 kB gzip JS) |
| 9.1.F | done | e95557a | F-01 to F-23 fixed (F-07 and F-09 partial by decision; F-23 passed on recheck): requests consumed once, one import and export path in `library/io.ts`, Build panels bound to `ui.panels`, R a stub until 9.3.2, "profile" wording, `PROF-n` ids, Library header and caps groups, disabled-key toast, item 12 e2e; 591 tests, 13 e2e |
| 9.2.1 | done | d31b604 | `src/engine/derived.ts`: the legacy derived object from `Preview`, keyed by display id, F2T2EA `stages` with a `ladder` alias; `at`, `tokens`, `envelopes`, `trackLine`, `crossings`, `stops`, `rangeSeries`; all nine fixtures pass field for field and on the `at` and `envelopesAt` samples; `derived()` 9.9 ms at 40 x 15; `flown` waits for 9.3.3; 622 tests |
| 9.2.2 | done | d428464 | `src/board/` ported from `40-cameras.js` to `44-render.js`: `toScene`, three cameras (Elevation From asset and Along path; axon orbit 0.45 and 0.35 deg/px, pitch clamp 8 to 86, the hint), 12 layers each with `inputs`, `render.scene` with per-layer fragments, `card`, `hitTest`, `board.css` on MVP tokens; byte parity with the legacy renderer in node over every seed and camera; 0.9 to 1.3 ms per full render at 40 x 15; 106 tests; merge check 7803ac0: `DerivedView.first` allows null, adapter-to-board render test; 729 tests |
| 9.2.3 | done | 6c04b36 | rail from `51-panel-rail.js` (spec groups with add buttons), quick-add palette on the shared `Palette` (A, S, V, E, Shift+F, formation popover, `useQuickAdd.boardArmed` for event placement), target menu per kind (`openTargetMenu`, `TargetMenu`; card items stubbed until 9.4.1; `setEventWarnings` idle until 9.3.1), tip at 400 ms with edge flips; commands exported per folder, registered in 9.2.6; 23 tests; four parity pairs; 752 tests |
| 9.2.4 | done | 8b0c287 | inspector replaced from `51-panel-inspector.js` (fields per kind, waypoint and vertex tables, profile block with the questions and hypotheses block, `eventWarnings` returns `[]` until 9.3.1); readout from `51-panel-readout.js` (`useReadout` with `pin`, `clear`, `setDragBaseline`; "Margin +0:12 (-0:04)"; interim preview source until 9.2.6 rewires it to `derived.at`); declared losses: class, datum, sensor bottom, top and status, effector rmin and elevation; 762 tests |
| node-fov | done | 3edda0a | fix from the 9.2.2 merge check: v6 `Node` carries `fovDeg` and `bearingDeg` (legacy default 0, a zero-width sector; 360 is the full ring); `importLegacyV4` keeps them, stored records default on parse without a stamp bump, `toScene` maps them, the render-test patch is gone and byte parity runs on the imported record alone; the inspector shows the two rows for nodes as legacy does; SURR-001 TM-1 now draws as a full ring; 765 tests |
| 9.2.5 | done | a6a702a | `src/features/build/board/` ported from `51-panel-board.js` and `45-tools.js`: `Board` mounts one `<g>` per layer and rewrites only changed fragments (ticks rewrite the `t` layers only), `useBoard` store (camera, ruler, placing, snap, pointer), select and stack cycle, drag with the pre-drag ghost and `setDragBaseline`, pan, pinch, wheel zoom at the cursor, axon orbit, right-click and 500 ms long press to `openTargetMenu`, ruler, placement with snap (rings, vertices, edges, 15 degrees, Alt) and ghost labels, `boardCommands` (G, =, -, nudge); `handles.ts` unchanged; 16 tests; tick 3.5 ms, drag step 0.5 ms at 40 x 15; five parity pairs; merge check: node placement carries fovDeg and bearingDeg; 781 tests |
| 9.2.6 | done | 17920d1 | Build wired from the rail, board, readout panel, inspector and the MVP timeline (kept until 9.3); rail, palette, menu and board commands registered in place of the stubs; one Escape owner (`app.escape`, nine steps); readout on `boardDerived(v).at`; `previewOf` passes group keys; `map/`, `assets/`, `profile/` and `maplibre-gl` removed (offline uninstall, 23 packages, nothing fetched); Thumbnail and MapSnapshot on `src/board` thumb mode; e2e helpers and five specs repointed; units deduped into `tokens.ts legacyUnits`; `src/board` ESLint fence; Elevation gate fixed to `needDoc`; entry 131 kB gzip; 82 unit files, 713 tests, 13 e2e; eight parity pairs |
| 9.2.F1 | done | 24a5a13 | root causes: sticky camera bounds in `useBoard` (an add or drag no longer refits Plan or 3D; Fit or a new profile recomputes; a deliberate deviation: legacy `44-render.js:71` recomputes every render); Elevation opens From asset with `view.elevationMode` and a bar control; `time.cursor` (T) replaces the 9.3.2 stub with `ui.timeOn`, off by default, turned on by scrub, play, the step keys, Home and End; e2e 12-02 and 12-03 read positions in the original geometry again; 721 tests |
| 9.2.F2 | done | 91ab1f6 | hygiene: `ladder` alias removed from `derived.ts` (the parity test rebuilds rungs from `stages`); redundant stack subscription removed from `gestures.ts`; `board.css` scoped under `:where(svg.board, svg.chart)`; palette labels "Delete height plane", "Delete event", "Delete card" (the menu keeps "Delete"); readout follows `useBoard.ref` and prints "at t+0:30"; perf spec selectors repointed; Prettier run on 19 files that predated the lanes; 722 tests, entry 131.7 kB gzip |
| 10.1 | done | 59eb86f | the cut: `src/engine/sim` (81 files), `adapter`, `run`, `score`, `sweep`, `headless.test`, `src/workers`, `runs.ts`, Results, Report, the Run button and notes, the hypotheses and chain time blocks, run and sweep commands, recharts (offline uninstall, 37 packages), seven e2e specs; three workspaces, `/results` and `/report` redirect to Build; v6 run fields kept `@deprecated` so stored records parse; spec sections 1, 4, 6, 7, 8, 11, 12 and the principles amended; 129 files deleted, 52k lines; 49 unit files, 436 tests, 6 e2e; entry 708 kB raw, 229 kB gzip (the former lazy `ui` chunk now sits in the entry; the three chunks of 9.2 summed 363 kB gzip) |


## 8. Handoff

State on 2026-11-01, end of the ninth session. `rebuild/mvp` is at 59eb86f (the merge of
10.1; one plan commit follows it) with the gate green: 49 unit files, 436 tests, 6 Playwright
specs on `vite preview`, build. Sub-phase 9.2 is merged with its root-cause fix lanes 9.2.F1
and 9.2.F2, and phase 10 lane 10.1 (the cut) is merged (section 7). Tag `pre-pivot` (d1f56d1)
holds the last head with the run and score code. No lane is in flight; no worktree exists. `main` is at 21e96c2 on `origin`; `rebuild/mvp` is ahead of `origin`.
Nothing was pushed and nothing was installed in this session (`npm ci --offline` per worktree
only).

**The pivot.** The user set the product's purpose on 2026-11-01: a polished version of the v3
mockup, a tool to create, iterate and brief test profiles as interactive mockups, not a place
to run tests. The mockup is saved at `legacy/mockup-v3.html` and serves at
`/legacy/mockup-v3.html` on the dev server. Phase 10 in section 6 is the plan; sub-phases
9.3 to 9.5 are superseded. The 9.2.R review of the dense legacy port was not launched: most of
its open items (the menu's long tail, the readout table format, the inspector action row, the
Build bar hints, the palette's catalog rows) belong to features phase 10 removes or replaces,
so a review of them would have been waste. The 9.2 items that survive the pivot were fixed at
the root in 9.2.F1 and 9.2.F2 (section 7). Section 7's "9.2 open items" list below keeps only
what phase 10 inherits.

**Orchestrator prompt.** Paste this to start the next session:

```text
You are the orchestrator for Profile Studio at /Users/caseytalbot/Projects/profile-studio,
branch rebuild/mvp. Read CLAUDE.md, docs/design-principles.md, docs/spec.md, then docs/plan.md
sections 5, 6 (phase 10), 7 and 8. Open legacy/mockup-v3.html in a browser from the dev server
(port 5174, path /legacy/mockup-v3.html) and use it for ten minutes: Compose, Brief, Collect.
That is the product. Run `npm run gate` to confirm the baseline: 49 unit files, 436 tests, 6
Playwright specs on `vite preview`, build.

Phase 10 is the work: the build becomes a more polished version of the mockup on the existing
domain, state and board. Decision 1 is taken and 10.1 is merged. Start by putting decisions 2,
3 and 4 at the head of phase 10 to me and record each answer as a row in section 1. Then 10.2,
10.3 and 10.4 in one message, then 10.5, 10.6, 10.R, 10.F, then my approval. Section 5 rules apply: one worker per
lane in a worktree under .worktrees/<id>, workers do not commit, gate and git diff --stat
before each --no-ff merge, gate on rebuild/mvp after, worktree removed, status table and
section 8 updated. Every UI brief names the mockup lines it ports and asks for a pair of
screenshots, mockup and port, under reviews/phase-10/.

Ask me before any download (npm install included), any push, and any merge to main.
```

**Start here.** Read `CLAUDE.md`, the principles, the spec, this file (sections 5 to 8), and
`legacy/mockup-v3.html` whole (541 lines; the modes start at line 374). Run `npm run gate` once.
Then:

1. Put decisions 2, 3 and 4 at the head of phase 10 to the user (10.1 is done; `pre-pivot`
   is tagged).
2. Read the amended spec sections 1, 4, 6, 7 and 12 before cutting the next briefs.
3. Launch 10.2, 10.3 and 10.4 in one message (disjoint folders: inspector; bar, strip and the
   cards slice; brief). Then 10.5, then 10.6, then 10.R and 10.F.
4. Record each merge in section 7 and the review in `reviews/phase-10.md` with pairs under
   `reviews/phase-10/`.

**This session against the request.** The user asked for a review of the 9.2 work against the
plan, root-cause corrections, clean code, a sound product and the handoff; then took decision 1
and lane 10.1 ran.

- Review: the handoff's own lane-by-lane table (previous section 8) was checked against the
  code. One claim was wrong: "the board refits on every scene change; legacy keeps the camera".
  Legacy recomputes the bounds on every render too (`legacy/js/44-render.js:71`; no file in
  `legacy/js` writes a bounds into `ui.view`). The jump is still a defect for the user, so the
  port now deviates on purpose: the camera holds until Fit, a new profile or a view change.
  The mockup (`bounds`, line 318) also recomputes per render; the port is the polished one.
- Root causes fixed (9.2.F1): sticky camera bounds in `useBoard` with reset on Fit and on a
  profile change; Elevation opens From asset with a `view.elevationMode` command and a control
  in the bar; the `time.cursor` stub replaced by `ui.timeOn` (T), off by default as in the
  mockup and legacy, with the scrub, play and the step keys turning it on; the two end-to-end
  specs the wiring lane bent around the refit (12-02, 12-03) read positions in the original
  geometry again.
- Clean code (9.2.F2): the `ladder` alias removed from `derived.ts`; the redundant stack
  subscription and the unused pointer field removed from `gestures.ts`; `board.css` rules
  scoped to the board svg; distinct palette labels for the three Delete commands; the readout
  follows `useBoard.ref` and prints "at t+0:30"; the perf spec's MapLibre-era selectors
  repointed.
- Process root causes, for the next briefs: (1) a wiring lane that inherits five checklists
  needs 3600 s, not the plan's 2400 s; (2) a spec that a lane must bend to pass is a defect
  report, not a spec edit: the worker stops and reports, the orchestrator decides; (3) a worker
  claim about legacy behaviour is checked against `legacy/js` by file and line before it enters
  the plan; (4) the owned-file rule holds: a worker that needs a line outside its files reports
  the line and stops.

**Lessons from 9.1 and 9.2 for the next briefs.** The derive fixtures in `fixtures/legacy-derive/`
have the shape `{derived, input, samples}`; the legacy v4 record is `input`. Required fields
added to `Vignette`, `Threat` or `Node` break every literal outside `src/domain`: the lane that
adds one lists the literals (`src/engine/testVignette.ts`, the perf tests, `commands.ts`
`addThreat` and `addNode`, `board/tools.ts`, `templates/build.ts`, `registry.test.ts`,
`schema.test.ts`) and the orchestrator fixes them on the lane branch before the merge. Two
lanes that both add a control with the same accessible name break the e2e selectors; name
controls per screen. Orchestrator wiring between parallel lanes must consume each request once.
Workers report the entry size against the number in the brief; put the budget in the brief.

**Brief shape for phase 10 lanes.** Working directory (`.worktrees/<id>`); the lane text from
section 6 verbatim; the mockup lines to port, read whole before writing; the renderer contract
and the owned-file rule; the files it must not touch; the spec sections it serves; the gate
(`E2E_PORT=<port> npm run gate`); the pair of screenshots (mockup and port) and where they go;
the report shape (what changed, every difference from the mockup with its reason, tests added,
what is open, screenshots); the time budget; the lanes running in parallel and their folders.
User-facing text in the `stat-te-terminology` vocabulary and the principles' words (profile,
card, Elevation, 3D).

**Approvals on record.** The user approved the phase 0 commits, the first phase 1 commit, one
merge to `main` with a push, and the Playwright Chromium download, all on 2026-10-30; a second
and a third push and merge to `main` at the end of the third and fourth sessions (2026-10-30).
Seventh session (2026-10-31): the install of `@fontsource/archivo`, `@fontsource/jetbrains-mono`
and `lucide-react` plus `npm ci` per worktree, and sub-phase 9.1 closed. Eighth session: the
node-fov lane. Ninth session (2026-11-01): the user set the pivot (phase 10), asked for the
root-cause fixes, and took decision 1 ("Delete it"), which authorised lane 10.1 and the
`pre-pivot` tag; no push, no install (two offline uninstalls: `maplibre-gl` in 9.2.6, `recharts`
in 10.1), no merge to `main`. Decisions 2, 3 and 4 are open.

**How to run a lane.** `git worktree add .worktrees/<id> -b lane/<id> rebuild/mvp`, then
`npm ci --offline` there (stop and ask if it tries to fetch). Parallel lanes each run the full
gate with their own preview port: `E2E_PORT=<port> npm run gate` (5181 to 5189 were used; dev
servers for pairs on 5191 to 5199). The worker does not commit. The orchestrator runs
`npm run gate` in the worktree, commits on the lane branch, merges with `--no-ff` into
`rebuild/mvp`, runs the gate there, removes the worktree and deletes the branch, then updates
section 7. Workers are picked by `~/.claude/rules/delegation.md`.

**Open items.** Each came from a worker report or a review; none is a guess. Items that phase
10 removes are not listed; `git show dfd96f5:docs/plan.md` has the full 9.2 list.

From lane 10.1 (the cut), for 10.2 to 10.5:
- `chainTime` stays in the domain because `preview.ts` and `derived.ts` read it; only its
  inspector block went. 10.2 decides whether it shows as a Site field.
- The sensor `model` and the asset `entered` fields stay live in the domain and the templates
  write them; their UI is gone. 10.2 or 10.5 removes them or shows them.
- `src/state/persist.ts` comments still mention run results (10.5 owns the file).
- The `CommandButton` `accent` variant (now used only by the Elevation segments) and some
  `shared/units.ts` helpers are unused; `src/ui/Showcase.tsx` keeps a static demo item
  `run.run` that is not registered.
- Spec sections 2, 5, 9 and 10 and acceptance item 17 still describe runs, the AAR and the
  run-row CSV; 10.5 (v7 schema) amends them.
- The entry chunk is 708 kB raw, 229 kB gzip, under the 300 kB budget. The former lazy `ui`
  chunk (Radix, cmdk) now sits in the entry because no lazy route remains; a lazy Brief in 10.4
  may bring it back down.

Inherited from 9.2 (from the 9.2 reports and this session):
- The field-of-view commit in the inspector has no clamp (0 on a sensor or over 360 is refused
  on reload). 10.2 clamps 1 to 360.
- Rail threat names truncate at 232 px. 10.3 or 10.6.
- "C2" and "TSPI" are unexpanded in the rail group name. 10.2 decides the words with the
  `stat-te-terminology` skill.
- Nudge arrows: the shell binds the arrows to `time.back1` and `time.forward1`; the focused
  board stage nudges the selection. 10.3 keeps one owner.
- Label culling differs from legacy at the port's larger stage (the ring radius is 265 px
  against 213 px with no chip row and a narrower rail). The mockup is the bar now; 10.R
  compares to it.
- The "MAX RG" label overlaps the axis title in Elevation (a legacy defect carried over).
- `metricsCfg.dLink` is dropped on legacy import.
- `tokens.ts legacyUnits` is the one unit formatter; `shared/units.ts` serves Results and
  Report and goes with them in 10.1.
- The perf test logs React `act` warnings (9.2.5).
- `Readout.tsx` (the hidden readout panel) and `src/features/build/readout/` stay until 10.3
  decides whether the one-line readout in the bar replaces them (the mockup has one line).
- Historical MapLibre mentions stay in `reviews/*` and `docs/`.

Sub-phase 9.1 (from `reviews/phase-9.1.md` and the 9.1.F report):
- `--text-subtle` (`--ps-t3`) is #7b7d73 on white, about 4.1:1, under WCAG AA for small text.
  The user chose to keep the legacy value (2026-10-31). 10.6 revisits with the warm palette.
- Duplicate and template copies take `PROF-n` ids, confirmed by the user (2026-10-31).
- `exportLibrary(current)` replaces the stored copy of the open profile but does not add an
  open profile that was never saved.
- At widths under about 900 px the top bar overflows and Import is clipped. 10.6.
- Seeds import with `meta.updated: null` and take the import time.
- The top bar shows no version; 10.5 adds the counter.
- Existing MVP components (Kbd, Tooltip) still use Tailwind default sizes, not the five-step
  scale.

Engine (`src/engine`, what stays after 10.1: geo, preview, derived and its files):
- Preview semantics: Assess is unclipped; Engage without a Target falls back to first effector
  reach. The board's derived stages read these.
- `derived.ts` `flown` is empty (the debrief overlay is deferred).

Domain (`src/domain`):
- Legacy import sets site lat/lon to 0 and maps MOP text to a question note. 10.5 maps the
  mockup's and legacy's `mop[]` to the measures list instead.
- `Area` has only `pts`; circles draw as polygons and the inspector guesses a circle at 16 or
  more vertices.
- The 9.2.4 declared losses (class, datum, sensor bottom, top and status, effector rmin and
  elevation) are legacy fields v6 lacks; `class` returns in 10.5.

State and commands (`src/state`, `src/commands`):
- `importJson` returns `Vignette[]`; records with no schema stamp are refused.
- IndexedDB itself is untested (no `fake-indexeddb`); the persistence tests use a mock db.
- Stubs with a lane reason remain for the card items and the Brief keys; 10.3 and 10.4 fill
  them.

Library (`src/features/library`):
- `LibraryScreen` calls `listVignettes` and `loadVignette` with no catch; in a private window
  with no IndexedDB the saved list stays empty with no message.
- A template copy is saved 500 ms after its first edit, not on open.
- `Thumbnail.tsx` renders through `src/board` thumb mode, which pulls `src/board` into the entry
  chunk.

Build and budgets:
- Entry measured 2026-11-01 at the 10.1 gate: 708 kB raw, 229 kB gzip JS, 26.3 kB gzip CSS
  (one chunk). Spec section 11 now allows 300 kB gzip.
- `e2e/perf/budgets.spec.ts` reruns the measurements: `npx playwright test -c
  e2e/perf/playwright.perf.config.mts`, `PERF_HEADED=1` for the GPU run. Its selectors were
  repointed in 9.2.F2.
- The root `package.json` stays CommonJS so `legacy/test/smoke.js` runs; Vite and Playwright
  configs are `.mts`.

**Known problems for the team.**

1. Ports and the browser. Port 5173 is the user's rangeboard dev server; use
   `npm run dev -- --port 5174 --strictPort` (`.claude/launch.json` "dev") for browser checks.
   Playwright serves `vite preview` on 5175 and the perf spec on 5177. Playwright cannot drive
   native HTML5 drag; use click-to-arm then click, or synthetic drag events, and say so in the
   report.
2. The internet. The user does not allow downloads without asking. Sources are local in
   `~/Desktop/MASTER/VALKRYN/`. `npm ci --offline` and `npm uninstall --offline` work from the
   cache; a worker stops and reports if npm tries to fetch. The mockup links Google Fonts; the
   port bundles the same families, so no fetch is needed.
3. DroneScore wins over C4 (`docs/reference/jiatf-401.md` section b).
4. rangeboard (`~/projects/rangeboard`) and vos are read-only.
5. Words. User-facing T&E text uses the `stat-te-terminology` skill.
6. Autosave writes to IndexedDB for `localhost:5174`; clear site data between browser checks
   when it matters. The legacy app and the mockup keep their own storage (`profileStudio.v3`
   in localStorage for the mockup) and seed CUAS-001.
7. The main checkout's `node_modules` was refreshed with `npm ci --offline` on 2026-11-01, so the stale `maplibre-gl` copy is gone.
