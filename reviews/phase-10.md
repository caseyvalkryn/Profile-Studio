# Phase 10 review and browser check (lane 10.R)

Reviewed: lanes 10.1 to 10.6, 10.W and 10.W2 as merged on `rebuild/mvp`, head `f10b25c`,
2026-11-01. Worktree `.worktrees/10.R`, branch `lane/10.R`. Measured against `docs/spec.md`
sections 7, 10, 11 and 12 (items 2 to 4, 9, 10, 12 to 16, 18 to 25), `docs/plan.md` phase 10
and section 8, `docs/design-principles.md`, and the v3 mockup `legacy/mockup-v3.html` as the
parity oracle.

Gate: `E2E_PORT=5197 npm run gate` exit 0.

- Vitest: 52 files, 463 tests passed.
- Playwright: 7 passed (12.2, 12.3, 12.4, 12.9, 12.10, 12.12, 12.19). Item 4 first-see tick
  5.4 ms, value readout 4.2 ms.
- `npx --no-install prettier --check src e2e` flags `src/features/build/board/Board.test.tsx`
  (not in the gate; plan section 8 open item, still open).

Dev server: `npm run dev -- --port 5196 --strictPort`. Mockup: the orchestrator's server at
`http://localhost:5174/legacy/mockup-v3.html`. Browser: Playwright Chromium 156, headless,
SwiftShader, 1440x900, deviceScaleFactor 1, a fresh context per seed. Seeds imported from the
mockup records (`legacy/mockup-v3.html:238-280`) and the eight templates. Scripts and logs are
in the session scratchpad (`port.mjs`, `mockup.mjs`, `firstuse.mjs`, `b*.mjs`, `e.mjs`,
`w.mjs`, `perf.log`, `deck.pdf`).

Units differ by design: the port shows nm, ft and kt (spec line 74), the mockup shows km, m and
m/s. After conversion the readouts match: CUAS-001 "T1 · 2.3 nm · 23 kt · 422 s" against
4.3 km and 12 m/s. The scrub midpoints match (211 s, 158 s, 133 s, 111 s), and so do the
Brief heads ("2 of 3 · CUAS-001").

## Verdict

No blocker. Three majors. A drag on a sensor in 3D orbits and shows no edit prompt, so item 13
fails on its last clause (F-01). Event labels lose the label declutter to track datablocks, so
a Brief card whose focus is an event does not name it (F-02). The perf spec stops at a stale
inspector lookup, so item 21 cannot be shown in full (F-03). The rest of the acceptance list
passes. Both themes, print, the dialogs and the palette read correctly under the warm tokens.

## Summary counts

| Grade | Count |
| --- | --- |
| blocker | 0 |
| major | 3 |
| minor | 9 |
| note | 21 |

## Acceptance (spec section 12)

