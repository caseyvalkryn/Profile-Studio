# Phase 7 fixes review and browser check (lane 7.R)

Reviewed: `c67822f..dfd06d1` (lanes 7.4 to 7.11, 47 files) at worktree `lane/7.R`, head `2379076`, 2026-10-30.
Measured against `docs/spec.md` sections 7, 8, 10 and 12, `docs/design-principles.md`, DroneScore
names in `docs/reference/dronescore-measures.md`, and the FR list in `reviews/phase-7-first-use.md`.
Build: `npm run build` exit 0, served by `npm run preview -- --port 5174 --strictPort`.
Gate at start: `npm run gate` exit 0. Typecheck and lint clean, Vitest 69 files and 505 tests
passed, build passed, Playwright 12 of 12 passed on port 5175.
Browser: Chrome through claude-in-chrome. Viewport 1326x806 at the start. It changed to 1854x757
during the Swarm zoom, then was set to 1440x757. Zoom and FR-10 data were taken at a stable 1440x757.
Theme in use: dark.
Storage: IndexedDB `profile-studio` and localStorage existed for `localhost:5174` at the start.
Both were deleted before the walk, again mid-walk, and at the end. End state: `indexedDB.databases()`
returned `[]`, localStorage length 0. Nothing was downloaded. `window.print` and
`URL.createObjectURL` were replaced with recorders: 0 print calls, 0 blobs.

## Verdict

No blockers. Most FR items are fixed and the acceptance drags work. Three majors remain. The hover
limit is stated in three places in the Hover report, and two of them contradict each other
(F-01). The Point defence question note uses names that are not DroneScore names (F-02). The
decimal rule prints float noise as "100.0000 % [96.3005, 100.0000]" (F-03). Fix F-01 to F-03 and
the minors in 7.F.

## FR status

| Item | Status | Evidence |
| --- | --- | --- |
| FR-01 laydown spread, labels | fixed, with F-09 and F-11 open | 0 label overlaps in all 5 templates at the default view; labels still cover markers |
| FR-02 report factor rows follow edits | fixed | RF-1 position and range follow the drag and undo, screenshots 17, 21 |
| FR-03 run-done note | fixed | note stays 23 s, clears on Results and on rename, screenshots 18, 20 |
| FR-04 unit-free questions | fixed | no nm, kt, ft or "Legacy" in any question or the km Report |
| FR-05 area interior hits | fixed | DA and WEZ-1 interiors select, screenshots 08, 15 |
| FR-06 display precision | fixed except F-03 | Hover 1.2.2 "99.92 % [99.88, 99.96]", screenshot 22 |
| FR-07 no save on open | fixed, with F-06 open | 4 opens without edits leave 0 records, screenshot 16 |
| FR-08 sweep y title | fixed | "1.1.2, km" inside the chart, screenshot 24 |
| FR-09 sweep progress | fixed | "Sweep running 0/5 test points" to "Sweep done" |
| FR-10 zoom drift | not fixed in code (declared loss); did not reproduce | point stays within 1 px through 4 wheel steps |
| 1a measure shortcut in menu | fixed, with F-07 open | "Measure from here M", screenshot 08 |
| 3b timeline lanes | fixed, with F-08 open | six lane labels per row, screenshot 01 |
| 3c label collision | fixed for map labels, F-10 open for grid labels | 0 overlaps over 4 zoom steps |
| 6b hover limit in plain words | partly fixed | stated three times, see F-01 |

The hover limit is stated twice in code: `limits.ts:23` (7.9) and `HOVER_SCOPE` in
`hoverTrackHold.ts:23` (7.4). The Report also carries a third statement in the section 1 note.

## Findings

Ranked by severity. Counts: 0 blocker, 3 major, 11 minor, 6 note.

