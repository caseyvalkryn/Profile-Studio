# Legacy app reference

Status 2026-11-01: the inventory of the legacy v4 app. It was the parity oracle for phase 9;
in phase 10 the mockup `legacy/mockup-v3.html` is the oracle and this app is a source of parts.

All file paths in this document are relative to `legacy/` (moved there on 2026-10-30, plan lane 0.2).

This is an inventory of the ES5 app in `js/*.js`, for a team rebuilding it in React and
TypeScript. It is not a design document. Read `docs/design-principles.md` for the product intent
and `docs/reference/jiatf-401.md` for the F2T2EA mapping that replaces the kill chain described
here.

## 1. Architecture

`index.html:56-103` loads 46 scripts in order. Every file wraps in
`(function (PS) {...})(globalThis.PS)` and writes to a namespace on `PS`. Load order is the
dependency order: a file may read any `PS.*` member a prior file wrote, never a later one.

Module roles, one line each, in load order (lines from `wc -l`):

- `js/00-ns.js` (207): `PS` namespace, `PS.util` (clone, get/setPath, uid, clamp, angleDiff,
  memo1, esc, S svg helper), `PS.units` (nav/si mode, formatters), `PS.fmt`.
- `js/10-catalog.js` (82): threat archetypes, system/volume kind tables, event types, identities,
  classes, rates; pure data plus `arch()` and `search()`.
- `js/11-schema.js` (238): the v4 record shape, v3→v4 migration, `Sc.blank`, `Sc.validate`.
- `js/12-seed.js` (109): 4 seed profiles (migrated on load) and 5 templates.
- `js/20-geo.js` (433): pure geometry and timing; no catalog, store or DOM.
- `js/21-derive.js` (432): `PS.derive.all`, one derived object per record, memoized by reference.
- `js/30-store.js` (426): `PS.store.create`, reducers, undo/redo, transactions.
- `js/31-bus.js` (78): `PS.bus`, diffs `prev`/`next` state into channel events.
- `js/32-select.js` (169): `PS.sel`, read-only selectors over store state.
- `js/33-persist.js` (162): localStorage save/load, export/import text, TSPI parsing.
- `js/34-time.js` (157): play/pause/scrub engine, one `time.set` per animation frame.
- `js/40-cameras.js` (197): plan, elev, axon camera math (world to screen).
- `js/41-symbols.js` (184): SVG fragment builders shared by layers.
- `js/42-layers.js` (41): layer registry (`PS.layers.register/list/chips`).
- `js/43-layer-*.js` (11 files, 38-233 lines): one registered layer per file; see section 7.
- `js/44-render.js` (389): composes cameras and layers into one SVG string; card/chart render;
  hit-test list.
- `js/45-tools.js` (969): every board mutation (place, drag, duplicate, snap, clipboard,
  formation).
- `js/46-keys.js` (224): key table, matcher, cheat-sheet generator; see section 6.
- `js/50-panels.js` (48): panel registry (`PS.panels.register/mount`).
- `js/51-panel-*.js` (20 files, 132-740 lines): one DOM panel per file; see section 6.
- `js/90-app.js` (722): wires store, bus, keys, panels and persistence into the running page.

Total: 46 files, 12,363 lines.

### Store, bus, select

`js/30-store.js` is a single-state Redux-style store. `St.create(initialState)` returns
`{ get, dispatch, reducer, subscribe, set, patch, ui, begin/commit/cancel, undo/redo }`. State
shape: `{ lib: [...records], activeId, dirty: {id: true}, ui: {...} }`. Every `profile.*` action
clones the active record (`U.clone`), mutates the clone, and calls `putActive` which stamps
`meta.updated` and marks `dirty[id]`. `setIn` (`js/30-store.js:42-51`) does an immutable set along
a dotted path, copying every object on the path. Undo/redo is a stack of `{label, before, after}`
snapshots of the whole record (`js/30-store.js:343-422`), depth 100 (`St.DEPTH`,
`js/30-store.js:6`). `store.begin(label)`/`commit()`/`cancel()` group a drag's many dispatches
into one undo entry.

`js/31-bus.js` is a pub/sub layer on top of the store. `B.wire(store)` subscribes once and, on
every `prev !== next`, computes `B.diff(prev, next)` and emits one event per changed UI channel
(`js/31-bus.js:18-29`: mode, cam, layers, units, time, sel, hover, baseline, placing, panels) plus
`profile`/`derived` when the active record identity changes, and `lib` when the library or
activeId changes. Panels subscribe to channels, not to the store directly.

`js/32-select.js` holds pure read functions over `state`: `Sl.profile`, `Sl.scene`, `Sl.derived`
(calls `PS.derive.all` on the active record), `Sl.selected`, `Sl.buildView`, `Sl.cardView`,
`Sl.library` (grouped by collection, sorted by last updated). No selector mutates state.

### Render pipeline

