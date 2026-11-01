# Profile Studio MVP specification

Status: definitive for the MVP and the upgrade. Date: 2026-10-30, amended 2026-10-31 from
`docs/reference/artifact-study.md` (sections 1, 2, 5 to 8, 10 to 12), amended 2026-11-01 in
lane 10.1 (sections 1, 4, 6, 7, 8, 11, 12). Read
`docs/design-principles.md` first. When this spec and a principle disagree, the principle wins
and this spec is corrected. The word "vignette" in code and in sections written before the
amendment means the record the UI calls a profile.

## 1. Product

Profile Studio is a counter-UAS test planning tool. A test planner creates, iterates and briefs
test profiles as interactive, detailed mockups. The planner builds a profile on a map. The
profile states one question, its data products and its measures of performance by DroneScore
ID, grouped by F2T2EA. The planner saves views as cards and briefs the profile from the app.
Profile Studio plans real tests. It does not run or score them. The product is a more polished
version of the v3 mockup `legacy/mockup-v3.html` (pivot of 2026-11-01, plan phase 10).

**User.** A test engineer or evaluator. A domain expert, not a programmer. The user knows C-UAS
sensors, effectors, threats and test design. The user does not know the app.

**First-use goal.** With no help, a new user opens a template, moves one sensor, saves a card
and briefs it in under 10 minutes.

**Non-goals.** Running or scoring a test. Later phases: backend, accounts, multi-user editing,
vos integration, live data feeds, false alarm simulation, real-system specification library.

**Upgrade (2026-10-31).** The MVP passed its acceptance suite on 2026-10-30. The upgrade brings
the app to the capability of the legacy app and past it: a New profile flow, the legacy type
system, the three legacy views (Plan, Elevation, 3D), the legacy board layers and readouts,
authored events with a debrief overlay, record round-trip, and a Brief workspace with export.
It is delivered as a one-to-one port of the legacy interface onto the MVP engine (plan section 6,
phase 9). Scope and decisions are in `docs/reference/artifact-study.md`. The first-use goal does
not change.

## 2. Terms

Use these words in the UI. One word for one thing. The code keeps the type names it has:
`Vignette` is the type of a profile.

| Term | Meaning | Replaces (legacy) |
| --- | --- | --- |
| Profile | One test situation: site, assets, threats, question, runs, cards | profile; "vignette" in the MVP |
| Library | The start screen: New, templates and saved profiles | Collect |
| Template | A read-only profile that opens as a new copy | template |
| Asset | Anything placed on the map: threat, sensor, effector, C2 node, TSPI station, area | item |
| Threat | A UAS with a type from the catalog and a flight path | aircraft |
| Flight path | Ordered waypoints with altitude, speed and hold time | path |
| Sensor | Radar, RF detector, EO/IR or acoustic | system |
| Effector | RF effector, kinetic effector or directed energy | system |
| Area | Defended asset, engagement zone, no-fly area, reference pattern, with a bottom and a top | volume |
| Height plane | A reference altitude drawn across the scene | plane |
| View | Plan, Elevation or 3D. Plan and Elevation edit; 3D looks | camera (plan, elev, axon) |
| Authored event | A planned kill-chain event at a time on a flight path: detect, track, identify, engage, split, merge, loiter, terminal, checkpoint | event |
| Debrief | Flown TSPI and events loaded after a range run, shown against the plan | debrief |
| Snapshot | A time at which envelopes draw when the time cursor is off | snapshot |
| Run | One simulation batch of N replicates with one seed | none |
| Replicate | One simulated trial. It writes one DroneScore run row per threat | none |
| Measure | One DroneScore row, by ID and name | MOP text |
| Threshold | The value a measure must meet in this vignette | none |
| Question | `Q-nn`: what the test must answer | purpose |
| Hypothesis | `H-nn`: a testable statement on one measure | none |
| Prediction | The expected value range, recorded before the first run | none |
| Sweep | Runs over a set of levels of one or two factors | none |
| AAR | The exported report | none |
| Brief | The workspace that presents a profile as cards | Brief mode |
| Card | A saved way of looking: view, layers, time, focus, caption, notes | card |
| Clip | A card's playback from one time to another at one rate, with beats | clip |
| Beat | A time inside a clip where playback stops | beat |
| Capture | A picture of the stage held for the session and exported as PNG or PDF | none |

