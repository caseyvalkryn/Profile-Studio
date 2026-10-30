# Profile Studio MVP specification

Status: definitive for the MVP. Date: 2026-10-30. Read `docs/design-principles.md` first. When this
spec and a principle disagree, the principle wins and this spec is corrected.

## 1. Product

Profile Studio is a counter-UAS test planning tool. A test planner builds a vignette on a map,
states a question and a hypothesis, simulates the vignette, and reads the result as DroneScore
measures grouped by F2T2EA. The planner compares runs and exports an after action report (AAR).

**User.** A test engineer or evaluator. A domain expert, not a programmer. The user knows C-UAS
sensors, effectors, threats and test design. The user does not know the app.

**First-use goal.** With no help, a new user opens a template, moves one sensor, runs the
vignette, reads one measure against its threshold and exports the AAR in under 10 minutes.

**MVP non-goals.** Backend, accounts, multi-user editing, vos integration, live data import,
3D view, false alarm simulation, real-system specification library. Each is a later phase.

## 2. Terms

Use these words in the UI and the code. One word for one thing.

| Term | Meaning | Replaces (legacy) |
| --- | --- | --- |
| Vignette | One test situation: site, assets, threats, question, runs | profile |
| Library | The start screen: templates and saved vignettes | Collect |
| Template | A read-only vignette that opens as a new copy | template |
| Asset | Anything placed on the map: threat, sensor, effector, C2 node, TSPI station, area | item |
| Threat | A UAS with a type from the catalog and a flight path | aircraft |
| Flight path | Ordered waypoints with altitude, speed and hold time | path |
| Sensor | Radar, RF detector, EO/IR or acoustic | system |
| Effector | RF effector, kinetic effector or directed energy | system |
| Area | Defended asset, engagement zone, no-fly area, reference pattern | volume |
| Run | One simulation batch of N replicates with one seed | none |
| Replicate | One simulated trial. It writes one DroneScore run row per threat | none |
| Measure | One DroneScore row, by ID and name | MOP text |
| Threshold | The value a measure must meet in this vignette | none |
| Question | `Q-nn`: what the test must answer | purpose |
| Hypothesis | `H-nn`: a testable statement on one measure | none |
| Prediction | The expected value range, recorded before the first run | none |
| Sweep | Runs over a set of levels of one or two factors | none |
| AAR | The exported report | brief / cards |

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

## 4. Measure sources

Each DroneScore row has one source class in the app. The scorecard shows the class beside the
value.

| Class | Rows | How the app gets the value |
| --- | --- | --- |
| Simulated | 1.1.1, 1.1.2, 1.1.3, 1.1, 1.2, 1.5, 1.2.1, 1.2.2, 1.2.3, 2.1.1, 2.1.2, 2.1.3, 2.1.3t, 2.1.4, 3a.2, 3b.1, 3.1.1, 3.1.2, 3.1.3, 3.1.4, 5.1, 5.4, 5.4e | Aggregated from replicate run rows |
| Entered | 1.3, 1.4, 1.6, 1.7, 1.8, 2.1, 2.2, 2.3, 2.4, 2.5, 3a.1, 3a.3, 3b.2, 5.2, 5.2e, 5.5, 5.5b, 5.6, INT-1 to INT-14 | Typed on the asset as a vendor sheet value. Some feed the simulation, for example 1.3 field of view |
| Derived | 5.3, 5.8 | Computed from other values with the DroneScore formula |
| Not simulated | 1.1.4, 4.1.1, 4.1.2, 4.2.1, 4.2.2, 5.1.1, 5.2.1, 5.3.1, 5.3.2, 5.7 | Shown greyed with the reason: specialist test, day closeout or a model the MVP does not have |

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
  chainTime: { decisionS: number; assignS: number }   // Target step inputs
  measures: MeasureSetting[]       // the rows this vignette scores, with thresholds
  runs: RunSummary[]               // stored results, newest first
  report: ReportDraft
}
type Threat = { id: string; type: string /* catalog id */; path: Waypoint[]; speedMs?: number }
type Waypoint = { x: number; y: number; z: number; holdS: number }
type Sensor = { id: string; kind: 'radar'|'rf'|'eoir'|'acoustic'; x: number; y: number; z: number
  rangeM: number; minRangeM: number; fovDeg: number; bearingDeg: number
  elMinDeg: number; elMaxDeg: number; model: SensorModel; entered: Record<string, Entered> }
type Effector = { id: string; kind: 'ew'|'kinetic'|'de'; x: number; y: number; z: number
  rangeM: number; fovDeg: number; bearingDeg: number; timeToEffectS: number; pk: number
  entered: Record<string, Entered> }
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

## 6. Engine

Pure TypeScript in `src/engine/`. No React, DOM or store imports. A lint rule enforces this.

1. **Preview.** `preview(v: Vignette): Preview`. Expected-value geometry: coverage windows per
   sensor and threat, first detection, the F2T2EA stage times, area entry times. It runs on every
   edit. Budget: 100 ms for 40 threats and 15 sensors. Port the legacy derive logic
   (`docs/reference/legacy-app.md`) and replace its `splitTimes` loop with an incremental method.
