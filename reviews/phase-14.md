# Phase 14 review and browser check (lane 14.R)

Reviewed: lanes 14.1 and 14.2 as merged on `main`, `git diff 761691f..0ca38e9 -- src e2e fixtures
docs/spec.md` (head `0ca38e9`), 2026-11-02. Worktree `.worktrees/14.R`, branch `lane/14.R`.
Measured against the user's request of 2026-11-02, the six readings and the lane texts 14.1 and
14.2 in `docs/plan.md` section 6 phase 14, the rows 14.D and 14.E, `docs/spec.md` sections 2, 5,
7, 8 and acceptance 26 and 27, `docs/design-principles.md` (2.4, 5.2, 5.6, 5.7) and the
`stat-te-terminology` references.

Gate: not run here (the orchestrator runs it on `main`). Files run: `npx vitest run` on
`siteFile`, `schema`, `migrate`, `persist`, `library` and `templates` tests, 6 files, 108 passed.
Build check: `npx vite build --outDir <scratchpad>/dist`, entry `index-*.js` 764.67 kB,
248.50 kB gzip.

Scratch checks (not committed, under the ignored `e2e/__results__/scratch/`): a vitest run on
the user's two sample files, on every truncated prefix of `fixtures/kml/site.kmz`, and on parser
edge cases; an independent haversine check of the extents.

Dev server: `npm run dev -- --port 5183 --strictPort` (stopped after the pass). Browser:
Playwright Chromium headless, 1440x900, a fresh context per script (IndexedDB empty at start).
Sample files: `TST Ranch.kmz` and `UAS Fly Area.kmz` from the user's Downloads, read in place
and not copied. Board drops used trusted OS-level drags through CDP
`Input.dispatchDragEvent`, so the real `drop` handlers ran with real `File` objects. No console
error or page error in any script.

## Verdict

No blocker. One major. The phase is mergeable after the fix lane, and F-01 needs the user's
word on reading 4 before that lane can fix it.

The sample files import at true scale. The ranch draws 693 by 502 m with 19 vertices, and the
fly area 343 by 429 m with 22 vertices. The second file lands at its true offset from the first,
and one undo removes one import. Plan, Elevation and 3D all draw both.

The major is the Build entry on any profile that still has a template's stand-in site. A New
profile, then "Import a site file", projects the ranch about Blank's 35.05, -117.6. The ranch
lands 3,483 km east of the defended asset, and the board fits to show both (F-01).

The minors are the projection's equatorial constants (F-02), the silent non-site drop on the
board (F-03), the "lon, lat" tuple with spaces (F-04), the Library's unseen success line (F-05)
and the e2e and test gaps (F-06).

## Summary counts

| Grade | Count |
| --- | --- |
| blocker | 0 |
| major | 1 |
| minor | 5 |
| note | 15 |

## Lane items