`PS.render.scene` (called from `js/51-panel-board.js:143`) builds one SVG string by running every
registered layer's `draw(ctx)` in order and concatenating the fragments, then the board panel sets
`stage.innerHTML = out.svg` directly (no virtual DOM, no diffing). The same `PS.render` functions
render brief cards and library thumbnails. `js/44-render.js` builds the shared `ctx` object
(record, derived, cam, t, sel, hover, focus, origin, `ctx.hit()` accumulator) that every layer in
`js/43-layer-*.js` reads from.

### Persistence

`js/33-persist.js`. Storage key `profileStudio.v4` (`P.KEY_V4`), previous key `profileStudio.v3`
kept for one-way read. Saved shape: `{schema: 4, lib: [...records], activeId, ui: {subset}}`. Only
six UI keys persist (`SAVED_UI`, `js/33-persist.js:10`): units, layers, panels, snap, stripTab,
theme. `P.load` prefers v4, falls back to v3 (migrates it, writes it back to v4, keeps the v3 key).
Export text (`P.exportText`) merges archetype fields into aircraft and attaches derived `timed`,
`windows`, `ladder`, `window`. Library export (`P.exportLibrary`) is the raw library, no derived
fields. `P.parse` re-validates every imported record through `Sc.migrate` and `Sc.validate`.

### Time

`js/34-time.js`. One `requestAnimationFrame` loop drives `T.tick`, which computes `t = ui.t + real
* ui.rate` (`real` clamped to 0.25 s per frame so a backgrounded tab does not jump) and dispatches
one `time.set` per frame. `T.playTo(tStop)` stops at an exact time (used by clip playback).
`T.nextEvent`/`T.prevEvent` snap to authored event times, ladder rung times (`t` and `tGeo`),
split times, and first-see times (`stops()`, `js/34-time.js:132-146`).

## 2. Data model

The v4 record (`js/11-schema.js`). `schema` is the string `"profile-studio/4"`
(`Sc.STAMP`); `Sc.detect` reads either a numeric `schema` or that string pattern, and treats a
missing or unreadable stamp as version 3.

| Field | Type | Default (`Sc.blank`) |
|---|---|---|
| `schema` | string | `"profile-studio/4"` |
| `id` | string | caller-supplied or `"PROF-1"` |
| `v` | number | `1` |
| `name` | string | `"New profile"` |
| `cls` | string, one of `C.CLASSES` | `"Custom"` |
| `collection` | string | `""` |
| `purpose` | string | `""` |
| `units` | `"nav"` or `"si"` | `"nav"` |
| `metricsCfg.dLink` | number > 0 or null | `{dLink: null}` |
| `site.name` | string | `""` |
| `site.datum` | `"AGL"` or `"MSL"` | `"AGL"` |
| `site.elev` | number | `0` |
| `scene.aircraft[]` | list | `[]` |
| `scene.systems[]` | list | `[]` |
| `scene.volumes[]` | list, seeded with one `DA` asset | one 400 m square |
| `scene.planes[]` | list | `[]` |
| `scene.paths[]` | list | `[]` |
| `events[]` | list | `[]` |
| `telemetry.tspi` | string | `""` |
| `telemetry.interval` | number | `20` |
| `telemetry.stations[]` | list of system ids | `[]` |
| `snapshots[]` | list of numbers | `[]` |
| `data[]` | list of strings | `[]` |
| `mop[]` | list of strings | `[]` |
| `cards[]` | list | `[]` |
| `debrief` | object or absent | not set by `blank`; present only once a debrief is applied |
| `meta.created` | ISO string | now |
| `meta.updated` | ISO string | now |

Nested shapes:
- `scene.aircraft[i]`: `{id, arch (archetype id), cruise (number or null, overrides archetype
  cruise)}`.
- `scene.systems[i]`: `{id, kind (one of `C.SYS_KINDS`), x, y, z, range, rmin, fov, bearing,
  elMin, elMax, zmin, zmax (number or null), status ("active"|"degraded"|"inactive")}`. Defaults
  per kind come from `C.SYS_DEFAULTS` (section 3).
- `scene.volumes[i]`: `{id, kind (one of `C.VOL_KINDS`), label, pts ([[x,y],...], 3+ vertices),
  zmin, zmax}`.
- `scene.planes[i]`: `{id, label, z}`.
- `scene.paths[i]`: `{id, aircraft, group ("" or a letter), identity (one of `C.IDENTITIES`),
  speed (number or null, overrides aircraft/archetype cruise), pts[]}`; each `pts[j]`: `{x, y, z,
  hold (seconds, default 0)}`.
- `events[i]`: `{id, t (seconds), type (one of `C.EV_TYPES` keys), label, path (path id), system
  (system id or null)}`.
- `telemetry`: `{tspi (free text naming the truth source), interval (seconds), stations (system
  ids that provide TSPI)}`.
- `cards[i]` (brief cards): `{id, name, cam: {proj: "plan"|"elev"|"axon", yaw, pitch, ref},
  layers (partial layer map), displays: {timeline, chart, readout}, clip (null or {t0, t1, rate,
  beats[]}), focus (event/object ids), t (number or null), caption, notes}`.
