# Phase 11 review and browser check (lane 11.R)

Reviewed: lanes 11.1 and 11.2 as merged on `rebuild/mvp`, `git diff 5bb3922..9122b24` (head
`9122b24`), 2026-11-01. Worktree `.worktrees/11.R`, branch `lane/11.R`. Measured against
`docs/plan.md` section 6 phase 11 (11.1 items 1 to 8, 11.2 steps 1 to 5) and the rows 11.1 and
11.2 of section 7, `docs/design-principles.md` (2.3, 5.9, 6.2), `docs/spec.md` sections 7, 11
and 12, and the v3 mockup `legacy/mockup-v3.html` as the parity oracle.

Gate: not run here (the orchestrator runs it on `rebuild/mvp`). One file run:
`npx vitest run src/board/render.test.ts`, 21 passed (the two new legacy patches apply).
Build check: `npx vite build --outDir <scratchpad>/r11/dist`, entry `index-*.js` 718.66 kB,
232.48 kB gzip; 12 woff2 files (120 kB) and 20 woff fallbacks as separate assets; no font
data in any JS chunk.

Dev server: `npm run dev -- --port 5193 --strictPort` (stopped after the pass). Mockup at
`http://localhost:5193/legacy/mockup-v3.html`. Browser: Playwright Chromium headless,
1440x900, deviceScaleFactor 1, a fresh context per script. Seed: CUAS-001 from the legacy
fixture `src/features/library/__fixtures__/legacy-v4-cuas-001.json`, imported through the
Library Import button (the 12.9 path). Scripts are in the session scratchpad under `r11/`
(`a.mjs`, `b.mjs`, `c.mjs`, `d.mjs`).

## Verdict

No blocker. Two majors, both in lane 11.1. Item 3 makes every part of a system's reach
drawing a range handle: a press on a sector's straight edge, the min range ring or an
Elevation limit ray starts a range drag whose first move sets the range to the press distance
(F-01; EO-1 went from 2500 m to 1000 m on a 3 px drag). Item 4 stores the Build pan and zoom in
the card, but the Brief stage, the card thumbnails and print draw every card at the fitted
frame, because `render.card` drops `zoom` and `centre` (F-02). The rest of 11.1 does what the
plan asks. Lane 11.2 is clean: Geist and Geist Mono load from the bundle outside the entry,
every Geist Mono number is tabular, and the type reads well in Library, Build (three views),
Brief and print, light and dark.

## Summary counts

| Grade | Count |
| --- | --- |
| blocker | 0 |
| major | 2 |
| minor | 5 |
| note | 10 |

## Lane items