| Item | Result | Evidence |
| --- | --- | --- |
| 14.1-1 the kind | pass | `range` in `AreaKind`, the zod enum, `AREA_KINDS` (last), `AREA_LABELS` "Range area", `AREA_DEFAULTS` `{zMaxM: 0, prefix: 'RNG'}`, `migrate.ts:55` legacy kind list, `ids.ts` `RNG-`. The rail library (`rail/library.ts:82`), the quick add (`palette/rows.ts:107`) and the inspector kind select (`inspector/Volumes.tsx:26`) read `AREA_KINDS`. Browser: the select shows "Range area", the rows read "Range area · 19 vertices" (`14.2-two-files-plan-light`) |
| 14.1-2 the drawing | pass | `.vol-range` ghost stroke, no dash, no fill (`board.css:194-199`). Computed stroke rgb(118, 125, 132) light, rgb(106, 113, 120) dark, fill none, dash none. `volumes.ts:61-67` sorts `range` first; the DOM volume order puts RNG ids first. Elevation and 3D draw both (`14.1-elevation-light`, `14.1-3d-light`) |
| 14.1-3 the stamp | pass | `SCHEMA` `profile-studio/8`; `migrateV7ToV8` restamps (`migrateV5.ts`); `importRecord` accepts v8, v7, v6, v5 and v4 (`persist.ts:236-241`); the library export writes `SCHEMA` (`persist.ts:214`). Tests pass for v7 round trip and v8 with a range area |
| 14.1-4 `siteFile.ts` | pass, with F-02, F-04 | Exports as listed. The extra sentence "The KML document in the KMZ cannot be read." was accepted in row 14.D |
| 14.1-5 tests | partial, F-06 | 14 tests; the projection, the origin both ways and four of the five sentences are covered. `BAD_ENTRY` has no test |
| 14.2-1 `importSiteFile` | pass, with F-01 | One `edit('import ' + name)` (`commands.ts:494-516`), then the selection, `fit()` and the toast "1 area from TST Ranch.kmz." A bad file toasts its sentence and rejects |
| 14.2-2 the board drop | pass, with F-03 | A trusted drop of `UAS Fly Area.kmz` on the board imports it at the same offset as the picker (107.8 m) (`14.2-board-drop-fly-light`) |
| 14.2-3 the Library | pass, with F-05 | `accept=".json,.kml,.kmz,application/json"`, label "Import file". A KMZ makes a profile named after the stem with no defended asset and the site set by the file. A bad `.kml` leaves "This file is not KML." on the message line and 0 profiles (`14.2-library-bad-kml-light`). JSON import: "Imported 1 profile." |
| 14.2-4 the e2e | partial, F-06 | 12-27 checks the count, "2 selected", the toast, the name, undo, and the same box on a drop. It checks the 1.5 ratio, not the metres against the grid |
| 14.2-5 the spec | pass | Section 7 Library line, section 8 "Import a site file", acceptance 27, section 5 item 4 and the Area row |

## Code checks

| Check | Result | Evidence |
| --- | --- | --- |
| 1. Zip reader | pass | Walks the central directory from the end record (`siteFile.ts:39-61`), so the data-descriptor fixture (bit 3, zero local sizes) reads. Methods 0 and 8; other methods give `BAD_ENTRY` (`:69-75`). The first `.kml` name in any case; the test with three entries passes. Every loop is bounded: the end-record scan runs at most 65,557 steps, and the entry loop is limited by `count` and checked at `:53`, `:64` and `:67`. All 665 truncated prefixes of `site.kmz` reject "This file is not a KMZ." with no slow case. A corrupted deflate stream gives "The KML document in the KMZ cannot be read." Zip64 and a prefixed zip are refused (N-13) |
| 2. KML parser | pass, with F-04 | Placemark `<name>` trimmed (`:132`). MultiGeometry gives one polygon per `<Polygon>`; `innerBoundaryIs` dropped; a `<Point>` alone gives "The file has no polygon." Closing vertex dropped (`:145`), and a ring under three vertices is skipped (`:146`). Namespaces are matched by local name through `getElementsByTagNameNS('*')`. The real files declare the default kml namespace plus `gx`, `kml` and `atom`, and their `<coordinates>` hold tabs and newlines; both parse (19 and 22 vertices). A BOM and a KML with no namespace parse. An undeclared `gx:` prefix gives "This file is not KML." A tuple with spaces after its commas parses wrong (F-04) |
| 3. Projection | pass to reading 3, F-02 | `localFrom` (`:154-157`) is reading 3 exactly. North is positive y: the fly area's centre is 17.7 m south and 106 m east of the ranch's by latitude and longitude, and the board puts it 17.0 m lower and 106.5 m right. Origin rule: an unset site takes the bbox centre, so the ranch centres at 0, 0. A set site projects the second file at its offset. At 5 km the reading's constants are 5.6 m short east and 16.8 m short north at 35.3°N (F-02) |
| 4. Ids | pass | `siteAreas` (`:189-198`) takes `nextId('range', used)` against threats, sensors, effectors, nodes and areas, and pushes each new id. With RNG-1 taken, the next two are RNG-2 and RNG-3. Planes and events use other prefixes |
| 5. Stamp | pass | Code read of the chain v5 to v6 to v7 to v8 (`migrateV5.ts`); the 108 tests pass. Error sentence: "Unknown record stamp: x. Expected profile-studio/8, profile-studio/7, profile-studio/6, profile-studio/5 or profile-studio/4." |
| 6. Command | pass | `build.importSite` (`commands.ts:933`), `workspaces: BUILD`, `when: needDoc`. e2e 12-10 compares every registry label with the palette on Build, so the new row is covered. Browser: the palette lists "Import a site file" and Enter opens a file chooser with `accept=".kml,.kmz"`. The hidden input is in the DOM while the chooser is open and gone after a pick or an empty pick (`cancel` and `change` both remove it, `:519-532`). Three picks in a row each open a chooser. Undo label "Undo: import UAS Fly Area.kmz"; the selection is the new area; `fit()` refits |
| 7. Board drop | minor, F-03 | `Board.tsx:80-92`: `onDragOver` accepts any `Files`; a non-site file falls through to the asset branch, which returns before `preventDefault`. A trusted drop of `notes.txt` changed nothing and showed no message (`14.2-board-drop-txt-light`) |
| 8. Library | pass, with F-05, N-07 | `readSitePolygons` runs before `openProfile` (`LibraryScreen.tsx:321` then `:332`), so a bad file opens nothing and autosave writes nothing. A good file opens an unsaved copy, and the import edit is the first edit that autosave writes. After two KMZ imports through the Library: "2 profiles · 1 collection" |
| 9. Principles | pass, N-10, N-12 | Selection: the selected range area takes the w3 stroke and the accent handles, as every area kind does (5.2). Ghost ink for range. Words: "Range area", "Import a site file", "site file", toast "1 area from TST Ranch.kmz." with the full stop the toast store asks for (`toastStore.ts:9`). No banned term |
| 10. Budget | pass, N-11 | Entry 248.50 kB gzip against 300 kB. The `siteFile` sentences are in the entry chunk |