| Item | Result | Evidence |
| --- | --- | --- |
| 2 | pass | e2e 12.2 |
| 3 | pass | e2e 12.3 |
| 4 | pass | e2e 12.4: first-see 5.4 ms, readout 4.2 ms, budget 100 ms |
| 9 | pass | e2e 12.9 |
| 10 | pass | e2e 12.10. The palette and sheet agree. K and R are listed but change nothing visible (F-05). |
| 12 | pass | e2e 12.12 |
| 13 | fail | View switch and key 3 open 3D (aria-pressed true). Drag orbits: hint "vertical x10 yaw -35° pitch 55°" became "yaw 10° pitch 41°". Threats animate at time t. A drag that starts on RDR-1 orbits and edits nothing (CUAS-001 v3 stays v3), but shows no prompt. A click with no move shows "Edit in Plan or Elevation." F-01. `R-dialog-3d-edit-prompt.jpg`, `R-CUAS-001-3d-click-prompt.jpg` |
| 14 | pass | Both segments. From asset axis "Range from asset"; Along path axis "Along T1, nm". `R-CUAS-001-elevation-along.jpg` |
| 15 | pass | Reach, Events, Labels and Telemetry toggles remove or add their `g.ly-*` layer. Envelopes removes `ly-envelopes` on MULTI-001 at t=150 (CUAS-001 has none). Readout: nothing selected "1 path · 6 events · 422 s"; T1 "T1 · 2.3 nm · 23 kt · 422 s". A sensor selection keeps the summary, as the mockup does (`legacy/mockup-v3.html:397`). |
| 16 | pass | Beads carry `data-t` equal to the event times. e4 time 178 to 240 moved the bead from 42.18 % to 56.87 %. One undo restored 178. |
| 18 | pass | Unit test `src/domain/migrate.test.ts:218-225` (legacy v4 round trip, every fixture, planes, volumes, events, snapshots, data and cards compared). Gate green. Not driven in the browser. |
| 19 | pass | 20-card deck: End "20 of 20", Home "1 of 20", Right "2 of 20". Print media shows 20 `brief-page` items. `page.pdf` in 162 ms, 20 pages, 2.8 MB. e2e 12.19. Print carries the toast (F-09). |
| 20 | pass | First-use walk in 3.1 s scripted, 5 user actions. Section C. |
| 21 | partial | Entry 224.7 kB gzip (budget 300). First load 83.6 to 404.2 ms (budget 2 s). Ring drag rep 1 at 60.0 fps. The perf spec fails at `e2e/perf/budgets.spec.ts:214`, so the other drag, preview and 3D budgets were not measured. F-03. |
| 22 | pass | C shows "Card saved. Write its caption in Brief." One Cmd+Z leaves the deck at 3. `R-dialog-toast.jpg` |
| 23 | pass | Library groups "REFERENCE 1" and "TOUGHSTUMP 3" with first-card thumbnails and the line "SURR-001 v1 · Surrogate · 2 cards · 1 path". The export carries `collection`, `class`, `version` and `"timed":[[3100,3000,120,0,0],...]`. `R-library.jpg` |
| 24 | pass | Unit test `src/state/persist.test.ts:86-101` (v6 to v7, export then import equal). Gate green. |
| 25 | pass | Sections Purpose, Aircraft, Paths, Systems (Sensors, Effectors), Volumes, Reference planes, Events, Telemetry, Data products, Measures of performance, plus Site. Every CUAS-001 object listed. Waypoint edit by keyboard: "T1 waypoint 1 x" 1.67, typed 2.5 and Tab gave 2.50 (v3 to v4), one Cmd+Z gave 1.67. Also `src/features/build/inspector/Inspector.test.tsx:101`. Picker: 67 rows. `R-CUAS-001-inspector-events.jpg`, `R-CUAS-001-picker.jpg` |

## First-use walk (section C)

Script `firstuse.mjs`, clicks and keys only, fresh context, empty storage. Shots
`R-firstuse-1.jpg` to `R-firstuse-7.jpg`.

1. The Library shows the 8 templates (0.0 s).
2. Open "Point defence, single quadrotor"; Build opens with the board fitted.
3. Drag RDR-1 120 px east. Position became 1.19, -0.43; version v1 to v2.
4. Save as card. The toast reads "Card saved. Write its caption in Brief."
5. Brief. Head "1 of 1 · PROF-1", focus RDR-1, the rest dim. Type a caption, Tab.

Total 3.1 s scripted, 5 user actions. The goal (spec section 1, under 10 minutes) is met.

Friction points:

- The rail hover tip stays on screen after the drag ends (`R-firstuse-4.jpg`).
- The bar readout keeps the scene summary while RDR-1 is selected. A new user gets no
  confirmation of the new position there (mockup parity, note N-12).
- "full run" wraps onto two lines under the scrub (F-08).
- The Undo button shows only "Undo"; the step name is in its title (N-14).
- The save toast is still on screen after the switch to Brief.
- The Brief stage frames the scene differently from the Build board (N-15).

## Budgets (section D)

Machine: headless Chromium 156 on SwiftShader (no GPU). `perf.log` in the scratchpad.

