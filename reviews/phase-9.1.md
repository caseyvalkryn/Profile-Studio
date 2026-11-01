# Phase 9.1 Foundation review and browser check (lane 9.1.R)

Reviewed: lanes 9.1.1, 9.1.2, 9.1.3 and 9.1.4 as merged on `rebuild/mvp`, head `6843b7d`, 2026-10-31.
Main checkout, no worktree. Measured against `docs/spec.md` sections 7, 8, 11 and 12 (items 10,
12, 18, 21), `docs/plan.md` 9.1 lane scopes, `docs/design-principles.md`,
`docs/reference/artifact-study.md`, and the legacy app at `/legacy/index.html` as the parity oracle.

Gate: `npm run gate` exit 0.

- Vitest: "Test Files  72 passed (72)", "Tests  584 passed (584)".
- Build: "✓ built in 267ms". Entry `index-BRaCRWni.js 173.18 kB │ gzip: 56.10 kB`.
- Playwright: "12 passed (8.1s)".

Dev server: `npm run dev -- --port 5174 --strictPort --force`. The first start returned 504
"Outdated Optimize Dep" for the port page; `--force` cleared it (F-24, environmental).
Production build: `vite preview --port 5177` on the gate's `dist/`.
Browser: Playwright Chromium, headless, 1440x900, fresh context per probe. Storage cleared before
each probe. Scripts and logs are in the session scratchpad (`p1` to `p4`).

## Verdict

One blocker. After any command-driven open (New, Cmd+N, From template, Open from a card), the top
bar's route request pins the router to `/build`. The workspace links then do nothing, and
the renamed profile cannot be reached in the Library (F-01, acceptance item 12). Three majors
follow. The name field steals focus back on every rename (F-02). The top bar Import dialog
does not refresh the Library (F-03). I, \ and R change state that no region reads (F-04). The
domain v6 work, the round-trips, the dialogs, the theme, Results and Report all pass.

## Findings

Ranked by severity. Counts: 1 blocker, 3 major, 12 minor, 9 note.

