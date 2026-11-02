# Profile Studio specification

Status: definitive for phase 10. Date: 2026-10-30, amended 2026-10-31 from
`docs/reference/artifact-study.md`, amended 2026-11-01 in lane 10.1 and again in the handoff
of the same day (sections 1, 2, 5 and 7 to 12 pruned to the pivot). Read
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

**History.** The MVP passed its acceptance suite on 2026-10-30. The upgrade of 2026-10-31
(plan phase 9) ported the legacy board, rail, palette, menus, inspector and readout onto the
MVP engine. Its remaining sub-phases were superseded on 2026-11-01 by phase 10, which makes
the build a polished version of the mockup. `docs/reference/artifact-study.md` records the
upgrade's scope. The first-use goal did not change.

## 2. Terms

Use these words in the UI. One word for one thing. The code keeps the type names it has:
`Vignette` is the type of a profile.

| Term | Meaning | Replaces (legacy, mockup) |
| --- | --- | --- |
| Profile | One test situation: site, assets, threats, question, data products, measures, cards | profile; "vignette" in the code |
| Library | The start screen: New, templates and saved profiles grouped by collection | Collect |
| Collection | The group a profile belongs to in the Library | collection |
| Class | The kind of test the profile plans: Counter-UAS, Multi-aircraft, One-way attack, Surrogate, Custom | class |
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
| Snapshot | A time at which envelopes draw when the time cursor is off | snapshot |
| Question | `Q-nn`: what the test must answer | purpose |
| Data product | The data the test must collect to answer the question | data product |
| Measure | One DroneScore row, by ID and name, under one F2T2EA step | MOP text |
| Threshold | The value a measure must meet in this profile | none |
| Brief | The workspace that presents a profile as cards | Brief mode |
| Card | A saved way of looking: view, layers, time, focus, caption, notes | card |
| Debrief | Flown TSPI and events loaded after a range run, shown against the plan. Deferred | debrief |

Clip, beat, capture and the debrief overlay are deferred (plan, phase 10). Their words return
with them.

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
   `DE-1`, `C2-1`, `TM-1`, `T1` for threats, `DA` for the defended asset. Questions use
   `Q-01`.
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
  schema: 'profile-studio/6'       // v7 in lane 10.5
  id: string; name: string; updated: string
  collection: string; class: ProfileClass; version: number   // v7 (10.5); site.name migrates into collection
  site: { name: string; lat: number; lon: number; elevM: number }
  questions: Question[]            // Q-01 ...
  hypotheses: Hypothesis[]         // v6 only, deprecated; dropped in v7
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
  chainTime: { decisionS: number; assignS: number }   // Target step inputs for the preview
  measures: MeasureSetting[]       // the measures of performance, with thresholds
  runs: RunSummary[]               // v6 only, deprecated; dropped in v7
  report: ReportDraft              // dataSources is the data products list; v7 keeps it, truth and notes, drops the rest
}
type Area = { id: string; kind: 'asset'|'wez'|'nfz'|'ref'; label: string
  pts: { x: number; y: number }[]; zMinM: number; zMaxM: number }
type HeightPlane = { id: string; label: string; zM: number }
type AuthoredEvent = { id: string; tS: number
  type: 'detect'|'track'|'identify'|'engage'|'split'|'merge'|'loiter'|'terminal'|'checkpoint'
  label: string; threatKey: string; sensorKey: string | null }