| Budget (spec section 11) | Measured | Result |
| --- | --- | --- |
| Entry bundle 300 kB gzip | 224.7 kB gzip (701.4 kB raw); CSS 26.0 kB gzip; BriefWorkspace 3.3 kB; cards 1.8 kB | pass |
| First load, interactive in 2 s | `/` x1 median 124.3 ms; `/build` x1 83.6 ms; `/` x4 404.2 ms; `/build` x4 343.1 ms (Library 645.3 ms) | pass |
| Map drag 60 fps | idle 59.5 fps (worst gap 33.3 ms); ring drag rep 1 60.0 fps, gap 16.8 ms, 120 moves | rep 1 only |
| Preview after an edit 100 ms | e2e 12.4: 5.4 ms first-see, 4.2 ms readout. Perf spec not reached. | pass by e2e |
| 3D view 60 fps | not measured (perf spec stopped) | not checkable |
| Deck PDF, 20 cards in 10 s | `page.pdf` 162 ms, 20 pages. Entering Brief with 20 cards: 90 ms to the last print page. Card step 14 to 34 ms to two frames. Caption typing 104 ms for 10 keys. | pass |

The orchestrator's 718 kB / 232.3 kB is the same build in KiB. The perf spec could not measure
ring drag reps 2 to 5, the waypoint drag, the preview latency (it watches `timeline-row`,
removed in 10.3) and the 3D drag. F-03.

## Findings

Grade order. Counts: 0 blocker, 3 major, 9 minor.

