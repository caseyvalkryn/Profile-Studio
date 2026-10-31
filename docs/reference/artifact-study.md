# Artifact study: the legacy app as the capability bar

Date: 2026-10-31. Status: approved scope for the post-MVP upgrade. The plan is `docs/plan.md`
phase 9. `docs/spec.md` and `docs/design-principles.md` were amended from this study on the same
day; where this file and the spec disagree, the spec wins and this file is corrected.

Read this after `docs/design-principles.md` and `docs/spec.md`. It answers three questions: what
the artifact is, what it does well for the operator, and what the rebuild must take from it.

## 1. What the artifact is

The artifact `https://claude.ai/artifact/92VicGqajnXq3NnQgqaa1n` (updated 2026-10-30) is
`legacy/` published byte for byte: the same 64 files, the same sizes, and the same sha256 for
`js/11-schema.js`. Schema stamp `profile-studio/4`. The older artifact
`https://claude.ai/artifact/M4Jr3utqfsvt5cEgCHbeB2` is the v3 predecessor, a single 93 kB page,
and a strict subset of v4. So the parity reference is `legacy/`, and
`docs/reference/legacy-app.md` is its inventory. This study does not repeat that inventory.

The rebuild in `src/` is the MVP of `docs/spec.md`: Library, Build, Results and Report; Plan and
side-elevation views; DroneScore scorecard; AAR export. It passes the 11 acceptance items. It
over-indexed on the smallest feature set that meets them. The legacy app is denser, and most of
its density serves a test planner. The upgrade takes that capability and keeps the quiet
interface.

## 2. What the artifact does well for the operator

Evidence is `legacy/js/<file>:<line>` with the function. Each item is one behaviour and the
reason it serves a test planner.

### Brief

1. One key (C) saves the whole working view as a card: camera, layers, time and selection.
   No form. `45-tools.js:836 tools.saveCard`, `90-app.js:529 card.save`.
2. Entering a card applies its camera, layers, readout and time in one step and stashes the
   Build view, restored on Escape. Brief never leaks into Build. `51-panel-cards.js:47
   brief.begin`, `:55 brief.end`, `:70 brief.enter`.
3. The stage head states position and time: "n. Name", "n of m", the projection, `t+2:55` in
   mono. The presenter always knows where the deck is. `51-panel-stage.js:144 renderHead`.
4. Presenter aids: a thumbnail of the next card with its name, an elapsed clock, a "Last card"
   mark. `51-panel-stage.js:124 renderAids`, `:140 renderElapsed`.
5. Full stage scales the type scale for the back of the room; key hints fade after 3 s and
   return on any key. `51-panel-stage.js:175 showHints`, `css/tokens.css:139`.
6. Clip playback: Right plays to the next beat at the clip rate and stops; Left steps back a
   beat, then to the clip start, then to the previous card. The operator narrates a timed
   segment beat by beat. `51-panel-cards.js:100 brief.step`, `34-time.js:96 T.playTo`.
7. Space is context-aware in Brief: next card when time is off, play or pause when time is on.
   `90-app.js:570 card.space`.
8. Caption tokens resolve live at the current time: `{T1.rng}` reads "2.3 nm" and follows the
   scrub. Keys: `rng`, `alt`, `spd`, `vc`, `tta`, `window`, `margin`, `see:<pathId>`.
   `21-derive.js:406 D.tokens`, `51-panel-stage.js:162 renderCaption`.
9. The notes panel previews tokens as you type and marks an unknown one with the reason
   ("has no path T9."). Errors surface before the brief. `51-panel-notes.js:54 preview`.
10. Every notes field is one undo step. Delete is an inline Yes or No row, never a modal.
    `51-panel-notes.js:195 setCard`, `:288`.
11. A live readout strip (K) under the stage gives one mono line per track: id, range, height,
    speed, closing speed, covering sensors. `51-panel-stage.js:101 renderReadout`.
12. The phone stage: Back, dots, Next; a 60 px swipe changes card; the hit sizes grow under a
    coarse pointer. A brief can be given from one hand. `51-panel-stage.js:33`, `:207`,
    `css/tokens.css:130`.

### Build

13. The readout panel follows selection, then hover, and can pin a baseline. During a drag it
    shows deltas against the pre-drag record: "Margin +0:12 (-0:04)". This is the core of a
    layout tool. `51-panel-readout.js:355 build`, `:108 delta`, `:492 pin`.
14. A drag carries a label with the largest downstream change as a second line: "set R1 range"
    then "T1 window -0:08". The operator reads the result, not only the geometry.
    `45-tools.js:438 LABELS`, `:588 move`, `51-panel-board.js:214 showLabel`.
