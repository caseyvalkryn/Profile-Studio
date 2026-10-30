# Phase 5 and 6 review and browser check (lane 6.R)

Reviewed: `f36b9a6..777e2bf` (phases 5 and 6) at worktree `lane/6.R`, 2026-10-30.
Scope: `src/features/{results,report,library,shared}/`, `src/domain/templates/`,
`src/domain/behaviors.ts`, `src/App.tsx`, `src/routes.test.tsx`, and the 5.3 parts of `src/state/`
and `src/engine/{run,score,sweep}.ts`.
Browser: Chrome through claude-in-chrome. Steps a to g on `npm run dev -- --port 5174 --strictPort`,
steps h to j on `npm run build && npm run preview -- --port 5174 --strictPort`.
Gate at start: `npm run gate` exit 0, 63 test files, 445 tests passed, build passed.

## Verdict

Phases 5 and 6 are not done. The scorecard numbers equal the engine, the F2T2EA placement is
correct, the hypothesis lock works at the first run, and the Library flows, legacy import and
the AAR sections all work. Two defects block acceptance. Results shows runs and scorecards from
other vignettes (F-01), and no control in the app starts a sweep, so acceptance 7 is reachable
only from the console (F-02). Three majors follow. A user cannot select a hypothesis to state a
prediction (F-03), undo rewinds a locked prediction (F-04), and the Swarm template's main
entered measure 2.3 always scores Inconclusive (F-05). Fix F-01 to F-05 in 6.F.

## Browser check

Theme in use: dark. Leftover state at start: IndexedDB `profile-studio` and localStorage existed
for origin `localhost:5174`; both were deleted before step a. Native HTML5 drag does not fire
through the tools and was not needed. Nothing was downloaded: every export was intercepted at
`URL.createObjectURL` and `HTMLAnchorElement.click`.

| Step | Result | Note | Screenshot |
| --- | --- | --- | --- |
| a. `/` with nothing stored | pass | 8 template cards, Blank last, each with question and F2T2EA steps | `phase-6/01-library-empty.jpg` |
| b. Open Point defence | pass, issues | Map, rings, sector, T1, areas. No circle area in this template. Labels DA, RDR-1, EO-1, RF-1, EW-1 overlap at the origin (phase 4 F-12). Timeline has one T1 row and no F2T2EA lanes (phase 4 F-19). Inspector hypothesis line in metres under nm (F-10) | `phase-6/02-build-point-defence.jpg`, `phase-6/03-labels-origin.png` |
| c. Units toggle | pass | Grid, inspector and asset library switch nm/ft/kt to km/m/m/s. Timeline shows time only | `phase-6/04-units-si.jpg` |
| d. Run, Results (12.1) | pass | Build shows "Run R-1 done, View results" (phase 4 F-08 fixed). 1.1.2 2.15 nm [2.15, 2.15], threshold ≥ 1.62 nm, Meets, Simulated. 2.1.3 and 3.1.2 also match the engine (see Confirmed correct). Interval display collapses (F-07) | `phase-6/05-results-run1.jpg` |
| e. Hypothesis lock (12.5) | partial | Palette "Set prediction" is disabled with "Select a hypothesis first", and no UI selects a hypothesis (F-03). Set through the command registry instead. Run locks it, the row shows "Prediction [97, 100], result inside", Meets, and the command then refuses. Two undos rewound the prediction to [90, 100] with the lock time kept (F-04). Before the run, Results showed Point defence's run under Hover (F-01) | `phase-6/06-set-prediction-disabled.jpg`, `phase-6/07-results-wrong-vignette.jpg`, `phase-6/08-lock-undo.png` |
| f. Compare (12.6), sweep (12.7) | pass / fail | Compare R-2 against R-1 side by side with "Difference against R-2: +0 %, intervals overlap". No UI starts a sweep (F-02). Started from the console through `useRuns.getState().startSweep`: line chart of 1.1.2 against threat altitude, "Meets the threshold ≥ 1.62 nm at 5 of 5 levels". Axis ticks lack units (F-11) | `phase-6/09-compare.jpg`, `phase-6/10-sweep-chart.jpg` |
| g. Report, export (12.8) | pass, issues | Seven sections in spec order, prediction "1.35 to 2.16 nm", lock time in UTC, map snapshot, factor table, scorecard, injected 1.1.2 chart, evaluation table, scope of inference, next test. PNG: `image/png`, 67,313 B, 1280x552, valid PNG header. SVG: `image/svg+xml`, 9,484 B. CSV: `text/csv`, 8,960 B. JSON: `profile-studio/5`, 51,808 B. Print media could not be emulated through the tools; print rules reviewed from `report.css` and `results.css` | `phase-6/11-report-setup.jpg`, `phase-6/12-report-chart-export.jpg` |
| h. Load time (preview) | pass | `/`: DOMContentLoaded 61 ms, first contentful paint 88 ms, LCP 88 ms, load 112 ms. Open Fiber FPV template: route change 24 ms, map canvas 109 ms, MapLibre worker loaded at 128 ms. Localhost, no throttling. Budget 2 s | none |
| i. Legacy v4 import (12.9) | pass | No JSON file exists in `legacy/`. Used `src/features/library/__fixtures__/legacy-v4-cuas-001.json` (`schema profile-studio/4`), injected into the file input with a `DataTransfer`. "Imported 1 vignette". T1 path with 4 points and the 60 s hold, RDR-1, RF-1, EO-1, EW-1, area DA, the purpose as Q-01, the MOP text in the Q-01 note, and the events and captions in report notes all remain intact (F-16) | `phase-6/13-legacy-import.jpg` |
| j. Library | pass | Search "loiter" filters templates (1) and saved (2). Export JSON: `Hover_track_hold.json`, `profile-studio/5`, 106,547 B, 2 runs. Delete shows "Deleted Hover track hold. Undo"; Undo restores it. Reload lists all 5 saved vignettes, newest first | `phase-6/14-library-search.jpg`, `phase-6/15-library-delete-undo.jpg`, `phase-6/16-library-reload.jpg` |

