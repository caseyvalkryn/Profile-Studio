# Profile Studio specification

Status: current as built. Dated 2026-10-30; amended through 2026-11-02 (the last prune removed
the phase and lane references; `git show 6a2e658:docs/spec.md` has the annotated copy). Read
`docs/design-principles.md` first. When this spec and a principle disagree, the principle wins
and this spec is corrected. The word "vignette" in code and in sections written before the
amendment means the record the UI calls a profile.

## 1. Product

Profile Studio is a counter-UAS test planning tool. A test planner creates, iterates and briefs
test profiles as interactive, detailed mockups. The planner builds a profile on a map. The
profile states one question, its data products and its measures of performance by DroneScore
ID, grouped by F2T2EA. The planner saves views as cards and briefs the profile from the app.
Profile Studio plans real tests. It does not run or score them. The product is a more polished
version of the v3 mockup `legacy/mockup-v3.html` (the pivot of 2026-11-01).

**User.** A test engineer or evaluator. A domain expert, not a programmer. The user knows C-UAS
sensors, effectors, threats and test design. The user does not know the app.

**First-use goal.** With no help, a new user opens a template, moves one sensor, saves a card
and briefs it in under 10 minutes.

**Non-goals.** Running or scoring a test. Out of scope: backend, accounts, multi-user editing,
vos integration, live data feeds, false alarm simulation, real-system specification library.

**History.** The MVP passed its acceptance suite on 2026-10-30. On 2026-10-31 the legacy
board, rail, palette, menus, inspector and readout were ported onto the MVP engine. On
2026-11-01 the product became a polished version of the mockup and the run and score surface
was removed. The first-use goal did not change. `docs/decisions.md` lists what the user settled.

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
| Area | Defended asset, engagement zone, no-fly area, reference pattern or range area (a site boundary or fly area from a KML or KMZ file), with a bottom and a top | volume |
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
| Debrief | Flown TSPI and events loaded after a range run, shown against the plan. Not built | debrief |

Beat, capture and the debrief overlay are not built. Their words return with them. A card's
`clip` is the slice: the user-facing word is "slice".

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
  schema: 'profile-studio/8'       // v8
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
type Area = { id: string; kind: 'asset'|'wez'|'nfz'|'ref'|'range'; label: string
  pts: { x: number; y: number }[]; zMinM: number; zMaxM: number }
type HeightPlane = { id: string; label: string; zM: number }
type AuthoredEvent = { id: string; tS: number
  type: 'detect'|'track'|'identify'|'engage'|'split'|'merge'|'loiter'|'terminal'|'checkpoint'
  label: string; threatKey: string; sensorKey: string | null }
