# Phase 4 review and browser check (lane 4.R)

Reviewed: `5b1cdcd..921ee03` (lanes 4.1 to 4.5) at worktree `lane/4.R`, 2026-10-30.
Browser: Chrome through claude-in-chrome, dev server `npm run dev -- --port 5174 --strictPort`.

## Verdict

Phase 4 does not work in a browser as shipped. The dev server bound on 5174 and the Build
workspace renders, but the map is dead: the MapLibre container is 0 px tall (F-01), and the
MapLibre worker 404s in dev and is missing from the production build (F-02). Right-click
menus never open (F-03), so acceptance 12.3 fails. All three defects are invisible to jsdom and
the MapLibre mock, which is why 401 green tests and the lane reports missed them. With the
first two patched in the page only (a CSS override and `setWorkerUrl`), the rest of Build
holds up well. Placement lands at the click point, one undo removes it, a ring drag updates
the inspector within 1 to 2 frames, Escape cancels drawing, Enter ends a path, Space plays,
the palette and shortcut sheet match the spec, tooltips behave, and a run completes in the
worker. Fix F-01 to F-03 and add one Playwright smoke that opens `/build` before phase 4 is
called done.

## Browser check

Theme in use: dark (`prefers-color-scheme: dark` true, `--accent #4f8cff`). Light theme not
testable (no emulation in the tools). Steps b to h ran with the F-01 and F-02 page patches
applied after step a; each "pass" below means "passes once F-01 and F-02 are fixed".

| Step | Result | Note | Screenshot |
| --- | --- | --- | --- |
| a. Layout renders | fail | App bar, top bar, assets, inspector, timeline render. Map container 0 px tall; canvas stuck at 300 px default; no grid lines; 12 `Worker failed to load` errors | `phase-4/01-build-as-shipped.png` |
| a'. Layout, patched | pass | Grid, rings, sector, labels draw. Grid labels in km under an nm toggle (F-04) | `phase-4/02-build-patched.png` |
| b. Drag radar to map, Cmd+Z (12.2) | not testable / pass | Native HTML5 drag does not fire through the tools. Click-to-arm then click placed RDR-2 at 3.17 nm E, 1.30 nm N, matching the grid within 1 px. One Cmd+Z removed it | none |
| c. Right-click, Add here, Sensors, 3D radar (12.3) | fail | No menu opens. MapLibre calls `preventDefault` on every contextmenu; Radix then skips opening (F-03) | none |
| d. Drag ring (12.4) | pass | Range 2.16 → 3.01 nm. Inspector and cursor value update 12 to 18 ms after each move. One Cmd+Z restores 2.16. No threat yet, so timeline update not observable here. Inspector shows raw `3.013` (F-09) | none |
| e. Threat, 3 waypoints, Enter, Escape, Space | pass | Escape mid-draw cancelled with no change and kept the selection. 3-point path T1 created, timeline row and t+23:44 appear. Space plays; marker moves. Waypoint fields unreadable (F-05) | `phase-4/03-threat-path.png` |
| f. Cmd+K "run"; `?` sheet (12.10 partial) | pass | `Run  Cmd+Enter` listed; sheet rows match spec section 8 key table | `phase-4/04-palette-run.png`, `phase-4/05-shortcut-sheet.png` |
| g. Tooltips | pass | Run: "Run Cmd+Enter" below the button after the pause. Library item: tooltip to the right, does not cover it; raw URL text (F-11) | none |
| h. Run | pass | Cmd+Enter: run `done`, progress 100/100, `doc.runs` 0 → 1. Progress too fast to see; Build shows no result (F-08). Results renders its placeholder | `phase-4/06-results.png` |

GIF not recorded: export is a browser download, outside this lane's permissions. The server
was stopped and the tab closed. Side effect: autosave wrote the edited "Point defence" (T1
and one run) to IndexedDB for origin `localhost:5174`; `openStartVignette` will open it next time.

## Findings

### F-01 blocker: the map container has zero height
- File: `src/features/build/map/MapView.tsx:3`, `:41`.
- Defect: `maplibre-gl.css` is unlayered. Its `.maplibregl-map { position: relative }` beats
  Tailwind 4's `@layer utilities .absolute`, so the `absolute inset-0` map div computes
  `position: relative` with height 0. MapLibre sizes the canvas from a 0-height container and
  falls back to 300 px. `overflow: hidden` then clips it, and clicks land on the wrapper.
- Evidence: computed `position: relative`, rect height 0 inside a 579 px `map-view`. Canvas
  style `height: 300px`. Arm-and-click placed nothing. Adding
  `.maplibregl-map{position:absolute!important}` fixed layout.
- Fix: import the MapLibre CSS into a cascade layer below utilities
  (`@import 'maplibre-gl/dist/maplibre-gl.css' layer(base);` in `src/styles`), or size the map
  div with inline style. Then call `map.resize()` from a `ResizeObserver` on the container.