| ID | Grade | Where | What I saw | Spec or mockup | Proposed fix (file) |
| --- | --- | --- | --- | --- | --- |
| F-01 | major | `src/features/build/board/gestures.ts:696`, `:711-714` | In 3D, `if (g.moved) return` runs before the rotate branch. A drag that starts on a sensor orbits and shows nothing. The prompt fires only on a click with no move, in the words "Edit in Plan or Elevation." | Spec lines 233-234: a drag in 3D "shows 'Edit in Plan (1) or Elevation (2)'". Item 13 (line 406-407): "A drag on a sensor in 3D shows the edit prompt and changes nothing." | When a 3D rotate gesture starts on a hit with a handle or role, show the prompt on release whether or not it moved, in the spec words with "(1)" and "(2)". `gestures.ts`. Add the drag case to the 3D e2e or `Board.test.tsx`. |
| F-02 | major | `src/board/layers/events.ts:135-143`; `src/board/layers/tracks.ts:213`, `:280`; `src/board/layers/paths.ts:108` | Event labels enter the declutter at p 3; track datablocks at p 1 and 1.5 and path labels at p 2 take the space first. CUAS-001 Brief card 2 (3D, focus e4) shows "004 23KT" and no "Loiter 60 s". In Plan and 3D event names drop near the tracks. | Mockup `fmtEv` (line 325) prints every event as "type label" and line 337 draws them with no cull. Spec lines 245-246: the stage draws the focus strong. | Give a focused object's label first place in the declutter, ahead of datablocks (`src/board/render.ts:154`, `ctx.label`). Consider p below 1.5 for event labels in Brief. `render.ts`, `events.ts`. |
| F-03 | major | `e2e/perf/budgets.spec.ts:214`, `:254`, `:288` | The spec reads `inspector.getByLabel('Range')`, absent since 10.2 shows a system's fields only when its row is selected. Test 1 timed out at 300 s after ring drag rep 1. The preview latency still watches `[data-testid="timeline-row"]`, removed in 10.3. | Item 21: budgets "measured by the perf spec". Plan section 8: "10.R repoints it" (a review lane does not edit code). | Select the system row before the Range lookup; point the preview probe at the bar readout or the board label. `budgets.spec.ts`. Rerun with `PERF_HEADED=1` for the GPU numbers. |
| F-04 | minor | `src/commands/commands.ts:823`, `:831`, `:876`; `src/features/build/menu/commands.ts:57` | The palette shows internal lane names as disabled reasons: "Event steps arrive with the time engine, lane 9.3.2" ([ and ]) and "The chart and readout strips arrive in lane 9.3.2" (R). `CARDS_LATER = 'Cards arrive in lane 9.4.1'` is exported and unused. | `docs/design-principles.md:71`: "Do not show internal names." The strips are on the deferred list (`docs/plan.md:265-266`). | Reword each reason in user terms ("Not in this version.") or drop the commands with their sheet rows; delete `CARDS_LATER`. `commands.ts`, `menu/commands.ts`, `menu/index.ts:14`. |
| F-05 | minor | `src/commands/commands.ts:502-519`; `src/state/ui.ts:45-49`, `:59-63` | Five palette commands flip `ui.panels` flags no component reads: "Layer chips on or off", "Readout panel on or off" (K in Build), "Events panel on or off", "Debrief panel on or off", "Snapshots panel on or off". The Build sheet lists "K Readout panel on or off" and "R Timeline, chart, readout". Each runs and nothing changes. | `Shell.tsx:65-80` and `BuildWorkspace.tsx:26-27` read only topbar, list, timeline and inspector. Same pattern as review 9.1 F-04. | Remove the five toggles and their flags, and the K and R rows from `src/features/commands/sheet.ts`. |
| F-06 | minor | `src/board/layers/reach.ts:166-169` | Elevation: "MAX RG" sits on the axis title "Height ft AGL". At the bottom left "0.0" sits on "RDR-1" and "Defended asset". | Plan section 8 (inherited from 9.2), confirmed. | Enter the axis title and tick labels in the declutter before the reach labels, or offset MAX RG below the title. `reach.ts` and the elevation grid in `src/board/layers/grid.ts`. |
| F-07 | minor | `src/features/build/rail/Rail.tsx:37` | Rail threat names truncate: "Quadrot...", "Swarm e...", "Delta wi...". | Plan section 8 (from 9.2, "10.3 or 10.6"); 10.6 did not close it. | Let the name column take the free width or wrap to two lines. `Rail.tsx`. |
| F-08 | minor | `src/features/build/bar/Scrub.tsx:114` | "full run" wraps to two lines at 1440 px. | Mockup bar (lines 384-390) keeps the time on one line. | `whitespace-nowrap` and a fixed width on the time label. `Scrub.tsx`. |
| F-09 | minor | `src/features/brief/brief.css:70-79`; `src/features/shell/Toast.tsx:10` | The print hide list omits `.dl-toast`. A toast on screen prints on the deck pages (`deck.pdf` page 2, `R-print.jpg`). | Spec line 252 and 364: one page per card with its render, caption and notes. | Add `.dl-toast` to the print `display: none` list. `brief.css`. |
| F-10 | minor | `src/features/brief/Notes.tsx:213-235` | Card Up, Down and Delete use `ps-btn quiet` and render as borderless text. | Mockup line 502 uses `button.mini`, bordered with `--rule-strong` (line 35). | Use the bordered small button style. `Notes.tsx`. |
| F-11 | minor | `src/board/layers/reach.ts:28-37` | `ringClass` gives directed energy the effector class `rg-eff`. | Mockup lines 329, 345, 359 give `ew` and `de` the `ring ew` class; line 107 `.ring.ew{stroke:var(--ew)}`. | Map `de` to `rg-ew`. `reach.ts`. |
| F-12 | minor | `src/features/build/inspector/Row.tsx:14`, `:140`; `Measures.tsx`; `Rail.tsx`; `BuildBar.tsx` | Row hover is `bg-surface-2`, the sunken tone #e4e0d8 (`src/styles/tokens.css:15`). | Mockup hovers to `var(--rule)` (lines 31, 74, 134, 146), the port's `surface-3` (`tokens.css:16`). | `hover:bg-surface-3` in these files. |

## Notes