| ID | Severity | File:line | What | Evidence | Expected fix | Lane |
| --- | --- | --- | --- | --- | --- | --- |
| F-01 | blocker | `src/features/shell/TopBar.tsx:186-191` | `useRouteRequests` runs `navigate(route.path)` whenever `route` or `navigate` changes. The request is never cleared, and `useNavigate` returns a new function on each location change. Every link click therefore bounces back to `/build`. The Library is unreachable by the nav until a reload. | p3: after New, URL `/build`; click Library: URL `/build`, 0 `h1`; click Results: `/build`; Back: `/build`. p2: IDB held "Range day A" but the Library link showed Build. Screenshots `9.1.R-route-lock.png`, `9.1.R-library-after-new.png`, `9.1.R-new-renamed-library.png` | Consume the request once: navigate, then set `route` to null in the store. Or call `navigate` from the request site and drop the effect. Add an e2e for item 12: New, rename, click Library, the card is listed. | 9.1.F |
| F-02 | major | `src/features/shell/TopBar.tsx:128-134` | The focus effect depends on `[nameFocus, name]` and `nameFocus` is never cleared. Each name change, including an undo of the rename, focuses and selects the name field again. | p1: rename, Enter: focus stays in `INPUT#tb-name`; Cmd+Z goes to the input's native undo with no toast. After a blur, Cmd+Z shows "Undid: Rename profile." and focus jumps back to `#tb-name`. `9.1.R-undo-toast.png` | Clear `nameFocus` after the first focus; depend on `nameFocus` only. Test: rename, Escape, Cmd+Z leaves focus on the body. | 9.1.F |
| F-03 | major | `src/features/shell/ImportDialog.tsx:25-45` | The dialog's `importText` saves records but does not call `libraryChanged()`. The Library's own `importText` in `src/features/library/io.ts:30-39` does. | p3, on the Library route: dialog import of CUAS-001 toasts "Imported 1 profile." and the Library still shows 0 saved cards. The Library's Import of three more files then shows 4. `9.1.R-import-norefresh.png` | Use one `importText` for both entries (see F-08), with `libraryChanged()`. | 9.1.F |
| F-04 | major | `src/commands/commands.ts:921-940` | I, \ and R toggle `ui.panels.inspector`, `list`/`inspector` and `stripTab`. Build still renders the MVP panels, which ignore `ui.panels`. The keys run, show no change and give no reason. Spec section 8 key table; principle 5.8. | p2: Tab, I, \ in Build: the visible regions stay "Asset library, Map, Inspector, Timeline". Palette rows "Inspector open or closed I", "Both side panels open or closed \" are enabled. | Until 9.2 mounts Build in the shell slots, either bind the MVP panels to `ui.panels`, or make these three commands stubs with a reason naming lane 9.2.1. | 9.1.F |
| F-05 | minor | `src/features/build/inspector/Inspector.tsx:25,79,84`; `src/domain/schema.ts:305,358` | User-facing "vignette" remains: "No vignette open.", the inspector heading "Vignette", the undo label "Rename vignette" (shown as "Undid: Rename vignette."), and the parse errors "The vignette has no id." and "This is not a valid vignette." that reach the import dialog. The 9.1.4 scope says every user-facing "vignette" becomes "profile". | Heading visible in `9.1.R-route-lock.png`. grep of `src/**/*.tsx` | Replace with "profile" in these five strings. The new shell and Library copy passes the `stat-te-terminology` check (no banned terms in user-facing text). | 9.1.F |
| F-06 | minor | `src/state/persist.ts:102-104` | The unknown-stamp error says "Expected profile-studio/6 or profile-studio/4." v5 is also accepted. | code | Name all three stamps. | 9.1.F |
| F-07 | minor | `src/features/shell/exportLibrary.ts:10-43`, `src/features/library/io.ts:30-39`, `src/state/persist.ts:87-89`, `src/features/shell/ImportDialog.tsx:25` | Two `importText`, two `exportLibrary`, two download helpers and two file-name rules. F-03 is the first divergence. | code | Keep one import path and one export path in `src/features/library/io.ts` (or `persist.ts`); the dialogs call them. | 9.1.F |
| F-08 | minor | `src/commands/keys.ts` (disabled command returns null) | A stub key does nothing and says nothing: 3, G, =, -, A, S, V, E, Shift+F, T, [, ], C, Shift+1 to 8. The palette shows the reason, for example "The 3D view arrives with the board renderer, lane 9.2.2". | p2: key 3 in Build: no change, no toast, no status. `9.1.R-palette-build.png` | On a key press of a disabled command, show its `when` reason in the status line or toast. | 9.1.F |
| F-09 | minor | `src/features/shell/TopBar.tsx:176-181`, `src/features/library/LibraryScreen.tsx:144-146` | The id slot reads `doc.v`, which v6 never carries, so "v3" never shows. Library cards also drop "v3" and "3 cards" and show "just now". | Pairs: legacy "CUAS-001 v3", port "CUAS-001". `9.1.R-topbar-*.png`, `9.1.R-library-*.png` | Carry the legacy version through the v4 import (or a revision counter) and show it; show the card count on Library cards. | 9.1.F |
| F-10 | minor | `src/features/library/newProfile.ts:68` (`newKey()`), `src/domain/ids.ts:48-51` | New profiles get a 36-character UUID as id, printed in the top bar id slot ("1b75f924-9bdf-4e9c-861f-5b9845a814d2"). Seed ids are short codes. Quiet interface. | `9.1.R-route-lock.png` | Give new profiles a short id (for example "NEW-001", next free) and keep the UUID internal if needed. | 9.1.F |
| F-11 | minor | `src/features/library/LibraryScreen.tsx:495-497` | Group headers are sentence case, `text-xs` muted ("Toughstump 3"). Legacy uses caps with `--ls-caps` tracking ("TOUGHSTUMP 3"). | `9.1.R-library-port.png` vs `9.1.R-library-legacy.png` | Apply the caps style from the legacy group header. | 9.1.F |
| F-12 | minor | `src/features/library/LibraryScreen.tsx:354-400` | Header order and gutter differ: port shows a "Library" title, New, search, Import, Export at a 24 px gutter. Legacy shows search first, then New, Import, Export at 16 px. | Library pair | Match the legacy order and gutter. Keep the "site" wording. | 9.1.F |
| F-13 | minor | `src/features/library/LibraryScreen.tsx:358` | The New button hard-codes `shortcut="⌘N"`. The registry prints platform names (Cmd+N in the sheet and palette). | code, `9.1.R-sheet-library.png` | Read the shortcut from the registry's `profile.new`. | 9.1.F |
| F-14 | minor | `src/features/shell/ImportDialog.tsx:17-19` and the toast store | After a successful import, a failing import shows the error table while the earlier "Imported 1 profile." toast is still up. | `9.1.R-import-notjson.png` | Dismiss the toast when the dialog opens or an import fails. | 9.1.F |
| F-15 | minor | `src/features/shell/shell.css:16-17` | `--ps-t3` maps to the same token as `--ps-t2`. The legacy third text level is lost (used at `:223`, `:274`). | code | Map `--ps-t3` to a third muted step in `tokens.css`. | 9.1.F |
| F-16 | minor | `src/features/shell/shell.css` (`.ps-top`) | Top bar: left gutter 12 px against legacy 16 px; the bottom rule runs full width against the legacy inset rule; the bar measures 49 px (48 plus a 1 px border). | p1: `.ps-top` 1440x49. `9.1.R-topbar-port.png` vs `9.1.R-topbar-legacy.png` | Gutter 16 px, inset rule, border inside the 48 px. | 9.1.F |
| F-17 | note | `src/state/persist.ts:71-89` | `loadAllVignettes` and `exportLibrary` return stored records without `parseVignette`. A stored v5 record exports as v5 inside a v6 library wrapper. Re-import still works because each record is parsed by its own stamp. | code | Parse on export so the file is all v6. | 9.1.F |
| F-18 | note | `src/features/shell/shell.css` | Every token read carries a `var(--x, fallback)` fallback. `tokens.css` now defines them all. | code | Drop the fallbacks. | 9.1.F |
| F-19 | note | `src/features/library/` | In the Library, `/` does not focus the search (focus stays on `BODY`). N is not bound either. | p3 `library.slashFocus "BODY:null"` | Decide whether the legacy `/` binding carries over; if so, register it scoped to `library`. | 9.1.F |
| F-20 | note | `src/features/library/LibraryScreen.tsx`, `src/features/library/commands.ts` | The Library shows its own New and Import next to the top bar's New and Import. `library.export` and `library.import` are exported and not registered. A "Templates" row sits above the groups; legacy offers templates only from the New arrow. | Library pair | Record the Templates row as intended or remove it; keep one Import and one New per screen. | 9.4 or 9.1.F |
| F-21 | note | `legacy/js/12-seed.js` seeds via import | Seeds with a null `meta.updated` import with the import time as `updated`, so group order follows import order (Reference before Toughstump in the pair). | `library.groups ["Reference1","Toughstump3"]` | None now. | none |
| F-22 | note | `src/domain/migrate.ts:310`, `:371` | A debrief event whose system id is unknown maps to `sensorKey: null` without a note (the authored-event path at `:212-213` does warn). `report.slides` is still filled from legacy cards while cards also import to `cards`. | code | Add a note for the unknown system. Confirm the slides copy is wanted now that cards are modeled. | 9.1.F |
| F-23 | note | `src/ui/Tooltip.tsx:15` | First tooltip opened at 431 ms (pass). A direct pointer jump from Export to Import showed no Import tooltip within 800 ms, and Theme showed none at 150 ms. A one-step Playwright move may not fire the pointer events Radix needs. | p3 `tooltip.*` | Recheck the skip-delay path by hand. | 9.1.F |
| F-24 | note | dev server | Vite 504 "Outdated Optimize Dep" after the 9.1.1 install. Cleared by `--force`. | session log | None. | none |
| F-25 | note | `src/features/shell/Shell.tsx` | Build passes no rail, right or strip content; it keeps its MVP panels until 9.2. JetBrains Mono loads only where mono text shows. | p1, p3 `cuas.mono` | None. | 9.2 |