## Budgets

| Budget | Result |
| --- | --- |
| Entry, 300 kB gzip | 248.50 kB gzip (pass; row 14.E reports the same) |
| `siteFile.ts` | 3.0 kB gzip as source, in the entry (N-11) |
| e2e | 12 spec files with 12-27 |

## Measurements from the real files

Read in the browser from the SVG: each `polygon.vol-range` bbox over the scale bar's SVG units
per metre (0.539, bar "0.5 nm / 0.93 km"). The grid step is 500 m: the vertical grid lines sit
270 px apart either side of the axis.

| Quantity | Board | Independent (haversine, sphere) | WGS84 local scale | Plan text |
| --- | --- | --- | --- | --- |
| TST Ranch W-E by S-N | 693.4 by 502.0 m, 19 vertices | 692.6 by 504.6 m | 694.1 by 503.5 m | about 690 by 500 m, 19 |
| UAS Fly Area W-E by S-N | 342.8 by 429.1 m, 22 vertices | 342.4 by 431.5 m | | about 340 by 430 m, 22 |
| Centre offset (bbox centres) | 107.8 m (106.5 m east, 17.0 m south) | 107.6 m | | 270 m (N-01) |
| Site after the first file | 35.29012500719301, -79.38677016098855 | | | about 35.2898, -79.3885 (N-02) |

Both areas sit in one frame; the fly area lies inside the ranch boundary
(`14.2-two-files-plan-light`). Undo once: RNG-2 gone, RNG-1 stays, site unchanged. Undo again:
no range area, site 0, 0 (unset). Toasts "Undid: import UAS Fly Area.kmz." and "Undid: import
TST Ranch.kmz." (`14.2-after-two-undos-light`).

## Acceptance

| Item | Verdict | Evidence |
| --- | --- | --- |
| 26 marquee | not touched by the phase | e2e 12-26 unchanged |
| 27 site file | partial, F-01 | Library and board drop: true scale and true offset, one undo per import (table above). From Build on a New profile or a template, the file projects against the stand-in site and lands 3,483 km away (F-01) |

## Findings