| ID | Where | Note |
| --- | --- | --- |
| N-01 | Brief stage, print pages | The compass rose shows on the Brief stage and the printed pages. The mockup has no compass anywhere (no match in `legacy/mockup-v3.html`). Spec line 235 gives the board basemap a compass and line 245 renders the stage through the board, so the port meets the spec. 10.4 item re-graded to note. |
| N-02 | `src/board/cameras.ts:335` | "vertical x1232" on a flat scene. Same formula as the mockup (line 353). Parity. |
| N-03 | Reach rings | Solid and filled when on (the system holds a track at t), dashed otherwise. The mockup is always dashed (line 107). Legacy board behaviour, kept. |
| N-04 | `--text-subtle` | 3.84:1 on the panel. User decision pending (plan section 7, 10.6 row). |
| N-05 | "Envelopes" | The `stat-te-terminology` banned list forbids bare "envelope" (use "operating envelope"). The mockup uses "Envelopes" (lines 232, 417). User decision; recorded. |
| N-06 | Rail "C2 and TSPI", "MAX RG", focus placeholder "T1, e4, WEZ-1" | Acronyms not expanded at first use (skill rule 3). C2 and TSPI open since 9.2. |
| N-07 | `src/domain/templates/fiberFpv.ts:15` | The question note says "Read the first-detection sensor in the preview. 1.1.1 scores the layer; the run rows do not name the detecting sensor." The app no longer runs or scores. The note is not rendered but travels in exports. |
| N-08 | `src/features/commands/sheet.ts` | `ORDER` names removed ids (view.stripCycle, panel.readout, brief.nextPage, brief.backPage, brief.full, brief.notes, brief.blank, brief.readout, brief.focusPrev, brief.focusNext, brief.card1 to 9). Unnamed keyed commands append at the end, so the sheet is complete. 10.4 item re-graded to note. |
| N-09 | Dead code | `setDragBaseline` (`readout/store.ts`, called from `tools.ts:38`, `:635`, `:663`, `:865`) has no production reader; `ui.stripTab` (`ui.ts:129`, `:194`, `:232`). Confirmed. |
| N-10 | `src/features/build/inspector/Profile.tsx:174-176` | Data products use `key={i}`. Confirmed; the comment says place is identity. |
| N-11 | "v6 key" comments | `src/board/render.ts:72`, `src/features/build/board/store.ts:5`, `tools.ts:120`, `:132`, `:163`. Stale after v7. |
| N-12 | `src/features/build/bar/readout.ts:19` | The readout follows a path or waypoint selection only; a sensor keeps the summary. Mockup parity (line 397). |
| N-13 | `src/features/build/inspector/Row.tsx:168`, `:226` | `Swatch` has hostile and volume only (mockup line 81 has friend and neutral). `Field` has no `list` prop; `Profile.tsx:36-39` sets it in an effect. Confirmed. |
| N-14 | `src/features/shell/TopBar.tsx:30-32`, `:234` | Undo shows the step only in its title ("Undo: <label>"). Spec lines 335-336: "The undo control and a short toast name the step". |
| N-15 | `src/features/brief/cards.ts` `cardFromBuild`; build `cards.ts` `boardCentre` | "Add card from current scene" stores centre 0,0 and zoom 1; a 3D card stores centre 0,0. The Brief frame can differ from the Build frame. |
| N-16 | Version counter | Undo does not lower it (v4 stays v4 after the waypoint undo). Matches the 10.5 rule "once per committed edit outside history". |
| N-17 | Library (`R-library.jpg`) | The saved-card line wraps at card width. Thumbnails sit inset; the mockup's run edge to edge (line 180). SURR-001's thumbnail draws small in its frame. The Library loads every record for thumbnails and `Profile.tsx:20` again for the collection list. |
| N-18 | `BuildBar.tsx` `toggleAddWaypoints` | Arms a new path; the board has no append. Matches the mockup (line 445). Template seeds have no paths, so it was not exercised on them. |
| N-19 | Prettier | `src/features/build/board/Board.test.tsx` fails `prettier --check`; not in the gate. Still open from 10.1. |
| N-20 | `docs/plan.md` section 8 | Lists items closed by 10.5 and 10.6 (top bar version, Kbd and Tooltip sizes, Showcase `run.run`, the 900 px top bar). Prune at the next handoff. |
| N-21 | Capture | The mockup stage renders pushed down and oversized in headless 1440x900, so its board is partly off screen in `R-mockup-*`. A capture limit, not a mockup fact. |

Deferred from phase 10 (plan lines 263-268), seen and not graded: the chart and readout strips
(R), event steps ([ and ]), the timeline with F2T2EA lanes, clips and beats, capture and the
debrief overlay.