- `debrief` (added post-v4, not in `Sc.blank`, validated if present): `{tspi: {pathId:
  [[t,x,y,z],...]}, events: [{id, t, type, path, system}]}`.

### v3 to v4 migration (`Sc.steps[3]`, `js/11-schema.js:38-102`)

Nine numbered steps, run once per version gap in `Sc.migrate`:

1. Stamp `"profile-studio/4"`, drop `_dirty`, ensure `scene` and its five lists exist.
2. Collapse `aircraft` to `{id, arch, cruise}`; `cruise` becomes `null` when it equals the
   archetype's own cruise.
3. Path: drop `timed` (now derived); default `identity` from `cls === "Surrogate" ? "neutral" :
   "hostile"`; default `speed` to `null`, `group` to `""`; fill `pts[].hold`/`.z` with 0.
4. System: rename kind `"truth"` → `"tspi"`; fill `z, rmin, elMin (-90), elMax (90), zmin (0),
   zmax (null), status ("active")` where missing.
5. Volume: fill `zmin (0)`; default `zmax` to `0` if null.
6. Ensure `events` is a list; default `event.system` to `null`.
7. Merge `telemetry.truth` into `telemetry.tspi` (drop `truth`); default `interval` to `20`,
   `stations` to `[]`.
8. Ensure `snapshots, data, mop, cards` are lists; on each card: reorder `layers` to
   `Sc.LAYER_KEYS` (fill `tracks: true, rings: false, target: true` for a pre-v1 layer set,
   current defaults otherwise); default `displays` to `{timeline: true, chart: false, readout:
   false}`, `clip` to `null`, `cam` to `{proj: "plan", yaw: -35, pitch: 55}`, `cam.ref` to
   `"asset"`, `focus` to `[]`.
9. Default `units` to `"nav"`, `metricsCfg` to `{dLink: null}`, `site` to `{name: "", datum:
   "AGL", elev: 0}`, `meta` to `{created: null, updated: null}`.

`Sc.migrate` refuses a record newer than `Sc.VERSION` (4) or one whose version has no migration
step, both with the message `"This record is version N. This page reads up to version 4."`.

### Validation (`Sc.validate`, `js/11-schema.js:148-237`)

Returns `{ok, errors[]}`; every distinct message appears once. Exact error text:

- `"This is not a profile record. Check the JSON."` (not an object, or no `scene`).
- `"The record stamp is not profile-studio/4."`
- `"The profile has no id."`
- `"The class <cls> is not in the catalog."`
- `"The list <k> is missing."` (one of aircraft, systems, volumes, planes, paths, events, cards).
- `"An item in <k> has no id."`
- `"Two items in <k> use the id <id>."`
- `"<owner> has a value that is not a number."`
- `"<id> has the kind <kind> that is not in the catalog."` (system or volume)
- `"<id> needs a minimum range from 0 to less than its range."`
- `"<id> needs elevation limits from -90 to 90 with the lower limit first."`
- `"<id> needs three or more vertices."` (volume)
- `"<id> refers to aircraft <id> that does not exist."` (path)
- `"<id> has the identity <identity> that is not in the catalog."` (path)
- `"<id> has no waypoints."` (path)
- `"<id> has the type <type> that is not in the catalog."` (event)
- `"<id> refers to path <id> that does not exist."` (event)
- `"<id> refers to system <id> that does not exist."` (event)
- `"The telemetry block is missing."`
- `"Telemetry refers to system <id> that does not exist."`
- `"The list snapshots is missing."`
- `"The link distance must be empty or above 0."`
- `"<id> has a camera that is not plan, elev or axon."` (card)
- `"<id> needs a clip start before the clip end."` (card)
- `"<id> has a clip rate that is not in the rate menu."` (card)
- `"<id> has a beat outside the clip."` (card)
- `"Debrief refers to path <id> that does not exist."`
- `"Debrief TSPI for <id> needs t, x, y, z samples."`
- `"A debrief event has the type <type> that is not in the catalog."`
- `"A debrief event refers to path <id> that does not exist."`

## 3. Catalog (`js/10-catalog.js`)

### Threat archetypes (`C.ARCHETYPES`)

13 rows. `rf` is true unless the id is in `NO_RF` (`g1-fpv-fiber`, `g3-delta-owa`, `g3-jet-owa`;
`js/10-catalog.js:22`).

