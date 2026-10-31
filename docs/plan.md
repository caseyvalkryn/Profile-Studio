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

Plan from `docs/reference/vos.md` once the MVP passes phase 7 and phase 9.

### Phase 9. Upgrade to artifact capability (drafted and committed 2026-10-31)

Source: `docs/reference/artifact-study.md` (scope and decisions), `docs/spec.md` as amended on
2026-10-31, `docs/design-principles.md` sections 2, 3, 5 and 8. The integration branch stays
`rebuild/mvp`. Lanes branch from it as `lane/9.x.y`. Section 5 rules apply. Each sub-phase ends
with a review lane with a browser pass, a fix lane, and the user's approval before the merge
to `rebuild/mvp`. The user also approves each npm install (a download): 9.1.1 and 9.3.1 need one.

Owned-file rule for this phase: `src/commands/commands.ts`, `src/App.tsx`,
`src/features/build/BuildWorkspace.tsx` and `src/state/ui.ts` belong to one lane per sub-phase
(the shell or wiring lane). Other lanes export their command definitions and panels from their
own folder, and the wiring lane registers them.

References per lane. Every brief names these, and the worker reads them before it writes:
`docs/design-principles.md`, the spec sections the lane implements, and
`docs/reference/artifact-study.md` section 2 for the behaviours it ports. Legacy code per lane:
9.1.1 `legacy/css/tokens.css`; 9.1.2 and 9.1.3 `legacy/js/51-panel-topbar.js`,
`51-panel-collect.js`, `90-app.js` (theme, undo toast); 9.1.4 `legacy/js/11-schema.js`,
`12-seed.js`; 9.2.1 `legacy/js/43-layer-*.js`, `41-symbols.js`; 9.2.2 `legacy/js/21-derive.js`
(`D.at`), `51-panel-readout.js`, `45-tools.js` (`LABELS`, `move`), `51-panel-chart.js`; 9.2.3
`legacy/js/51-panel-palette.js`, `45-tools.js` (`snap`, `legText`, formation), `51-panel-menu.js`;
9.2.4 `legacy/js/40-cameras.js` (elev), `34-time.js` (`stops`), `46-keys.js`; 9.3.1
`legacy/js/40-cameras.js` (axon: `zx`, `hint`, `rotate`); 9.4.1 `legacy/js/51-panel-timeline.js`,
`45-tools.js` (`snapBead`), `21-derive.js` (warnings); 9.4.2 `legacy/js/33-persist.js` (TSPI
parse), `43-layer-telemetry.js`; 9.5.1 `legacy/js/45-tools.js` (`saveCard`, `saveClip`),
`21-derive.js` (`D.tokens`); 9.5.2 `legacy/js/51-panel-stage.js`, `51-panel-cards.js`,
`34-time.js` (`playTo`); 9.5.3 `legacy/js/51-panel-notes.js`.

#### 9.1 Foundation

- **9.1.1 Type system and icons** (`opus-medium`, 1800 s, needs install approval:
  `@fontsource/archivo`, `@fontsource/jetbrains-mono`, `lucide-react`). `src/styles/tokens.css`:
  the two families, the five-step scale with line heights, weights 400 and 500, tabular
  numerals, three stroke weights, layout and control tokens, the full-stage scale, coarse-pointer
  sizes. `src/styles/base.css` and the Tailwind theme read them. `src/ui/Icon.tsx` wraps Lucide
  with a label slot. The print stylesheets keep the light theme. Owned: `src/styles/`,
  `src/ui/Icon.tsx`, `index.html`. Gate: `npm run gate`; a browser screenshot of Build and
  Results at 1440 x 900 in both themes.