15. The quick-add palette (A) is a searchable list with group headers, catalog values per row
    (speed and height, range and sector) and shortcut hints; S, V and E jump to a group. A radar
    is S and a click, with its values in view. `51-panel-palette.js:117 buildList`, `:32
    KEY_HINT`.
16. The placement ghost snaps to sensor rings, area vertices and edges within 8 px, to 15 degree
    bearings with Shift, else to the grid. Its label names the snap ("on R1 ring") and the leg
    ("1.40 nm, 93 s"). Alt disables snap. `45-tools.js:144 tools.snap`, `:135 legText`.
17. The axon camera orbits by drag (yaw 0.45 deg per px, pitch 0.35 deg per px clamped 8 to 86)
    and prints "vertical x3  yaw -35  pitch 55", so height is not mistaken for scale.
    `40-cameras.js:136 zx`, `:172 hint`, `:178 axon.rotate`.
18. Timeline: scrub on the axis, Shift-drag sets a loop range, Ctrl-wheel zooms time at the
    pointer, an overview bar pans, double-click clears the range. `51-panel-timeline.js:488
    onDown`, `:587 onWheel`, `:602 ovDown`.
19. Bead retime: drag an authored event along its lane; it snaps to a geometry crossing within
    3 s unless Alt is held; one undo step "Move e3". Events sit on the geometry that caused them.
    `51-panel-timeline.js:518`, `45-tools.js:208 tools.snapBead`.
20. Previous and Next ([ and ]) jump through authored events, ladder times, splits and first
    sees. The operator steps through decision points, not seconds. `34-time.js:132 stops`.
21. The cheat sheet is generated from the key map per mode with platform names (Cmd or Ctrl).
    A key that exists is always documented. `46-keys.js:213 PS.keys.sheet`, `:160 pretty`.
22. The tip waits 400 ms of stable hover, shows id, name and one or two facts, follows the
    pointer and flips away from edges. `51-panel-tip.js:5 DELAY`, `:195 place`.
23. Undo and redo toast the label: "Undid: set R1 range." `90-app.js:533`, `30-store.js:312
    undoLabelOf`.
24. Theme cycles auto, light, dark on one button; auto follows the system; the choice persists.
    `90-app.js:697 PS.app.setTheme`, `51-panel-topbar.js:115`.

### Type and layout

25. Two families, Archivo and JetBrains Mono, weights 400 and 500 only. Five sizes with set line
    heights: 11/14 micro, 12/16 data, 13/18 body, 14/20 title, 17/24 display. Tabular numerals,
    caps tracking .06em, three stroke weights .75, 1.25 and 2.25 px. The full stage scales the
    five sizes to 14, 15, 16, 18 and 22 px. `css/tokens.css:3` to `:139`.
26. Layout tokens: list column 232 px, right column 320 px, top bar 48 px, strip 112 px, control
    heights 28, 24 and 22 px, rows 24 and 40 px. Coarse pointer raises hit to 28 px and controls
    to 44 px. `css/tokens.css:130`.

### What it does badly

- Nothing can be edited in the axon view. Every drag there says "Edit in Plan or Elevation."
  The operator sees the problem in 3D and must leave to fix it. `40-cameras.js:169`,
  `51-panel-board.js:459`. The upgrade keeps this rule for the 3D view and makes the switch
  one key.
- The stage rebuilds the whole scene SVG through `innerHTML` on every store channel, including
  each time tick in clip playback. `51-panel-stage.js:182 render`. The port mounts one `<g>`
  per layer and rewrites only the layers whose inputs changed (plan section 6, phase 9, the
  renderer contract).
- Notes save on blur, so a reload or a card switch before blur drops the edit, and the clip
  form is a separate draft lost unless saved. `51-panel-notes.js:201`, `:118`. The upgrade
  writes every field to the document store on input, one undo step per field.

## 3. Gap list with decisions

MVP facts from the 2026-10-31 survey: 30 static commands plus dynamic "Add here" commands in
`src/commands/commands.ts`; `View = 'plan' | 'profile'` and an unused `theme` field in
`src/state/ui.ts`; grid, bearing, field of view and altitude snap with Alt bypass but no snap to
geometry in `src/features/build/map/handles.ts`; `report.slides` repurposed as AAR note storage
in `src/features/report/draft.ts`; legacy `snapshots` and `debrief` not modeled; height planes
and authored events flattened to notes in `src/domain/migrate.ts:165`; no web fonts; entry
80.8 kB gzip, MapView chunk 297 kB gzip.