| id | group | name | airframe | role | cruise m/s | vmax m/s | alt m | endurance min | prop | rf |
|---|---|---|---|---|---|---|---|---|---|---|
| g1-quad-isr | 1 | Quadrotor ISR | multirotor | isr | 12 | 21 | 30-400 | 20-55 | electric | yes |
| g1-fpv-rf | 1 | FPV attack, RF manual | multirotor | one-way-attack | 25 | 42 | 2-100 | 3-15 | electric | yes |
| g1-fpv-fiber | 1 | FPV attack, fiber optic | multirotor | one-way-attack | 15 | 30 | 2-60 | 5-20 | electric | no |
| g1-swarm-quad | 1 | Swarm element quadrotor | multirotor | swarm-element | 14 | 25 | 30-300 | 10-30 | electric | yes |
| g2-heavy-multirotor | 2 | Heavy lift multirotor bomber | multirotor | strike | 12 | 22 | 50-400 | 20-40 | electric | yes |
| g2-vtol-isr | 2 | VTOL fixed wing ISR | vtol-hybrid | isr | 17 | 25 | 300-1800 | 120-180 | electric | yes |
| g2-fw-isr | 2 | Fixed wing ISR, catapult | fixed-wing | isr | 25 | 42 | 500-2000 | 240-960 | piston | yes |
| g2-lm-xwing | 2 | Loitering munition, X wing | fixed-wing | loitering-munition | 27 | 80 | 100-3000 | 30-60 | electric | yes |
| g3-delta-owa | 3 | Delta wing one way attack, piston | delta-wing | one-way-attack | 46 | 52 | 50-4000 | 300-840 | piston | no |
| g3-foam-decoy | 3 | Foam delta wing decoy | delta-wing | decoy | 35 | 44 | 100-3000 | 120-240 | piston | yes |
| g3-jet-owa | 3 | Turbine one way attack | delta-wing | one-way-attack | 95 | 125 | 100-9000 | 120-300 | turbine | no |
| g3-vtol-hybrid | 3 | VTOL hybrid fixed wing | vtol-hybrid | isr | 30 | 40 | 300-3000 | 120-300 | hybrid | yes |
| g3-target-piston | 3 | Piston target drone, surrogate | fixed-wing | surrogate | 33 | 65 | 100-4900 | 60-480 | piston | yes |

Each row also carries `behaviors` (3-4 free-text tactics) and `src` (a citation URL), not shown
here; see `js/10-catalog.js:8-20` verbatim.

### System kinds (`C.SYS_KINDS`) and defaults (`C.SYS_DEFAULTS`)

| kind | label | range m | fov deg | confirm s | tte s |
|---|---|---|---|---|---|
| radar | 3D radar | 4000 | 360 | 3 | - |
| rf | RF detector | 3000 | 360 | 2 | - |
| eoir | EO/IR | 2500 | 30 | 4 | - |
| acoustic | Acoustic | 800 | 360 | 3 | - |
| ew | RF effector | 1500 | 360 | - | 10 |
| kinetic | Kinetic effector | 3000 | 360 | - | 8 |
| de | Directed energy | 1000 | 360 | - | 6 |
| c2 | C2 node | 0 | 0 | - | - |
| tspi | TSPI station | 0 | 0 | - | - |

`confirm` and `tte` are planning defaults, not measured values (`js/10-catalog.js:29`).
`C.SENSOR_KINDS = [radar, rf, eoir, acoustic]`; `C.EFFECTOR_KINDS = [ew, kinetic, de]`.

### Volume kinds (`C.VOL_KINDS`, `C.VOL_DEFAULTS`)

| kind | label | default top m |
|---|---|---|
| asset | Defended asset | 0 |
| wez | Engagement zone | 1200 |
| nfz | No fly volume | 150 |
| ref | Reference pattern | 0 |

### Other catalog tables

- `C.EV_TYPES`: detect D, track T, id I, engage E, split S, merge M, loiter L, terminal X,
  checkpoint C. `C.EV_NAMES` gives the matching display name.
- `C.LADDER_STEPS = ["detect","track","id","engage","effect"]`.
- `C.IDENTITIES = ["hostile","suspect","unknown","pending","neutral","friend"]`.
- `C.CLASSES = ["Counter-UAS","Multi-aircraft","One-way attack","Surrogate","Custom"]`.
- `C.RATES = [0.25, 0.5, 1, 2, 4, 8, 16, 32]` (playback rates).
- `C.ID_DWELL = 5` (seconds inside EO/IR fov to count as positive id).
- `C.COAST_S = 10` (seconds a track survives a sensor gap before it reads as lost; see trackLine,
  section 5).

## 4. Seeds and templates (`js/12-seed.js`)

### Seeded profiles

| id | name | purpose | threats | systems | events | MOP count |
|---|---|---|---|---|---|---|
| CUAS-001 | Single Group 1 ingress with loiter | How does one track hand off from detect to effect, and does the track hold through a hover? | 1 (g1-quad-isr) | RDR-1, RF-1, EO-1, EW-1 | 6 | 4 |
| MULTI-001 | Six Group 1, two elements, split then converge | How should a group of six read on scope, and when does one envelope become two? | 6 (g1-swarm-quad, groups A/B) | RDR-1, RF-1, EW-1 | 5 | 4 |
| OWA-001 | Group 3 delta wing, low ingress, terminal dive | Where in the geometry does the engage decision have to happen for a 46 m/s one way attack? | 1 (g3-delta-owa) | RDR-1, EO-1, KIN-1 | 5 | 4 |
| SURR-001 | Group 3 surrogate racetrack with truth | How accurate is the sensor track against truth on a known pattern? | 1 (g3-target-piston) | RDR-1, TM-1, RTK | 5 | 4 |

