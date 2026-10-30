# Phase 7 first-use walk (lane 7.2)

Walked: `lane/7.2` at `4db84ea`, 2026-10-30, on `npm run build` then
`npm run preview -- --port 5174 --strictPort` (production bundle).
Browser: Chrome through claude-in-chrome, window 1440 x 900 (viewport 1440 x 757), dark theme.
Storage: at the start the `profile-studio` IndexedDB existed for `localhost:5174`. It was deleted
and localStorage cleared; after reload the `vignettes` store held 0 records. Both were deleted
again at the end (`indexedDB.databases()` returned `[]`, localStorage length 0).
Nothing was downloaded. `URL.createObjectURL`, `HTMLAnchorElement.click` and `window.print` were
replaced with recorders before the walk.

Native HTML5 drag does not fire through the tools. Library placement was not part of the walk,
and the native drag path is untested by this lane (7.1 covers it in Playwright). Map drags
(sensor, waypoint) use pointer events and worked through the tool.

## Result

The first-use goal is met. The five steps took 76 s of wall clock from the tool timestamps,
against the 10-minute goal. No step needed help text, a search or the source code.

The time is a tool-driven time: it excludes the time a person takes to read each screen. The friction items below estimate
the cost to a human first-time user. Their sum (about 3 to 5 minutes at most) still leaves the
walk under 10 minutes.

Two major items remain for a first-time user: assets stacked at the site origin cannot all be
selected by click (FR-01), and the AAR does not state the sensor position that the user changed
(FR-02).

## Timed walk

t0 = 1793383721.3 s (Library loaded with empty storage).

| Step | Time | Result | Screenshot |
| --- | --- | --- | --- |
| 1. Open a template (Point defence, single quadrotor) | 17.6 s (includes a window resize) | pass. Card click opens Build with the map, the question in the top bar and Run. | `phase-7/01-library.jpg`, `02-point-defence-open.jpg` |
| 2. Move one sensor | 23.0 s | pass after one wrong selection. The first click at the origin selected T1 waypoint 2; the second selected RF-1. A drag moved RF-1 to 1.19 nm E, 0.94 nm S; the inspector updated. | `03-sensor-moved.jpg` |
| 3. Run the vignette | 7.3 s (run itself 0.4 s) | pass. Top bar showed `24/100` and Cancel, then "Run R-1 done, View results". | `04-run-progress.jpg`, `05-run-done-note.jpg` |
| 4. Read one measure against its threshold | 16.9 s (includes a 5 s wait to test the done note) | pass. Results: 1.1.2 Detection Range (ground) 2.151 nm [2.149, 2.152], threshold ≥ 1.62 nm, Meets, Simulated. H-01 prediction [1.62, 2.16], result inside. | `06-results-1-1-2.jpg` |
| 5. Export the AAR | 11.5 s | pass. Report shows seven sections; Export PDF called `window.print` once at 1793383797.6 s. | `07-report.jpg` |
| Total | 76.3 s | goal met (under 600 s) | |

## Friction items

Ranked by estimated cost to a human first-time user.