| Legacy capability | MVP owner | Decision |
| --- | --- | --- |
| Brief mode: card strip, stage, notes | new `src/features/brief/` | In. Fifth workspace, phase 9.5 |
| Save view as card (C) | `src/commands/`, `src/domain/types.ts` Card | In |
| Clip with t0, t1, rate, beats; play to stop | `src/features/build/timeline/usePlayback.ts` | In |
| Caption tokens `{id.key}` | `src/domain/tokens.ts` over the preview | In, same keys |
| Presenter keys, full stage, blank stage, aids | `src/features/brief/` | In |
| Phone stage | `src/features/brief/` | In, coarse-pointer tokens |
| Brief export | none in legacy | Beyond: PDF through print, PNG per card. No PPTX |
| Captured renders and attached images | none in legacy | Beyond: session memory only, never persisted |
| Timeline strip per card | none in legacy | Beyond: the F2T2EA strip at the card time |
| Axon camera with orbit | `src/board/cameras.ts` | In, ported one to one as the 3D view, view only (decision of 2026-10-31 pm, section 5) |
| Elevation as range from a reference origin | `src/features/build/profile/` | In, as a mode beside Along path |
| Reference origin per card (`cam.ref`) | `src/state/ui.ts` | In |
| Layer chips Shift+1..8 | `src/features/build/map/layers.ts`, `src/commands/` | In, chips hidden by default |
| Link envelopes, track lifecycle drawing | `src/features/build/map/layers.ts` | In |
| Readout strip with pin and drag deltas | `src/features/build/readout/` | In, hidden by default |
| Chart strip under the board | `src/features/build/timeline/` | In, as a strip mode (R cycles) |
| Drag labels with the largest downstream change | `src/features/build/map/` | In |
| Quick-add palette, S V E | `src/features/build/assets/`, `src/ui/Palette.tsx` | In, as the Add group of the palette |
| Formation popover | `src/commands/` | In |
| Snap to geometry, G toggle | `src/features/build/map/handles.ts` | In |
| Height planes | `src/domain/types.ts` | In, real field, round-trips |
| Area kinds with bottom and top | `src/domain/types.ts` Area | In, `zMinM` and `zMaxM` |
| Snapshots list | `src/domain/types.ts` | In, round-trips; drives envelopes when time is off |
| Data list (`data[]`) | `report.dataSources` exists | In, editable in Report |
| Authored events with geometry warnings | `src/domain/types.ts`, `src/engine/preview.ts` | In, as the planned row. Scorecard stays engine-only |
| Debrief TSPI overlay | `src/domain/types.ts` Debrief, `src/features/build/debrief/` | In, paste or CSV per profile |
| Ladder table | Results scorecard | Out. The scorecard by F2T2EA replaces it |
| Theme control | `src/state/ui.ts` has `theme` | In, one command and one top bar control |
| Undo labels on the button and a toast | `src/features/build/BuildWorkspace.tsx` | In |
| Full key table | `src/commands/commands.ts` | In; conflicts resolved in spec section 8 |
| Export library as one JSON | `src/state/persist.ts` | In |
| Archivo and JetBrains Mono, five-step scale | `src/styles/tokens.css` | In, self-hosted |
| Warm paper and graphite palette | `src/styles/tokens.css` | Out. The cool palette and one accent stay |
| UI icons | none in legacy | Beyond: Lucide with labels |
| New profile button | `src/features/library/`, `src/commands/` | Beyond: instant blank in Build, Cmd+N |

Four legacy capabilities stay out: the ladder table, the warm palette, authored events as engine
inputs, and editing in the 3D view.

## 4. Decisions on record (interview of 2026-10-31)

1. The operator sees the word Profile. Code types keep the name Vignette. Because Profile now
   names the record, the side-elevation view is renamed Elevation (its legacy name). Views are
   Plan, Elevation and 3D on keys 1, 2 and 3.
2. New is instant: a button in Library and Build and Cmd+N create "Untitled profile" with the
   default site and one defended asset, open Build and focus the name field. Templates stay a
   separate choice; a menu arrow on New offers "From template".
3. Progressive disclosure. Default Build shows the map, the timeline, the asset library, the
   inspector and the top bar. Layer chips, the readout strip, the chart strip, the debrief panel
   and the authored-event list start hidden and open by key, palette or a quiet toggle. Every
   feature registers in the command registry. The 10 minute first-use goal stays and is re-run
   in phase 9.5.
4. Type system: Archivo and JetBrains Mono bundled from `@fontsource` packages (OFL), weights
   400 and 500, the five-step scale with its line heights, tabular numerals, three stroke
   weights, the full-stage scale. The MVP palette and the single accent stay. Icons: Lucide,
   with a label; icon-only controls get a tooltip. Board symbols do not change.