Each seed is a v1-v3 literal (`js/12-seed.js:7-62`) migrated through `Sc.migrate` on load
(`Sd.load`). Each ships 2-3 brief cards with camera, layer set, focus, time and caption/notes
(`js/12-seed.js:18-20, 36-38, 48-50, 60-61`).

### Templates (`Sd.templates`, `js/12-seed.js:78-108`)

| id | name | class | starting content |
|---|---|---|---|
| point-defence | Point defence | Counter-UAS | DA volume, radar, RF detector, EW effector |
| fixed-wing-ingress | Fixed wing ingress | One-way attack | DA + engagement zone volumes, radar, EO/IR, kinetic |
| range-test | Range test | Surrogate | DA + reference racetrack volumes, radar, 2 TSPI stations |
| swarm | Swarm | Multi-aircraft | DA volume, radar, RF, EW; 2 snapshots |
| blank | Blank | Custom | `Sc.blank(id)`, no volumes except the implicit DA from `blank` |

All templates start with no paths; the planner draws the ingress.

## 5. Derive engine

`PS.derive.all(record)` (`js/21-derive.js`) is memoized by record reference
(`PS.util.memo1`, `js/21-derive.js:401`): the same object reference returns the cached result, a
new clone recomputes. It reads `PS.catalog` at call time, never at module load, so a hot-swapped
catalog takes effect on the next derive. `js/20-geo.js` holds the pure math; `js/21-derive.js`
assembles it per-record.

### Output fields of the derived object (`js/21-derive.js:54-59`)

- `speeds[pathId]`: effective speed, `path.speed || aircraft.cruise || archetype.cruise || 15`.
- `timed[pathId]`: `G.timed(pts, speed)` (see below), the per-waypoint `{x,y,z,t0,t1}` list.
- `groupOf[pathId]`, `emitsRf[pathId]` (false only when the archetype sets `rf: false`).
- `tmax`: the latest `t1` across all paths, floor 60 s (`G.tmax`).
- `origin`: centroid of the first `asset`-kind volume, else `{0,0,0}`.
- `windows[systemId][pathId]`: coverage windows (full rule set). `windowsRing[systemId][pathId]`:
  windows under the range-and-status rule only (used to draw the static ring).
- `first[pathId][systemId]` / `last[pathId][systemId]`: `{t, r, pos}` of the first/last coverage
  window, or null.
- `firstSensor[pathId]`, `firstEffector[pathId]`: `{system, t}` of the earliest sensor/effector
  window, across all systems of that class.
- `vols[volumeId][pathId]`: volume entry/exit windows. `daEntry[pathId]`: first entry time into
  the defended-asset volume, or null.
- `dLink`: `{value, auto}`, the link-cluster distance (explicit `metricsCfg.dLink`, or
  `2.5 * medianNN` of grouped paths at t=0 when 2+ grouped paths exist and no explicit value is
  set).
- `splits[]`: `{t, from, to}` member-count changes in the group graph (see `G.splitTimes` below).
- `ladder[pathId]`: the detect/track/id/engage/effect rungs (see below).
- `window[pathId]`: `{planned, geometric, detectT, engageT, rangeAtEngage, tDA, latest, margin}`.
- `warnings[]`: system, path and event warnings (exact text below).
- `crossings[pathId]`: in/out coverage events per system, time-sorted.
- `trackLine[pathId]`: track lifecycle spans (see below).
- `flown[pathId]`: present only when `record.debrief.tspi` exists; resampled debrief series plus a
  debrief-only ladder.
- Functions attached by `attachFns` (`js/21-derive.js:342-399`): `originAt(refId, pathId, t)`,
  `closing(pathId, t, originId)`, `tta(pathId, t)`, `envelopesAt(t)`, `rangeSeries(pathId, refId)`
  (cached per path+ref), `coveringAt(pathId, t)`, `holdsAt(systemId, t)`, `at(pathId, t, refId)`
  (the one-call bundle a readout reads: x, y, z, range, bearing, heading, speed, closing speed,
  time-to-asset, window, margin, covering systems).

### Algorithms

- **Timing** (`G.timed`, `js/20-geo.js:9-21`): leg time is 3D length divided by speed; a point's
  `hold` seconds extend `t1` past `t0` at that point, so a hold is a dwell, not a pause between
  legs.
- **Coverage windows** (`windowsOf`/`G.coverageWindows`, `js/20-geo.js:200-243`): samples the
  predicate at 1-second steps (or `dt`) plus every waypoint `t0`/`t1` and the path end, bisects to
  0.1 s at each state change, merges gaps under 1 s, and drops windows under 0.2 s.
  `G.inCoverage` (`js/20-geo.js:183-198`) is the predicate: the system must be active and have
  `range > 0`; slant range must be within `[rmin, range]`; FOV is checked against bearing when
  `fov < 360`; elevation angle must sit within `[elMin, elMax]`; target height must sit within
  `[zmin, zmax]`. `opts.ringOnly` keeps only the status-and-range term, used to draw a ring that
  does not care about FOV or elevation. `opts.emitsRf` (defaults true) drops coverage for `rf` and
  `ew` systems against a path whose archetype has `rf: false` (the RF-silent threats), the one
  rule unique to RF emitters.