type Card = { id: string; name: string; view: CardView
  layers: Partial<Record<LayerId, boolean>>
  displays: { timeline: boolean; chart: boolean; readout: boolean }   // chart deferred
  clip: Clip | null /* deferred */; focus: string[] /* keys */; tS: number | null /* null: time off */
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
type ProfileClass = 'Counter-UAS'|'Multi-aircraft'|'One-way attack'|'Surrogate'|'Custom'
type Entered = { value: number | boolean | string; source: string }   // source note is required
```

`SensorModel`, `Node`, `Area` and the deprecated v6 types (`Hypothesis`, `RunSummary`,
`ReportDraft`) are defined in the code with the same rules. Every asset, waypoint and question
also carries `key: string`, a UUID
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
3. Cards are `Vignette.cards`. `report.dataSources` is the data products list.
4. The schema stamp is `profile-studio/6`. A v5 record migrates with empty lists and a null
   debrief. v7 (lane 10.5) adds `collection`, `class` and `version`, keeps the data products,
   the telemetry (`report.truth`) and the import notes (`report.notes`), and drops the run fields.
   A v6 record migrates without loss.

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
question and the F2T2EA steps it exercises, Blank last. Saved profiles below, grouped by
collection, newest first, each with a thumbnail from its first card and the line "id v3 ·
class · n cards · n paths" (lane 10.5). Search filters both. Actions: Open, Brief, Duplicate,
Export, Delete with undo, import JSON (v7, v6, v5 or legacy v4), export the library as one
JSON.

**New.** The New button and Cmd+N create "Untitled profile" with the default site and one
defended asset, open Build and focus the name field for inline rename. A menu arrow on New
offers "From template". Nothing asks a question first.

**Build.** The board fills the screen. The default layout is the rail on the left, the board
with its bar and strip in the centre, the inspector on the right, and the top bar (principle
5.8).
- Rail: the asset library, grouped as Threats, Sensors, Effectors, C2 and TSPI, Areas, Height
  planes. The command palette's Add group is the quick-add: search by name, catalog values per
  row, shortcut hints; A opens it, S, V and E open it on a group.
- Bar (lane 10.3): the view segment (Plan, Elevation, 3D), Add waypoints as a pressed toggle,
  the five layer toggles (Reach, Events, Envelopes, Telemetry, Labels), Save as card (C) and the
  one-line readout. Fit, Ref and the units toggle live in the palette.
- Under the board: the shared timeline strip (see Brief below; lanes 12.1, 12.2 and 12.4), time
  off by default. The strip is as tall as its lanes; a grip on its top edge sets the most it
  may take (96 to 720 px, default 200; arrows, Home and a double click reset) and the lanes
  scroll past that; the stage takes the rest. The thumbnails of the other cameras left on
  2026-11-01 (lane 12.2); the bar's view segment switches the view.
- Inspector (lane 10.2): the whole scene, every object under its section (Purpose, Aircraft,
  Paths, Systems, Volumes, Reference planes, Events, Telemetry, Data products, Measures of
  performance, Site), the selected object's row expanded. A row click selects it on the board.
  Every field writes to the document on input, one undo step per field.
- Views. Plan: north up. Elevation: a side view with a mode, Along path (distance along the
  selected flight path) or From asset (range from the reference origin; every path, slant arcs
  with elevation limits, height planes). 3D: the axonometric camera ported from the legacy
  axon view, drawn by the same layers as Plan and Elevation. Orbit by drag (yaw 0.45 and pitch
  0.35 degrees per pixel, pitch clamped 8 to 86 degrees), zoom and fit. It animates the threats
  and track frames at the current time and prints its vertical exaggeration, yaw and pitch
  ("vertical x3  yaw -35  pitch 55"). A drag in 3D does not edit; it shows "Edit in Plan (1) or
  Elevation (2)".
- Basemap. The blank grid with range rings, axes, compass and scale bar, as in the legacy
  board.
- Drag labels. A drag shows the value under the cursor and, on a second line, the largest
  downstream change, for example "T1 window -0:08".

**Brief** (lane 10.4). The card strip with thumbnails on the left, the stage in the centre,
the notes panel on the right.
- Save as card (C, anywhere in Build) stores the view, layers, time and focus as a card in one
  undo step, inserted after the current card. Cards move (Up, Down), duplicate and delete with
  undo.
- The stage renders the card's view through the board at its time and layers, the focus drawn
  strong and the rest dim. The head shows "n of m · id". The caption sits under the stage.
- Previous and Next; Left, Right and Space move between cards. Opening a card applies its view;
  leaving Brief restores the Build view.
- The notes panel: name, camera, yaw and pitch, time, focus ids, layers, caption, presenter
  notes.
- "Add card from current scene" when the deck is empty.
- The shared timeline (2026-11-01, from the reference artifact): one strip,
  `src/features/timeline`, hosted under the Build board and under the Brief stage, over the one
  time state. The axis scrubs; Shift and drag set the loop range; Ctrl or Cmd and the wheel zoom.
  The view opens on the action span (the first coverage window less a lead, to the run end)
  when the run is more than three times it; "Fit run" and "Fit action" in the strip's menu; a
  hand zoom holds (lane 12.4). A DA row above the lanes draws each threat's entry. One lane per
  threat (lane 12.4, after the reference strip): a 14 px header with the threat id, the F2T2EA
  key points as glyphs (Find open circle, Fix circle with a dot, Track diamond, Target circle
  with a cross, Engage filled triangle, Assess square with a tick, DA bar; two within 10 px
  stack) with the step, the time and a definition on hover, and the engage margin bracket from
  Engage to the latest engage; then one row per sensor and effector at a shared pitch of 14 to
  24 px with a pill in its fill and its id (a compact band when they do not fit); then the
  authored events as circled letters (a drag moves one in Build). Sensor windows hatch in the
  friend ink, effector windows are solid in the text ink, EW windows hatch the other way. The
  group splits are a dashed rule with a circled S or M. A legend names the seven glyphs, the
  three fills and the bead. Axis labels read "0:00"; the cursor carries "t+0:00". The play bar:
  first, previous and next key point ([ and ]), play, last, rate, loop, the boxed clock and
  Time off. In Brief the strip always shows under the
  stage (lane 12.3); a card whose Timeline display is off (the stage's Timeline button, L, or
  the notes checkbox) collapses it to the play bar; new cards open with it on. The Readout
  display adds the live line of the threat in focus under the caption.
- With no card (lane 12.3) the stage draws the build: the live scene at the Build view that
  was open, the head "Build view · id" and the live time, the question as caption, the readout
  line. Save a screenshot downloads the stage as a PNG at twice its size; Save a frame as a
  card (C) keeps the view as card 1.
- The stage renders at the live time: the card's time on open, then the strip and the keys move
  it; P plays or pauses in Brief. C saves a frame: a new card after the current one with the same
  view, layers and focus at the current time, caption empty.
- The notes panel lists the key points of the threats in focus (every threat when the focus
  names none) with the system that gives each; a press moves the time there. "Definitions" under
  the list says what each step means. The presenter aids under the stage: the next card and the
  elapsed clock.
- Export: the deck as PDF through the print stylesheet, one page per card with its render,
  caption and notes.
- Deferred (plan, phase 10): clips and beats, caption tokens, the chart display, attachments,
  the phone stage. Each returns only when the user asks.

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
| Timeline | Set time here, Loop from here, Clear loop |
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
| Shift+1 to 5 | Layer toggle by number: Reach, Events, Envelopes, Telemetry, Labels |
| =, - | Zoom in, out |
| Tab, Shift+Tab | Next or previous object of the same kind |
| I | Inspector open or closed |
| \ | Both side panels open or closed |

Brief keys (only in Brief): Right or Space next card; Left previous card; Home, End; Up and
Down move the current card in the strip; Delete removes it with undo. Build keys that edit are
off in Brief. The registry scopes a shortcut by workspace.

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

Each template opens ready to edit and brief, with thresholds as planning values.

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

- The profile as JSON: the record plus the resolved waypoint times per path (`timed`: x, y, z,
  arrive, depart), as the mockup exports for the range's VAL tooling (lane 10.5). The library
  as one JSON.
- The brief deck as PDF through the print stylesheet, light theme, one page per card. An export
  stores nothing.

## 11. Budgets

| Item | Budget |
| --- | --- |
| Map drag | 60 frames per second with 40 threats and 15 sensors |
| Preview after an edit | 100 ms |
| First load | Interactive in 2 s on a laptop |
| Entry bundle | 300 kB gzip. The fonts load outside the entry |
| 3D view | The map drag budget: 60 frames per second with 40 threats and 15 sensors, same renderer as Plan |
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

Phase 10 is done when the items of 1 to 11 that are not retired still pass and all of these
pass:

12. New (button and Cmd+N) opens Build with "Untitled profile" and the name field focused; the
    renamed profile appears in the Library.
13. The 3D view opens from the view switch and from key 3, orbits by drag, animates the threats
    at the current time, and prints its vertical exaggeration. A drag on a sensor in 3D shows
    the edit prompt and changes nothing.
14. The Elevation view switches between Along path and From asset.
15. The five layer toggles in the Build bar switch their layers on the board; the one-line
    readout follows the selection.
16. An authored event shows as a bead on the scrub at its time; a time edit in the inspector
    moves the bead in one undo step.
17. ~~A debrief CSV loads and the flown row and flown track appear.~~ Deferred 2026-11-01,
    phase 10.
18. A legacy v4 record with height planes, no-fly and reference areas, snapshots, events, cards
    and a data list round-trips through import and export without loss.
19. Save card from Build creates a card; Brief opens it at its view and time; Left and Right
    move between cards; a 20 card deck prints to PDF with one page per card.
20. The first-use goal (section 1) is met again by a first-time user walk, under 10 minutes.
21. The bundle budgets in section 11 hold, measured by the perf spec.
22. Save as card (C, or the button on the Build bar) stores the view, layers, time and focus as
    a card in one undo step. Brief opens the card at that view and time.
23. The Library groups saved profiles by collection with a thumbnail and the metadata line; a
    profile export carries `timed` per path.
24. A v6 record migrates to v7 and round-trips through export and import without loss.
25. The whole-scene inspector lists every object of CUAS-001 under its section; a waypoint edit
    is one undo step; the measures picker lists the 67 DroneScore rows.