## Section E: themes, print, dialogs

- Light and dark: Library, Build, Brief and the palette read under the warm tokens in both
  (`R-dark-library.jpg`, `R-dark-build.jpg`, `R-dark-brief.jpg`, `R-dark-palette.jpg`). No
  pageerror in any run.
- Print: light values on paper, one page per card, compass and toast as noted (N-01, F-09).
- Dialogs: export (`R-dialog-export.jpg`), palette (`R-dialog-palette.jpg`; Brief rows show
  reasons such as "The card is first"), palette search "event" (`R-dialog-palette-event.jpg`,
  F-04), shortcut sheets for Build and Brief (`R-dialog-shortcuts.jpg`,
  `R-dialog-shortcuts-brief.jpg`), toast (`R-dialog-toast.jpg`).

## Section F: lane open items

| Item | Outcome |
| --- | --- |
| 10.4: event labels missing on the Brief stage | Confirmed, graded major (F-02). |
| 10.4: compass on the Brief stage and print | Confirmed, re-graded to note (N-01). |
| 10.4: shortcut sheet stale rows | Confirmed, re-graded to note (N-08). |
| 10.6: rail names truncate | Confirmed, minor (F-07). |
| 10.6: `--text-subtle` 3.84:1 | Confirmed, note (N-04). |
| 9.2: MAX RG overlap in Elevation | Confirmed, minor (F-06). |
| 9.2: perf preview latency reads the old tip | Confirmed and widened, major (F-03). |
| 9.2: readout panel kept until 10.3 | 10.3 replaced it with the bar line; the store and K toggle remain (F-05, N-09). |
| 10.1: Board.test.tsx Prettier | Confirmed, note (N-19). |
| 10.2 to 10.5 code items (Swatch, Field list, `key={i}`, v6 comments, `boardCentre`, `cardFromBuild`, Add waypoints) | Confirmed, notes N-10, N-11, N-13, N-15, N-18. |
| DE ring class, hover tone, Brief mini buttons | Confirmed, minor (F-10 to F-12). |

## Section G: words

`stat-te-terminology` invoked once. No banned term in rendered UI strings except "Envelopes"
(N-05). The DroneScore names in `src/domain/measures.ts` are the standard and stay (for example
"Intercept Envelope"). The `stored` column ("run: ...", "verdict: ...") is not rendered.
Principle 5.6 fails on the lane names in disabled reasons (F-04) and the stale template note
(N-07). Acronyms are not expanded at first use (N-06). Units follow the skill (nm, ft AGL, kt).

## Screenshot index

76 files with the `R-` prefix, 7.5 MB; the directory with the earlier lanes' `10.x-*.jpg` is
8.9 MB, 89 files.

- Port, full seeds: `R-{CUAS-001,MULTI-001,OWA-001,SURR-001}-{plan,elevation,3d,brief}.jpg`.
- Port, templates: `R-{blank,fixed-wing-ingress,point-defence,range-test,swarm}-{plan,elevation,3d,brief}.jpg`.
- Port, checks: `R-CUAS-001-3d-click-prompt.jpg`, `R-CUAS-001-elevation-along.jpg`,
  `R-CUAS-001-inspector-events.jpg`, `R-CUAS-001-picker.jpg`, `R-library.jpg`, `R-print.jpg`.
- Mockup: `R-mockup-{CUAS-001,MULTI-001,OWA-001,SURR-001}-{plan,elevation,3d,brief}.jpg`.
- First use: `R-firstuse-1.jpg` to `R-firstuse-7.jpg`.
- Themes: `R-dark-library.jpg`, `R-dark-build.jpg`, `R-dark-brief.jpg`, `R-dark-palette.jpg`.
- Dialogs: `R-dialog-3d-edit-prompt.jpg`, `R-dialog-export.jpg`, `R-dialog-palette.jpg`,
  `R-dialog-palette-event.jpg`, `R-dialog-shortcuts.jpg`, `R-dialog-shortcuts-brief.jpg`,
  `R-dialog-toast.jpg`.