## 3. Standards

1. **Measures.** `docs/reference/dronescore-measures.md` is the only list. A measure keeps its
   DroneScore ID, name and unit.
2. **Kill chain.** F2T2EA is the display grouping over DroneScore `stage_reached`. The table is
   in `docs/reference/jiatf-401.md` section c. Target has no stored stage. It shows the
   decision time between Track and Engage.
3. **Units.** Store metres, seconds and metres per second. Display nm, ft AGL and kt by default.
   One toggle switches to km, m and m/s. Time shows as `t+m:ss`. Bearing shows as three digits
   and a degree sign.
4. **Frame.** Positions are metres east (x) and north (y) of the site origin. Altitude (z) is
   metres above ground level. The site stores the origin latitude, longitude and ground
   elevation.
5. **IDs.** Assets get short IDs by kind: `RDR-1`, `RF-1`, `EO-1`, `AC-1`, `EW-1`, `KIN-1`,
   `DE-1`, `C2-1`, `TM-1`, `T1` for threats, `DA` for the defended asset. Questions and
   hypotheses use `Q-01` and `H-01`.
6. **Terminology.** User-facing T&E words follow the `stat-te-terminology` skill.

## 4. One question, one profile, one brief

1. A profile states one question. Every other part of the profile serves that question.
2. The profile names its data products: the data the test must collect to answer the question.
3. The profile states its measures of performance by DroneScore ID and name, each under one
   F2T2EA step, with its threshold. See `docs/reference/dronescore-measures.md`.
4. The brief carries the question, the data products and the measures to the test team. The
   app plans the test. It does not run or score it.

## 5. Data model

TypeScript types in `src/domain/types.ts`. Runtime validation with zod in `src/domain/schema.ts`.

```ts
type Vignette = {
  schema: 'profile-studio/5'
  id: string; name: string; updated: string
  site: { name: string; lat: number; lon: number; elevM: number }
  questions: Question[]            // Q-01 ...
  hypotheses: Hypothesis[]         // H-01 ...
  threats: Threat[]
  sensors: Sensor[]
  effectors: Effector[]
  nodes: Node[]                    // C2 and TSPI stations
  areas: Area[]
  planes: HeightPlane[]            // upgrade
  events: AuthoredEvent[]          // upgrade: the planned row
  snapshots: number[]              // upgrade: seconds
  cards: Card[]                    // upgrade: the brief
  debrief: Debrief | null          // upgrade: flown data
  chainTime: { decisionS: number; assignS: number }   // Target step inputs
  measures: MeasureSetting[]       // the rows this vignette scores, with thresholds
  runs: RunSummary[]               // stored results, newest first
  report: ReportDraft
}
type Area = { id: string; kind: 'asset'|'wez'|'nfz'|'ref'; label: string
  pts: { x: number; y: number }[]; zMinM: number; zMaxM: number }
type HeightPlane = { id: string; label: string; zM: number }
type AuthoredEvent = { id: string; tS: number
  type: 'detect'|'track'|'identify'|'engage'|'split'|'merge'|'loiter'|'terminal'|'checkpoint'
  label: string; threatKey: string; sensorKey: string | null }
type Card = { id: string; name: string; view: CardView
  layers: Partial<Record<LayerId, boolean>>
  displays: { timeline: boolean; chart: boolean; readout: boolean }
  clip: Clip | null; focus: string[] /* keys */; tS: number | null /* null: time off */
  caption: string; notes: string }
type CardView = { kind: 'plan'|'elevation'|'3d'; centre: { x: number; y: number }; zoom: number
  yawDeg: number; pitchDeg: number; ref: 'asset' | string /* key */
  elevationMode: 'alongPath'|'fromAsset' }
type Clip = { t0S: number; t1S: number; rate: number; beatsS: number[] }
type Debrief = { source: string; loadedAt: string
  tspi: Record<string /* threat key */, [number, number, number, number][] /* t, x, y, z */>
  events: { tS: number; type: AuthoredEvent['type']; threatKey: string; sensorKey: string | null }[] }
type LayerId = 'reach'|'events'|'envelopes'|'tracks'|'telemetry'|'labels'|'rings'|'target'
type Threat = { id: string; type: string /* catalog id */; path: Waypoint[]; speedMs?: number }
type Waypoint = { x: number; y: number; z: number; holdS: number }
type Sensor = { id: string; kind: 'radar'|'rf'|'eoir'|'acoustic'; x: number; y: number; z: number
  rangeM: number; minRangeM: number; fovDeg: number; bearingDeg: number
  elMinDeg: number; elMaxDeg: number; model: SensorModel; entered: Record<string, Entered> }
type Effector = { id: string; kind: 'ew'|'kinetic'|'de'; x: number; y: number; z: number
  rangeM: number; fovDeg: number; bearingDeg: number; timeToEffectS: number; pk: number
  entered: Record<string, Entered> }
type Node = { id: string; kind: 'c2'|'tspi'; x: number; y: number; z: number; rangeM: number
  fovDeg: number /* legacy default 0; 360 or more is the full ring */; bearingDeg: number }
type MeasureSetting = { id: string /* DroneScore ID */; op: '>='|'<='; threshold: number; unit: string }
type Hypothesis = { id: string; question: string; measure: string; op: '>='|'<='; value: number
  prediction: { low: number; high: number } | null; lockedAt: string | null }
type Entered = { value: number | boolean | string; source: string }   // source note is required
type RunRow = {                    // one per threat per replicate; DroneScore field names
  run: number; threat: string
  stage_reached: 'none'|'detect'|'track'|'classify'|'identify'|'engage'|'defeat'
  detect_range_m: number|null; detect_alt_m: number|null
  track_continuity_pct: number|null; track_error_m: number|null
  id_range_m: number|null; id_time_s: number|null; identified_ok: boolean|null
  engagement_range_m: number|null; time_to_intercept_s: number|null
  outcome: 'Success'|'Miss'|'No Attempt'
}
```

