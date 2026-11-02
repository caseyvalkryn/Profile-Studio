# Phase 13 review and browser check (lane 13.R)

Reviewed: lanes 13.1, 13.2, 13.3 and 13.W as merged on `rebuild/mvp`, `git diff 9cb2400..63fe5cf`
(head `63fe5cf`), 2026-11-01. Worktree `.worktrees/13.R`, branch `lane/13.R`. Measured against
the user's request of 2026-11-01 and the four readings in `docs/plan.md` section 6 phase 13, the
rows 13.1 to 13.W, `docs/spec.md` sections 5, 7, 8 and 12, `docs/design-principles.md` (5.2,
5.7, 5.9, 5.10, 8.5), plan section 5 (rules 10 and 11) and the `stat-te-terminology` skill.

Gate: not run here (the orchestrator runs it on `rebuild/mvp`). One file run:
`npx vitest run src/board/render.perf.test.ts`, 3 passed. Build check:
`npx vite build --outDir <scratchpad>/13.R/dist`, entry `index-*.js` 752.98 kB, 244.52 kB gzip.

Dev server: `npm run dev -- --port 5195 --strictPort` (stopped after the pass). Browser:
Playwright Chromium headless, 1440x900, a fresh context per script. Seeds: CUAS-001 from the
legacy fixture, imported through the Library Import button; the "Swarm of six, split" template
through "Open template". Scripts are in the session scratchpad under `13.R/` (`lib.mjs`, `a.mjs`
to `h.mjs`, `k.mjs`). No console error or page error in any script.

## Verdict

No blocker. Two majors. A reload in Brief puts the Brief time and loop into Build when the user
leaves Brief, because the Build stash is taken after the persisted Brief state is restored
(F-01). The wiring lane did not dedupe the helpers the three parallel lanes each wrote: `mmss`
exists three times, `stepAt`, `parseTime`, `round1` and the bar class twice, and two copies
already differ (F-02, plan rule 10).

The rest of the phase does what the request asks. The strip, the board and the inspector share
one selection and one hover. A glyph press moves the time and selects the system that gives the
step. The Brief shows the frame, the slice and the list inside the slice, and prints them. One
glyph set reads on the strip, the notes panel and the board in all three views. The minors are
keyboard reach (F-03, F-10), the light-theme contrast of a future board mark (F-04), one Build
item in the Brief menu (F-05), strip polish (F-06, F-09), the e2e gaps (F-07) and two time
formats in one panel (F-08).

## Summary counts

| Grade | Count |
| --- | --- |
| blocker | 0 |
| major | 2 |
| minor | 8 |
| note | 15 |

## Lane items