| ID | Severity | Screen | What happened (evidence) | Proposed fix | Est. cost |
| --- | --- | --- | --- | --- | --- |
| FR-01 | major | Build map | Expected: click a sensor to select it. Saw: in every template opened (Point defence, Swarm, Delta wing, Hover, Detection range sweep) the sensors, the effector and the defended asset sit within a few pixels of the origin, and T1's last waypoint ends there too. The first click at the origin selected T1 WP 2. RDR-1 and EW-1 (Swarm) and RDR-1 and KIN-1 (Delta wing) share one point: three clicks at (789, 334) all returned `RDR-1`, and the labels overlap at maximum zoom. KIN-1 was reachable only after dragging RDR-1 aside. Did: clicked a second spot; for the effector, moved the radar then undid it. | Offset template laydowns so no two assets share a point. Cycle the selection on a repeat click at the same point, or show a pick list of stacked hits. Avoid label overlap. | 30 to 90 s; an effector cannot be selected at all without the workaround |
| FR-02 | major | Report, sections 3 and 6 | Expected: the AAR records the factor the user changed. Saw: the factor table and scope of inference list each sensor's range and sector (`Sensor RF-1 RF detector range 1.62 nm, sector 360°`) but not its position. RF-1 at 1.19 nm E, 0.94 nm S appears only in the map snapshot. Did: read the snapshot. | Add the position (E and N from the site, or bearing and range) to the factor table and the scope of inference. | A reader of the AAR cannot state the condition tested |
| FR-03 | minor | Build top bar | Expected: a lasting sign that the run finished. Saw: a DOM poll every 100 ms recorded `17/100` at 101 ms, `Run R-2 done` at 401 ms, and nothing at 6402 ms. The note shows for 6.0 s; the Results tab carries no badge; the map does not change. Did: saw the note only because a screenshot fell inside the 6 s. | Keep the note until the user opens Results or edits the vignette, or mark the Results tab with the new run. | 10 to 30 s for a user who looks at the map during the run |
| FR-04 | minor | Build top bar, Report section 1 | Expected: template text in the display units. Saw: "Legacy MOP: initial detection at or above 3.0 km" (Point defence), "a 46 m/s one-way attack outside 2 km" (Delta wing), "loiter at 1.5 km" (Hover), "altitude from 30 to 400 m" (Detection range sweep), all with the display in nm, ft and kt. The text does not change with U. "Legacy MOP" is an internal label. | Write template questions without hard-coded units or format them with the units toggle. Drop "Legacy". | 5 to 15 s of conversion per template |
| FR-05 | minor | Build map, Swarm | Expected: click the engagement zone to select it. Saw: a right-click inside the zone gave the empty-map menu; a right-click on its edge gave the RDR-1 menu, because the zone edge coincides with the 2.16 nm radar ring. The zone could not be selected by click. | Make the area interior a hit target below point assets, or offset the template zone from the radar ring. | 15 to 30 s |
| FR-06 | minor | Results and Report | Expected: the value sits visibly inside its interval. Saw: 1.2.2 Track Continuity `99.9 %` with `[99.8, 99.9]` (Hover); 1.1.2 in km `3.98 km` with `[3.98, 3.99]` (Point defence). The value prints equal to one limit. | Choose the decimal places so that value and both limits differ, as the nm view does (`2.151 nm [2.149, 2.152]`). | 5 to 10 s of doubt per row |
| FR-07 | minor | Library, Saved | Expected: a saved vignette only after an edit, or a visible difference from the template. Saw: opening Swarm with no edit (right-clicks and zoom only) added "Swarm of six, split" to Saved; after the walk Saved held four rows named exactly like four templates. | Save only after the first edit, or name the copy distinctly. | 5 to 15 s choosing between same-name rows |
| FR-08 | minor | Results, sweep chart | Expected: units on both axes. Saw: x axis titled "Threat altitude, ft AGL"; y ticks `0.00` to `2.20` with no unit; the unit appears only in the caption "Line: nm at each level". | Title the y axis with the measure unit. | 5 s |
| FR-09 | minor | Build top bar | Expected: progress during a sweep. Saw: "Sweep running" with no count (screenshot ss_6996gajdk, not saved), while a run shows `n/100`. Spec section 11 asks for progress. | Show levels or replicates done. | under 5 s for a fast sweep |
| FR-10 | minor | Build map | Expected: wheel zoom about the cursor. Saw (Delta wing): with the pointer at (701, 332) on the origin, two zoom steps moved the origin to (750, 332) and then (788, 333). | Anchor wheel zoom at the pointer. | 5 to 10 s of re-panning |

## Watch-list results