- **Range and closing speed** (`G.rangeAt`, `G.closingSpeed`, `js/20-geo.js:268-277`): horizontal
  range from an origin; closing speed is the negative of the radial component of velocity (motion
  away from the origin is negative).
- **Link clustering and splits** (`G.envelopesAt`, `G.splitTimes`, `js/20-geo.js:320-357`):
  `envelopesAt` is one convex-hull-per-connected-component snapshot at time t, where two paths are
  linked when their 3D separation is at or under `dLink`. `splitTimes` walks the whole run in 0.1 s
  steps, builds a sticky link graph (a link survives at `0.8 * dLink` once formed, so near-miss
  noise does not flap it), counts connected components at each step, and reports a change only
  once a new component count holds for 3 continuous seconds — this is the slowest derive routine
  (measured at `js/20-geo.js:333`, see perf note below).
- **Ladder (detect/track/id/engage/effect)** (`ladderFor`, `js/21-derive.js:157-260`): for each
  rung, the geometric time (`geo.detect/track/id/engage`) comes from the earliest sensor/effector
  coverage window (track additionally requires the window to last the system's `confirm` seconds;
  id requires an EO/IR window to last `ID_DWELL` seconds). If an authored event of that type
  exists, the rung uses the event's time and system, with the geometric time kept as `tGeo` for
  comparison; otherwise the rung is the geometric time itself. `effect` is derived from `engage`:
  the effector's `tte` (time-to-effect) is added, clipped to the effector's own coverage window,
  and clipped again to the defended-asset entry time if the aircraft would reach the asset first.
  `latest` is the latest possible engage time that still gets an effect before the asset is
  entered or the effector window closes; `margin = latest - engageTime`.
- **Track lifecycle (`trackLine`)** (`trackLineFor`, `js/21-derive.js:263-300`): one state per time
  span, in order pending (before detect) to unknown (after track init) to identity (after id).
  Sensor coverage gaps longer than `COAST_S` (10 s) downgrade the state to coast for the first 10
  s of the gap, then lost until coverage resumes.
- **`envelopesAt`/`splitTimes`** both call `PS.util.memo1`-free geometry per frame; they are the
  cost centers at scale.

### Warning text templates (`js/21-derive.js:125-249`)

- System with no reach: `"<id> has no reach. Drag its ring out."`
- Path under two waypoints: `"<id> needs two waypoints."`
- Event after the path lands: `"<id> is after <pathId> lands. Drag it back."`
- Early detect/track/id event: `"<eventId> is <N> s early. <system|No system> can
  detect|track|identify <pathId> at <mm:ss>."`
- Late engage event: `"<eventId> is <mm:ss> late. The latest engage is <mm:ss>."`
- Effect event before effector reach: `"<eventId> is before <effectorId> reach at <mm:ss>."`

### Live tokens (`D.tokens`, `js/21-derive.js:406-431`)

Caption and notes text support `{id.key}` tokens, e.g. `{T1.rng}`. Keys: `rng` (range), `alt`
(altitude, respects site datum), `spd` (speed), `vc` (closing speed), `tta` (time to the defended
asset), `window` (geometric detect-to-engage window), `margin` (engage margin), and `see:systemId`
(first-see time and range of a path against a named system). An unknown id or key leaves the token
as typed.

### Measured performance (brief, from the task; not re-measured in this pass)

- `derive`: 1.5 ms for 1 path, 13 ms for 6 paths, 435 ms for 42 paths and 15 systems.
- Of the 42-path case, `G.splitTimes` alone is 311 ms (0.1 s steps over every pair,
  `js/20-geo.js:333`).
- `render`: 0.3-3 ms.
- Every drag move reruns derive: `js/45-tools.js:588-596` patches the record on every pointer
  move, and the store's reference change invalidates the derive memo on the next read.

## 6. User actions inventory (parity checklist)

### Toolbar (`js/51-panel-topbar.js`)
- [ ] Mode segment: Build, Brief, Library
- [ ] Profile name field (rename)
- [ ] Id and version readout
- [ ] Undo (shows the pending label; disabled when nothing to undo)
- [ ] Redo
- [ ] Export (opens the export dialog)
- [ ] Import (opens the import dialog)
- [ ] Theme toggle (cycles auto, light, dark)
- [ ] Help (cheat sheet)

### Quick-add palette (`js/51-panel-palette.js`)
- [ ] Open via toolbar, `a`, or context-menu Add
- [ ] Search field filters by label and group
- [ ] Groups: Aircraft, Sensors and effectors, Volumes, Events, Reference (height plane)
- [ ] Per-row data column: cruise speed and height band (aircraft); range and sector (systems);
  top height (volumes)
- [ ] Shortcut hints on rows that have one (radar = S, asset volume = V)
- [ ] Picking an aircraft/system/volume/event enters placement mode; clicking the board places it
- [ ] Formation popover (press `f`): lay out N aircraft on a line with spacing