5. 3D: the legacy axon camera ported one to one as the third view of the same board. Orbit,
   zoom and fit. View only; a drag in 3D shows a one-line prompt and 1 or 2 switch views. The
   vertical exaggeration, yaw and pitch print on screen as in the legacy axon. (Revised the same
   afternoon; the morning decision was a three.js scene. See section 5.)
6. Elevation view gets a mode: Along path (the MVP reading) or From asset (the legacy reading:
   every path, slant arcs with elevation limits, height planes).
7. Basemap: the blank grid, as in the legacy board. An imagery underlay for the plan view is
   deferred to a later lane (revised the same afternoon; MapLibre leaves with the port).
8. Brief: fifth workspace built the legacy way. Cards re-render the live scene at the saved
   camera, layers and time. Clips with beats, caption tokens, presenter keys, full stage, blank
   stage, aids, readout strip, phone stage. Added: a timeline strip per card, Capture to a PNG
   held in session memory, attached images held in session memory, PDF of the deck through the
   print stylesheet, PNG per card. No PPTX. Report can embed a card.
9. Storage: profiles, cards, runs and settings persist in IndexedDB as today. Captured renders
   and attached images never persist. A card re-renders from its saved view after a reload.
10. Authored events are the planned row. Each threat row on the timeline shows planned beads,
    simulated stage times from the latest run, and flown times when debrief data is loaded.
    Warnings fire when a bead contradicts geometry. The scorecard stays engine-only.
11. Debrief input: pasted TSPI text or a CSV file with t, x, y, z per path, plus an optional
    event list, stored in the profile. Shown as the flown row, a flown track on the map and in
    3D. No live feed.
12. Non-goals stay: backend, accounts, multi-user, vos port, live feeds, false alarm simulation,
    real-system specification library.
13. Budgets: the entry ceiling stays at 500 kB gzip; the port removes MapLibre. The 3D view
    holds the map drag budget, since it is the same renderer. Capture under 300 ms. A 20 card
    deck prints in under 10 s. (Revised the same afternoon.)
14. Delivery: five sub-phases in order: Foundation, Board, Strip and events and debrief, Brief,
    Acceptance (revised the same afternoon; see section 5). Each phase ends with a review with browser screenshots, a fix lane and
    the user's approval before merge to `rebuild/mvp`. The 11 acceptance items stay green and
    new items cover the upgrade.

## 5. Delivery decision: port, not retrofit (2026-10-31, afternoon)

The user compared the MVP and the legacy app side by side and asked whether a new build from the
artifact beats a retrofit of the MVP. The answer on record: port the legacy interface one to one
onto the MVP's engine, domain and state, and remove MapLibre. The plan is `docs/plan.md` section
6, phase 9. The morning draft of phase 9 (a retrofit with three.js) is withdrawn.

Evidence:

| | Legacy artifact | MVP |
| --- | --- | --- |
| Code | 12.4k lines ES5, 46 modules | 33k lines TS, of which 16k is the frozen rangeboard sim |
| Board | One SVG renderer, three cameras, 11 layers | MapLibre plan view, SVG side profile, HTML label overlay |
| Modes | Build, Brief, Library | Library, Build, Results, Report |
| Engine | Deterministic derive | Monte Carlo, DroneScore scorecard, sweeps, AAR |
| Type | Archivo and JetBrains Mono, five-step scale | System fonts, no scale |
| Tests | 11 smoke cases | 536 unit, 12 e2e |

Reasons:

1. An oracle exists. Every ported panel, layer and camera is checked against the running legacy
   app side by side. A retrofit re-derives each behaviour through MapLibre and three.js, which
   is how the MVP became a reduced copy.
2. One renderer. The retrofit ends with three (MapLibre, SVG elevation, three.js) and 11 layers
   duplicated as mesh builders. The legacy design draws all three views through one layer set.
3. MapLibre fights the design: labels as an HTML overlay because a blank style has no glyphs
   offline, a mock in every board test, `preserveDrawingBuffer` for capture. The default
   basemap is a blank grid.
4. The coupling is small. Two MVP files import MapLibre. The domain, engine, state, commands,
   UI primitives, Results and Report never touch the board.

Cost: `src/features/build/{map,assets,inspector,timeline,profile}` (6.4k lines), the MVP library
screen and the 12 end-to-end specs' selectors are replaced. The lanes 4.x, 7.4 to 7.11 and 7.F
that polished the MapLibre board are sunk. The lane count is about the same as the retrofit
draft: it is set by the legacy module count, not by the approach.

## 6. Sources

- Artifact inventory and MVP survey: worker reports of 2026-10-31 (scratch, not kept).
- `docs/reference/legacy-app.md` for the legacy inventory.
- `legacy/` for every line cited above.