### F-02 blocker: MapLibre worker 404 in dev, absent from the build
- File: `src/features/build/map/controller.ts:3`, `:76` (map creation); `vite.config.mts`.
- Defect: MapLibre 6.16 resolves its worker as `new URL(`./${workerName}`, import.meta.url)`.
  Vite's dep prebundle moves the module to `node_modules/.vite/deps/`, where no worker exists.
  In the production build Rolldown cannot see the template URL, so no worker chunk is emitted.
- Evidence: 12 console errors `Worker failed to load` from `.vite/deps/maplibre-gl.js`.
  `curl /node_modules/.vite/deps/maplibre-gl-worker.mjs` returns 404. `vite build` to scratch
  emits only `sim.worker-*.js`; `MapView-*.js` still names `maplibre-gl-worker.mjs`. Calling
  `setWorkerUrl('/node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs')` before remount fixed
  rendering.
- Fix: `import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'` and
  `setWorkerUrl(workerUrl)` before `new MlMap`. Verify in `vite` and `vite preview`.

### F-03 blocker: right-click menus never open (acceptance 12.3)
- File: `src/features/build/map/MapView.tsx:29-41`; `src/ui/ContextMenu.tsx:24-27`.
- Defect: MapLibre's mouse rotate and pitch handlers set
  `contextmenu = e => e.preventDefault()` on the map container, even with `dragRotate: false`.
  The native event reaches React already prevented, and Radix `composeEventHandlers` skips
  its open handler when `defaultPrevented` is true. The trigger stays `data-state=closed`.
- Evidence: `menuAt(450,470)` returns `{kind:'map'}`. A patched `preventDefault` logged one
  caller, `MP.e.contextmenu` in `.vite/deps/maplibre-gl.js:34037`. No `[role=menu]` was ever
  added. Real right-click and a dispatched event both fail. The jsdom mock has no handler.
- Fix: open the map menu from the controller's own `contextmenu` listener in capture phase
  on `el`, and render it as a controlled menu anchored at the pointer (`ui/Menu.tsx`).
  Do not rely on bubbling past MapLibre. Cover it with a Playwright test.

### F-04 major: map grid labels ignore the units toggle
- File: `src/features/build/map/geojson.ts:356-358`.
- Defect: grid labels are hard-coded `km` while the top bar and inspector show nm, ft and kt.
  Principle 1.3 says one toggle changes display units everywhere.
- Evidence: screenshots 02 and 03 show "4 km N" beside an inspector reading "3.17 nm".
- Fix: format grid labels through `shared/units.ts` and pick grid steps in display units.

### F-05 major: waypoint fields cannot show their values
- File: `src/features/build/inspector/panels.tsx` (waypoint rows, about `:115-160`).
- Defect: four fields per row in a 260 px inspector. x and y show "–: nm", alt shows a
  stacked "ft AGL" with no number, Height AGL on sensors shows "6 ft AGL" clipped.
- Evidence: screenshot 03.
- Fix: two fields per row, or a compact table with the unit in the column head.

### F-06 major: ground elevation MSL carries an AGL unit
- File: `src/features/build/inspector/Inspector.tsx:96-99`.
- Defect: `q="altitude"` renders "ft AGL" for a field labelled MSL. The datum is wrong on a
  reference value.
- Evidence: screenshot 01, Site section.
- Fix: add an `elevation` quantity (ft MSL, m MSL) to `shared/units.ts`.

### F-07 major: Pfa displays as 0.00
- File: `src/features/build/inspector/panels.tsx:314-321`.
- Defect: Pfa (typically 1e-6) renders "0.00 per look". The display rounding erases the
  value, and a user who edits it writes 0.
- Evidence: radar inspector, steps b and d.
- Fix: a `format` prop with exponent notation, for example `1e-6`.

### F-08 minor: a run gives no visible feedback in Build
- File: `src/features/build/BuildWorkspace.tsx:115-130`.
- Defect: progress shows only while `status === 'running'`. A 100-replicate run ended before
  a screenshot, and nothing on Build says it finished or where the result is.
- Fix: after `done`, show a short status ("Run 1 done, view results") for a few seconds.

### F-09 minor: inspector and readouts mix precision
- Files: `src/ui/Field.tsx:123-124`; `src/features/build/inspector/panels.tsx` (path length).
- Defect: after a ring drag the Range field shows `3.013`, while the cursor tip shows
  `3.01 nm`. Path length shows `9.224 nm`. Fields without a `format` prop show raw values.
- Fix: give every UnitField `format` from `shared/units.ts`.

### F-10 minor: speed placeholder reads as a value
- File: `src/features/build/inspector/panels.tsx:97`.
- Defect: "23.3 cruise kt" puts a word inside a number box.
- Fix: placeholder `23.3` with the hint "cruise" in the label or the tooltip.