### Context menu (`js/51-panel-menu.js`, `actionsFor`)
- [ ] Path: Add event here, Formation, Reverse, Duplicate, Delete
- [ ] Waypoint: Hold +30 s, Insert after (disabled on the last point), Delete (disabled at 1 point)
- [ ] System: Make a sector / Make omni (toggle by current fov), Duplicate, Delete
- [ ] Volume or vertex: Set top, Duplicate, Delete
- [ ] Plane: Delete
- [ ] Event: Change type, Move to geometry (only when the event carries a warning), Delete
- [ ] Group: Split here (only with a time cursor), Merge (only with 2+ letters), Delete group
- [ ] Card: Apply view, Open in Brief, Up, Down, Delete
- [ ] Empty board: Add, Save card
- [ ] Every menu: Copy (enabled for path/system/volume/plane with a selection), Paste

### Keyboard (`js/46-keys.js`, full table)
- [ ] `a` palette open; `s` add sensor (radar); `v` add volume (asset); `e` add event
- [ ] `f` formation; `1|2|3` mode (Build/Brief/Library)
- [ ] `p|l|x` camera (plan/elev/axon); Space play/pause (Build); `,`/`.` step 1 s;
  Shift+`,`/`.` step 10 s; Home/End time to start/end; `t` time cursor on/off; `[`/`]` previous or
  next event/derived time
- [ ] `u` units toggle (anywhere); `g` grid snap; `m` ruler; `r` cycle timeline/chart/ladder strip
- [ ] Shift+1..8 toggle layer by chip number; `0` fit board; `=`/`+`/`-` zoom
- [ ] Arrow keys nudge selection; Shift+Arrow nudges 5 steps; Tab/Shift+Tab next/prev object of
  same kind; Delete/Backspace remove selection; `d` duplicate; `c` save view as card