| Item | Result | Evidence |
| --- | --- | --- |
| 13.1-1 persistence | partial, F-01 | Build: clock t+2:05, strip height 283, loop, rate x2 and the zoom span survive a reload; the selection clears (`R-16`, `R-17`). A workspace switch without a reload restores Build to t+1:40, no loop, x1 (`R-19`). A reload in Brief fails (F-01, `R-14`, `R-15`). Guard: `timePersist.ts` wraps `storage()`, the read and the save in `try`; no throw path in private mode (code read) |
| 13.1-2 linking | pass | Row press on RDR-1 selects it on the board and in the inspector and lights the row; the clock stays (`R-04`). Board hover on RF-1 lights the RF-1 row and the light clears on leave (`R-05`). Glyph presses: Find 0:28 and Fix 0:46 select RDR-1, Track 2:30 and Target select EO-1, Engage 4:22 and Assess 5:00 select EW-1, DA 6:54 selects T1 (`R-06`) |
| 13.1-3 Cards row | pass (draw), not checked (press) | CUAS-001: markers 2 (t+3:20) and 3 (t+5:00); card 1 has no time and draws nothing. With a slice, card 2 draws in the accent with the band (`R-13`). Swarm with no card: no Cards row (`R-30`). The press was not exercised in the browser, and e2e 12-20 does not test it (F-07) |
| 13.1-4 state colour | pass on the strip | At t+1:40: Find reached, Fix current with the halo, the rest future, DA future (`R-03`). Future glyph `--text-subtle` at 4.97:1 on the strip surface |
| 13.1-5 Brief parity | pass, with F-05 | Build and Brief menus list Set time here, Loop from here, Clear loop, Fit run, Fit action, Save a frame here, Save the loop as a slice (disabled with the reason when no loop) and Add event here (`R-07`). The bead drag is guarded by `mode === 'build'`. Brief Tab order reaches the grip, the play bar, the loop buttons and the clock (`R-22`, `R-27`) |
| 13.1-6 polish | pass, with F-06, F-09 | Step word after the threat id ("T1 Fix", "A1 Fix"), gutter 72 px (`R-03`, `R-30`). Loop control is the `Repeat`/`Repeat1` icon pair on one line |
| 13.2-1 slice | pass, with F-03 | Scissors on card 2: slice t+1:42 to t+3:15 x1, one undo step "set card c4 slice"; Slice field 1:42, 3:15, x1; head text in the slice form (`R-11`). P from 0:10 jumps to 1:42 and plays at x1 (`R-12`). Space in Brief runs Next card, so Space does not play the slice (F-03) |
| 13.2-2 Frame panel | pass | Card 2: "Frame at t+3:20; T1 margin +142 s; Target; Engage in 1:02; Range 1.18 nm; Height 394 ft AGL; Speed 23 kt; Closing 21 kt; Held by RDR-1 RF-1 EO-1; DA in 3:34" (`R-09`). "Inside the slice" lists 6 items in time order (`R-11`) |
| 13.2-3 key points | pass | Glyphs with the state classes; the current step reads "now" (`R-09`) |
| 13.2-4 aids and print | pass | Aids "T1 Target · Next: 3 Engage and effect at t+5:00". New frame card caption "Write what the viewer must see at t+1:40." (`R-10`). Print: 3 pages for 3 cards (PDF), each with the time line ("t+0:55 to t+2:05 · x1", "t+3:20", "t+5:00"), a one-row frame table and the board marks with `--t` set (`R-28`) |
| 13.2-5 iconography | pass | Scissors on the stage head, disabled with the reason when no loop; section heads carry no icon |
| 13.3-1 marks | pass | 7 marks on T1 at t+1:40 in Plan, Elevation and 3D (`R-23` to `R-26`); `kp-now` T1:fix; no marks with Events off; marks take no pointer events |
| 13.3-2 state | pass, with F-04 | Reached opacity 1 in the text ink (13.42:1), future opacity 0.45 in `--t2`; the DA mark in the hostile ink |
| 13.3-3 declutter | pass per threat, N-10 | `events.ts:189-203` steps a later mark along the normal; it compares marks of one threat only |
| 13.3-4 parity and perf | pass, N-07 | The two key point layers and the root style are stripped before the byte compare. Perf below |
| 13.W wiring | partial, F-02, F-07, N-08 | `timelineCommands` registered; the palette lists both with the disabled reason (`R-20`, `R-21`); the dynamic import of `brief/cards` stays (N-14); no dedupe (F-02); the shortcut sheet lacks the two commands (N-08) |

## Code checks

| Check | Result | Evidence |
| --- | --- | --- |
| Undo semantics | pass | Time, loop, zoom, grip, rate and selection changes in Build and a time change in Brief leave the undo label unchanged. `setSlice` and `sliceFromLoop` are one step each |
| Renderer fence | pass | `src/board` imports no React, store or DOM module. The imports from `state/ui` are the earlier type imports in `cameras.ts`, `types.ts`, `format.ts` and `render.ts` |
| Persistence guard | pass | Code read of `src/state/timePersist.ts`; every storage access sits in `try` |
| e2e selectors | minor, F-07 | `12-20` presses `circle.tl-hit` with `force: true`, which hides a covered target |
| Duplicated modules | major, F-02 | Listed in F-02 |

## Budgets

| Budget | Result |
| --- | --- |
| Entry, 300 kB gzip | 244.52 kB gzip (pass) |
| Tick, 16 ms (`render.perf.test.ts`, 40 x 15) | tick set 0.41 ms Plan, 0.48 ms Elevation, 0.37 ms 3D (pass; the set omits `keypoints-now`, N-07) |
| Tick in the browser, Swarm at x8 for 3 s | 181 frames, p50 16.7 ms, p95 16.7 ms, max 16.8 ms, 0 frames over 20 ms; the board `--t` changed on 179 frames; clock 0:00 to 0:24 (pass) |
| e2e | 10 spec files (9 functional with 10 tests, plus `perf/budgets.spec.ts`) |

## Acceptance (the user's five asks)