type Card = { id: string; name: string; view: CardView
  layers: Partial<Record<LayerId, boolean>>
  displays: { timeline: boolean; chart: boolean; readout: boolean }   // chart not built
  clip: Clip | null /* the slice */; focus: string[] /* keys */; tS: number | null /* null: time off */
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
4. The schema stamp is `profile-studio/8`. A v5 record migrates with empty lists and a null
   debrief. v7 adds `collection`, `class` and `version`, keeps the data products,
   the telemetry (`report.truth`) and the import notes (`report.notes`), and drops the run fields.
   A v6 record migrates without loss. v8 adds the area kind `range`; a v7 record
   migrates by its stamp alone. Import accepts v8, v7, v6, v5 and legacy v4.

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
class · n cards · n paths". Search filters both. Actions: Open, Brief, Duplicate,
Export, Delete with undo, import JSON (v8, v7, v6, v5 or legacy v4) or a KML or KMZ site file
as a new profile, export the library as one JSON.

**New.** The New button and Cmd+N create "Untitled profile" with the default site and one
defended asset, open Build and focus the name field for inline rename. A menu arrow on New
offers "From template". Nothing asks a question first.

**Build.** The board fills the screen. The default layout is the rail on the left, the board
with its bar and strip in the centre, the inspector on the right, and the top bar (principle
5.8).
- Rail: the asset library, grouped as Threats, Sensors, Effectors, C2 and TSPI, Areas, Height
  planes. The command palette's Add group is the quick-add: search by name, catalog values per
  row, shortcut hints; A opens it, S, V and E open it on a group.
- Bar: the view segment (Plan, Elevation, 3D), Add waypoints as a pressed toggle,
  the five layer toggles (Reach, Events, Envelopes, Telemetry, Labels), Save as card (C) and the
  one-line readout. Fit, Ref and the units toggle live in the palette.
- Under the board: the shared timeline strip (see Brief below; lanes 12.1, 12.2 and 12.4), time
  off by default. The strip is as tall as its lanes; a grip on its top edge sets the most it
  may take (96 to 720 px, default 200; arrows, Home and a double click reset) and the lanes
  scroll past that; the stage takes the rest. The strip is the plan's clock: its
  time state (cursor, time on, loop, zoom span, height, rate) persists per profile across a
  workspace switch and a reload; the selection does not. A system row or a key point glyph is a
  press target that selects its system (a glyph also sets the time), and lights with the
  board's and the inspector's selection and hover. A Cards row under the DA row marks each card
  by number, with a band for a slice; a press sets its time in Build (a slice also sets the
  loop) and opens the card in Brief. Glyphs take the state colour at the cursor: reached in the
  text ink, current in the accent with a halo, future subtle. The thumbnails of the other cameras left on
  2026-11-01; the bar's view segment switches the view.
- Inspector: the whole scene, every object under its section (Purpose, Aircraft,
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

**Brief**. The card strip with thumbnails on the left, the stage in the centre,
the notes panel on the right.
- Save as card (C, anywhere in Build) stores the view, layers, time and focus as a card in one
  undo step, inserted after the current card. Cards move (Up, Down), duplicate and delete with
  undo.
- The stage renders the card's view through the board at its time and layers, the focus drawn
  strong and the rest dim. The head shows "n of m · id". The caption sits under the stage.
- Previous and Next; Left, Right and Space move between cards. Opening a card applies its view;
  leaving Brief restores the Build view.
- The notes panel: name, camera, yaw and pitch, zoom with Fit, time, focus ids, layers, caption,
  presenter notes.
- The frame on the stage (2026-11-02, user request): the wheel zooms a Plan or Elevation card
  about the cursor (0.5 to 8) and a drag pans it; in 3D a drag orbits at the board's rates. One
  wheel burst or one drag is one undo step ("zoom card c2", "pan card c2", "orbit card c2"). The
  head prints the zoom ("x2.5") when it is not 1; = and - zoom about the middle; Fit (the notes
  button, the palette) returns to the fitted frame. The strip thumbnails and the print deck draw
  the stored frame.
- The Frame panel at the top of the notes: for each threat in focus, the step
  reached with its glyph, the next step's countdown (a press moves the time there), range,
  height, speed and closing, the systems holding it as pills, the engage margin (in the hostile
  ink when negative) and DA entry. A card with a slice lists its key points inside the slice.
- The slice: a card's `clip`, a time range and a rate. The Scissors head button
  ("Set the slice from the loop", disabled with its reason when there is no loop) takes the
  strip's loop and rate into the current card, or into a new card when the deck is empty. The
  notes Slice field edits from, to and rate, and Clear removes it; each is one undo step. The
  head shows "t+1:00 to t+2:00 · x2". Opening a slice card sets the loop, rate and time; P
  plays the slice from its start. Leaving Brief restores Build's loop and rate with its view.
- "Add card from current scene" when the deck is empty.
- The shared timeline (2026-11-01, from the reference artifact): one strip,
  `src/features/timeline`, hosted under the Build board and under the Brief stage, over the one
  time state. The axis scrubs; Shift and drag set the loop range; Ctrl or Cmd and the wheel zoom.
  The view opens on the action span (the first coverage window less a lead, to the run end)
  when the run is more than three times it; "Fit run" and "Fit action" in the strip's menu; a
  hand zoom holds. A DA row above the lanes draws each threat's entry. One lane per
  threat: a 14 px header with the threat id, the F2T2EA
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
  stage; a card whose Timeline display is off (the stage's Timeline button, L, or
  the notes checkbox) collapses it to the play bar; new cards open with it on. The Readout
  display floats the frame panel at the stage's top right: "Frame at t+2:06" (or "Full run"),
  then each threat in focus as the notes' Frame block (at most three, "and n more").
- With no card the stage draws the build: the live scene at the Build view that
  was open, the head "Build view · id" and the live time, the question as caption, the frame
  panel. The stage gestures need a card. Save a screenshot downloads the stage as a PNG at twice its size; Save a frame as a
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
- Not built: beats, caption tokens, the chart display, attachments,
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
| Timeline | Set time here, Loop from here, Clear loop, Save a frame here, Save the loop as a slice |
| Card | Open, Open in Brief, Duplicate, Move up, Move down, Delete |
| Empty map (upgrade) | also: Save card, Add height plane |

Each item shows its shortcut. A disabled item says why in its tooltip.

**Handles.** Drag a ring to set range. Drag a sector edge to set field of view. Drag the bearing
handle to rotate. Drag a waypoint to move it. Shift-drag a waypoint to change altitude. Alt
disables snap. The value shows beside the cursor during the drag.

**Selection** (2026-11-02). A click selects one object. A mouse drag on the empty board in Plan
or Elevation draws a rectangle and selects every system, flight path and area with a point
inside it (events and height planes are not selected this way); the count shows beside the
cursor, the ids in the readout. Shift adds the rectangle's objects to the selection. Shift-click
adds one object or removes it. Every selected object draws in the accent; the handles belong to
the first. A drag on one of several selected objects moves them all by one snapped offset, one
undo step, with the pre-drag ghost; the arrows nudge them together. Delete, Duplicate and
Copy act on the whole selection. The inspector expands no row and shows the count. A
one-finger touch drag still pans; Escape drops a rectangle in progress.

**Import a site file** (2026-11-02). The palette command "Import a site file" opens a file
picker for a KML or KMZ file; a KML or KMZ file dropped on the board does the same. Each polygon
becomes a range area at true scale about the profile's site, as one undo step "import <file
name>". When the site is unset or lies more than 50 km (great-circle) from the centre of the
file's polygons, the same step sets the site to that centre. The new areas are the selection,
the board refits, and a toast says "2 areas from <file name>.", followed by "Site set from <file
name>." when the site moved. A bad file changes nothing; the toast says why in one sentence. A
dropped file that is not KML or KMZ toasts "Drop a KML or KMZ file to import a site."

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
  arrive, depart), as the mockup exports for the range's VAL tooling. The library
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
   interval, threshold and evaluation.~~ Retired 2026-11-01 (the pivot).
2. Dragging a radar from the library places it at the drop point. One undo removes it.
3. Right-click on empty map, Add here, Sensor, Radar places a radar at the click point.
4. Dragging a sensor ring changes range. The preview and the timeline update within 100 ms.
5. ~~A hypothesis with a prediction locks at the first run. The Results row shows Meets, Does
   not meet or Inconclusive.~~ Retired 2026-11-01 (the pivot).
6. ~~Two runs compare side by side with the difference shown.~~
   Retired 2026-11-01 (the pivot).
7. ~~A one-factor sweep shows a line chart of the measure against the factor.~~
   Retired 2026-11-01 (the pivot).
8. ~~The AAR exports as PDF with all seven sections, and each chart exports as PNG and SVG.~~
   Retired 2026-11-01 (the pivot).
9. A legacy v4 JSON from the current app imports without loss of assets, paths or text.
10. Every command is reachable from the palette, and its shortcut matches the shortcut sheet.
11. ~~The engine package builds and runs headless in Node with no DOM.~~
    Retired 2026-11-01 (the pivot).

The product is done when the items of 1 to 11 that are not retired still pass and all of
these pass:

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
17. ~~A debrief CSV loads and the flown row and flown track appear.~~ Not built (2026-11-01).
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
26. A drag on the empty board selects everything inside the rectangle; a drag on one selected
    object moves them all by the same offset; one undo puts them back.
27. A KML or KMZ file with polygons, imported from the Library or dropped on the board, draws
    each polygon as a range area at true scale about the site; two files of one site land at
    their true offset; one undo removes an import.

## 13. Known gaps

Observed defects and limits on 2026-11-02, none scheduled. Each is small; fix one only when the
user asks.

- An edit of one vertex line in the inspector rewrites every vertex of the area from the shown
  text (0.001 nm rounding), so the other vertices move by up to 0.9 m.
- The Elevation axis reads "Range from asset" when the profile has no defended asset; range
  areas then draw as flat lines at 0.
- "Range" has three meanings on Build: the Range area, the Elevation axis, and a system's reach.
- `siteFile.ts` (about 3 kB gzip) loads with the entry; the KMZ reader has no Zip64 path.
- The inspector rows do not mark each object of a multi-selection, because a row's current flag
  also expands it; the chip "n selected" stands in.
- A drag on a selected path's line moves nothing unless the path is in a group selection.
- The site file picker and the board drop take one file; a drop of several reads the first.
- Board marks of one threat do not declutter against another threat's; event labels can overlap
  their circled letters at the same time; the Swarm template shows four of six lanes at the
  default strip height.
- A card named "at t+1:40" keeps its name when its slice moves; `--kt` rounds to 0.1 s.
- The perf spec does not measure the deck PDF or a long-task quiet window; preview latency is
  taken at the DOM mutation.
- The parsed-record cache keys on `updated`, so an import that keeps id and `updated` but
  changes content draws the old thumbnail.
- The Library thumbnail draws the first card at the fitted frame; the Elevation limit rays have
  no test that presses one.
- `importJson` refuses records with no schema stamp and the mockup's `profile-studio/3`.
  Legacy import sets site latitude and longitude to 0 and keeps the MOP text as a question note.
- The inspector leaves out `chainTime`, the sensor `model`, the asset `entered` fields, a path
  Id and Speed field and the event system select; the fields stay in the domain.