The preview server was stopped and the tab closed. Side effect: IndexedDB for origin
`localhost:5174` now holds five vignettes (Single Group 1 ingress with loiter, Fiber FPV, no RF,
Detection range sweep, Hover track hold, Point defence). Start-up will open the newest stored one.
A copy of the fixture was placed in `dist/` for step i and removed afterwards.

## Findings

### F-01 blocker: Results shows runs from other vignettes
- File: `src/features/results/ResultsWorkspace.tsx:57`, `:72`; `src/state/runs.ts` (`results` and `order` are global).
- Defect: the entries list is `order.map((k) => results[k])` with no filter on the open document.
  The runs store keeps every run of the session across vignettes. Results then scores the
  current vignette's hypotheses against another vignette's run, and labels foreign runs "Run N"
  because their summary is not in `doc.runs` (`labelOf`, lines 23 to 25).
- Evidence: after a Point defence run, opening Hover track hold showed Point defence's run as
  "Run 1" with its scorecard, and Hover's H-01 as "Not scored in this run" (screenshot 07).
  Under Detection range sweep, the compare picker still listed the two Hover runs as "Run 3" and
  "Run 2". The Report scopes correctly by `docId` (`ReportWorkspace.tsx`, `useReportRun`).
- Fix: filter entries to runs whose `docId` matches the open document, as `useReportRun` does.
  Add a test that opens a second vignette and expects an empty Results.

### F-02 blocker: no control starts a sweep (acceptance 12.7)
- File: `src/state/runs.ts:239` (`startSweep`, no caller outside tests);
  `src/domain/templates/types.ts:16` and `detectionRangeSweep.ts:22` (sweep hint);
  `src/commands/commands.ts` (no sweep command).
- Defect: the engine, the worker and the store support a sweep, and Results draws the line
  chart. Nothing in the UI calls `startSweep`. The template's `sweep` hint is not read and is not
  stored on the `Vignette`, so running the Detection range sweep template from the app produces a
  single run at one altitude.