| Ask | Verdict | Evidence |
| --- | --- | --- |
| A persistent timeline | partial | Build reload and the workspace switch pass (`R-16`, `R-17`, `R-19`). A reload in Brief puts the Brief time and loop into Build (F-01) and reopens Brief at card 1 (N-05) |
| Linking between plan, geometry, events, objects and cards | pass | Row press, board hover and glyph press in both directions (`R-04` to `R-06`); the Cards row puts the deck on the time axis (`R-13`); the board marks put the key points on the track (`R-23`) |
| The Brief as a space to assess, observe, analyze and teach a frame or a slice | pass, with F-03 | Frame panel, slice with the inside list, the aids, the caption prompt and the printed frame table (`R-09` to `R-12`, `R-28`) |
| The Brief strip as robust as Build | pass, with F-05 | Same menu, loop, zoom, grip, rate and presses; keyboard reach in Brief (`R-22`, `R-27`); the bead drag is the one Build-only control |
| Glyphs, colour distinction, iconography and polish | partial | One glyph set on the strip, the notes panel and the board in three views (principle 8.5). The future state reads differently on the board and the strip and the board mark is under 3:1 in light (F-04); the margin label and the cursor chip collide with other marks (F-06, F-09) |

## Findings

| Id | Grade | File:line | What | Evidence | Fix |
| --- | --- | --- | --- | --- | --- |
| F-01 | major | `src/features/brief/BriefWorkspace.tsx:143-144`; `src/features/brief/cards.ts:91-94`, `:97-106`; `src/state/timePersist.ts:132-165` | Reading 1 and 13.1 item 1: "The Build stash of Brief still restores the Build time on exit; persistence sits under it." The stash lives in memory only. After a reload in Brief, `bindTimePersist` restores the Brief time state, then the Brief mount calls `stashBuild()`, which snapshots that Brief state as Build's. Leaving Brief writes the Brief time and loop into Build; the Build time from before Brief is lost | Build at t+1:40, no loop; Brief with a slice and the clock at t+2:05; reload in Brief; Brief reopens at card 1; leave Brief: Build shows t+2:05 with the slice's loop. `R-14`, `R-15` | Persist the Build time state while Brief is open: in `timePersist`, save the stash's fields (not the live ones) when `buildStash` is set, and on a restore into Brief seed `buildStash` from that entry. Add the Brief reload to e2e 12-20 |
| F-02 | major | `src/features/timeline/layout.ts:40` (`round1`), `:44` (`parseTime`), `:52` (`mmss`), `:64-65` (`barClass`), `:146` (`stepAt`), `:181` (`pointStates`); `src/features/brief/cards.ts:315` (`parseTime`), `:323` (`round1`); `src/features/brief/frameData.ts:40` (`mmss`), `:70` (`pillClass`), `:78` (`stepAt`); `src/features/brief/Notes.tsx:317-330` (point states inline); `src/engine/tokens.ts:53` (`mmss`) | Plan rule 10: the wiring lane "dedupes what the parallel lanes each wrote locally (formatters, constants)". 13.W left the copies. Two differ already: `layout.mmss` uses `Math.abs`, `frameData.mmss` clamps at 0; the two `stepAt` use different tolerances and differ with time off. The strip and the Frame panel can name a different step or time for the same cursor | Code read; the `cards.ts:315` comment still cites "Timeline.tsx parseTime" | One `mmss(s, signed)` from `engine/tokens.ts`; `parseTime`, `round1`, `stepAt`, `pointStates` and the bar class exported once from `timeline/layout.ts` and imported by `brief/*`; a test that pins the shared `stepAt` at a key point time |
| F-03 | minor | `src/features/brief/commands.ts:44-52`; `src/commands/keys.ts:88-104` | 13.2 item 1: "P and Space play the slice from its start". In Brief, Space is `brief.space` (Next card). `dispatchKey` exempts only text inputs, so Space on a focused strip button runs the global command and the button never toggles | Loop all focused, Space: Build starts playback, Brief moves from card 1 to card 2; Enter toggles the button in both (`h.mjs`, `g.mjs`) | In `dispatchKey`, return null for Space and Enter when the target is a button or `[role="button"]`. Settle Space in Brief (play, per 13.2, or Next card, per the spec key table) and amend the other |
| F-04 | minor | `src/board/board.css:434-437`; `src/features/timeline/timeline.css:310-313` | Reading 4 and principle 8.5: one vocabulary, a future point dim. The board draws a future mark in `--t2` at opacity 0.45; the strip draws it in `--text-subtle` at full opacity. In light the board mark is 2.07:1 against the board paper rgb(238, 235, 228), under the 3:1 floor for graphics (WCAG 1.4.11). Strip future 4.97:1, board reached 13.42:1 | `d.mjs` contrast probe, light theme; `R-23` | Draw the future mark in `--text-subtle` at opacity 1, as the strip does, or raise the opacity floor until the mark reaches 3:1 |
| F-05 | minor | `src/features/build/menu/commands.ts:161`; `src/features/commands/adapter.ts:212` (`menuItemsFor`) | 13.1 item 5 lists the Brief strip menu items; "Add event here" is not one. The command declares `workspaces: ['build']`, but `menuItemsFor(kind)` does not filter by workspace, so Brief shows it enabled. A press opens the Brief command palette, because `openQuickAdd('events')` falls back | `R-18` | Filter `menuItemsFor` by the current workspace |
| F-06 | minor | `src/features/timeline/LaneSvg.tsx:175` | 13.2 item 2 writes the margin signed ("margin +18 s"); the Frame panel reads "margin +142 s"; the strip reads "margin 31 s". The label is end-anchored at the window start and touches the Engage triangle on every lane | `R-03`, `R-30` | Sign the strip label with the Frame panel's formatter; anchor it clear of the Engage glyph (start-anchored after the window end, or above the bar) |
| F-07 | minor | `e2e/12-20-timeline.spec.ts`; `e2e/12-21-slice.spec.ts` | 13.W asked 12-20 to cover "the Cards row opens card 2 in Brief"; it does not. The reload check covers Build only, so it misses F-01. The glyph press uses `click({ force: true })`. In 12-21 the P check cannot tell a wrap from a stay, because the loop holds the time inside the slice in both cases | Code read | Add the Cards row press in Brief and a Brief reload then leave; drop `force`; start P from a time outside the slice and assert the first sample equals `t0S` |
| F-08 | minor | `src/features/brief/Notes.tsx:490-494` | Principle 5.7 and one panel: the Card section's "Time s" field shows raw seconds (200, 101.9) while the new Slice field beside it takes m:ss | `R-11` | Show and parse the card time in m:ss through the shared `parseTime` and `mmss`, label "Time" |
| F-09 | minor | `src/features/timeline/Axis.tsx` (cursor chip) | The cursor chip draws over the nearest major tick label: "t+1:40" covers "2:00" | `R-29`, `R-30` | Hide a tick label whose box meets the chip |
| F-10 | minor | `src/commands/commands.ts:826-841`; `src/commands/keys.ts:95-96` | In Build, Tab from the page runs `edit.nextOfKind` (by design, legacy tabFree), so focus never leaves the page; 400 presses did not reach any control. A keyboard-only user reaches no strip control in Build. Brief reaches the first strip stop at Tab 23. Predates phase 13 (spec key table) | `k.mjs` | Let Tab from the page move focus when nothing is selected, or add a key that focuses the play bar and list it in the sheet |