`SensorModel`, `Node`, `Area`, `RunSummary` and `ReportDraft` are defined in the code with the
same rules. Every asset, waypoint, question and hypothesis also carries `key: string`, a UUID
minted at creation that never changes. The display `id` (such as `RDR-1`) can be renamed.
References between records and React list keys use `key`, never `id` or an array index. Legacy v4 records import through `src/domain/migrate.ts`. The import maps profile to
vignette, aircraft and paths to threats, systems to sensors, effectors and nodes, volumes to
areas, and MOP text to a question note. It keeps all free text.

Upgrade rules for the record:

1. Height planes, area bottom and top, authored events, snapshots, cards, the data list
   (`report.dataSources`) and debrief data import from legacy v4, edit in the app, and export
   without loss. Nothing is flattened to a note.
2. A card stores a way of looking, never a picture. Captured renders and attached images live in
   session memory only and are not part of the record or of IndexedDB.
3. `ReportDraft.slides` keeps its current use as AAR note storage. Cards are `Vignette.cards`.
4. The schema stamp becomes `profile-studio/6`. A v5 record migrates with empty lists and a
   null debrief.

## 6. Engine

Pure TypeScript in `src/engine/`. No React, DOM or store imports. A lint rule enforces this.
The engine plans. It does not simulate replicates or score measures.

1. **Geo.** `src/engine/geo.ts`. Geometry and timing ported from `legacy/js/20-geo.js`: metres,
   seconds, bearings clockwise from north. Positions along a path, ranges, coverage windows.
   The numbers match the legacy app, so the `fixtures/legacy-derive/` parity holds.
2. **Preview.** `preview(v: Vignette): Preview`. Expected-value geometry: coverage windows per
   sensor and threat, first detection, the F2T2EA stage times, area entry times. It runs on every
   edit. Budget: 100 ms for 40 threats and 15 sensors.
3. **Derived.** `derived(v, p)`. The renderer's object, built from the preview and keyed by
   display id: stages, windows, first and last sight, system times and event warnings. The
   readout at time t (`at`), caption tokens, envelopes, the track line, crossings, stops and the
   range series read from it.

Every engine function is deterministic for a given input.

## 7. Screens

Three workspaces in a top bar: Library, Build, Brief. The command palette
(Cmd+K) is available everywhere. The top bar also holds New, undo and redo with the pending
label, the units toggle and the theme control (auto, light, dark).

**Library.** A New button first. Templates in one row of cards with a map thumbnail, the
question and the F2T2EA steps it exercises, Blank last. Saved profiles below, newest first.
Search filters both. Actions: open, duplicate, export, delete with undo, import JSON (v6, v5 or
legacy v4), export the library as one JSON.