- [ ] Mod+Z undo; Mod+Shift+Z or Ctrl+Y redo; Mod+C copy; Mod+V paste
- [ ] `i` toggle inspector; `\` toggle both side panels; `?` cheat sheet; Escape cancel/close/back
- [ ] Brief mode: Right/PageDown next clip beat else next card; Left/PageUp previous; Space next
  card or play; Home/End first/last card; `1..9` jump to card; `f` full stage; `n` notes panel;
  `b` blank stage; `k` live readout strip; Up/Down cycle focus
- [ ] Library mode: `/` focus search; `n` new-profile menu

### Board gestures (`js/51-panel-board.js`)
- [ ] Click empty: deselect. Click object: select.
- [ ] Drag object/handle: move it (snaps unless Alt held or snap off)
- [ ] Drag empty (middle button, Space held, or touch): pan. Two-finger touch: pinch zoom+pan.
- [ ] Wheel: zoom at cursor
- [ ] Double-click a waypoint: delete it. Double-click while placing aircraft/volume: finish.
- [ ] Right-click, or long-press ~500 ms on touch: context menu
- [ ] Axon camera drag: orbit (yaw/pitch) instead of pan
- [ ] Ruler mode: two clicks measure a distance. Rect placement (volume with no points): drag a
  rectangle.

### Placement flow (`js/45-tools.js`)
- [ ] Picking a palette item sets `ui.placing`; a ghost follows the cursor; click (or click-drag
  for a rectangle volume) commits
- [ ] Snap: grid snap plus snap to existing geometry (`PS.tools.snap`), bypassed with Alt
- [ ] Clipboard copy/paste of path, system, volume, plane; reverse path direction; duplicate;
  remove waypoint; make sector/omni; merge/split/remove group

### Inspector fields per kind (`js/51-panel-inspector.js`)
- [ ] Path: id, aircraft, archetype line, group, identity, speed (nullable, "auto <speed>"
  placeholder), run-time readout, waypoint table (x, y, height, hold, delete), "needs two
  waypoints" warning
- [ ] System: id, kind, x, y, height, range, minimum range, field of view, bearing, elevation
  min/max, bottom, top (nullable), status, "has no reach" warning
- [ ] Volume: id, kind, label, bottom, top, vertex table (x, y, delete; disabled under 3 vertices)
- [ ] Plane: id, label, height
- [ ] Event: id, type, label, path, time (`m:ss` or seconds), system (optional), matching warning
- [ ] Group: member list, click a member to select it
- [ ] Card: camera, layers, clip, focus, time, caption, notes (`js/51-panel-cards.js`,
  `js/51-panel-notes.js`)

### Timeline/chart/ladder/readout
- [ ] Timeline (`js/51-panel-timeline.js`): drag the lane to scrub; drag an event bead to retime
  it (snaps to derived times); drag to select a time range; hover for a tooltip
- [ ] Chart (`js/51-panel-chart.js`): click a segment to seek; hover for detail
- [ ] Ladder (`js/51-panel-ladder.js`): sortable columns (path, detect, track, id, engage,
  effect), click a header to sort
- [ ] Readout (`js/51-panel-readout.js`): live strip of `d.at()` for the selection or hover
  target; click to pin

### Brief mode (cards, stage, notes)
- [ ] Card strip: add/reorder/delete; Save card captures camera, layers, time, selection
- [ ] Stage: renders the active card; caption with live tokens; full-stage toggle; blank toggle;
  presenter hints (next card, elapsed); phone header with swipe Back/Next; live readout toggle
  (`k`)
- [ ] Notes: notes/caption fields with live token preview; clip fields (t0, t1, rate, beats)

### Library / collect mode (`js/51-panel-collect.js`)
- [ ] Grid grouped by collection, newest collection first; search by id, name, collection, purpose
- [ ] New split button: blank or one of the 5 templates
- [ ] Per-card: Open, Brief, Duplicate, Export, Delete (inline confirm); library-level Import and
  Export

### Import/export, undo/redo, units, theme
- [ ] Export dialog: active record or whole library. Import: paste/load JSON, re-validated and
  migrated.
- [ ] Undo/redo: toolbar buttons and Mod+Z/Mod+Shift+Z, pending-action label shown
- [ ] Units toggle: nav (nm, ft AGL, kt) or si (km, m, m/s), `u` anywhere. Theme: auto/light/dark.

## 7. Cameras and layers

### Cameras (`js/40-cameras.js`)

Three projections, each a `setup(scene, derived, size, view, opts)` function returning world-to-
screen mapping, applied after a shared viewer transform (`sx = base_x * zoom + px`):

- **plan**: top-down, north up.
- **elev**: side view, horizontal axis is range from the origin, vertical axis is height.
- **axon**: axonometric 3D, yaw/pitch controlled by drag (orbit), the only camera with no 2D pan
  edit (editing a dragged object elsewhere prompts "Edit in Plan or Elevation").

### Layers (`js/42-layers.js` registry; 8 chip layers plus 3 structural ones)

| layer | chip | draws |
|---|---|---|
| reach | 1 | Sensor/effector rings (dashed at rest, solid tinted while covering); elevation slant arcs and elevation-limit rays |
| events | 2 | Event beads with letter glyphs; warning triangles on early events; first-see ticks per sensor/effector |
| envelopes | 3 | One convex hull per link cluster at t (or per snapshot when t is null) |
| tracks | 4 | Track frames by lifecycle state; leaders; data blocks; sensor-to-track lines; engagement bars; mission-kill mark; target TSPI cross (chip 8 "target") |
| telemetry | 5 | Planned TSPI samples, station links at t, flown debrief samples and frame |
| labels | 6 | One greedy label-placement pass over every layer's queued candidates |
| rings | 7 | Drawn by the grid layer; registered separately only for the chip bar |
| target | 8 | Drawn inside the tracks layer; the TSPI truth cross |

Non-chip structural layers: `grid` (grid, axes, compass, scale bar, range rings, axon hint),
`paths` (planned routes, hold rings, waypoint dots), `systems` (ground frames by kind, status
marks, selection ring, id labels), `volumes` (asset, engagement zone, no-fly, reference pattern),
`planes` (height planes), `handles` (edit-only: selection handles, pre-drag ghost at 32% opacity,
ruler, placement ghost, formation ghost).

## 8. Tests (`test/smoke.js`, `test/cases/*.js`)

`node test/smoke.js` loads every `js/*.js` file (in `index.html` script order) into one bare `vm`
context, then runs each of the 11 case files against the resulting `PS`.

| case file | covers |
|---|---|
| `00-load.js` | every script loads in order and defines no global besides `PS`; `PS.VERSION` |
| `catalog.js` | `PS.catalog` tables and lookups |
| `derive.js` | `PS.derive.all` on the seed records |
| `geo.js` | `PS.geo` pure functions on inline geometry fixtures (no catalog dependency) |
| `keys.js` | `PS.keys` table shape, matching, and cheat-sheet generation |
| `persist.js` | `PS.persist` save/load/export/import/parse roundtrips |
| `render.js` | cameras, symbols, layers and `PS.render` across plan/elev/axon on the seed |
| `schema.js` | `PS.schema` migration and validation, and `PS.seed` |
| `store.js` | `PS.store`, `PS.bus`, `PS.sel` reducers and selectors |
| `time.js` | `PS.time` with a manual ticker and a minimal store |
| `units.js` | `PS.units` and `PS.fmt` formatting |

Cases are commented with a "Lane" number showing their load-order dependency; `derive.js` and
`time.js` self-skip with a console note if the catalog/seed lanes have not populated `PS` yet in
whatever order the harness runs them.

## 9. Known gaps

- No HTML5 drag-and-drop from the palette onto the board; placement is pick-then-click, not drag.
- Right-clicking empty map offers only Add and Save card, nothing else.
- MOPs (`mop[]`) are free text, not structured measures; there is no per-MOP pass/fail or
  threshold field in the v4 schema.
- The engine is deterministic only: one run, one set of derived times. No probability of
  detection, no Monte Carlo, no confidence interval.
- The kill chain modeled throughout `js/21-derive.js` and the UI is detect/track/id/engage/effect.
  The project now uses F2T2EA over DroneScore `stage_reached`; see
  `docs/reference/jiatf-401.md` section c for the mapping this legacy five-rung ladder does not
  use.