2. **Run.** `run(v: Vignette, n: number, seed: number): { rows: RunRow[]; trace: RunTrace[] }`.
   `RunRow` holds only DroneScore fields; `RunTrace` carries the stage times and positions for
   the timeline, including the Target time. Monte Carlo replicates in a
   Web Worker, seeded and repeatable. Transfer and modify the rangeboard engine
   (`docs/reference/rangeboard-parts.md`). Models for the MVP:
   - Radar Pd by Swerling case against signal to noise ratio over range.
   - RF, EO/IR and acoustic Pd as a logistic curve with a 50 percent range parameter.
   - RF detection only for a threat that emits.
   - Track initiation by M of N detections. Track loss after a coast time.
   - Classification and identification after a dwell, with a correct-ID probability.
   - Engagement when the threat is identified and inside effector reach, after the Target chain
     time. Effect after time to effect, with Pk.
   - Track error as Gaussian noise per sensor.
3. **Measures.** `score(rows: RunRow[], settings: MeasureSetting[]): Score[]`. Proportions use a
   Wilson 95 percent interval. Ranges and times use the mean with a 95 percent percentile
   bootstrap interval. Each score has value, interval, threshold and evaluation: Meets, Does not
   meet, or Inconclusive (the interval spans the threshold).
4. **Sweep.** `sweep(v, factor, levels, n, seed)`. MVP factors: threat speed, threat altitude,
   approach bearing, sensor range, sensor position offset. One or two factors.

Every engine function is deterministic for a given input and seed. Tests use fixed seeds.

## 7. Screens

Four workspaces in a top bar: Library, Build, Results, Report. The command palette (Cmd+K) is
available everywhere.

**Library.** Templates first, in one row of cards with a map thumbnail, the question and the
F2T2EA steps it exercises. Saved vignettes below, newest first. Search filters both. Actions:
open, duplicate, export, delete with undo, import JSON (v5 or legacy v4).

**Build.** The map fills the screen.
- Left: the asset library. Grouped as Threats, Sensors, Effectors, C2 and TSPI, Areas. Collapses
  to icons.
- Right: the inspector for the selection. It shows only the fields of that kind, with units.
- Bottom: the timeline with one lane per F2T2EA step and one row per threat. Play, pause, scrub
  and loop.
- Top: vignette name, the active question, Run, units toggle.
- A Plan and Profile toggle. Profile is the side elevation along the selected flight path.

**Results.** The scorecard: DroneScore measures grouped by F2T2EA, then areas 4 and 5 below as
system results. Each row: ID, name, value with interval, threshold, evaluation, source class.
Click a row to see its chart. Compare up to four runs side by side. Sweep results show as a line
chart (one factor) or a heat map (two factors).

**Report.** The AAR composer. Sections in fixed order: question, hypothesis and prediction,
setup (map snapshot and factor table), results (scorecard and charts), evaluation, scope of
inference, next test. The user can add a note to any section and pick which charts appear.

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
| Area | Set top, Add vertex here, Duplicate, Delete |
| Timeline | Set time here, Loop from here |

Each item shows its shortcut. A disabled item says why in its tooltip.

**Handles.** Drag a ring to set range. Drag a sector edge to set field of view. Drag the bearing
handle to rotate. Drag a waypoint to move it. Shift-drag a waypoint to change altitude. Alt
disables snap. The value shows beside the cursor during the drag.

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
| Cmd+Enter | Run |
| F | Fit view |
| M | Measure tool |
| U | Units toggle |
| 1, 2 | Plan, Profile |
| ? | Shortcut sheet |

**Commands.** One registry (`src/commands/`) defines each action once: ID, label, shortcut,
enable rule with a reason, and the kinds it applies to. The menus, the palette, the keys and the
shortcut sheet all read it.

**Undo.** Every vignette edit is one undo step. A drag is one step. Selection, view and time are
not undo steps.

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
- Run rows as CSV with DroneScore field names. Vignette and runs as JSON.

## 11. Budgets

| Item | Budget |
| --- | --- |
| Map drag | 60 frames per second with 40 threats and 15 sensors |
| Preview after an edit | 100 ms |
| Run of 200 replicates, 6 threats | 5 s, in the background, with progress |
| First load | Interactive in 2 s on a laptop |
| Entry bundle | 500 kB gzip |

## 12. Acceptance

The MVP is done when all of these pass in the end-to-end suite:

1. A new user opens "Point defence, single quadrotor", runs it, and sees 1.1.2 with a value,
   interval, threshold and evaluation.
2. Dragging a radar from the library places it at the drop point. One undo removes it.
3. Right-click on empty map, Add here, Sensor, Radar places a radar at the click point.
4. Dragging a sensor ring changes range. The preview and the timeline update within 100 ms.
5. A hypothesis with a prediction locks at the first run. The Results row shows Meets, Does not
   meet or Inconclusive.
6. Two runs compare side by side with the difference shown.
7. A one-factor sweep shows a line chart of the measure against the factor.
8. The AAR exports as PDF with all seven sections, and each chart exports as PNG and SVG.
9. A legacy v4 JSON from the current app imports without loss of assets, paths or text.
10. Every command is reachable from the palette, and its shortcut matches the shortcut sheet.
11. The engine package builds and runs headless in Node with no DOM.