**New.** The New button and Cmd+N create "Untitled profile" with the default site and one
defended asset, open Build and focus the name field for inline rename. A menu arrow on New
offers "From template". Nothing asks a question first.

**Build.** The map fills the screen. The default layout is the four panels below and the top
bar. Every other panel starts hidden (principle 5.8).
- Left: the asset library. Grouped as Threats, Sensors, Effectors, C2 and TSPI, Areas, Height
  planes. Collapses to icons. The command palette's Add group is the quick-add: search by name,
  catalog values per row, shortcut hints; A opens it, S, V and E open it on a group.
- Right: the inspector for the selection. It shows only the fields of that kind, with units.
  Areas show bottom and top. Authored events show type, time, path, sensor and any warning.
- Bottom: the timeline with one lane per F2T2EA step and one row per threat. Each row shows the
  planned beads (authored events), the preview stage times, and the flown times when debrief
  data is loaded. Play, pause, scrub, loop; Shift-drag sets the loop; drag a
  bead to retime it, snapping to a geometry crossing within 3 s. R cycles the strip between
  timeline, chart and readout.
- Top: profile name, the active question, the view switch (Plan, Elevation, 3D).
- Hidden until asked: layer chips (Shift+1 to 8, one chip per `LayerId`), the readout strip
  (follows selection then hover, pins a baseline, shows deltas during a drag), the chart strip,
  the authored-event list, the debrief panel (paste TSPI or load a CSV), the snapshot list.
- Views. Plan: north up. Elevation: a side view with a mode, Along path (distance along the
  selected flight path) or From asset (range from the reference origin; every path, slant arcs
  with elevation limits, height planes). 3D: the axonometric camera ported from the legacy
  axon view, drawn by the same layers as Plan and Elevation. Orbit by drag (yaw 0.45 and pitch
  0.35 degrees per pixel, pitch clamped 8 to 86 degrees), zoom and fit. It animates the threats
  and track frames at the current time and prints its vertical exaggeration, yaw and pitch
  ("vertical x3  yaw -35  pitch 55"). A drag in 3D does not edit; it shows "Edit in Plan (1) or
  Elevation (2)".
- Basemap. The blank grid with range rings, axes, compass and scale bar, as in the legacy
  board. An imagery underlay for the plan view is deferred (plan section 6, phase 9).
- Drag labels. A drag shows the value under the cursor and, on a second line, the largest
  downstream change, for example "T1 window -0:08".

**Brief.** Cards on the left, the stage in the centre, notes on the right.
- Save card (C, anywhere in Build) captures the view, layers, time and selection as a card,
  inserted after the current card. Cards reorder by drag, duplicate and delete with undo.
- The stage renders the card through the same map, elevation or 3D view at the card's time,
  with its timeline strip, a caption with resolved tokens, and the readout strip when on. The
  head shows "n. Name", "n of m", the view and `t+m:ss`.
- Opening a card applies its view; leaving Brief restores the Build view.
- Clip: t0, t1, rate and beats on the notes panel. Right plays to the next beat and stops,
  else moves to the next card. Left steps back a beat, then to t0, then to the previous card.
  Space is next card, or play and pause when time is on.
- Presenter: F full stage with the larger type scale, B blank stage, K readout strip, N notes
  panel, Home and End, 1 to 9 jump to a card, key hints that fade after 3 s. A thumbnail of the
  next card and an elapsed clock sit under the stage.
- Capture takes a PNG of the stage at the card's time into session memory and attaches it to
  the card. The user can attach an image file the same way. Attachments show under the stage and
  print in the deck. They are not saved.
- Export: the deck as PDF through the print stylesheet, one page per card with its capture or
  live render, caption and notes; a card as PNG.
- Phone: the stage fills the width, Back, dots and Next replace the aids, a swipe changes card.

**Theme.** One control cycles auto, light and dark. Auto follows the system. The choice persists.

## 8. Interaction

**Place.** Drag an item from the asset library onto the map. A ghost follows the cursor. The
drop places the item at the cursor. A threat drop places its first waypoint and starts path
drawing. Click adds waypoints, double-click or Enter ends it, Escape cancels. Clicking a library
item without dragging arms it for one click on the map.