| Id | Grade | File:line | What | Evidence | Fix |
| --- | --- | --- | --- | --- | --- |
| F-01 | major | `src/commands/commands.ts:496-503`; `src/domain/siteFile.ts:187-188` | Reading 4 counts any non-zero site as set. Every template and every New profile carries a stand-in site (Blank: 35.05, -117.6). Row 14.E records this and resets the site for the Library path only. The Build entry has no such guard. A New profile, then "Import a site file" with `TST Ranch.kmz`, puts RNG-1 at x 1880.6 nm, y 14.2 nm (3,483 km east, 26 km north) of the defended asset. `fit()` then shrinks the board to a 10 nm scale bar with the ranch as a dot, and the site fields still read 35.05, -117.6. The user's first move on a new profile is the one that fails. Acceptance 27 asks for "true scale about the site" | Browser: `14.2-new-profile-then-import-light`; vertices text "1880.559, 14.202" | Needs the user's word on reading 4. Recommended: when the file's centre lies more than 50 km from the site, set the site to the file's centre in the same undo step and say so in the toast. The alternative is to refuse with one sentence that names the distance and the Site fields |
| F-02 | minor | `src/domain/siteFile.ts:25-26`, `:154-157` | Reading 3 claims the projection is "exact to well under a metre" at a few km. Its constants are the equator's degree lengths (111320 east, 110574 north). At 35.3°N, the true metres per degree are larger by 0.11% east and 0.34% north. The ranch draws 693.4 by 501.8 m against 694.1 by 503.5 m on WGS84. At 5 km the error is 5.6 m east and 16.8 m north. The lane followed the reading as written, so this is a defect in the reading (rule 13) | Scratch vitest with the WGS84 series at the site latitude | Take metres per degree at the origin's latitude (north 111132.92 − 559.82 cos 2φ + 1.175 cos 4φ; east 111412.84 cos φ − 93.5 cos 3φ) and test the 600 by 400 m rectangle at 35°N within 0.5 m |
| F-03 | minor | `src/features/build/board/Board.tsx:80-92` | Row 14.E lists this as open; graded a finding. `onDragOver` shows the copy cursor for any file. A drop of anything other than `.kml` or `.kmz` falls into the asset branch, which returns before `preventDefault`, so nothing happens and nothing says why. Headless Chromium did nothing. A headed browser opens an uncancelled file drop in the tab; that was not checked here. Only `files[0]` is read, so a multi-file drop ignores the rest | Trusted CDP drop of `notes.txt`; `14.2-board-drop-txt-light` | In `onDrop`, call `preventDefault` when any file is present, and toast "Drop a KML or KMZ file to import a site." when it is not a site file |
| F-04 | minor | `src/domain/siteFile.ts:138-141` | The tuple is split on whitespace first. "-79, 35, 0" becomes the tokens "-79,", "35,", "0". `Number('')` is 0, so each token becomes a vertex [-79, 0], [35, 0] and so on. The polygon passes the three-vertex check and lands on the equator. KML forbids spaces inside a tuple, but some exporters write them | Scratch: ring `[[-79,0],[35,0],[-78.999,0],[35,0],...]` | Collapse `\s*,\s*` to `,` before the whitespace split, and reject a tuple with an empty field |
| F-05 | minor | `src/features/library/LibraryScreen.tsx:333-339` | After `openProfile` the app is on Build, so the Library message line set on success is never seen. It counts `doc.areas.length` (every area) rather than the imported areas. The error branch after `openProfile` can only see the "Open a profile first." path. The toast already reports the count | Code read; the Library after the import shows no line | Drop the success `setMessage` (the toast carries it) or count the imported areas and show it when the Library is next opened |
| F-06 | minor | `e2e/12-27-site-file.spec.ts:30-32`; `src/domain/siteFile.test.ts` | 14.2 item 4 asks for "the grid labels showing the fitted extent". The e2e checks the width-to-height ratio only, so a uniform scale error would pass. 14.1 item 5 asks for every error sentence, and "The KML document in the KMZ cannot be read." has no test. Nothing in the e2e drives the palette picker (12-10 covers its presence, not its run) | Code read | Read metres from the scale bar as `helpers.ts readBoard` does and assert 600 by 400 m within 2 m; add a corrupt-deflate case to `siteFile.test.ts`; add a `filechooser` step to 12-27 |

## Notes