| Item | Result | Evidence |
| --- | --- | --- |
| 11.1-1 selected row | fixed | `Row.tsx:141` uses `bg-surface-3` (`--surface-3` #d8d3c9, commented as the rule tone). Port selected row rgb(216, 211, 201) with the 2 px inset accent rgb(40, 98, 176); mockup `.item[aria-current="true"]` (line 135; line 146 is the event row, same rule) rgb(216, 211, 201) with the same inset. `R-09-selected-row.jpg`, `R-09-mockup-selected-row.jpg` |
| 11.1-2 `.ps-strip` | fixed | Rules gone from `shell.css` and `brief.css`; `grep` finds no `ps-strip`, `--strip`, `h-strip` or `spacing-strip` in `src`, `e2e` or `index.html` |
| 11.1-3 ring press | fixed, with F-01 | Choice judged sound: principle 2.3 ("Drag a ring to set range") outranks mockup line 443, whose ring has no `data-k` so a press there only deselects. RDR-1 unselected, press on the ring and drag 30 px out: range 4000 m to 4600 m, centre unchanged, RDR-1 selected, drag label "RDR-1 2.48 nm (4,600 m)". `R-06-ring-press-drag.jpg`, `R-07-ring-press-result.jpg`. The same rule fires on parts that are not the range ring: F-01, `R-08-sector-edge-press.jpg` |
| 11.1-4 card frame | partial, F-02 | Stored view correct: card c4 saved from a zoomed Plan holds `zoom` 1.822 and `centre` {1056, 669} (read from IndexedDB). 3D saves `zoom` 1 and centre 0, 0 with the toast "Card saved at the fitted 3D frame. Write its caption in Brief." (`R-12-3d-card-toast.jpg`). Brief card 4 shows the fitted frame: scale bar 1 nm = 147.7 px against card 1 at 142.5 px, origin at the stage centre (`R-13-brief-card4-fitted-frame.jpg`, `R-27-brief-card4-second-run.jpg`, `R-15-brief-added-card.jpg`, print `R-18-print.jpg`) |
| 11.1-5 append | fixed, with F-03 and F-04 | T1 selected, Add waypoints, two clicks on the plan: "4 wp · 422 s" to "6 wp · 964 s", the new points at the last height (394 ft), undo label "add waypoint to T1" per point. Escape ends the placement, keeps the points, the button goes `aria-pressed="false"`. With nothing selected the toggle arms a new threat. The hint reads "Pick a point to place the start waypoint. Press Escape to cancel." throughout the append (F-03, the known open item, confirmed). `R-10-add-waypoints-append.jpg` |
| 11.1-6 one read | fixed | `LibraryScreen.tsx:211-230` reads once per `changed` through `listWithRecords`; parsed records are cached by id and `updated` (`persist.ts:120-133`), the delete drops the entry (`persist.ts:168`). Thumbnail after an edit in Build: SVG length 4118 to 4116, redrawn (`R-20-library-after-edit.jpg`). Duplicate adds a second card with its thumbnail (`R-21-library-duplicate.jpg`). Profile.tsx reads the listing the session already has. Notes N-05, N-06 |
| 11.1-7 Max range gap | fixed | The label sits at 149 to 163 px, under "Height ft AGL" (131 to 145) and above the top tick "492" (163 to 177): no overlap, legible in light and dark. `R-24-elevation-max-range-crop.jpg`, `R-25-elevation-dark-cursor-off.jpg`. Note N-04 |
| 11.1-7 parity patches | fixed | `render.test.ts:303-318`: two patches on `43-layer-reach.js`. The first takes the F-06 patch output as its search string, so the chain stays exact; the second swaps only the two "MAX RG" literals. `testkit.ts:87` throws unless each search string occurs exactly once and `:93` throws on an unused patch; the byte comparison (`toBe(a)`, `:370`, `:374`) is unchanged |
| 11.1-8 words | fixed | "Max range" on the board (user choice); "C2 and TSPI" kept (user decision) |
| 11.2 families | fixed | `base.css:4-7` imports `@fontsource/geist` and `geist-mono` 400 and 500; `tokens.css:51-52`. Loaded faces: Geist 400, 500; Geist Mono 400, 500. Body `Geist, system-ui, ...` |
| 11.2 packages | fixed | `package.json` and `package-lock.json`: only the two `@fontsource` entries swapped (16 changed lines), both OFL-1.1, 5.3.0 |
| 11.2 tokens | fixed | `--strip` and `--spacing-strip` removed; nothing reads them |
| 11.2 principle 5.9 | fixed | `design-principles.md:77` names Geist and Geist Mono. Spec section 7 names no family (lane row), so no spec change was owed |
| 11.2 tabular figures | fixed | 59 leaf elements in Geist Mono with digits, all `tabular-nums` (Build Plan). Board scale bar and ids: Geist Mono, `tabular-nums`. Note N-07 for numbers in the Geist voice |
| 11.2 glyphs | fixed | At 11 px Geist Mono separates 1, l, I and 0 (slab 1, tailed l, serifed I, slashed or dotted 0): RDR-1, T1, P1, e1 to e6, CUAS-001 read cleanly. `R-22-glyphs-rail.jpg`, `R-23-glyphs-topbar.jpg`. Note N-08 for Geist sans I and l |
| 11.2 fonts outside the entry | fixed | Build check above |

## Acceptance (spec section 12, items the diff touches)

| Item | Result | Evidence |
| --- | --- | --- |
| Ring drag sets range (principle 2.3; e2e 12.4) | pass on the ring, fail on the sector edge | RDR-1 4000 m to 4600 m (`R-07`). EO-1 sector edge press sets 1000 m (F-01, `R-08`) |
| Inspector selection | pass | Selected row in the rule tone with the accent inset (`R-09-*`) |
| Placement (Add waypoints) | pass, with F-03, F-04 | Appends to T1; Escape ends; new threat when none selected (`R-10`) |
| Cards: save, Brief stage, print (12.19 area) | partial | Save stores the frame and the 3D toast shows; the stage, thumbnails and print ignore the frame (F-02) |
| Library: grid, thumbnails, duplicate | pass | `R-01-library.jpg`, `R-20`, `R-21` |
| Theme: light and dark in Geist | pass | `R-02`, `R-03`, `R-04`, `R-05`, `R-16`, `R-17`, `R-25` |
| Print in Geist | pass (type) | `R-18-print.jpg`, six pages, light |
| Entry budget (spec section 11) | pass | 232.48 kB gzip against 300 kB; fonts outside the entry |

## Findings

| Id | Grade | File:line | What | Evidence | Fix |
| --- | --- | --- | --- | --- | --- |
| F-01 | major | `src/features/build/board/tools.ts:646`, `:490-499`; `src/board/layers/reach.ts:95`, `:100-101`, `:107-113`, `:120-124`, `:142` | Every element of a system's reach drawing carries `data-k="system"`: the range ring, a sector's two straight edges, the min range ring, the Elevation min range arc and the elevation limit rays. Item 3 turns any press off the glyph into the `range` role, and the range role is absolute (`:791-798`, range = cursor distance). A press on the straight edge of a sector, the min range ring or a limit ray, then any move, sets max range to the press distance | EO-1 (30° sector, 2500 m): press at 40 % along its edge, 3 px move: drag label "EO-1 0.54 nm (1,000 m)", ring radius 137.8 px to 55.1 px, centre unchanged. `R-08-sector-edge-press.jpg` | Give the range role only to the max range ring element (a `data-role="range"` on it in `reach.ts`, read in `gestures.ts` `hitAt`), and make other reach parts select only |
| F-02 | major | `src/board/render.ts:253-262`; `src/features/brief/toCardRec.ts:19-30` | `render.card` builds the view from `cd.cam` without `zoom`, `px` or `py`, so the card's stored `centre` and `zoom` never reach the Brief stage, the strip thumbnails or print. Spec section 7 Brief: the stage renders the card's view. The lane's screenshot `11.1-4-brief-card-keeps-frame.jpg` and the 11.1 row claim more than the stage shows. The frame does reach Build through `card.open` (`build/cards/cards.ts:200-213`) | c4 stored `zoom` 1.822, `centre` {1056, 669}; in Brief card 4 has 147.7 px per nm (card 1: 142.5 px) and the origin at the stage centre. Print pages 4 and 6 identical in frame to the fitted view. `R-13-brief-card4-fitted-frame.jpg`, `R-27-*`, `R-18-print.jpg` | Carry `zoom` and `centre` into `CardRec.cam` and let `render.card` set `zoom`, `px`, `py` from them at the stage size (the `panFor` arithmetic in `build/cards/cards.ts`) |
| F-03 | minor | `src/features/build/board/gestures.ts:900-905` | In append mode `placing.pts` stays empty, so the hint says "Pick a point to place the start waypoint. Press Escape to cancel." before and after each appended point. Escape keeps the points (each was its own undo step), so "cancel" is wrong too. The hint also hides the leg readout `appendTo` writes (`tools.ts:415`): `Board.tsx:223` shows the hint first | `board-msg` text after zero, one and two clicks: the same sentence. `R-10-add-waypoints-append.jpg` | When `placing.pathId` is set: "Pick a point to add a waypoint to T1. Double-click or press Enter or Escape to end." |
| F-04 | minor | `src/features/build/board/tools.ts:477-483` | Escape ends an append through `cancelPlacing`, which does not clear the readout; the last leg readout stays on the board through undo and a view change, and in Elevation it overlaps the axis title. `finishPlacing` clears it (`:430`) | After two appended points, Escape: `board-msg` "0.93 nm, 144 s"; still there after two undos and key 2, over "Height ft AGL". `R-19-elevation-max-range.jpg`, `R-26-stale-leg-label.jpg` | In `cancelPlacing`, route a `pathId` placement to `finishPlacing`, or call `readout('')` |
| F-05 | minor | `src/features/brief/cards.ts:145`; `src/features/build/cards/cards.ts:17`; `src/features/brief/toCardRec.ts:56` | Plan item 4 asked to say in the card line that a 3D card keeps the fitted frame; the lane says it in a toast only, which is gone after a few seconds. The strip line of a 3D card reads "3D · t+200 s" with no mark | `R-14-brief-3d-card.jpg`, strip text "5. Card 53D · t+200 s" | Add the note to the strip's small line, or record the toast as the decision in the plan |
| F-06 | minor | `src/features/build/board/tools.ts:498` | `offGlyph` uses a fixed 14 px tolerance (`r + 14` = 21 px) while a mouse press hits the glyph within `r + 7` = 14 px (`gestures.ts:212`). A ring press 14 to 21 px from the centre falls through to the DOM hit and stays a centre move, the old jump. Reachable only when the ring is drawn within 21 px of the centre (short range, zoomed out) | Code read; not reproduced in the browser | Pass the touch flag and use the same tolerance as `hitAt` |
| F-07 | minor | `src/features/brief/cards.ts:145`; `src/features/build/cards/cards.ts:17` | New user-facing words "fitted 3D frame": the spec uses "Frame" for the site coordinate frame (section 3 item 4) and the board for track frames; the `stat-te-terminology` lexicon uses "fitted" for a fitted model. No banned term is hit | `references/banned-terms.md`, `lexicon.md` searched | "Card saved. 3D cards keep the default 3D view, not the pan and zoom. Write its caption in Brief." |

## Notes

| Id | Where | Note |
| --- | --- | --- |
| N-01 | `Row.tsx:141` | Hover and current share the rule tone; the mockup does the same (lines 134 and 135). |
| N-02 | `BuildBar.tsx:141-161` | Add waypoints arms the selected threat even in Elevation; the first click there returns "Press P to add in Plan." (`tools.ts:326-328`), as the mockup's plan-only append. |
| N-03 | `build/cards/cards.ts:144` | The 3D card drops the zoom as well as the pan. The axon camera has a zoom (`cameras.ts:183-204`); keeping `zoom` in 3D is possible if the user wants it. |
| N-04 | `reach.ts:149-156` | With the system at range 0 (RDR-1 at the asset), "Max range" sits in the height tick column, between the axis title (4 px above) and the top tick (0 px box gap). Legible; the corner is crowded. The mockup draws no such label in Elevation. |
| N-05 | `Profile.tsx:19-25`, `persist.ts:105` | `lastListing` is refreshed only by a listing read. A save, delete or duplicate made after the last read is not in the collections datalist until the Library is opened again. Low impact. |
| N-06 | `persist.ts:120-133` | The parsed cache keys on `updated`. An import that keeps a record's id and `updated` but changes its content would draw the old thumbnail. Unlikely in use. |
| N-07 | principle 5.9 | Numbers in the Geist voice are proportional (`font-variant-numeric: normal`): waypoint numbers on the board (`text.wpn`), "Max range" box, labels such as "Loiter 60 s" and "120 m ceiling". They are names, not columns. Every numeric column is Geist Mono and tabular. Predates phase 11. |
| N-08 | Geist sans | Geist sans draws capital I and lower-case l as bare strokes ("EO/IR", "Il"). No id is set in Geist sans, so no id is ambiguous. |
| N-09 | `src/board/board.css:271`, `:414`, `:436`, `:539`, `:545` | Board marks (event letters, 7 and 8 px) ask for weight 700, which is not bundled; the browser synthesizes it from Geist 500. The CSS marks them "mark, not text". Predates phase 11. |
| N-10 | principle 5.9 sizes | Live sizes off the five pairs: 11/14.67 (rail mono columns, `text-[11px]`), 12/15 (`leading-tight` rail names), 13/13 (top bar buttons), 11/18 (rail group heads), 12/18. Predates 11.2, which kept the sizes; for the held list or a type pass. |

## Words

Checked against `stat-te-terminology` (`banned-terms.md`, `lexicon.md`): "Max range" (user
choice), "C2 and TSPI" (user decision), the undo label "add waypoint to T1", the toasts
"Card saved at the fitted 3D frame. Write its caption in Brief." and "Card added at the
fitted 3D frame." No banned term. "fitted 3D frame" collides with two existing meanings
(F-07). The append hint is wrong in fact (F-03).

## Screenshot index

28 files with the `R-` prefix under `reviews/phase-11/`, 3.3 MB. All CUAS-001, 1440x900.

- Library: `R-01-library.jpg`, `R-20-library-after-edit.jpg`, `R-21-library-duplicate.jpg`.
- Build in Geist: `R-02-build-plan-light.jpg`, `R-03-build-plan-dark.jpg`,
  `R-04-build-elevation-dark.jpg`, `R-05-build-3d-dark.jpg`, `R-11-build-zoomed.jpg`.
- Item 1: `R-09-selected-row.jpg`, `R-09-mockup-selected-row.jpg`.
- Item 3: `R-06-ring-press-drag.jpg`, `R-07-ring-press-result.jpg`,
  `R-08-sector-edge-press.jpg` (F-01).
- Item 4: `R-12-3d-card-toast.jpg`, `R-13-brief-card4-fitted-frame.jpg`,
  `R-14-brief-3d-card.jpg`, `R-15-brief-added-card.jpg`, `R-27-brief-card4-second-run.jpg`.
- Item 5: `R-10-add-waypoints-append.jpg`, `R-26-stale-leg-label.jpg`.
- Item 7: `R-19-elevation-max-range.jpg` (with the F-04 leftover), `R-24-elevation-max-range-crop.jpg`,
  `R-25-elevation-dark-cursor-off.jpg`.
- Brief and print in Geist: `R-16-brief-light.jpg`, `R-17-brief-dark.jpg`, `R-18-print.jpg`.
- Glyphs: `R-22-glyphs-rail.jpg`, `R-23-glyphs-topbar.jpg`.

## Not checked

- The min range ring and the Elevation limit rays in F-01 are from the code; CUAS-001 has
  neither a min range nor limit rays in view. The sector edge case was reproduced.
- F-06 is from the code.
- The 17 px size step does not occur on the Build screen of CUAS-001; it was not inspected.
- The Profile collections datalist staleness (N-05) was not exercised in the browser.