## Parity pairs

Retaken at 1440x900, light, with the four legacy seeds imported (`9.1.R-library-port.png` was
taken after a reload, on the Library route).

Top bar, `9.1.R-topbar-legacy.png` and `9.1.R-topbar-port.png`, CUAS-001 open:

1. Five workspaces (Library, Build, Results, Report, Brief) against three. Intended (9.1.3 scope).
2. No key numbers on the segment. Intended: spec section 8 gives 1, 2 and 3 to the views.
3. New split button in the top bar. Intended (9.1.3 scope).
4. Id without "v3". Defect, F-09.
5. Left gutter 12 px, full-width rule, 49 px height. Defect, F-16.
6. Neutral MVP palette against the legacy warm grey. Intended (study decision 4).
7. Undo, Redo, Export, Import, "Theme auto", "?" in the same order and wording. Match.

Library, `9.1.R-library-legacy.png` and `9.1.R-library-port.png`:

1. "Templates" row above the groups. Open question, F-20.
2. Header order: title, New, search against search, New. Defect, F-12.
3. Placeholder "Search question, name, site" against "Search purpose, name, collection". Intended ("site" wording, "question" is the MVP name of purpose).
4. "4 profiles, 2 sites" against "4 profiles, 2 collections". Intended.
5. Group headers sentence case against caps. Defect, F-11.
6. Group order Reference then Toughstump. Note, F-21.
7. Thumbnails are grey placeholder rings. Intended until `src/board` lands in 9.2.
8. Card meta "SURR-001 just now" against "SURR-001 v1 2 cards". Defect, F-09.
9. Card buttons Open, Brief, Duplicate, Export, Delete. Match.
10. Palette colours. Intended (study decision 4).