## Notes

| Id | Where | Note |
| --- | --- | --- |
| N-01 | `src/features/timeline/commands.ts:2-3`, `:26-29`; `src/features/brief/cards.ts:315` | Stale comments: `localItems` and a guard "before 13.2 merges"; "Timeline.tsx parseTime". |
| N-02 | `src/features/timeline/Timeline.tsx:215` | `onDown` tests `.tl-grip`, which no element has; the grip is `.tl-resize`. Dead branch. |
| N-03 | `timeline/commands.ts`; `brief/cards.ts` `NO_LOOP_REASON` | Two reasons for one state: "Set a loop first: Shift and drag on the axis" and "Set a loop on the timeline first (Shift and drag)". |
| N-04 | `brief/cards.ts` `setSlice` | The card name "Overview at t+1:40" stays when the slice starts at 1:42. The name is the user's text; a hint is enough. |
| N-05 | `src/state/timePersist.ts` | `cardKey` is not persisted: a reload in Brief opens card 1, and applying card 1 rewrites the stored time state to time off and no loop. |
| N-06 | `src/board/layers/events.ts` | `--kt` rounds to 0.1 s (13.3 open item). A mark at 46.04 s can read reached at 46.0 s. |
| N-07 | `src/board/render.perf.test.ts:114` | `TICK` omits `keypoints-now`, the one new layer that reads `ctx.t`, and the 40 x 15 scene has no stages, so the marks are not timed. The browser Swarm run at x8 covers it (Budgets). |
| N-08 | shortcut sheet | Neither "Save a frame here" nor "Save the loop as a slice" is listed; 13.W asked for it and the row declares the deviation. |
| N-09 | `brief/cards.ts` `setSlice` | The undo label "set card c4 slice" names the id; the toast and the head name "card 2". The plan's own example uses the id. |
| N-10 | `events.ts:182-209` | Declutter compares the marks of one threat. The Swarm's six formation tracks overlap each other: 27 pairs of 42 mark boxes intersect at t+1:40 (`R-29`). |
| N-11 | strip height | The Swarm shows 4 of 6 lanes at the default height; B2 and B3 scroll (`R-30`). |
| N-12 | `LaneSvg.tsx` | Event labels overlap their circled letters (earlier open item). On CUAS-001 the authored beads sit at the key point times and cover the board marks. |
| N-13 | `src/features/timeline/PlayBar.tsx:49-55` | Loop range at the full view sets a 0-to-end loop, which reads as Loop all. |
| N-14 | `src/features/timeline/commands.ts` | The dynamic import of `brief/cards` stays; the plan allows it with the reason in the report. |
| N-15 | `LaneSvg.tsx:158`; board `<title>` | The strip glyph title reads "t+1:40", the board mark title "1:40". 13.3 item 1 asks for the strip's title text. |