| Id | Where | Note |
| --- | --- | --- |
| N-01 | `docs/plan.md` phase 14 intro | "Centres 270 m apart" does not match the files. Bbox centres are 107.6 m apart (haversine), area centroids 54.2 m and vertex means 301.7 m. The board's 107.8 m is right; the plan text should change. |
| N-02 | brief | The expected site "about 35.2898, -79.3885" differs from the ranch's bbox centre, 35.290125, -79.386770 (157 m in longitude). The code follows reading 4. |
| N-03 | Library path, second file | Importing `UAS Fly Area.kmz` through the Library makes a second profile, "UAS Fly Area", with its own site at the fly area's centre (35.28997, -79.38560). The two profiles do not share a frame. This is as reading 5 specifies. The Import tooltip could say that Build adds a file to the open profile. |
| N-04 | `LibraryScreen.tsx:321`, `:334` | The file is read and parsed twice (row 14.E). Harmless at a few kB. |
| N-05 | `inspector/Profile.tsx:247-262` | Latitude and longitude show 14 decimals ("35.29012500719301"). Six decimals is 0.1 m. |
| N-06 | `inspector/Volumes.tsx:122-138` | Vertices show to 0.001 nm (1.85 m). Editing one line rewrites every vertex from the shown text, so the other imported vertices move by up to 0.9 m. Predates phase 14; imported boundaries make it visible. |
| N-07 | autosave | A failed Library import saves nothing (0 profiles after the bad `.kml`). Undoing a Library import leaves the saved profile empty with the site unset, as any undone first edit does. |
| N-08 | palette in the Library | "Import a site file" is not listed in the Library (`workspaces: BUILD`), rather than listed as disabled. Other Build commands behave the same (`14.2-palette-library-light`). |
| N-09 | `commands.ts:496` | `doc` is taken before the file read awaits. A profile switch during the read would apply ids and the site computed against the old profile. Theoretical at these file sizes. |
| N-10 | words | "Range" now means three things on Build: the Range area, the Elevation axis "Range from asset, nm", and Reach. No banned term; worth a glance when the terms table next changes. |
| N-11 | entry | `siteFile.ts` (about 3 kB gzip) loads with the entry. A dynamic import inside `importSiteFile` and the Library's site branch would move it out. Not needed against the budget. |
| N-12 | selection | Range areas select like every area kind: w3 stroke and accent handles, while the outline keeps the ghost ink. Matches principle 5.2. |
| N-13 | `siteFile.ts:37` | The reader needs a local header at byte 0 and has no Zip64 path. Google Earth writes neither case. |
| N-14 | `Board.tsx:88-91` | After a site drop the focus is `BODY`; the asset drop focuses the stage (`:104`). Keys after a drop were not exercised. |
| N-15 | Elevation | With no defended asset, the Elevation view still labels its axis "Range from asset" and draws the range areas as flat lines at 0 (`14.1-elevation-light`). |

## Words

Checked against `stat-te-terminology` (`banned-terms.md`, `lexicon.md`) for the new user text:
"Range area", "Import a site file", "Import file", "site file", "n areas from <file>.", "This
file is not a KMZ.", "The KMZ has no KML document.", "The KML document in the KMZ cannot be
read.", "This file is not KML.", "The file has no polygon.", the Import tooltip. No banned term.
Every toast is one sentence with a full stop. See N-10 for "range".

## Screenshot index

14 files under `reviews/phase-14/`, 1440x900 jpg, about 1.4 MB.

- Real files, Library then palette: `14.2-ranch-library-import-light.jpg`,
  `14.2-palette-import-light.jpg`, `14.2-two-files-plan-light.jpg`,
  `14.2-two-files-plan-dark.jpg`, `14.2-inspector-volumes-light.jpg` (the two Volumes rows and
  the Site fields), `14.1-elevation-light.jpg`, `14.1-3d-light.jpg`,
  `14.2-after-two-undos-light.jpg`.
- Board drop: `14.2-board-drop-fly-light.jpg`, `14.2-board-drop-txt-light.jpg` (F-03, no change).
- Library: `14.2-library-bad-kml-light.jpg`, `14.2-library-two-profiles-light.jpg` (N-03),
  `14.2-palette-library-light.jpg` (N-08).
- F-01: `14.2-new-profile-then-import-light.jpg`.

## Not checked

- A non-site file dropped on the board in a headed browser, where the uncancelled drop may open
  the file in the tab (F-03). Headless Chromium only.
- Safari and Firefox (`DecompressionStream('deflate-raw')` and the input `cancel` event).
- A real OS cancel of the file chooser. An empty `setFiles` stood in for it; the `cancel` event
  was dispatched by script.
- Keyboard use of the selection after a board drop (N-14).
- The Library message line when the Library is reopened after an import (F-05, code read).