The lane pairs (`9.1.3-*` and `9.1.4-*`, 14 files, plus the 9.1.1 Results and Report shots)
were read as lane evidence and not retaken, except as listed above.

## Browser checklist

| # | Check | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Parity pairs | partial | Two pairs retaken; 17 differences listed above, 6 defects. `9.1.R-topbar-*.png`, `9.1.R-library-*.png` |
| 2 | Type | pass, with F-16 | Archivo 400 and 500 and JetBrains Mono 400 and 500 loaded (with a profile open). Body Archivo 13px/18px. Id slot JetBrains Mono 12px. Top bar 48 px plus border. 232 px and 320 px columns are tokens only: Build does not use the shell columns yet (F-25) |
| 3 | New, Cmd+N, From template | fail | Button and Cmd+N: `/build`, "Untitled profile", focus `#tb-name`, selection 0 to 16. Untouched profile not saved (0 records before and after). Both template menus list 7 templates with Blank last. The renamed profile cannot be reached in the Library (F-01). `9.1.R-new-build.png`, `9.1.R-new-menu-topbar.png`, `9.1.R-route-lock.png` |
| 4 | Item 18 export counts | pass | CUAS-001 from the UI: schema `profile-studio/6`, planes 1, events 6, cards 3, snapshots 0, dataSources 4, site "Toughstump", slides 3, areas `DA asset 0 0`. Unit test covers the nine records. `9.1.R-export-port.png` |
| 5 | Keys | partial | Tab selects; 1 and 2 switch Plan and Elevation; 3 is a silent stub (F-08); I, \, R change nothing visible (F-04); Cmd+Z after a rename goes to the input (F-02). Sheet titles "Keys in Build" and "Keys in Library" read from the registry; palette shortcuts match the sheet (item 10). `9.1.R-key2-elevation.png`, `9.1.R-sheet-build.png`, `9.1.R-sheet-library.png`, `9.1.R-palette-build.png` |
| 6 | Theme | pass | Cycle auto, light, dark, auto; `data-theme` and `profileStudio.ui` follow; light persists after reload; auto follows emulated dark (bg rgb(15,17,21)) and light (rgb(246,247,248)). `9.1.R-auto-dark.png` |
| 7 | Dialogs v5, v6, v4, non-JSON | pass, with F-03 and F-14 | v5, v6 and v4 paste each give "Imported 1 profile." and store v6. Non-JSON: table row "1 This file is not JSON.". Empty: "Paste a profile, or pick a file.". Export library: `profile-library.json`, v6, 5 records; re-import "Imported 5 profiles, 5 replaced.". `9.1.R-import-notjson.png`, `9.1.R-import-empty.png` |
| 8 | Results and Report | pass | Point defence R-1: 1.1.2 "Detection Range (ground) 2.150 nm [2.149, 2.152] ≥ 1.62 nm Meets". Report: 3 charts; PNG `h-01-1-1-2-detection-range-ground-1-62-nm.png` 69,556 bytes; Export PDF calls print once; print PDF 146,416 bytes, seven h2 sections, top bar hidden. `9.1.R-results-port.png`, `9.1.R-report-port.png`, `9.1.R-report-print.png` |
| 9 | Brief placeholder, no profile | pass | Brief: "Brief arrives in lane 9.4.". Build and Results with an empty store: "No profile open." and "Open one from the Library". `9.1.R-brief-placeholder.png`, `9.1.R-results-noprofile.png` |
| 10 | Budgets | pass | See below |
| 11 | Words | partial | Five user-facing "vignette" strings remain (F-05). New shell and Library copy has no banned terms |
| 12 | Principles | partial | Progressive disclosure: chips, readout, events, debrief, snapshots off by default (`ui.ts` `PANEL_DEFAULTS`). Tooltip 431 ms (400 ms delay plus polling). Quiet interface: UUID id (F-10), stale toast (F-14). Icons with labels: every top bar control has a text label |