| ID | Severity | File:line | What I saw | Spec or principle | Proposed fix |
| --- | --- | --- | --- | --- | --- |
| F-01 | major | `src/features/report/limits.ts:19-23`, `src/domain/templates/hoverTrackHold.ts:23,61` | Hover report states the limit three times (section 1 note, section 6 generated line, section 6 note). The generated line says the results "do not cover a hovering or loitering threat"; HOVER_SCOPE says 1.2.2 is measured over the orbit turn, which is the loiter. The generated line also cites "waypoint 16", which means nothing to a reader. Screenshot 23. | Design principles: one statement per fact; spec 10 scope of inference must be correct and plain. | Keep one statement. Drop HOVER_SCOPE or the generated line for this template. Reword the generated line to "a threat that stops and hovers" and name the hold by time, not waypoint index. |
| F-02 | major | `src/domain/templates/pointDefence.ts:22` | Note reads "3.1.2 Defeat Rate" and "1.1.2 Detection Range", and "in the measure rows". It shows in Report section 1. | DroneScore names: 3.1.2 "Probability of Kill (Pk)" (`dronescore-measures.md:98`), 1.1.2 "Detection Range (ground)" (`:58`). Name every metric by DroneScore ID and name. | Use the DroneScore names. Replace "in the measure rows" with plain wording such as "in the hypotheses". |
| F-03 | major | `src/features/shared/units.ts:204,214` | Point defence R-1 (nm) printed 3.1.2 as "100.0000 % [96.3005, 100.0000]". R-2 (km) printed "100 % [96, 100]". The exact test `a !== b` treats float noise below 100 as a distinct value and drives decimals to MAX_DECIMALS. Screenshot 19. | Spec 8 and FR-06: show the fewest decimals that separate distinct values. | Compare with a tolerance, or round both values to MAX_DECIMALS before `a !== b`. Add a test with a Wilson bound of 99.99999999. |
| F-04 | minor | `src/features/build/map/controller.ts:535` | After Escape or undo the next stacked click re-selects the top hit from mousedown, so the cycle position is wrong. | FR-01 stacked-hit cycle must be predictable. | Reset `lastClick` on Escape, undo and selection change from outside the map. |
| F-05 | minor | `src/features/build/BuildWorkspace.tsx:156` | Browser back or forward into Results leaves the run-done note up on return. | FR-03: the note clears once Results is seen. | Dismiss the note when ResultsWorkspace mounts. |
| F-06 | minor | `src/state/persist.ts:144-155`, `src/features/library/LibraryScreen.tsx:83-91` | The 500 ms save debounce is not flushed on a route change. An edit then Library within 500 ms shows no Saved row. A run alone saves an unedited template copy. | FR-07: save on edit only, and show the save. | Flush the pending save on route change. Do not mark the doc dirty for a run. |
| F-07 | minor | `src/commands/registry.ts:85`, `src/features/commands/ShortcutSheet.tsx:16` | `shortcutFrom` adds M to the palette row too, but M runs map.measure, not that row. The shortcut sheet omits the row. | Design principles: one key, one action, shown the same way everywhere. | Apply `shortcutFrom` in the context menu only. |
| F-08 | minor | `src/features/build/timeline/layout.ts:8-10`, `src/features/build/BuildWorkspace.tsx:21`, `src/features/build/timeline/Timeline.tsx:151` | ROW_H 64 inside TIMELINE_HEIGHT 160 shows about 1.7 rows. In Swarm the time axis scrolls away with the rows. Screenshot 11. | 3b: rows readable with the time axis in view. | Make the axis sticky, outside the scrolled area, and size the panel to at least 2 rows. |
| F-09 | minor | `src/features/build/map/labels.ts:54` | Placement avoids other labels only. Delta wing: the RDR-1 label covers the DA square and the T1 end (screenshot 03). Swarm: EW-1 label covers DA at zoom (09, 10). Sweep: RDR-1 marker covers the EO-1 label (26). Fallback slot 0 can overlap; no canvas bounds check. | FR-01: labels readable and not over markers. | Add marker boxes to the obstacle set; test bounds; when no slot is free, hide the label rather than overlap. |
| F-10 | minor | `src/features/build/map/controller.ts:320-380` | At 100 px per nm with 0.5 nm steps the x-axis grid labels run together ("4.5 nm W4 nm W3.5 nm W"). 0 overlaps at 122 px per nm. Screenshot 10. | 3c: no label collision at any zoom. | Choose the grid step from label width, or drop alternate grid labels when they collide. |
| F-11 | minor | `src/domain/templates/swarmSplit.ts` (`split(e, 0, 3, 150)`) | Split at fraction 0 puts WP1 and WP2 at the same point for all 6 threats. The start stack is 18 deep; each threat comes up twice in a row (A2, A3, A3, B1, B1, B2 WP1). Inspector header says "Threat" with no stack position. Screenshot 06. | FR-01: spread laydown; stacked-hit cycle should reach each object once. | Start the split after a short leg, or drop the duplicate waypoint. Show "n of m" while cycling. |
| F-12 | minor | `src/features/build/BuildWorkspace.tsx:200-210` | "Sweep done, View results" stays up after moving RDR-1 and dragging its ring, so it points at results from the earlier laydown. The run-done note clears on edit. Screenshots 25, 26. | FR-03: a done note describes the current vignette. | Clear the sweep note on the same edit signal as the run note. |
| F-13 | minor | `src/domain/templates/build.ts:83-89`, `src/domain/templates/templates.test.ts` | The 24 px laydown spacing rule is a comment only; the test diff is 3 lines and asserts no spacing. | Tests cover each FR fix. | Add a test that every template's markers sit at least 24 px apart at the default view. |
| F-14 | minor | `src/features/build/map/labels.test.ts:76` | Wall-clock assertion `toBeLessThan(2)` ms. Will flake on a loaded CI host. | Gate must be deterministic. | Assert work count or remove the timing check. |
| F-15 | note | `src/features/shared/units.ts:214` | Two values within 1e-4 print as "[99.8700, 99.8700]"; the test locks this in. | FR-06. | Print one value when the bounds do not separate at MAX_DECIMALS. |
| F-16 | note | `src/features/build/map/hit.ts:96`, `src/features/build/map/MapView.test.tsx`, `src/features/build/timeline/Timeline.tsx:17` | `hitTest` is now used only by tests; a MapView test comment claims more than it tests; a const sits between imports. | No dead code. | Remove `hitTest` or use it; fix the comment; move the const. |
| F-17 | note | `src/domain/templates/detectionRangeSweep.ts:19-22` | Pre-existing: SWEEP_SCOPE hard-codes m, ft, km and nm. | Units follow the toggle. | Build the text from the units formatter. |
| F-18 | note | `src/features/build/map/hit.ts:20-127` | Inside Delta wing WEZ-1, a click within 8 px of the KIN-1 ring or EO-1 sector edge selects those first; a repeat click reaches WEZ-1. Screenshots 14, 15. By design. | FR-05. | None. Record in the shortcut sheet if users ask. |
| F-19 | note | measure readout and Report factor rows (file not traced) | Measure readout "1.21 n" is clipped at the inspector edge (screenshot 13). A sensor at the origin reads "0.00 nm E, 0.00 nm N of the site". | Design principles: plain words. | Keep the readout inside the map; print "at the site" for a zero offset. |
| F-20 | note | `src/features/results/` sweep chart | Caption says "Band: 95 % interval" but no band is visible at this scale in Detection range sweep. Screenshot 24. | Caption must match the marks. | Draw a minimum band height, or drop "Band" from the caption when it cannot be seen. |