- Evidence: `grep -rn startSweep src` lists only `runs.ts` and `simClient.ts`. The step f chart
  appeared only after `useRuns.getState().startSweep([{kind:'threat-altitude',levels:[30,60,120,240,400]}],20,1)`
  from the console; it finished in 282 ms and its cells equal the Node `sweep()` output.
- Fix: add a "Run sweep" command (palette and Run menu) that takes the factor and levels from the
  vignette, store the factor on the vignette when a template has one, and include the sweep result
  in the Report results section.

### F-03 major: no way to select a hypothesis or state a prediction (acceptance 12.5)
- File: `src/features/build/inspector/Inspector.tsx:118` (plain `<li>`);
  `src/commands/commands.ts:943` (`hypothesis.setPrediction` needs a hypothesis key in the
  selection).
- Defect: the Questions and hypotheses list is not interactive, and no other control puts a
  hypothesis in the selection. "Set prediction" therefore stays disabled. A user can only run with
  the prediction a template ships with.
- Evidence: palette entry disabled with "Select a hypothesis first" (screenshot 06). Clicking H-01
  in the inspector left the selection unchanged. The step e lock check needed
  `setSelection([h.key])` from the console.
- Fix: make each hypothesis row a button that selects it and opens fields for measure, operator,
  threshold and prediction low and high, with units.

### F-04 major: undo rewinds a locked prediction
- File: `src/state/runs.ts:157` (lock through `docStore.apply`, outside history);
  `src/commands/commands.ts:943` (Set prediction is an undoable edit); `src/state/document.ts:98`.
- Defect: the lock sets `lockedAt` outside the undo history, but the earlier "Set prediction"
  edit stays on the stack. Undo after the first run reverts the prediction and keeps `lockedAt`.
  The prediction recorded before the first run is lost, which defeats the purpose of the lock.
- Evidence: prediction set to [97, 100], run R-1 locked it, then two `undo()` calls gave
  prediction [90, 100] with `lockedAt` still set. Results then showed "Prediction [90, 100]"
  (screenshot 08).
- Fix: clear the undo history for prediction edits at lock time, or make undo refuse any patch
  that touches a locked hypothesis's prediction. Results and Report should show the run's
  `predictions` snapshot, not the live value (see F-12).

### F-05 major: the Swarm template's entered measure 2.3 never scores
- File: `src/engine/score.ts:238`; `src/domain/templates/swarmSplit.ts:2`, `:28`.
- Defect: 2.3 Track Quantity is a main measure of the template, entered on the radar as 6. The
  template comment says the scorecard shows it from the entered value. `score()` has no formula for
  it and returns null with the note "entered: no simulated formula", so the evaluation is always
  Inconclusive. Spec section 4 lists 2.3 in the Entered class.
- Evidence: Node `score()` on the template, n 100, seed 1: 2.3 value null, evaluation
  inconclusive. 1.2.1 and 3.1.1 score 100 % [99.36, 100].
- Fix: score Entered measures from the asset's entered value (no interval, source Entered) and
  evaluate against the threshold.

### F-06 minor: internal names shown in the scorecard
- File: `src/engine/score.ts:101`, `:138`, `:238`; `src/features/results/Scorecard.tsx:144`.
- Defect: a null score shows its engine note as user text. The notes name `rangeboard`,
  `stage_reached`, `identified_ok` and "entered: no simulated formula". Design principle 5.6:
  "Do not show internal names."