**Right-click menus.**

| Target | Items |
| --- | --- |
| Empty map | Add here (submenu by group), Paste here, Measure from here, Set time here, Fit view |
| Threat or path | Add waypoint here, Change threat type, Set speed, Set altitude for all, Reverse, Duplicate, Delete |
| Waypoint | Hold +30 s, Insert after, Set altitude, Delete |
| Sensor or effector | Make sector or Make omni, Set range, Duplicate, Delete |
| Area | Set top, Set bottom, Add vertex here, Duplicate, Delete |
| Height plane | Set height, Delete |
| Authored event | Change type, Move to geometry (when it carries a warning), Delete |
| Threat (upgrade) | also: Add event here, Formation, Split here (with a time cursor), Merge (with two or more groups) |
| Timeline | Set time here, Loop from here, Add event here |
| Card | Open, Open in Brief, Duplicate, Move up, Move down, Delete |
| Empty map (upgrade) | also: Save card, Add height plane |

Each item shows its shortcut. A disabled item says why in its tooltip.

**Handles.** Drag a ring to set range. Drag a sector edge to set field of view. Drag the bearing
handle to rotate. Drag a waypoint to move it. Shift-drag a waypoint to change altitude. Alt
disables snap. The value shows beside the cursor during the drag.

**Snap** (upgrade). The placement ghost and a dragged waypoint snap to sensor rings, area
vertices and edges within 8 px, to 15 degree bearings with Shift, else to the grid. The label
names the snap ("on RDR-1 ring") and the leg ("1.40 nm, 93 s"). G toggles grid snap. Alt
bypasses every snap.

**Keys.**