### F-11 minor: the library tooltip shows a raw URL on one unbounded line
- Files: `src/features/build/assets/library.ts:130`; `src/ui/Tooltip.tsx` (`whitespace-nowrap`).
- Defect: the tooltip reads "Source: https://drdrone.ca/pages/..." at about 600 px wide over the map.
- Fix: show the source name, keep the URL in the inspector, and cap tooltip width.

### F-12 minor: map labels overlap at the origin
- File: `src/features/build/map/controller.ts` (label overlay).
- Defect: RDR-1, RF-1, EW-1 and DA are co-located in the dev vignette, so their labels stack
  into an unreadable glyph. The overlay has no collision rule (open item from 4.1).
- Evidence: screenshots 01 to 03.
- Fix: offset labels of co-located assets, or show one label with a count.

### F-13 minor: sensor, effector and C2 library items show no values
- File: `src/features/build/assets/AssetsPanel.tsx:105-107` (summary only for threats).
- Defect: principle 3.3 says library items carry real values. Only threats show kt and ft.
- Fix: show range and FOV for sensors and effectors.

### F-14 minor: hostile colour has no token
- Files: `src/features/build/map/layers.ts:17-21`; `src/features/results/results.css:1-22`.
- Defect: hostile is hard-coded per theme. Results defines its own `--state-*` locally.
- Fix: add `--state-hostile` and the evaluation states to `src/styles/tokens.css`.

### F-15 minor: duplicated formatters remain
- Files: `src/features/results/format.ts`, `src/features/report/format.ts`,
  `src/features/report/factors.ts:30`, `src/features/commands/adapter.ts:105`.
- Defect: two local formatter files and ad hoc `toFixed` beside `shared/units.ts`.
- Fix: fold into `shared/units.ts` (5.3 is touching both screens).

### F-16 note: snap is invisible at working zoom
- File: `src/features/build/map/handles.ts:11`.
- Defect: snap is a fixed 10 m. At the default zoom 1 px is about 17 m, so ring drags land
  on values like 2.478 nm. Alt disables snap as specified.
- Fix: snap range to a display-unit step tied to zoom (for example 0.05 nm).

### F-17 note: the map focus ring uses the accent
- File: `src/features/build/map/MapView.tsx:41` (focus ring on the map container).
- Defect: after a click, a 1 px accent outline frames the whole map. Principle 5.2 reserves
  the accent for selection and current time.
- Fix: use `focus-visible` only, in a muted colour.

### F-18 note: dev vignette hack
- Files: `src/features/build/devVignette.ts`, `src/App.tsx:6`, `:40`.
- It is marked PHASE 6 REMOVAL and falls back cleanly. It opens the newest stored vignette,
  so a reviewer's edits persist across loads. Lat/lon import as 0 (2.1 open item).

### F-19 note: circle areas and timeline lanes not exercised
- Circle areas draw as polygons (4.1 open item). The dev vignette has no areas, so this was
  not seen. The timeline showed one T1 row with faint tick marks and no F2T2EA lane labels
  before the run. Spec section 7 asks for one lane per step. Check in 7.2 with a template.

## Confirmed correct

- Arm-and-click places at the cursor; one Cmd+Z removes the placement (12.2, click path).
- A ring drag is one undo step. The cursor value and inspector update within 1 to 2 frames.
- Escape order: the first Escape cancels the draft and keeps the selection.
- Enter ends a 3-waypoint path; Space plays and pauses; the marker moves.
- The palette lists every registered command except `help.palette` (`adapter.ts:224-228`).
  `Run` shows `Cmd+Enter`, and the shortcut sheet matches spec section 8.
- Tooltips: 400 ms delay and 300 ms skip (`Tooltip.tsx:7-8`); placed beside, not over, the target.
- The run executes in `sim.worker`, completes 100/100 and appends to `doc.runs`.
- Numbers in panels, the timeline and the grid use the mono font.
- One accent (`#4f8cff`) marks selection, the current time and Run.
- Bundles (`vite build`): entry 169.40 kB gzip, MapView 295.71 kB gzip, under the 500 kB budget.
- The MapView Suspense fallback is a `bg-surface-0` div, the same colour as the map, so no flash.
- `npx vitest run`: 59 files, 401 tests pass; no `console.error` or stderr in the log.
- First load interactive under 2 s: not measurable on the dev server (unbundled modules);
  measure on `vite preview` in 7.2.

## What 7.2 (first-use audit) should watch

1. Run the audit on `vite preview`, not only `vite`, so F-02 class defects show.
2. Right-click every target in the section 8 table once F-03 is fixed; check each item's
   shortcut and disabled reason.
3. Native drag from the library with a real mouse (12.2), including the ghost and threat path start.
4. Light theme on a light-mode machine: map colours, state colours, tooltip contrast.
5. Units toggle: every number on the map, grid, timeline, inspector and tooltips switches.
6. A template with areas and several threats: circle areas, F2T2EA lanes, label collisions,
   60 fps drag with 40 threats and 15 sensors.
7. Whether a first-time user notices that a run finished (F-08).