Screenshots added in `reviews/phase-9.1/` by this lane: 26 PNG files named `9.1.R-*`, largest
`9.1.R-report-print.png` at 328 kB.

## Budgets

Spec section 11.

| Item | Budget | Measured |
| --- | --- | --- |
| Entry bundle | 500 kB gzip | 56.10 kB gzip JS plus 33.99 kB gzip CSS |
| Fonts | outside the entry | 14 woff2 files, all separate assets (Archivo latin 400 14.70 kB, JetBrains Mono latin 400 21.16 kB) |
| First load | interactive in 2 s | `vite preview`, fresh context, localhost, no throttling: Library ready at 116 ms, 57 ms, 53 ms; 269 kB transferred |
| Lazy chunks | none set | MapView 297.23 kB, PromptNumber 121.42 kB, SweepChart 105.80 kB, persist 33.16 kB gzip |

The first-load figure has no network or CPU throttling. The perf spec (item 21) is the measure of
record.

## What the fix lane should do

Ordered by severity.

1. F-01: consume the route request once in `TopBar.tsx`; add an item 12 e2e (New, rename, Library link, card listed).
2. F-02: clear `nameFocus` after the first focus; effect depends on `nameFocus` only.
3. F-03 and F-07: one import path and one export path; the dialog import calls `libraryChanged()`.
4. F-04: bind the MVP Build panels to `ui.panels`, or turn I, \ and R into stubs with a lane 9.2.1 reason.
5. F-05: replace the five "vignette" strings.
6. F-08: show a disabled command's reason when its key is pressed.
7. F-09 and F-10: version in the id slot and on cards, card count, short ids for new profiles.
8. F-11, F-12, F-16: Library caps headers, header order and gutter; top bar gutter, inset rule, 48 px.
9. F-06, F-13, F-14, F-15: v5 in the stamp error, registry shortcut on the Library New, toast dismissal, a third text level.
10. Notes F-17 to F-22 as time allows; F-20 needs a decision from the user on the Templates row.