| # | Item | Result | Evidence |
| --- | --- | --- | --- |
| 1a | Right-click empty map | pass, one deviation. Add here (submenu Threats, Sensors, Effectors, C2 and TSPI, Areas), Paste here (disabled: "Copy something first"), Measure from here, Set time here, Fit view `F`. "Measure from here" shows no shortcut although `M` is the measure tool; spec says each item shows its shortcut. | `08-menu-empty-map.jpg`, `09-menu-add-here.jpg` |
| 1b | Sensor (RF-1, RDR-1) | pass. Make sector, Set range, Duplicate `Cmd+D`, Delete `Delete`. | `10-menu-sensor.jpg` |
| 1c | Effector (KIN-1) | pass after moving RDR-1 aside; same four items. Not reachable by click while stacked (FR-01). | `22-effector-menu-after-move.jpg` |
| 1d | Threat path (T1) | pass. Add waypoint here, Change threat type ›, Set speed, Set altitude for all, Reverse, Duplicate `Cmd+D`, Delete `Delete`. | DOM read, Point defence |
| 1e | Waypoint (T1 WP 1) | pass. Hold +30 s, Insert after, Set altitude, Delete (disabled: "A flight path needs two waypoints"). | `11-menu-waypoint.jpg` |
| 1f | Area (defended asset, Swarm) | pass. Set top, Add vertex here, Duplicate `Cmd+D`, Delete `Delete`. Engagement zone not reachable (FR-05). | DOM read |
| 1g | Timeline | pass. Set time here, Loop from here, Clear loop (disabled: "No loop is set"). | DOM read |
| 1h | Hypothesis | not a map target; no right-click menu found. | |
| 2 | Units toggle | pass, one deviation. `U` switched grid (nm to km), inspector (kt to m/s, ft AGL to m AGL, nm to km), library list (`23 kt · 98 ft to 1,312 ft` to `12 m/s · 30 m to 400 m`), library tooltip (`max 21 m/s`), Results (`≥ 3.00 km`, no nm, kt or ft left) and Report (no nm, kt or ft left). Inspector hypothesis line switched `≥ 1.08 nm` to `≥ 2.00 km` (F-10 fixed). Timeline shows time only. Template question text does not switch (FR-04). | `12-units-metric-build.jpg`, `13-results-metric.jpg` |
| 3a | Circle areas | pass. The Swarm engagement zone draws as a smooth circle. Delta wing WEZ-1 is a square polygon by design. | `14-swarm-open.jpg`, `17-delta-wing-open.jpg` |
| 3b | F2T2EA lanes in the timeline | fail (F-15 stands). One row per threat (`A1, A2, A3, B1, B2, B3` in Swarm; `T1` elsewhere); no Find to Assess lane label in the timeline DOM. Spec section 7 asks for one lane per step. | `14-swarm-open.jpg` |
| 3c | Label collisions | fail (F-15 stands). Origin labels overlap in all templates opened, at every zoom (RDR-1 over EW-1 or KIN-1); Swarm threat labels stack at the start point; Report map snapshot shows the same overlap. | `16-swarm-origin-zoom.jpg`, `07-report.jpg` |
| 3d | Drag smoothness | pass at this scene size. Tool drag of Delta wing WP 1: 61 frames in 417 ms, longest frame gap 8.5 ms, 0 gaps over 17 ms (display runs near 144 Hz); path time updated 4:25 to 4:37. A 2 s scripted drag with synthetic pointer events selected the waypoint but did not move it, so its count (289 frames in 1999 ms, max gap 8.7 ms) is idle rendering only. The 40-threat, 15-sensor budget scene was not tested. | DOM timings |
| 4 | Run-finished notice | partial. The note "Run R-n done, View results" is next to Run and links to Results, but clears after 6.0 s with no lasting cue (FR-03). The Results tab is always visible in the top bar. | `05-run-done-note.jpg`, DOM poll |
| 5 | Scorecard text, precision, glyphs, units | pass, one deviation. Unscored rows read "Not scored in this vignette"; no engine term found (regex for `stage_reached`, `undefined`, `NaN`, `engine`, `LOSSES`: 0 hits) (F-06 fixed). Report and Results use `≥` with units on every value (F-09 fixed). Sweep x axis "Threat altitude, ft AGL" (F-11 fixed); y axis has no unit (FR-08). Precision shows value equal to a limit in two rows (FR-06, F-07 partly fixed). | `06-results-1-1-2.jpg`, `21-results-unscored-rows.jpg`, `19-sweep-chart.jpg` |
| 6a | Detection range sweep (F-14) | pass. "Run sweep" exists in the top bar (F-02 fixed). The chart shows 1.1.2 near 1.27 nm at 98 and 197 ft AGL, rising to about 2.18 nm at 787 and 1,312 ft AGL; subtitle "Meets the threshold ≥ 1.62 nm at 3 of 5 levels". The template answers its question. | `18-sweep-template-open.jpg`, `19-sweep-chart.jpg` |
| 6b | Hover track hold (F-18) | partial. The map shows a loiter mark mid-path and 1.2.2 scores 99.9 % [99.8, 99.9], Meets. The question note says the Monte Carlo "flies through the hover hold" while the preview dwells, so the scored run does not include the 60 s hover the question names. The scope of inference does not state this limit, and the note uses engine words. | `20-hover-open.jpg`, Report text |
| 7 | Light theme | not tested. The tools give no color-scheme emulation; `matchMedia('(prefers-color-scheme: dark)')` returned true. Print output was intercepted at `window.print` and not viewed. | |

## Fix lanes proposed

- `src/domain/templates/`: offset the stacked laydown at the origin and the Swarm zone from the
  radar ring (FR-01, FR-05); unit-free question text without "Legacy" (FR-04); state the Hover
  limit in plain words (6b).
- `src/features/build/map/`: cycle or list stacked hits on click (FR-01); area interior hit
  target (FR-05); label collision avoidance (3c); wheel zoom at the pointer (FR-10).
- `src/features/build/timeline/`: one lane per F2T2EA step (3b, F-15).
- `src/features/build/` top bar: keep the run-done note or badge the Results tab (FR-03); sweep
  progress count (FR-09).
- `src/commands/`: show `M` on "Measure from here" if it is the measure command (1a).
- `src/features/report/`: sensor and effector positions in the factor table and scope of
  inference (FR-02); Hover limit in the scope of inference (6b).
- `src/features/results/`: precision so value and limits differ (FR-06); y-axis unit on the
  sweep chart (FR-08).
- `src/features/library/`: save a template copy only after an edit, or name it distinctly (FR-07).