| Key | Action |
| --- | --- |
| Cmd+K | Command palette |
| Cmd+Z, Shift+Cmd+Z | Undo, redo |
| Delete | Delete selection |
| Escape | Cancel the current action, then clear selection |
| Space | Play or pause |
| Left, Right | Step time 1 s, with Shift 10 s |
| Cmd+D | Duplicate |
| Cmd+C, Cmd+V | Copy, paste |
| F | Fit view |
| M | Measure tool |
| U | Units toggle |
| 1, 2, 3 | Plan, Elevation, 3D |
| ? | Shortcut sheet |
| Cmd+N | New profile |
| A | Quick-add (the palette's Add group) |
| S, V, E | Quick-add on Sensors, Areas, Events |
| Shift+F | Formation |
| C | Save card |
| [ , ] | Previous or next event or derived time |
| Home, End | Time to start or end |
| T | Time cursor on or off |
| G | Grid snap |
| R | Strip: timeline, chart, readout |
| Shift+1 to 8 | Layer chip by number |
| =, - | Zoom in, out |
| Tab, Shift+Tab | Next or previous object of the same kind |
| I | Inspector open or closed |
| \ | Both side panels open or closed |

Brief keys (only in Brief): Right or PageDown next beat else next card; Left or PageUp back;
Space next card or play; Home, End; 1 to 9 jump to card; F full stage; B blank; K readout; N
notes; Up, Down cycle the focus. Build keys that edit are off in Brief. The registry scopes a
shortcut by workspace, so 1 to 3 switch views in Build and jump to cards in Brief.

**Commands.** One registry (`src/commands/`) defines each action once: ID, label, shortcut,
enable rule with a reason, the kinds it applies to, and the workspaces it is active in. The
menus, the palette, the keys and the shortcut sheet all read it. The shortcut sheet is
generated from the registry per workspace.

**Undo.** Every profile edit is one undo step. A drag is one step. Each notes field is one
step. Selection, view and time are not undo steps. The undo control and a short toast name the
step: "Undo: set RDR-1 range".

**Tooltips.** Open after 400 ms. Move between tooltips with no delay. One line: what the control
does, then its shortcut. Placed so they never cover the pointer target.

## 9. Templates

Each template opens ready to run, with thresholds as planning values.

| Template | Question | Main measures |
| --- | --- | --- |
| Point defence, single quadrotor | Does the layer detect, identify and defeat a Group 1 ISR quad before the asset? | 1.1.2, 2.1.3, 3.1.2 |
| Hover track hold | Does the track hold through a 60 s hover? | 1.2.2 |
| Swarm of six, split | Does the system track six and engage both elements? | 1.2.1, 2.3, 3.1.1 |
| Delta wing one-way attack, low ingress | Is the engagement decision early enough for a 46 m/s attack? | 1.1.2, 3.1.3, 3.1.4 |
| Fiber FPV, no RF | What detects a threat that emits nothing? | 1.1.1 by sensor |
| Surrogate racetrack with truth | How accurate is the track against truth? | 1.2.3 |
| Detection range sweep | How does detection range change with threat altitude? | 1.1.2 against altitude |
| Blank | | |

Threat behaviors from the catalog generate paths: direct approach, terrain-following ingress,
orbit, racetrack, hover and stare, terminal dive, split, multi-axis salvo.

## 10. Export

- AAR as PDF through a print stylesheet, light theme.
- Each chart as PNG and SVG, same look as on screen.
- Run rows as CSV with DroneScore field names. Profile and runs as JSON. The library as one JSON.
- The brief deck as PDF through the print stylesheet, one page per card. A card as PNG. Neither
  export stores anything; captures and attachments leave with the session.

## 11. Budgets

| Item | Budget |
| --- | --- |
| Map drag | 60 frames per second with 40 threats and 15 sensors |
| Preview after an edit | 100 ms |
| First load | Interactive in 2 s on a laptop |
| Entry bundle | 300 kB gzip. The fonts load outside the entry |
| 3D view | The map drag budget: 60 frames per second with 40 threats and 15 sensors, same renderer as Plan |
| Capture | 300 ms |
| Deck PDF | 20 cards print in 10 s |

## 12. Acceptance

The MVP is done when all of these pass in the end-to-end suite:

1. ~~A new user opens "Point defence, single quadrotor", runs it, and sees 1.1.2 with a value,
   interval, threshold and evaluation.~~ Retired 2026-11-01, phase 10.
2. Dragging a radar from the library places it at the drop point. One undo removes it.
3. Right-click on empty map, Add here, Sensor, Radar places a radar at the click point.
4. Dragging a sensor ring changes range. The preview and the timeline update within 100 ms.
5. ~~A hypothesis with a prediction locks at the first run. The Results row shows Meets, Does
   not meet or Inconclusive.~~ Retired 2026-11-01, phase 10.
6. ~~Two runs compare side by side with the difference shown.~~
   Retired 2026-11-01, phase 10.
7. ~~A one-factor sweep shows a line chart of the measure against the factor.~~
   Retired 2026-11-01, phase 10.
8. ~~The AAR exports as PDF with all seven sections, and each chart exports as PNG and SVG.~~
   Retired 2026-11-01, phase 10.
9. A legacy v4 JSON from the current app imports without loss of assets, paths or text.
10. Every command is reachable from the palette, and its shortcut matches the shortcut sheet.
11. ~~The engine package builds and runs headless in Node with no DOM.~~
    Retired 2026-11-01, phase 10.

The upgrade is done when the items of 1 to 11 that are not retired still pass and all of these
pass:

12. New (button and Cmd+N) opens Build with "Untitled profile" and the name field focused; the
    renamed profile appears in the Library.
13. The 3D view opens from the view switch and from key 3, orbits by drag, animates the threats
    at the current time, and prints its vertical exaggeration. A drag on a sensor in 3D shows
    the edit prompt and changes nothing.
14. The Elevation view switches between Along path and From asset.
15. Layer chips toggle with Shift+1 to 8; the readout strip pins a baseline and shows a delta
    during a ring drag.
16. An authored event retimes by drag on the timeline, warns when it contradicts geometry, and
    the warning clears when moved to geometry.
17. A debrief CSV loads and the flown row and flown track appear; the scorecard is unchanged.
18. A legacy v4 record with height planes, no-fly and reference areas, snapshots, events, cards
    and a data list round-trips through import and export without loss.
19. Save card from Build creates a card; Brief opens it at its view and time; a clip with two
    beats stops at each beat on Right; capture produces a PNG; a 20 card deck prints to PDF
    with one page per card.
20. The first-use goal (section 1) is met again by a first-time user walk, under 10 minutes.
21. The bundle budgets in section 11 hold, measured by the perf spec.
22. Save as card (C, or the button on the Build bar) stores the view, layers, time and focus as
    a card in one undo step. Brief opens the card at that view and time.