## Words

Checked against `stat-te-terminology` (`banned-terms.md`, `lexicon.md`) for the new user text:
"Save a frame here", "Save the loop as a slice", "Set the slice from the loop", "Inside the
slice", "Frame at t+3:20", "margin +142 s", "Held by", "DA in 3:34", "Write what the viewer must
see at t+1:40.", the step words Find, Fix, Track, Target, Engage, Assess. No banned term. Units
are nm, ft AGL and kt as the skill asks. F-06 and N-03 are word consistency, not terminology.

## Screenshot index

32 files with the `R-` prefix under `reviews/phase-13/`, 3.9 MB. CUAS-001 unless named.

- Build at t+1:40 and the linking: `R-01-build-1m40-light.jpg`, `R-02-build-1m40-dark.jpg`,
  `R-03-strip-1m40-crop.jpg`, `R-04-row-press-linked.jpg`, `R-05-board-hover-lights-rows.jpg`,
  `R-06-glyph-press-engage.jpg`, `R-07-build-strip-menu.jpg`.
- Brief, frame and slice: `R-08-brief-card1.jpg`, `R-09-brief-card2-frame.jpg`,
  `R-10-brief-new-frame-placeholder.jpg`, `R-11-brief-slice.jpg`, `R-12-brief-slice-playing.jpg`,
  `R-13-strip-loop-and-cards-band.jpg`.
- Persistence: `R-14-after-reload.jpg`, `R-15-build-after-reloaded-brief.jpg` (F-01),
  `R-16-build-before-reload.jpg`, `R-17-build-after-reload.jpg`, `R-19-build-after-leaving-brief.jpg`.
- Menu and palette: `R-18-brief-add-event-here.jpg` (F-05), `R-20-palette-slice.jpg`,
  `R-21-palette-frame.jpg`.
- Keyboard in Brief (Swarm): `R-22-keyboard-grip-focus.jpg`, `R-27-keyboard-loop-toggle.jpg`.
- Board marks: `R-23-board-marks-plan-2x.jpg`, `R-24-elevation-marks.jpg`, `R-25-3d-marks.jpg`,
  `R-26-3d-marks-2x-crop.jpg`.
- Print: `R-28-print-deck.jpg`.
- Swarm of six, split: `R-29-swarm-build-1m40.jpg`, `R-30-swarm-strip-crop.jpg`,
  `R-31-swarm-after-x8.jpg`, `R-32-swarm-brief.jpg`.

## Not checked

- The Cards row press in Build and Brief (13.1 item 3) was not exercised in the browser.
- The mockup `legacy/mockup-v3.html` was not opened for a side-by-side; the plan's readings
  were the oracle for this phase.
- Dark-theme contrast of the board and strip future states (light only, F-04).
- Private-mode storage was checked by code read, not in a private context.
- F-02 divergence was found by code read; no screen showed the strip and the Frame panel
  disagree.