## Browser check

| # | Check | Result | Note | Screenshot |
| --- | --- | --- | --- | --- |
| 1 | FR-01 laydown and stacked hits | partial | 0 label overlaps in all 5 templates; cycle and drag of B2 WP1 work (moved to 2.35, 1.67 nm, then undone). Labels over markers (F-09); 18-deep Swarm start stack (F-11) | 01-05, 06, 07 |
| 2 | FR-05 area interior | pass | Swarm DA centre selects "Defended asset DA"; right-click in radar reach opens the empty-map menu (radar coverage is not an area). Delta WEZ-1 interior selects WEZ-1 | 08, 14, 15 |
| 3 | 3c labels over zoom | partial | 0 map-label overlaps over 2 zoom-in and 2 zoom-out steps; grid labels collide at 100 px per nm (F-10) | 09, 10 |
| 4 | FR-10 zoom about pointer | pass | Pointer (1000,450). px per nm 149, 122, 100, 122, 149; the map point re-projected to within 1 px each step | none |
| 5 | 3b timeline | partial | Lane labels and ticks correct; scrub to t+1:47 works; gutter menu has Set time here, Loop from here, Clear loop. Axis scrolls away in Swarm (F-08) | 01, 11, 12 |
| 6 | FR-03 run-done note | pass | 20/100 at 101 ms, 70/100 at 201 ms, "Run R-1 done" at 301 ms, still up at 23,301 ms; gone after Results; Cmd+Enter gives "Run R-2 done"; rename clears it | 18, 20 |
| 7 | FR-09 sweep progress | pass | Polled every 100 ms: 0/5 at 101 ms, 1/5 at 201 ms, 2/5 at 300 ms, 3/5 at 500 ms, 4/5 at 601 ms, "Sweep done" at 801 ms | none |
| 8 | FR-04 questions | pass | All 5 questions unit-free; km Report has 0 matches for nm, kt, ft or Legacy. Section 1 note wording in F-02. Report section 1 at nm not walked for every template | 01-05 |
| 9 | FR-02 and 6b report follows edits | partial | RF-1 at 1.04 nm E, 0.52 nm S, range 1.62 nm in the Report; after U, 1.93 km E, 0.97 km S, range 3.00 km. 6b: hover limit stated three times (F-01) | 17, 21, 23 |
| 10 | FR-06 precision | partial | Hover 1.2.2 "99.92 % [99.88, 99.96]"; Point defence 1.1.2 "3.981 km [3.978, 3.983]". 3.1.2 shows "100.0000 % [96.3005, 100.0000]" (F-03) | 19, 22 |
| 11 | FR-08 sweep chart | pass | Y title "1.1.2, km", rotated, inside the 640x260 SVG; 0 text elements outside the chart bounds | 24 |
| 12 | FR-07 save on edit only | pass | 4 opens without edits: 0 records, Saved list empty. RF-1 drag: 1 record immediately and after 1 s. Rename: still 1 record, later `updated`. Re-open from Saved and edit again was not run | 16, 17 |
| 13 | 1a measure tool | pass | Menu shows "Measure from here M"; M toggles crosshair and a 1.21 nm readout; M again returns the grab cursor | 08, 13 |
| 14 | Acceptance 12.2 and 12.4 drags | pass | Detection range sweep: RDR-1 drag sets 1.32 km E, -0.75 km N in the inspector and moves the timeline ticks; ring drag sets range 4.00 to 5.04 km | 25, 26 |
| 15 | Light theme | not run | The tools give no colour-scheme emulation, and changing the OS setting is out of scope | none |