- Evidence: source lines above; Scorecard renders `s.note` when the value is null.
- Fix: map each null reason to plain text for the scorecard ("Not simulated. Enter a value on
  the sensor.") and keep the engine note for tests.

### F-07 minor: display precision hides the result
- File: `src/features/shared/units.ts` (`scaleFor`: nm 2 decimals, % 0 decimals).
- Defect: intervals narrower than the display step print as a point, and a value below 100 %
  prints as 100 %.
- Evidence: 1.1.2 3982.73 m [3979.55, 3985.37] shows "2.15 nm [2.15, 2.15]". Hover 1.2.2
  99.87 % [99.81, 99.93] shows "100 % [100, 100]". Compare shows "+0 %".
- Fix: choose decimals from the interval width (at least two significant digits of the width),
  or show one more decimal when low and high round to the same value.

### F-08 minor: "Run done" note appears on a different vignette
- File: `src/features/build/BuildWorkspace.tsx:141` (`RunDone` reads the global active run).
- Defect: after a run ends, opening another vignette within the display time shows "Run done,
  View results" for the run of the previous vignette.
- Evidence: seen in step e when Hover track hold was opened after the Point defence run.
- Fix: show the note only when the active run's `docId` equals the open document.

### F-09 minor: Report uses ASCII operators and its own label maps
- File: `src/features/report/ReportWorkspace.tsx:35` to `:56`, `:259`, `:343`.
- Defect: the Report scorecard and hypothesis render `s.op` and `h.op` raw (">="), while Results
  and the chart titles use "≥". `STEP_LABEL`, `EVALUATION_LABEL` and `SOURCE_LABEL` duplicate the
  maps in `src/features/shared/units.ts`, which the 5.3 dedupe meant to remove.
- Evidence: Report scorecard row ">= 1.62 nm" next to chart title "≥ 1.62 nm" (screenshot 12).
- Fix: use `formatThreshold` and the shared word maps.

### F-10 minor: inspector hypothesis line ignores the units toggle
- File: `src/features/build/inspector/Inspector.tsx:116`.
- Defect: the line prints `${h.op} ${h.value} ${unit}` from stored metres.
- Evidence: "1.1.2 Detection Range (ground) >= 3000 m" under nm/ft/kt (step b).
- Fix: format through `formatThreshold` with the current units.

### F-11 minor: sweep chart x axis
- File: `src/features/results/SweepChart.tsx:150`.
- Defect: tick labels carry no unit (the unit is only in the caption) and show converted levels
  with one decimal: 98.4, 196.9, 393.7, 787.4, 1312.3. The last tick label extends 3 px past the
  SVG edge.
- Evidence: screenshot 10; DOM measurement of the last tick text.
- Fix: put the unit in the axis label, round converted levels to whole ft, and anchor the last
  tick label at its end.

### F-12 minor: Report evaluation uses live hypothesis values
- File: `src/features/report/ReportWorkspace.tsx:434`; `src/features/results/Hypotheses.tsx:77`.
- Defect: the Report evaluation table builds its row from the live `h.op` and `h.value`, and
  Results prints the live `h.prediction`. The run's `predictions` snapshot is used only for the
  evaluation itself. With F-04, the shown prediction and the evaluated prediction can differ.
- Evidence: step e, Results "Prediction [90, 100]" after the undo, for a run locked at [97, 100].
- Fix: render from the snapshot for the selected run.

### F-13 note: lock time format differs between Results and Report
- File: `src/features/results/Hypotheses.tsx:40` (`toLocaleString`); Report prints UTC.
- Evidence: Results "Locked" in local time; Report "2026-10-30 17:40 UTC".
- Fix: one formatter, UTC, in `shared/units.ts`.

### F-14 note: the Detection range sweep template cannot show an altitude effect
- File: `src/domain/templates/detectionRangeSweep.ts`.
- Evidence: Node sweep, n 20, seed 1, 1.1.2 by threat altitude: 30 m 3975.4, 60 m 3975.4,
  120 m 3975.4, 240 m 3973.6, 400 m 3965.2 m. The radar range of 4000 m sets the result at every
  level, so the response is flat.
- Fix: start the threat outside the radar range or lower the radar range so altitude changes
  the horizon-limited detection range. State the limit in the scope of inference.

### F-15 note: phase 4 F-12 and F-19 remain
- Labels at the origin overlap in Build and in the Report map snapshot (screenshots 03, 11). The
  timeline has no F2T2EA lanes (no lane label found in the DOM). Both are carried into 7.2.

### F-16 note: legacy import details
- The legacy fixture has no site position, so the imported vignette sits at 0° 0° with an empty
  site name. The MOP list imports as text in the Q-01 note, and the four measures arrive without
  thresholds. Both follow from the source file. The import tooltip says "legacy v4" while the
  file carries `"v": 3` and `schema profile-studio/4`.

### F-17 note: bundle size
- `npm run build` warns of chunks over 500 kB: MapView 1,084 kB (296 kB gzip), ResultsWorkspace
  415.66 kB (109.60 kB gzip). Load time on localhost is well within budget (step h); no action
  for the MVP.

### F-18 note: Hover track hold does not fly a hover
- `src/domain/behaviors.ts` documents that holds are not flown (LOSSES). The template question
  was reworded to a "60 s loiter". The 1.2.2 result therefore does not test track hold on a
  stationary target. State this in the template's scope of inference.

## Confirmed correct

- Gate: 63 files, 445 tests, build passed at the start of the lane.
- Scorecard values equal the engine for n 100, seed 1. Point defence: 1.1.2 3982.73 m
  [3979.55, 3985.37], 2.1.3 3636.70 m [3494.30, 3757.00], 3.1.2 100 % [96.30, 100], all Meets.
  Hover 1.2.2 99.87 % [99.81, 99.93]. Delta wing 3.1.4 17.89 s [15.32, 20.66] ≤ 30 s Meets.
  Fiber FPV 1.1.1 100 % [96.3, 100]. Surrogate 1.2.3 10.01 m [9.91, 10.11] ≤ 15 m Meets.
- Wilson 95 % intervals for proportions and seeded bootstrap intervals for samples; Meets,
  Does not meet and Inconclusive follow spec section 6.
- Every measure carries its DroneScore ID and name and sits under one F2T2EA step per
  `jiatf-401.md` section c (2.1.3 under Track, 3.1.2 under Assess).
- The lock happens at the first run, the run stores a `predictions` snapshot, and
  "Set prediction" then refuses with "Prediction locked at first run".
- Compare shows two runs side by side with a difference line.
- A worker sweep equals the Node `sweep()` output cell for cell, and Results draws its line chart.
- Report: seven sections in spec order (`draft.ts`), chart injection with hypothesis title and
  result subtitle, map snapshot, factor table. PNG, SVG, CSV and JSON exports each produce a
  blob. The SVG export inlines computed fill, stroke and font, so it renders as on screen.
- Print rules exist (`report.css` print root and `noprint`, light tokens in `results.css`).
- Library: 8 template cards, search over templates and saved, open, export, delete with undo,
  import of v4 JSON, saved list newest first after reload. Build, Results and Report gate on an
  open document with an empty state (`src/App.tsx`, read from source; not opened in the browser).
- All eight behaviours in spec section 9 exist in `behaviors.ts`. Each template runs and scores
  its main measures, except 2.3 (F-05).
- Phase 4 F-04 (units on the grid and inspector) and F-08 (run feedback in Build) are fixed.

## What 7.1 and 7.2 should cover

7.1 (end-to-end, Playwright):
- Two vignettes in one session: Results for the second shows no runs of the first (F-01).
- Start a sweep from the UI on the Detection range sweep template and expect the line chart (F-02).
- Select a hypothesis, set a prediction, run, then undo: the prediction stays as locked (F-03, F-04).
- Export PNG and SVG through the download event, not a click on the menu alone (12.8).
- Import the legacy v4 fixture through the file chooser (12.9).

7.2 (first-use audit):
- Plain-language text in place of engine notes on the scorecard (F-06).
- Precision of values and intervals in nm and % (F-07), units on the sweep axis (F-11).
- Operator glyphs and units in the Report and inspector (F-09, F-10).
- Label overlap at the origin and the missing F2T2EA lanes (F-15).
- Whether the Detection range sweep and Hover templates answer their questions (F-14, F-18).