- **9.1.2 Profile word, New flow, library export** (`opus-medium`, 1800 s). Every user-facing
  "vignette" becomes "profile" (`stat-te-terminology` check on the diff). `profile.new` (Cmd+N)
  creates "Untitled profile" with the default site and one defended asset, opens Build and
  focuses the name field; `profile.newFromTemplate`. Library: New button first, with a menu
  arrow for templates; export the library as one JSON; import v6, v5 and legacy v4. Owned:
  `src/features/library/`, `src/state/persist.ts`, `src/commands/` (this sub-phase's owner).
  Tests: New in a fresh store, rename shows in the library, library export and import round-trip.
- **9.1.3 Shell** (`opus-medium`, 1800 s). Five workspaces with a Brief placeholder route. Top
  bar: New, undo and redo with the pending label and a toast, units, theme control (auto, light,
  dark) wired to `ui.theme`, view switch Plan, Elevation, 3D (3D disabled until 9.3 with a
  reason). `View = 'plan' | 'elevation' | '3d'`; `src/features/build/profile/` renamed
  `elevation/`. Panel visibility in `ui`: inspector (I), both side panels (\), strip mode (R:
  timeline, chart, readout), layer chips, readout strip, events, debrief, snapshots, all hidden
  by default. Command scoping by workspace in the registry types. Owned: `src/App.tsx`,
  `src/state/ui.ts`, `src/features/build/BuildWorkspace.tsx`, `src/features/build/elevation/`,
  `src/features/commands/`.
- **9.1.4 Domain v6** (`opus-high`, 2400 s, parallel, pure data). `src/domain/types.ts` and
  `schema.ts` per spec section 5: `planes`, `events`, `snapshots`, `cards`, `debrief`, `Area`
  bottom and top, `Threat.group`. Stamp `profile-studio/6`; v5 to v6 migration; legacy v4 import
  keeps every one of those fields; export without loss. Test: each legacy seed and template in
  `legacy/` round-trips import, export, import with deep equality on the mapped fields (spec
  acceptance item 18 as a unit test). Owned: `src/domain/`, `fixtures/`.
- **9.1.R Review** (`opus-high`, with browser) and **9.1.F Fixes** (`opus-medium`).

#### 9.2 Board parity

- **9.2.1 Layers and chips** (`opus-high`, 2400 s). One file per `LayerId` under
  `src/features/build/map/layers/`: reach (dashed at rest, solid while covering), events (beads
  and first-see ticks), envelopes (one hull per link cluster at t, per snapshot when time is
  off), tracks (lifecycle frames, leaders, data blocks, sensor-to-track lines, engagement bars,
  kill mark), telemetry (planned TSPI samples and station links), labels (one placement pass),
  rings, target. Layer chip commands exported from the folder. Owned: `src/features/build/map/`
  except `handles.ts`, `placement.ts` and `dragLabel.ts`.
- **9.2.2 At time t, readout, drag labels, chart strip** (`fable-medium`, 2400 s).
  `src/engine/at.ts` per spec section 6.5 with parity tests against `fixtures/legacy-derive/`.
  Readout strip panel: follows selection then hover, pin a baseline, deltas in colour during a
  drag against the pre-drag record. Drag label with the largest downstream change
  (`src/features/build/map/dragLabel.ts`). Chart strip: range and closing speed series at t,
  click to seek. Owned: `src/engine/at.ts`, `src/features/build/readout/`,
  `src/features/build/map/dragLabel.ts`, `src/features/build/timeline/ChartStrip.tsx`.
- **9.2.3 Quick-add, formation, snap, menu items** (`opus-medium`, 2400 s). The palette's Add
  group with search, catalog values per row and shortcut hints; A, S, V, E. Formation popover
  (Shift+F). Snap to rings, vertices and edges within 8 px, 15 degree bearings with Shift, G
  toggle, Alt bypass, snap name and leg text on the ghost. Menu items: Set bottom, Add height
  plane, Set height, Split here, Merge, Save card (stub that 9.5 fills). Owned:
  `src/features/build/assets/`, `src/ui/Palette.tsx`, `src/features/build/map/handles.ts`,
  `src/features/build/map/placement.ts`.
- **9.2.4 Elevation modes, time keys, sheet** (`opus-medium`, 1800 s). From asset mode: every
  path, slant arcs with elevation limits, height planes, reference origin. Keys [ ] (stops:
  events, stage times, splits, first sees), Home, End, T, =, -, Tab. Shortcut sheet generated
  per workspace from the registry. Owned: `src/features/build/elevation/`,
  `src/features/commands/ShortcutSheet.tsx`, `src/features/build/timeline/stops.ts`.
- **9.2.5 Wiring** (`opus-high`, 2400 s, after 9.2.1 to 9.2.4). Registers every exported
  command, composes the hidden panels into `BuildWorkspace`, dedupes helpers, one Escape owner.
  Owned: the four shell files and `src/features/shared/`.
- **9.2.R Review** (`opus-high`, with browser; acceptance item 15) and **9.2.F Fixes**.

#### 9.3 3D view

- **9.3.1 Scene** (`fable-medium`, 3600 s, needs install approval: `three`, `@types/three`).
  `src/features/build/scene3d/` as a lazy chunk: orbit, zoom, pan; ground grid and compass;
  reach domes and sector cones with elevation limits; areas as prisms between bottom and top;
  height planes; flight paths at altitude with drop lines; threats and track frames at t from
  the preview; selection highlight; the exaggeration, yaw and pitch readout; the edit prompt on
  drag. A controlled `view` prop so a card can drive it. Owned: `src/features/build/scene3d/`.
  Test: geometry builders in Vitest; the chunk under 250 kB gzip.
- **9.3.2 Imagery and terrain** (`opus-medium`, 1500 s, parallel). Basemap toggle with a
  configurable tile URL and an optional DEM URL in `ui` settings, persisted; MapLibre raster
  source when online; one-line offline message; terrain mesh for the 3D view from the DEM.
  Owned: `src/features/build/map/basemap.ts`, `src/features/build/settings/`.
- **9.3.3 Wiring and perf** (`opus-medium`, 1500 s, after). View switch and key 3, the
  controlled `view` prop on `MapView` and `ElevationView` too, perf spec: 30 frames per second
  with 40 threats and 15 sensors (`e2e/perf/`). Owned: the shell files, `e2e/perf/`.
- **9.3.R Review** (`opus-high`, with browser; acceptance items 13 and 14) and **9.3.F Fixes**.

#### 9.4 Authored events and debrief

- **9.4.1 Authored events and the timeline rows** (`fable-medium`, 2400 s).
  `src/engine/events.ts` (`checkEvents`, spec section 6.7). Timeline rows per threat: planned
  beads with letter glyphs, simulated stage times of the latest run from `RunTrace`, flown times
  from the debrief. Drag a bead to retime with snap to crossings within 3 s, Alt bypass, one
  undo step. Warning triangles with the reason; Move to geometry. Inspector fields; Add event
  here on a path and on the timeline; the hidden event list. Owned: `src/engine/events.ts`,
  `src/features/build/timeline/`, `src/features/build/events/`, `src/features/build/inspector/`.
- **9.4.2 Debrief** (`opus-high`, 2400 s, parallel). `src/engine/debrief.ts` (`resample`,
  TSPI text and CSV parsers with the legacy text format). Debrief panel: paste or load, source
  note, per-threat mapping, clear. Flown track layer on the map and a flown builder in the 3D
  scene, both read-only data. Owned: `src/engine/debrief.ts`, `src/features/build/debrief/`,
  `src/features/build/map/layers/flown.ts`, `src/features/build/scene3d/flown.ts`.
- **9.4.R Review** (`opus-high`, with browser; acceptance items 16 and 17) and **9.4.F Fixes**.

#### 9.5 Brief and export

- **9.5.1 Cards, tokens, store** (`opus-medium`, 1800 s). Document store actions for cards
  (save with the legacy defaults, reorder, duplicate, delete, field edits as one undo step
  each). `src/engine/tokens.ts` per spec section 6.6 with the legacy token tests. Save card (C)
  and the card menu items. Owned: `src/state/document.ts` (cards slice), `src/engine/tokens.ts`,
  `src/features/brief/cards/`.
- **9.5.2 Stage and presenter** (`fable-medium`, 3600 s, after 9.5.1). `BriefWorkspace`: card
  strip, stage, notes column. The stage drives the controlled map, elevation or 3D view at the
  card's view and time, the timeline strip, the caption with resolved tokens, the readout
  strip, the head and aids. Enter and leave restore the Build view. Clip playback with beats
  (`playTo`), Space, Right, Left, Home, End, 1 to 9, F, B, K, N, Up, Down, key hints that fade.
  Phone layout. Owned: `src/features/brief/` except `cards/` and `notes/`,
  `src/features/build/timeline/usePlayback.ts` (`playTo`).
- **9.5.3 Notes, capture, attachments, export** (`opus-high`, 2400 s, parallel with 9.5.2).
  Notes panel with live token preview and reasons, clip fields with the legacy parse rules and
  error text. Capture: the map canvas (`preserveDrawingBuffer` on demand), the 3D renderer and
  the elevation SVG to a PNG blob in a session store, never persisted. Attach an image file.
  Deck PDF: `brief.css` print stylesheet, one page per card. Card PNG. Report embed of a card.
  Owned: `src/features/brief/notes/`, `src/features/brief/capture.ts`, `src/features/brief/brief.css`,
  `src/features/report/` (embed only).
- **9.5.4 Wiring** (`opus-medium`, 1500 s, after). Mount Brief, scope the Brief keys, register
  the card commands, `stat-te-terminology` check on all new copy. Owned: the shell files.
- **9.5.R Review** (`opus-high`, with browser; acceptance item 19) and **9.5.F Fixes**.

#### 9.6 Acceptance

- **9.6.1 End-to-end** (`opus-medium`, 2400 s). One Playwright spec per spec section 12 item
  12 to 19. Items 1 to 11 stay green.
- **9.6.2 First-use re-walk** (`opus-medium` with browser, 1200 s). Item 20. Friction ranked;
  fixes are new lanes.
- **9.6.3 Budgets** (`opus-medium`, 900 s). Item 21: every section 11 row, with numbers in
  `reviews/phase-9-budgets.md`.
- **9.6.R Review** (`opus-high`): the whole upgrade against the principles, then **9.6.F**.

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

## 8. Handoff

State on 2026-10-31, end of the fifth session (a planning session, no code lane). The MVP is
done: phases 0 to 7 and their fix lanes are merged on `rebuild/mvp` with the gate green (69 unit
test files, 536 tests, 12 Playwright specs on `vite preview`, build), and `main` is at the
fourth-session merge (21e96c2) on `origin`. The fifth session wrote `docs/reference/artifact-study.md`,
amended `docs/spec.md` and `docs/design-principles.md` from it, and drafted phase 9 in section 6.
The user asked for that commit and this handoff on 2026-10-31. No lane is in flight; no worktree
exists. `rebuild/mvp` is one commit ahead of `origin` (this one) until the user approves a push.

**Orchestrator prompt.** Paste this to start the next session:

```text
You are the orchestrator for Profile Studio at /Users/caseytalbot/Projects/profile-studio,
branch rebuild/mvp. Read CLAUDE.md, docs/design-principles.md, docs/spec.md, then docs/plan.md
sections 5, 6 (phase 9), 7 and 8, then docs/reference/artifact-study.md. Run `npm run gate` to
confirm the baseline: 69 unit files, 536 tests, 12 e2e specs, build green.

Phase 9 is the work: six sub-phases, in order, each ending with a review lane with a browser
pass, a fix lane, and my approval before its merge to rebuild/mvp. Start with sub-phase 9.1:
ask me to approve the npm install for 9.1.1, then launch 9.1.1, 9.1.2, 9.1.3 and 9.1.4 in one
message, each in its own worktree. Section 5 rules apply: one worker per lane in a worktree
under .worktrees/<id>, workers do not commit, gate and git diff --stat before each --no-ff
merge, gate on rebuild/mvp after, worktree removed, status table and section 8 updated. The
owned-file rule and the references per lane in section 6 phase 9 go into every brief.

Ask me before any download (npm install included), any push, and any merge to main.
```

**Start here.** Read `CLAUDE.md`, the principles, the spec, this file (sections 5 to 8) and the
study. Run `npm run gate` once to confirm the baseline (69 unit files, 536 tests, 12 e2e). Then:

1. Sub-phase 9.1. Ask the user to approve the install for 9.1.1 (`@fontsource/archivo`,
   `@fontsource/jetbrains-mono`, `lucide-react`). Launch the four 9.1 lanes in one message.
   9.1.4 is pure data and conflicts with nothing. 9.1.2 owns `src/commands/`; 9.1.3 owns the
   shell files; 9.1.1 owns `src/styles/`. Merge in order 9.1.1, 9.1.4, 9.1.2, 9.1.3, gate after
   each. Then 9.1.R with a browser pass on port 5174, then 9.1.F, then the user's approval.
2. Sub-phases 9.2 to 9.6 follow the same rhythm. 9.3.1 needs an install approval (`three`,
   `@types/three`). Record each merge in section 7 and each phase review in
   `reviews/phase-9.<n>.md`.
3. Phase 8 (vos port) is a separate plan, after phase 9. Any item under "Open items" runs as
   its own lane only when the user asks.

**Brief shape for phase 9 lanes.** Working directory (`.worktrees/<id>`); the lane text from
section 6 verbatim; owned files and the files it must not touch; the references per lane; the
spec sections and acceptance items it serves; the gate (`E2E_PORT=<port> npm run gate`); the
report shape (what changed, tests added, what is open, screenshots for UI lanes); the time
budget from section 6; the lanes running in parallel and their folders. Workers write user-facing
text in the `stat-te-terminology` vocabulary and the principles' words (profile, card, clip,
beat, capture, Elevation, 3D).

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