Screenshots: 26 JPEG files in `reviews/phase-7-fixes/`, largest 104 kB.

## Fix lane

Files cited, grouped by folder.

- `src/domain/templates/`: `pointDefence.ts` (F-02), `hoverTrackHold.ts` (F-01), `swarmSplit.ts` (F-11), `build.ts` and `templates.test.ts` (F-13), `detectionRangeSweep.ts` (F-17)
- `src/features/report/`: `limits.ts` (F-01)
- `src/features/shared/`: `units.ts` and its test (F-03, F-15)
- `src/features/build/map/`: `controller.ts` (F-04, F-10), `labels.ts` (F-09), `labels.test.ts` (F-14), `hit.ts` and `MapView.test.tsx` (F-16)
- `src/features/build/timeline/`: `layout.ts`, `Timeline.tsx` (F-08, F-16)
- `src/features/build/`: `BuildWorkspace.tsx` (F-05, F-08, F-12)
- `src/features/results/`: `ResultsWorkspace.tsx` (F-05 dismiss on mount), sweep chart (F-20)
- `src/commands/`: `registry.ts` (F-07)
- `src/features/commands/`: `ShortcutSheet.tsx` (F-07)
- `src/state/`: `persist.ts` (F-06)
- `src/features/library/`: `LibraryScreen.tsx` (F-06)
