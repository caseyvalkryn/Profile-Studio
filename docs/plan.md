# Profile Studio build plan

Date: 2026-10-30, pruned for phase 10 on 2026-11-01. This plan takes Profile Studio from the
legacy ES5 app to the product in `docs/spec.md`. An orchestrator can pick it up cold. Read in
this order: `CLAUDE.md`, `docs/design-principles.md`, `docs/spec.md`, this file (sections 1 to
5, phase 10 in section 6, then 7 and 8), then the reference file each lane names.

## 1. Decisions

These are settled. Do not reopen them without the user.

| Decision | Choice | Reason |
| --- | --- | --- |
| Measures | DroneScore rows only | User: the gold standard |
| Kill chain display | F2T2EA over `stage_reached` | User confirmed 2026-10-30 |
| Design | First principles. rangeboard is a source of parts | User, 2026-10-30 |
| Product form | Installed production MVP, not a static page | User, 2026-10-30 |
| vos | Port after the MVP | `docs/reference/vos.md` |
| Sources | Local only, `~/Desktop/MASTER/VALKRYN` | User: no internet downloads |
| Engine | `src/engine`: geo, preview, derived; pure, deterministic TypeScript | The rangeboard Monte Carlo transfer of phase 2 was deleted in lane 10.1 |
| Purpose | A polished profile mockup tool: create, iterate and brief test profiles. Not a place to run tests | User, 2026-11-01 (phase 10) |
| Run and score code | Deleted in lane 10.1 (phase 10 decision 1); tag `pre-pivot` keeps it one checkout away | User, 2026-11-01 |
| Palette | Warm paper and graphite with affiliation inks, from `legacy/css/tokens.css` and the mockup `:root`, in lane 10.6 (phase 10 decision 3) | User, 2026-11-01 |
| Mode names | Library, Build, Brief (phase 10 decision 2). The mockup's Collect, Compose, Brief set the direction, not the words | User, 2026-11-01 (kickoff prompt) |
| Inspector | The whole-scene inspector replaces the selection inspector (phase 10 decision 4). The selected object's row expands; nothing is lost | User, 2026-11-01 (kickoff prompt) |
| "Envelopes" | The layer that draws the hull around a group of threats keeps the mockup's and spec's name "Envelopes" (review 10.R N-05); the `stat-te-terminology` skill allows the term for this layer | User, 2026-11-01 |
| Hint grey | `--text-subtle` darkens from #7b7d73 to #696b61 in the light theme (4.97:1 on the panel, 4.55:1 on the board), the nearest warm grey at WCAG AA (review 10.R N-04); the dark value stays | User, 2026-11-01 |
| Phase 10 | Approved; `rebuild/mvp` merged into `main` (phase 11 opens from there) | User, 2026-11-01 |
| Typeface | Geist for text and Geist Mono for numbers (`@fontsource/geist`, `@fontsource/geist-mono`, OFL) replace Archivo and JetBrains Mono. The brief: unique, intuitive, worthy of an operator command and control panel; elegant, modern and distinctive (the SpaceX register); not "military", not JetBrains Mono. Picked by the user from the lane 11.2 shortlist of four on the specimen page `reviews/phase-11/type-choices.html`; the download of the two packages approved | User, 2026-11-01 |
| Words (11.1 item 8) | The rail group keeps the mockup's "C2 and TSPI" (an allowed exception to `stat-te-terminology` rule 3, recorded in the skill's `banned-terms.md`); the Elevation label "MAX RG" becomes "Max range" | User, 2026-11-01 (poll) |
| Phase 11 | The merge of `rebuild/mvp` into `main` approved on 2026-11-01, to be run after 11.F lands with the gate green; the push is a separate approval | User, 2026-11-01 |
| Scope hold | The bigger pieces wait for "product complete": the vos port (phase 8), the domain fields the UI dropped (`chainTime`, sensor `model`, `entered`), and the deferred list of phase 10 | User, 2026-11-01 |

## 2. Stack

Chosen to match vos majors, so the later port stays medium effort.

| Need | Choice |
| --- | --- |
| UI | React 18.3.1, TypeScript ~5.6.3, Vite ^8.0.16 |
| State | Zustand ^5.0.2 with Immer patches for undo |
| Validation | zod |
| Board | `src/board/`: the legacy SVG renderer ported one to one (three cameras, the layer registry) |
| Menus, tooltips, dialogs | Radix primitives |
| Command palette | cmdk |
| Styling | Tailwind 4.1.12 (`@tailwindcss/vite`) with tokens as CSS custom properties in `src/styles/tokens.css` |
| Storage | IndexedDB through `idb`, plus JSON import and export |
| Tests | Vitest for unit and engine, Playwright for end-to-end by user action |
| Lint and format | ESLint flat config and Prettier |

These are the vos versions (`docs/reference/vos.md`, 2026-10-30). Use the latest patch of the
other packages at scaffold time and pin exact versions in `package-lock.json`.

## 3. Layout

```text
legacy/            frozen ES5 v4 app, runnable; mockup-v3.html, the product direction
fixtures/          golden derive outputs from legacy, seeds, test vignettes
src/engine/        pure TS: geo, preview, derived (no DOM, no React)
src/domain/        types, schema, catalog, templates, behaviors, migrate, the DroneScore table
src/state/         stores: document (undo), ui; persistence
src/commands/      the command registry
src/ui/            primitives: Button, Field, Kbd, Tooltip, Menu, ContextMenu, Palette, Dialog, Icon
src/board/         pure TS port of the legacy renderer: scene adapter, cameras, symbols, layers, render
src/features/      shell/, library/, build/{board,rail,palette,menu,tip,inspector,readout,timeline}/,
                   commands/, shared/; brief/ arrives in lane 10.4
src/styles/        tokens.css, base.css
e2e/               Playwright suites for spec section 12 items; e2e/perf/ measures the budgets
```

## 4. Gate

`npm run gate` runs typecheck, lint, unit tests, build and the end-to-end suite (`npm run e2e`
on `vite preview`). `npm run legacy:smoke` keeps the legacy app green.

## 5. Orchestration rules

1. One agent per lane per round. A send-back is a new agent with the review file as input.
2. Lanes in one phase own disjoint files. Launch them in one message.
3. Every brief states: working directory, owned files, gate command, report shape, time budget.
4. A worker report is a claim. The orchestrator runs the gate and reads `git diff --stat`
   before it marks a lane done.
5. Each lane works on branch `lane/<id>` from `rebuild/mvp`. The orchestrator merges in plan
   order, then runs the gate once on `rebuild/mvp`.
6. After each phase, one review lane (`opus-high`) reviews the phase diff against the spec and
   the principles. Findings go to `reviews/<phase>.md`. Fixes are a new lane.
7. Screenshots and browser checks go to a worker. The orchestrator reads the report.
8. Commit, push and merge to `main` only with user approval.
9. A review lane is followed by a fix lane (`<phase>.F`) that owns the files the findings cite
   and reports per finding: fixed, partial, or declared loss.
10. When parallel lanes build parts of one screen, a wiring lane follows them (4.5, 5.3, 6.3). It
    owns `App.tsx`, the composed screen and the shared folders, and it dedupes what the parallel
    lanes each wrote locally (formatters, constants).
11. Every UI phase gets a real browser pass in its review. jsdom and the map mock passed 400
    tests while the map had zero height, a 404 worker and no right-click menu (phase 4).
12. A wiring lane that inherits several checklists gets 3600 s, not 2400 s.
13. A spec or test a lane must bend to pass is a defect report, not a spec edit: the worker
    stops and reports; the orchestrator decides.
14. A worker claim about legacy or mockup behaviour is checked against the file and line before
    it enters the plan.
15. A worker that needs a line outside its owned files reports the line and stops.
16. The brief states the entry budget; the worker reports the measured size against it.

Worker types are in `~/.claude/rules/delegation.md`. Default: `opus-medium`.

## 6. Phases and lanes

### Phases 0 to 9 (done or superseded)

Phases 0 to 7 built the MVP of 2026-10-30: baseline, scaffold, domain and engine, state and
commands, the Build workspace, Results and Report, Library and templates, acceptance. Phase 8
(the vos port) is a separate plan after the product is done. Phase 9 (2026-10-31) ported the
legacy interface onto the MVP engine: 9.1 (fonts, tokens, domain v6, shell, Library) and 9.2
(derived, `src/board`, rail, palette, menu, tip, inspector, readout, board view, wiring) are
merged with their fix lanes. Sub-phases 9.3 (strip, events, debrief), 9.4 (Brief) and 9.5
(acceptance) are superseded by phase 10. Section 7 has the commit per lane; the findings are
in `reviews/`; the lane text is in git (`git show 70caf07:docs/plan.md`).

Two rules from phase 9 stay in force. The renderer contract: `src/board/` is a pure
TypeScript port of `legacy/js/40-cameras.js` to `44-render.js` with no React, store or DOM
import (an ESLint fence enforces it); layers keep `draw(ctx)` and return SVG fragment strings;
the board view mounts one `<g>` per layer and rewrites only the layers whose inputs changed.
The owned-file rule: `src/commands/commands.ts`, `src/App.tsx`, `src/state/ui.ts` and the
composed workspace files belong to one lane per sub-phase; other lanes export their commands
and panels from their own folder, and the wiring lane registers and mounts them.

### Phase 10. The profile mockup tool (pivot of 2026-11-01)

Decision of 2026-11-01 (user): Profile Studio is a tool to create, iterate and brief
counter-UAS test profiles as interactive, detailed mockups. It plans real tests; it does not
run them. The functionality stays simple for the user. The direction is the v3 mockup
`legacy/mockup-v3.html` (the artifact `M4Jr3utqfsvt5cEgCHbeB2`, 541 lines, served on the dev
server beside the legacy app): three modes, one board with three cameras, a whole-scene
inspector, cards and a brief. The build is a more polished version of that mockup, on the
engine, domain, state and board the rebuild already has.

Sub-phases 9.3, 9.4 and 9.5 are superseded by this phase.

**What the mockup has and the build lacks** (read `legacy/mockup-v3.html` at the line):

| Mockup feature | Where in the mockup | Build today |
| --- | --- | --- |
| Time off by default ("full run"), one checkbox and a scrub | `.scrub`, line 390 | T toggles time (9.2.F1); the scrub is the MVP timeline until 10.3 |
| Thumbnails of the other two cameras under the stage, click to switch | `drawStage`, line 396 | none |
| Five layer toggles in view: Reach, Events, Envelopes, Telemetry, Labels | `LAYER_DEFS`, line 386 | 12 chips, hidden (Shift+1 to 8) |
| Save as card, one click | `t-card`, line 431 | a stub (the `card.*` commands report a reason) |
| Whole-scene inspector: every object listed under its section, the selected one expanded | `drawInspector`, lines 407 to 420 | selection-only inspector plus the profile form |
| Purpose block: question, class, collection | line 408 | name, id, collection, purpose, units, site elevation, link distance, latitude, longitude, questions and hypotheses, chain time |
| Aircraft rows with the archetype's facts and source link | line 409 | archetype on the threat |
| Data products and Measures of performance lists | lines 418, 419 | `report.dataSources` in Report; measures as hypotheses |
| Brief: card strip with thumbnails, stage, caption, Previous and Next, arrow keys, notes panel | lines 491 to 509 | placeholder |
| Collect: grid by collection, per card Compose, Brief, Duplicate, Export, Delete; thumbnail from the first card; "id v3 · class · n cards · n paths" | lines 511 to 522 | Library: Open, Duplicate, Export, Delete; grouped by site |
| Export with resolved waypoint times (`timed`) for VAL | line 525 | v6 JSON |

**What lane 10.1 removed** (the user's words: this is not a place for real testing): the Run button and dialog, Results, Report, hypotheses and predictions,
chain time, compare, sweep, the Monte Carlo worker and `src/engine/sim` (18.3k lines), `run`,
`score`, `sweep`, `adapter`, `src/state/runs.ts`, recharts, and the end-to-end specs 12-01,
12-05 to 12-08, phase6-f01 and phase6-f04. DroneScore stays as the naming standard for the
measures of performance list (`docs/reference/dronescore-measures.md`, the 67-row table in
`src/domain`); the scorecard goes.

**Decisions** (each is a row in section 1; all four are taken as of 2026-11-01):

1. Delete the run and score code, or hide it behind a flag. Decided 2026-11-01: delete. Git
   keeps it (tag `pre-pivot` at d1f56d1). A hidden workspace is not simple, and the entry
   chunk and the gate both shrink.
2. Mode names. Spec: Library, Build, Brief. Mockup: Collect, Compose, Brief. Proposal: keep
   Library, Build, Brief (approved in 9.1; the mockup sets the direction, not the words).
3. Palette. The mockup and the legacy app use warm paper and graphite with affiliation inks
   (`legacy/css/tokens.css`, `legacy/mockup-v3.html` `:root`). The port kept the MVP cool
   palette. Decided 2026-11-01: adopt the warm palette (lane 10.6).
4. The whole-scene inspector replaces the selection inspector, or sits beside it. Proposal:
   replace. The selection still expands its own row; nothing is lost.

**Rules.** Section 5 applies. Lanes branch from `rebuild/mvp` as `lane/10.x`. The renderer
contract and the owned-file rule from phase 9 stay. The oracle for every UI lane is the mockup
at `/legacy/mockup-v3.html` beside the legacy app at `/legacy/index.html`: the worker opens the
same seed (CUAS-001) in the mockup and the port, saves the pair under `reviews/phase-10/`, and
lists every difference as intended (cite the spec line) or a defect. Parity with the legacy v4
app is no longer the bar; the mockup's simplicity is. Budgets: entry under 300 kB gzip after
10.1; the spec section 11 rows stay.

#### 10.1 Cut (`opus-high`, 3000 s; done 2026-11-01, merged at 59eb86f)

Remove the run and score surface: `src/engine/sim/`, `adapter.ts`, `run.ts`, `score.ts`,
`sweep.ts`, `headless.test.ts`, `src/workers/`, `src/state/runs.ts`, `src/features/results/`,
`src/features/report/`, the Run button, the run-done note, the hypotheses and chain time blocks
in the inspector, the `run.*`, `results.*`, `report.*` and sweep commands, `recharts` (offline
uninstall, nothing fetched), and the seven end-to-end specs above. Keep: the domain's
`Hypothesis` and `RunSummary` types only where the v6 schema needs them to parse stored records
(mark them deprecated; v7 drops them in 10.5). Keep the DroneScore table and `measures.ts`.
Three workspaces in the shell: Library, Build, Brief (decision 2). Spec sections 1, 4, 6, 7,
11 and 12 amended in the same lane: section 4 becomes "One question, one profile, one brief";
section 6 keeps geo, preview and derived; the first-use goal becomes "opens a template, moves
one sensor, saves a card and briefs it in under 10 minutes"; acceptance items 1, 5 to 8 and
11 are retired, item 19 (Brief) and a new item (Save as card) stay. `docs/design-principles.md`
section 4 is rewritten to the same effect. Owned: the files above, `src/App.tsx`,
`src/commands/commands.ts`, `docs/spec.md`, `docs/design-principles.md`, `e2e/`. Gate green
with the remaining specs; entry size in the report.

#### 10.2 Whole-scene inspector (`opus-high`, 3600 s, parallel with 10.3 and 10.4)

Port `drawInspector` (`legacy/mockup-v3.html` lines 407 to 420) onto the v6 document: Purpose
(question, class, collection), Aircraft (one row per archetype in use: id, archetype select,
cruise, the catalog facts and source link), Paths (one row per threat with the waypoint table:
x, y, altitude, hold; add and remove; the selected path expanded; the hint text), Systems
(sensors, effectors, nodes: id, kind, position, reach, field of view, bearing), Volumes (label,
kind, top, vertices), Reference planes, Events (time, type, label, path, the time slider),
Telemetry (truth source, interval, stations, snapshots), Data products, Measures of
performance (a DroneScore picker: ID and name, F2T2EA step shown). The selected object's row
expands; clicking a row selects it on the board. Every field writes to the document store on
input, one undo step per field (the legacy rule). The MVP profile form's units, site elevation,
link distance, latitude and longitude move to a "Site" disclosure at the end, closed by
default. Owned: `src/features/build/inspector/`. Tests: each section renders from CUAS-001;
a waypoint edit is one undo step; the picker lists 67 rows.

#### 10.3 Board bar, layers, time, thumbnails, Save as card (`opus-medium`, 3000 s)

The Build bar becomes the mockup's: the view segment (Plan, Elevation, 3D), Add waypoints
(the existing path placement, as a pressed toggle), the five layer toggles in view (map the 12
board layers onto Reach, Events, Envelopes, Telemetry, Labels; the other seven follow Labels or
stay on), Save as card (C) and the one-line readout. Under the board: the time checkbox, the
scrub and "full run" (the MVP timeline strip is deleted; the authored events draw as beads on
the scrub), then the two thumbnails of the other cameras, click to switch. Fit, Ref and the
units toggle move to the palette. Owned: `src/features/build/BuildWorkspace.tsx`,
`src/features/build/board/` (bar and strip only), `src/features/build/timeline/` (deleted),
`src/state/document.ts` (the cards slice: save with the view, layers, time and focus;
reorder; delete; one undo step), the `card.*` commands. Tests: Save as card stores the view;
the thumbnails render the other two cameras; the scrub turns time on.

#### 10.4 Brief (`fable-medium`, 3600 s)

Port `drawBrief`, `drawCardStrip`, `drawBriefStage` and `drawNotes` (`legacy/mockup-v3.html`
lines 491 to 509): the card strip with thumbnails (`render.card` in thumb mode), the stage
rendering the card's view through `src/board` at its time and layers with its focus ids drawn
strong and the rest dim, the head ("n of m · id"), the caption, Previous and Next, Left,
Right and Space, the notes panel (name, camera, yaw and pitch, time, focus ids, layers,
caption, presenter notes, Up, Down, Delete), "Add card from current scene" when the deck is
empty. Entering Brief stashes the Build view and leaving restores it. Print stylesheet: one
page per card with its render, caption and notes (PDF through print). Clips, beats, caption
tokens, presenter aids, capture and the phone stage are not in this lane; each returns only
when the user asks. Owned: `src/features/brief/`, `src/App.tsx` (mount only), the Brief keys
in `src/commands/commands.ts`. Tests: a card opens at its view and time; arrows move; print
has one page per card.

#### 10.5 Collect polish and export (`opus-medium`, 2400 s, after 10.2 to 10.4)

Library per the mockup's Collect: grouped by collection (a `collection` field on the profile;
`site.name` migrates into it in v7), per card Open, Brief, Duplicate, Export, Delete; the
thumbnail from the first card when one exists; the metadata line "id v3 · class · n cards · n
paths"; a `version` counter that bumps on each committed edit; a `class` field (Counter-UAS,
Multi-aircraft, One-way attack, Surrogate, Custom). Export adds the resolved waypoint times
(`timed`: x, y, z, arrive, depart) per path, as the mockup does for VAL. v7 schema drops the
run fields. Owned: `src/features/library/`, `src/domain/`, `src/state/persist.ts`. Tests:
round-trip v6 to v7; export carries `timed`.

#### 10.6 Palette and polish (`opus-medium`, 2400 s, decision 3 taken)

The warm paper and graphite palette from `legacy/css/tokens.css` into `src/styles/tokens.css`
(both themes), the affiliation inks on the board, the mockup's control sizes (28, 26, 24 px),
the top bar at widths under 900 px, and the `stat-te-terminology` check on every string the
phase added. Owned: `src/styles/`, `src/board/board.css`, `src/features/shell/`.

#### 10.R Review and 10.F Fixes

`opus-high` with the browser at 1440 x 900: the port beside the mockup for every seed in
`fixtures/legacy-derive/` in all three views and in Brief; the first-use goal re-walked; the
budgets measured. Then the fix lane and the user's approval.

#### Deferred from phase 10

Clips and beats, caption tokens, presenter aids, capture and attachments, the phone stage,
the debrief overlay, the timeline with F2T2EA lanes, the chart strip, the readout strip with
drag deltas, the quick-add palette's catalog rows, the target menu's long tail, snap to
geometry. Each exists in `legacy/` and returns as its own lane only when the user asks.

### Phase 11. Small defects and the typeface (opens 2026-11-01)

Phase 10 was approved on 2026-11-01 and merged into `main`. Phase 11 closes the small defects
10.F left and establishes the product's typeface. The bigger pieces are held (section 1, "Scope
hold"): the vos port (phase 8), the dropped domain fields, and the deferred list above. Section
5 rules apply. Lanes branch from `rebuild/mvp` as `lane/11.x`; the orchestrator merges
`rebuild/mvp` into `main` at the end of the phase with the user's approval.

#### 11.1 Small defects (`opus-medium`, 2400 s)

The items 10.F and the review left, each fixed or declared with its reason:

1. The selected inspector row uses `bg-surface-2` (sunken); the mockup's current row uses the
   rule tone (`legacy/mockup-v3.html` line 146, `.item[aria-current="true"]{background:var(--rule)}`)
   with the 2 px accent inset. `src/features/build/inspector/Row.tsx` Item.
2. Leftover `.ps-strip` rules in `src/features/shell/shell.css` and `src/features/brief/brief.css`
   with no element.
3. A press on the ring edge of a system that is not selected moves its centre to the cursor:
   `src/features/build/board/tools.ts` defaults the role to centre. The mockup (line 443) drags the
   system only from its glyph in Plan; a ring press on an unselected system should select it and
   start nothing, or start the range drag. Decide against the mockup line and principle 2.3.
4. "Add card from current scene" in Brief stores the default frame (centre 0, 0, zoom 1), and a
   card saved in 3D stores centre 0, 0 (the axon camera has no inverse). Store the Build stash's
   centre and zoom where they exist; in 3D store the fitted frame and say so in the card line.
   `src/features/brief/cards.ts`, `src/features/build/cards/cards.ts`.
5. Add waypoints arms a new path of the selected threat's type; the mockup (line 445) appends
   waypoints to the selected path on the plan. Make `placeAt` and `finishPlacing` in
   `src/features/build/board/tools.ts` honour `placing.pathId`, so the toggle appends to the
   selected path and starts a new one only when none is selected.
6. The Library loads every record to draw its thumbnail, and `inspector/Profile.tsx` lists the
   collections from `listVignettes` again. Keep one listing read per screen; render thumbnails
   from the listing's first card and the stored scene summary, or cache the loaded records.
7. "MAX RG" in Elevation sits just above the top tick; give it the same gap as the axis title.
8. Words the user decides first (ask with a poll before the lane): the rail group name "C2 and
   TSPI" and the board label "MAX RG" (unexpanded acronyms, `stat-te-terminology` rule 3).

Owned: the files above and their tests. Gate green; a screenshot per fixed item under
`reviews/phase-11/`. Report per item: fixed, partial or declared.

#### 11.2 Typeface (`fable-medium`, 3600 s; decision row "Typeface")

Establish one type family for the product in place of Archivo and JetBrains Mono (principle
5.9, spec section 7 Theme and the `@fontsource` bundles of lane 9.1.1). The brief: unique,
intuitive, worthy of an operator command and control panel; elegant, modern, distinctive, the
register of the SpaceX interfaces; not "military" (no stencil, no DIN-signage flavour, no
camouflage of any kind); not JetBrains Mono. The constraints stay: two voices at most (text and
numbers), weights 400 and 500, the five sizes with their line heights, tabular numerals for
every number, bundled from a local package, no runtime fetch, an open licence that allows
bundling.

Procedure:

1. A shortlist of four candidates at most, each with the licence, the tabular-figure support,
   the weights, the package (`@fontsource/<name>` or a local file set) and one line on why it
   fits the brief. Starting list, to be checked, not copied: Geist with Geist Mono (Vercel,
   OFL; a calm Swiss grotesk made for dense product interfaces; the nearest open match to the
   SpaceX register); Recursive (OFL; one variable family that spans a sans and a mono through
   its axes, so one family gives both voices); Instrument Sans with a tabular mono partner
   (OFL); Manrope (OFL; geometric, clear numerals). Reject IBM Plex as common and D-DIN as
   signage; reject anything that reads as a terminal or a stencil.
2. Nothing is downloaded before the user approves the exact packages (section 1, Sources; the
   kickoff rule). The lane stops after the shortlist and asks with a poll.
3. With the approved packages installed (`npm install`, one approved command), render the
   Build screen with CUAS-001 in every candidate at 1440 x 900, light and dark, the inspector
   open, time on, and the Brief stage with card 2, as specimens under `reviews/phase-11/type-*`.
   The same five sizes and two weights in each. The user picks from the specimens by poll.
4. Apply the pick: `src/styles/base.css` imports, `src/styles/tokens.css` `--ui` and `--mono`,
   the removal of the two old packages (offline uninstall), principle 5.9 and spec section 7
   amended with the family names, the five sizes re-checked against the family's x-height (a
   size step may change by one pixel; say which and why), the entry budget re-measured (the
   fonts load outside the entry, spec section 11).
5. The pair of screenshots per screen (Library, Build in three views, Brief, print) before and
   after, under `reviews/phase-11/`.

Owned: `src/styles/`, `package.json` and the lockfile for the font packages only,
`docs/design-principles.md` item 5.9, `docs/spec.md` section 7 Theme. Report: the shortlist
table, the user's pick and the poll record, the sizes changed, the measured sizes, the
screenshots.

#### 11.R Review and 11.F Fixes

`opus-high` with the browser at 1440 x 900: the two lanes against the spec, the principles and
the mockup; then the fix lane and the user's approval; then the merge into `main`.

#### Held for product complete

The vos port (phase 8, a separate plan); the domain fields the UI dropped (`chainTime`, read
by `preview.ts` and `derived.ts`; the sensor `model` and the asset `entered` source notes,
still written by the templates); the deferred list of phase 10 above. Each returns only when
the user asks.

## 7. Status

The orchestrator updates this table at each merge. `Head` is the `rebuild/mvp` commit after the
merge. Open items live in section 8, not here. The review screenshots of phases 4 to 9.2 were
removed from the tree on 2026-11-01 (`git show 70caf07` has them); the findings stay in
`reviews/*.md`.

| Lane | Status | Head | Result |
| --- | --- | --- | --- |
| 0.1 to 0.3 | done | 6d81756 | Legacy baseline on `main`; legacy app in `legacy/`; 9 golden derive fixtures |
| 1.1 | done | f147f73 | Vite, React 18.3.1, TS 5.6.3, Tailwind 4.3.3, ESLint 10, Vitest 5, Playwright; tokens; shell; engine fence; `npm run gate` |
| 2.1 | done | a7bae7f | `src/domain`: types, zod, ids, catalog, 67-row DroneScore table, legacy v4 import |
| 2.2 | done | c38ec67 | `src/engine/{geo,preview}.ts`: parity with the 4 legacy seeds; 17 ms at 40 threats x 15 sensors |
| 2.3a | done | 687b842 | rangeboard 59-file trial closure in `src/engine/sim`, logic unchanged, seed 4821 byte-identical |
| 2.3b | done | c2aaeaf | adapter, run (RunRow + RunTrace), score (Wilson, bootstrap), sweep, worker and client |
| 2.R, 2.F | done | 0c8f46e | `reviews/phase-2.md`: 2 blockers, 2 majors, 8 minors; all fixed except two declared losses |
| 3.1, 3.2 | done | 6669667 | document store with patch undo, ui, runs, persist, 51 commands; 9 UI primitives |
| 3.R, 3.F | done | 343ffcc | `reviews/phase-3.md`: 1 blocker, 4 majors, 8 minors; all 13 fixed |
| 4.1 to 4.4 | done | 2c68b24 | map, assets panel, inspector, timeline and profile |
| 4.5 | done | f36b9a6 | Build workspace wired; one command adapter; shared units; entry 169 kB gzip, map chunk 296 kB |
| 5.1, 5.2 | done | f52238a | results (scorecard, charts, compare, sweep, export) and report (7 AAR sections, CSV, JSON, print) |
| 6.1 | done | 025da17 | library screen: template cards, saved vignettes, search, import, delete with undo |
| 5.3 | done | 8a832c1 | Results and Report mounted; `RunSummary.predictions`; `ReportDraft.sections`; worker cancel |
| 6.2 | done | 9a4f864 | behaviours and the 8 templates, each runs and scores (table in section 8) |
| 4.R | done | see `reviews/phase-4.md` | browser check: 3 blockers (map height, worker 404, no right-click menu), 4 majors, 8 minors |
| 4.F | done | 405bae4 | all 15 fixed; F-01 to F-07 browser-verified (`reviews/phase-4/after-4F.png`); 442 tests |
| 6.3 | done | 26074c3 | Library on `/` with the 8 templates; dev vignette removed; empty state on Build, Results, Report without a document; 445 tests |
| 6.R | done | e053836 | `reviews/phase-6.md`: 2 blockers (Results unscoped to the document, no sweep control), 3 majors, 7 minors, 6 notes; 16 screenshots |
| 6.F | done | f5d8f5b | all 16 worked findings fixed; F-15 (labels, F2T2EA lanes) and F-17 (chunk size) stand; 7 browser screenshots; 462 tests |
| 7.2 | done | see `reviews/phase-7-first-use.md` | first-use goal met (76 s of tool time, under 10 min); 2 major and 8 minor friction items; F-15 stands; 23 screenshots |
| 7.1 | done | 39342af | 12 Playwright specs (section 12 items 1 to 10, phase 6 F-01 and F-04) on `vite preview` port 5175; item 11 as `src/engine/headless.test.ts`; `npm run gate` now ends with `npm run e2e`; 463 unit tests |
| 7.3 | done | c2e6699 | `reviews/phase-7-budgets.md`: all 5 section 11 budgets pass on an M4 Pro; run 200 x 6 at 2.3 s has the least margin; perf spec in `e2e/perf/` outside the gate |
| 7.4 | done | dfd06d1 | templates: laydowns spread (25 px or more apart at the default view), unit-free questions, hover limit in plain words (FR-01, FR-04, 6b); no threshold changed |
| 7.5 | done | dc57e29 | map: stacked-hit cycling on repeat click, area interior hits, label collision avoidance (FR-01, FR-05, 3c); FR-10 not reproduced, declared loss |
| 7.6 | done | d58dbbc | timeline: six labelled F2T2EA lanes per threat row, 96 px gutter, 64 px rows (F-15, 3b) |
| 7.7 | done | 38e0e8f | top bar: run-done note stays until Results or a user edit; sweep progress as test points done of total (FR-03, FR-09) |
| 7.8 | done | 76e4d98 | commands: "Measure from here" shows `M` through a display-only `shortcutFrom` (1a) |
| 7.9 | done | 0540850 | report: asset positions from the site in the factor table and scope of inference; simulation limits generated from the vignette (FR-02, 6b) |
| 7.10 | done | 5f8cf3b | results: value and limits print apart, up to 4 decimals; sweep y-axis title `<ID>, <unit>` (FR-06, FR-08) |
| 7.11 | done | 1be3e17 | library: a template copy saves after its first edit, not on open (FR-07) |
| 7.R | done | cabd251 | `reviews/phase-7-fixes.md`: 0 blockers, 3 majors (hover limit stated three times, non-DroneScore measure names in template text, 4-decimal float noise), 11 minors, 6 notes; 26 screenshots; FR-01 to FR-09, 1a, 3b, 3c confirmed fixed in the browser |
| 7.F | done | 6d3ac25 | 17 fixed; F-11 (Swarm start stack, inspector header) and F-19 ("at the site" wording) partial; F-18 stands by design; 7 browser screenshots (`reviews/phase-7-fixes/after-7F-*.jpg`); 526 tests |
| 7.G | done | bdbd9b9 | 7.F follow-ups: inspector "n of m" header while cycling a stack and Swarm starts 420 m apart (F-11); "at the site" for a zero offset (F-19); sweep note in `src/state/runs.ts` (F-12); small-area label obstacle tests; report limits state the logistic width and minimum range losses, delta wing note no longer repeats the altitude limit; 9 browser screenshots (`after-7G-*.jpg`); 536 tests |
| 9.1.1 | done | 22c891d | Archivo and JetBrains Mono bundled from `@fontsource` (400, 500); legacy type and layout tokens in `src/styles/tokens.css` with the MVP palette kept; `src/ui/Icon.tsx` over Lucide; entry 80.8 kB gzip; 538 tests |
| 9.1.2 | done | 0613db2 | domain v6: `planes`, `events`, `snapshots`, `cards`, `debrief`, `Threat.group`; stamp `profile-studio/6`; v5 to v6 migration inside `parseVignette`; legacy v4 import keeps planes, events, snapshots, cards, data list, debrief and collection (as `site.name` when empty); nine fixture round-trips; 552 tests |
| 9.1.4 | done | 5c03126 | Library ported from `51-panel-collect.js`: grid by site, search, New split button (instant "Untitled profile", templates Blank last), inline delete confirm with undo, `exportLibrary`; `libraryCommands` exported, registered after 9.1.3; "profile" wording in Results, Report, runs; stored v5 records migrate on load; 564 tests |
| 9.1.3 | done | 875d920 | shell ported from `app.css`, `51-panel-topbar.js`, `90-app.js`, `46-keys.js`, `51-panel-help.js`, `51-panel-dialog.js`: five workspaces, top bar with New split button and inline rename, workspace-scoped key table (spec section 8 wins over legacy keys), sheet generated from the registry, export and import dialogs, theme cycle under `profileStudio.ui`, undo toast; stubs with a reason for every later-lane key; `profile.new` and `profile.newFromTemplate` wired from the Library after merge; 584 tests |
| 9.1.R | done | 80d15fa | `reviews/phase-9.1.md`: 1 blocker (route request never cleared, every link bounced to Build), 3 majors (name focus re-fired, dialog import did not refresh the Library, I \ R keys had no effect), 12 minors, 9 notes; 26 browser screenshots; budgets pass (entry 56 kB gzip JS) |
| 9.1.F | done | e95557a | F-01 to F-23 fixed (F-07 and F-09 partial by decision; F-23 passed on recheck): requests consumed once, one import and export path in `library/io.ts`, Build panels bound to `ui.panels`, R a stub until 9.3.2, "profile" wording, `PROF-n` ids, Library header and caps groups, disabled-key toast, item 12 e2e; 591 tests, 13 e2e |
| 9.2.1 | done | d31b604 | `src/engine/derived.ts`: the legacy derived object from `Preview`, keyed by display id, F2T2EA `stages` with a `ladder` alias; `at`, `tokens`, `envelopes`, `trackLine`, `crossings`, `stops`, `rangeSeries`; all nine fixtures pass field for field and on the `at` and `envelopesAt` samples; `derived()` 9.9 ms at 40 x 15; `flown` waits for 9.3.3; 622 tests |
| 9.2.2 | done | d428464 | `src/board/` ported from `40-cameras.js` to `44-render.js`: `toScene`, three cameras (Elevation From asset and Along path; axon orbit 0.45 and 0.35 deg/px, pitch clamp 8 to 86, the hint), 12 layers each with `inputs`, `render.scene` with per-layer fragments, `card`, `hitTest`, `board.css` on MVP tokens; byte parity with the legacy renderer in node over every seed and camera; 0.9 to 1.3 ms per full render at 40 x 15; 106 tests; merge check 7803ac0: `DerivedView.first` allows null, adapter-to-board render test; 729 tests |
| 9.2.3 | done | 6c04b36 | rail from `51-panel-rail.js` (spec groups with add buttons), quick-add palette on the shared `Palette` (A, S, V, E, Shift+F, formation popover, `useQuickAdd.boardArmed` for event placement), target menu per kind (`openTargetMenu`, `TargetMenu`; card items stubbed until 9.4.1; `setEventWarnings` idle until 9.3.1), tip at 400 ms with edge flips; commands exported per folder, registered in 9.2.6; 23 tests; four parity pairs; 752 tests |
| 9.2.4 | done | 8b0c287 | inspector replaced from `51-panel-inspector.js` (fields per kind, waypoint and vertex tables, profile block with the questions and hypotheses block, `eventWarnings` returns `[]` until 9.3.1); readout from `51-panel-readout.js` (`useReadout` with `pin`, `clear`, `setDragBaseline`; "Margin +0:12 (-0:04)"; interim preview source until 9.2.6 rewires it to `derived.at`); declared losses: class, datum, sensor bottom, top and status, effector rmin and elevation; 762 tests |
| node-fov | done | 3edda0a | fix from the 9.2.2 merge check: v6 `Node` carries `fovDeg` and `bearingDeg` (legacy default 0, a zero-width sector; 360 is the full ring); `importLegacyV4` keeps them, stored records default on parse without a stamp bump, `toScene` maps them, the render-test patch is gone and byte parity runs on the imported record alone; the inspector shows the two rows for nodes as legacy does; SURR-001 TM-1 now draws as a full ring; 765 tests |
| 9.2.5 | done | a6a702a | `src/features/build/board/` ported from `51-panel-board.js` and `45-tools.js`: `Board` mounts one `<g>` per layer and rewrites only changed fragments (ticks rewrite the `t` layers only), `useBoard` store (camera, ruler, placing, snap, pointer), select and stack cycle, drag with the pre-drag ghost and `setDragBaseline`, pan, pinch, wheel zoom at the cursor, axon orbit, right-click and 500 ms long press to `openTargetMenu`, ruler, placement with snap (rings, vertices, edges, 15 degrees, Alt) and ghost labels, `boardCommands` (G, =, -, nudge); `handles.ts` unchanged; 16 tests; tick 3.5 ms, drag step 0.5 ms at 40 x 15; five parity pairs; merge check: node placement carries fovDeg and bearingDeg; 781 tests |
| 9.2.6 | done | 17920d1 | Build wired from the rail, board, readout panel, inspector and the MVP timeline (kept until 9.3); rail, palette, menu and board commands registered in place of the stubs; one Escape owner (`app.escape`, nine steps); readout on `boardDerived(v).at`; `previewOf` passes group keys; `map/`, `assets/`, `profile/` and `maplibre-gl` removed (offline uninstall, 23 packages, nothing fetched); Thumbnail and MapSnapshot on `src/board` thumb mode; e2e helpers and five specs repointed; units deduped into `tokens.ts legacyUnits`; `src/board` ESLint fence; Elevation gate fixed to `needDoc`; entry 131 kB gzip; 82 unit files, 713 tests, 13 e2e; eight parity pairs |
| 9.2.F1 | done | 24a5a13 | root causes: sticky camera bounds in `useBoard` (an add or drag no longer refits Plan or 3D; Fit or a new profile recomputes; a deliberate deviation: legacy `44-render.js:71` recomputes every render); Elevation opens From asset with `view.elevationMode` and a bar control; `time.cursor` (T) replaces the 9.3.2 stub with `ui.timeOn`, off by default, turned on by scrub, play, the step keys, Home and End; e2e 12-02 and 12-03 read positions in the original geometry again; 721 tests |
| 9.2.F2 | done | 91ab1f6 | hygiene: `ladder` alias removed from `derived.ts` (the parity test rebuilds rungs from `stages`); redundant stack subscription removed from `gestures.ts`; `board.css` scoped under `:where(svg.board, svg.chart)`; palette labels "Delete height plane", "Delete event", "Delete card" (the menu keeps "Delete"); readout follows `useBoard.ref` and prints "at t+0:30"; perf spec selectors repointed; Prettier run on 19 files that predated the lanes; 722 tests, entry 131.7 kB gzip |
| 10.1 | done | 59eb86f | the cut: `src/engine/sim` (81 files), `adapter`, `run`, `score`, `sweep`, `headless.test`, `src/workers`, `runs.ts`, Results, Report, the Run button and notes, the hypotheses and chain time blocks, run and sweep commands, recharts (offline uninstall, 37 packages), seven e2e specs; three workspaces, `/results` and `/report` redirect to Build; v6 run fields kept `@deprecated` so stored records parse; spec sections 1, 4, 6, 7, 8, 11, 12 and the principles amended; 129 files deleted, 52k lines; 49 unit files, 436 tests, 6 e2e; entry 708 kB raw, 229 kB gzip (the former lazy `ui` chunk now sits in the entry; the three chunks of 9.2 summed 363 kB gzip) |
| 10.2 | done | bc04039 | the whole-scene inspector from the mockup (Purpose, Aircraft, Paths, Systems, Volumes, Reference planes, Events, Telemetry, Data products, Measures of performance, Site): every object under its section, the selected row expanded, a row click selects on the board, one undo step per field (coalesced focus to blur, Escape reverts), FOV clamped 1 to 360, the DroneScore picker with 67 rows; ProfileForm, forms and fields deleted; Class waits for 10.5; 49 unit files, 434 tests; pair `reviews/phase-10/10.2-*.jpg` |
| 10.3 | done | d3475f6 | the Build bar from the mockup (view segment, Add waypoints toggle, five layer toggles over the chip layers, Save as card, one-line readout), the scrub (Time checkbox, full run, event beads), two camera thumbnails; the MVP timeline and the readout panel deleted; `card.save` (C) and the six card menu commands real; `view.ref` in the palette; 12-04 repointed to the events layer; 48 unit files, 428 tests; pair `10.3-*.jpg` |
| 10.4 | done | 6d4787a | the Brief workspace (card strip, stage with "n of m · id", caption, Previous and Next, notes panel, Add card from current scene), Build view stashed on entry and restored on exit, Brief keys as commands scoped to `brief`, print stylesheet one page per card, lazy route (Brief chunk 3.3 kB gzip); e2e 12-19; 53 unit files, 463 tests, 7 e2e |
| 10.W | done | c1eab13 | wiring after 10.2 to 10.4: `card.save` inserts after the Brief's current card; one card id minter (`ids.ts` kind `card`); the Brief's applyCard and layer groups read the Build cards and bar modules; Shift+1 to 5 flip the five toggles; 52 unit files, 453 tests, 7 e2e; entry 717 kB raw, 232 kB gzip |
| 10.5 | done | 7996d4b | schema v7 (`collection`, `class`, `version`; run fields and the extra `report` fields dropped; v5 and v6 migrate in `parseVignette`; legacy v4 maps `collection`, `cls` and `v`); `version` rises once per committed edit outside history; export carries `timed` [x, y, z, arrive, depart] per path, import strips it and refuses the mockup's `profile-studio/3`; Library grouped by collection, first-card thumbnail, the line "id vN · class · n cards · n paths", search over class and collection; inspector Purpose gains Class and a Collection datalist; template classes; spec section 5 keeps `report.truth`; 52 unit files, 463 tests; pair `10.5-*.jpg` |
| 10.6 | done | 805db63 | the warm paper and graphite palette in both themes (mockup `:root` wins over `legacy/css/tokens.css` where they differ: hostile #d43725), affiliation ink tokens on the board classes, controls 28, 26 and 24 px (`--ctl-seg`), Kbd and Tooltip on the type scale, top bar wraps under 900 px with the mono id, one Inspector landmark, dark blocks screen-only so print reads the light values, Systems row swatch, Showcase `run.run` removed; `--text-subtle` #7b7d73 measured 3.84:1 on the panel (user decision pending); pairs `10.6-*.jpg` light, dark and the 800 px bar |
| 10.W2 | done | c4e843b | the top bar shows "PROF-1 v3" from `version` |
| 10.R | done | ac28e3d | `reviews/phase-10.md`: 0 blockers, 3 majors (3D drag on a sensor orbits with no edit prompt; event labels lose the declutter to track datablocks, so a focused event has no label on the Brief stage; the perf spec stops at the inspector Range field and still watches the removed timeline), 9 minors, 21 notes; acceptance 2 to 25 pass except item 13 (the drag prompt) and item 21 (partial); first-use walk met in 5 actions; budgets pass (entry 224.7 kB gzip, 60 fps ring drag, 20-page PDF 162 ms); 76 browser screenshots `R-*.jpg` |
| 10.D | done | 474b20a | user decisions from the review notes: "Envelopes" kept (N-05, skill note added); `--text-subtle` #696b61 in the light theme at 4.97:1 (N-04) |
| 10.F | done | 130ca87 | all 12 findings fixed and 8 notes closed: the 3D drag prompt "Edit in Plan (1) or Elevation (2)" (item 13 passes), focused and event labels lead the declutter (legacy byte parity kept through per-finding source patches in `render.test.ts`; 34 snapshots updated), the perf spec runs to the end with every section 11 budget met headless (SwiftShader) and headed (M4 Pro), user-worded disabled reasons, five dead panel toggles and `stripTab` removed, MAX RG and the zero tick, rail names wrap, "full run" on one line, print hides the toast, Brief mini buttons, DE rings in the ew ink, hover to surface-3, `Swatch` friend and neutral, `Field.list`, Undo names its step, Library thumbnails edge to edge, `readout/store.ts` deleted; 52 unit files, 465 tests, 7 e2e; entry 717 kB raw, 231.9 kB gzip; nine `after-10F-*.jpg` |
| 10.F2 | done | 20694b7 | Enter in an inspector field blurs the input after the commit, so the next Cmd+Z is the app's undo, not the input's native undo (the 10.F follow-up); 52 unit files, 466 tests, 7 e2e; entry 231.9 kB gzip |
| 10.M | done | main | phase 10 approved by the user on 2026-11-01; `rebuild/mvp` merged `--no-ff` into `main` with the phase 11 plan and this handoff; the gate run on `main` |
| 11.1 | done | 2aba1a0 | small defects: the selected inspector row in the rule tone; `.ps-strip` rules gone; a ring press on an unselected system drags its range and selects it (principle 2.3 over mockup line 443); cards keep the Build pan and zoom, a 3D card keeps the fitted frame and the toast says so; Add waypoints appends to the selected path (`placing.pathId`) and starts a new threat only when none is selected; one listing read per screen with a parsed-record cache in `persist.ts`; the Elevation max range label clear of the top tick; "Max range" replaces "MAX RG", "C2 and TSPI" kept (user poll); two parity patches in `render.test.ts`; 54 unit files, 476 tests, 7 e2e; entry 232.48 kB gzip; 13 screenshots `reviews/phase-11/11.1-*.jpg`; open: the board hint in append mode still says "place the start waypoint" (`gestures.ts` hintText), for 11.F |
| 11.2 | done | 9122b24 | Geist and Geist Mono (`@fontsource/geist`, `@fontsource/geist-mono` 5.3.0, OFL) replace Archivo and JetBrains Mono: the user picked from the shortlist of four (Geist, Instrument Sans, Manrope, Recursive) on `reviews/phase-11/type-choices.html`, the one approved download; old packages uninstalled offline; `base.css` imports and `tokens.css` families; tabular figures confirmed at 12 px (tnum takes effect); x-height 0.530 against Archivo 0.526 and Geist Mono 0.530 against JetBrains Mono 0.550, no size step crosses half a pixel, so the five sizes and line heights stay; `--strip` and `--spacing-strip` removed with their last user; principle 5.9 amended (spec section 7 names no family); 52 unit files, 466 tests, 7 e2e on the lane; entry 231.86 kB gzip, 100 kB of woff2 outside the entry; 13 screenshots `reviews/phase-11/type-before-*.jpg` and `type-after-*.jpg` |
| 11.R | done | 4d340b5 | `reviews/phase-11.md`: 0 blockers, 2 majors (every reach element carries the range role, so a press on a sector edge, the min range ring or a limit ray sets max range to the press distance; `render.card` drops the card's zoom and centre, so the Brief stage, thumbnails and print draw every card at the fitted frame), 5 minors (the append hint, the leg readout left by Escape, the 3D note in a toast only, the `offGlyph` tolerance, "fitted 3D frame" wording), 10 notes; the Geist lane clean in light, dark and print; ring drag, selected row, append, Library thumbnails and the entry budget pass; 28 screenshots `R-*.jpg` |
| 11.F | done | 23d7e2b | all 7 findings and N-05 fixed: the range role only on the max range ring (`data-role="range"` in `reach.ts`, `Hit.part` in `hitAt`, the arc test in `beginDrag`; a press on a sector edge, the min range ring or a limit ray selects and starts nothing); the card's zoom and centre in `CardRec.cam`, drawn by `render.card` on the Brief stage, the strip thumbnails and print, 3D cards keep the default view; the append hint names the path and the leg readout shows after the first point; Escape ends an append and clears the readout; the 3D note in the strip line, the toasts without "fitted"; `offGlyph` on the `hitAt` tolerance with the touch flag; `saveVignette` and `deleteVignette` keep the cached listing current; four parity patches; 54 unit files, 481 tests, 7 e2e; entry 233.04 kB gzip; seven `after-11F-*.jpg`; open: the Library thumbnail draws the first card at the fitted frame (`scene.ts` has no frame); the Elevation limit rays are covered by code only |
| 11.M | done | main | phase 11 merge into `main` approved by the user on 2026-11-01; `rebuild/mvp` merged `--no-ff` into `main` with this handoff; the gate run on `main`; both branches pushed on 2026-11-01 |

## 8. Handoff

State on 2026-11-01, end of the eleventh session. Phase 11 is done, approved for the merge and
merged into `main` and pushed (section 7, row 11.M). `rebuild/mvp` and `main` hold the same tree: lanes
11.1 and 11.2, the review 11.R and the fix lane 11.F, with the gate green: 54 unit files, 481
tests, 7 Playwright specs on `vite preview`, build; entry 720 kB raw, 233.0 kB gzip (budget
300); 100 kB of Geist woff2 outside the entry. The type is Geist and Geist Mono (section 1,
"Typeface"); the two packages were the one download of the session. Tag `pre-pivot` (d1f56d1)
holds the last head with the run and score code. No lane is in flight; no worktree exists.

**The product.** A polished version of the v3 mockup `legacy/mockup-v3.html` (served at
`/legacy/mockup-v3.html`): three workspaces (Library, Build, Brief), one board with three
cameras, a whole-scene inspector, cards and a brief. It plans tests as interactive mockups; it
does not run them. The mockup is the parity oracle; the legacy v4 app at `/legacy/index.html`
is a source of parts.

**Decisions.** Section 1 has all of phase 10 and the three of 2026-11-01 that open phase 11:
phase 10 approved and merged, the typeface direction, the scope hold.

**Next.** No phase is open. The plan ends at phase 11; the held list (section 6, "Held for
product complete": the vos port, the dropped domain fields, the phase 10 deferred list) and the
review notes below return only when the user asks. The next session starts by asking the user
which of them, if any, opens phase 12, and writes that phase into section 6 before any lane.

**Orchestrator prompt.** Paste this to start the next session:

```text
You are the orchestrator for Profile Studio at /Users/caseytalbot/Projects/profile-studio,
branch rebuild/mvp. Read CLAUDE.md, docs/design-principles.md, docs/spec.md, then docs/plan.md
sections 1 to 5, phases 10 and 11 in section 6, then 7 and 8. Start the dev server from
.claude/launch.json ("dev", port 5174) and use the product at / beside the mockup at
/legacy/mockup-v3.html for ten minutes. Run `npm run gate` to confirm the baseline: 54 unit
files, 481 tests, 7 Playwright specs, build.

No phase is open. Ask me, with a poll, which of the held items (section 6 "Held for product
complete") and the section 8 open items opens phase 12, then write the phase into section 6
with lanes, owned files and budgets before any lane starts. Plan section 5 rules apply: one
worker per lane in a worktree under .worktrees/<id>, workers do not commit, gate and git diff
--stat before each --no-ff merge, gate on rebuild/mvp after, worktree removed, sections 7 and 8
updated. Put every decision to me with the poll tool as soon as it is known.

Ask me before any download (npm install included), any push, and any merge to main.
```

**Brief shape for lanes.** Working directory (`.worktrees/<id>`); the lane text from section 6
verbatim; the mockup lines to port, read whole before writing; the renderer contract and the
owned-file rule (section 6, phases 0 to 9); the files it must not touch; the spec sections it
serves; the gate (`E2E_PORT=<port> npm run gate`); the entry budget (300 kB gzip); the pair of
screenshots (mockup and port) and where they go; the report shape (what changed, every
difference from the mockup with its reason, tests added, what is open, the measured entry
size, screenshots); the time budget; the lanes running in parallel and their folders.
User-facing text in the `stat-te-terminology` vocabulary and the principles' words (profile,
card, Elevation, 3D).

**Lessons from phase 10.** Two parallel lanes that each delete a stub assertion in one test
file conflict at the merge (`workspaces.test.ts`, 10.3 and 10.4); give one lane the test file
or tell both which lines are theirs. Two lanes that need the same small module (the card
record from the Build view, the five-layer table) each write one; the wiring commit after the
merge keeps one and points the other at it. A renderer change for a finding breaks the byte
parity with the legacy renderer; `render.test.ts` keeps parity by patching the legacy source
per finding (`PHASE_10_DEVIATIONS`), so every other byte is still compared. Workers drive the
mockup and the port with Playwright scripts, never with the orchestrator's browser pane. The
derive fixtures in `fixtures/legacy-derive/` have the shape `{derived, input, samples}`; the
legacy v4 record is `input`. A required field added to `Vignette` breaks every literal outside
`src/domain`; the lane that adds one fixes the literals on its branch (10.5 did). Two lanes
that add a control with the same accessible name break the e2e selectors; name controls per
screen. A legacy or mockup claim in a worker report is checked against the file and line (rule
14).

**Lessons from phase 11.** A worker that decides against a mockup line on a principle (11.1
item 3) needs the hit model stated in the brief: the lane gave the range role to every reach
element because they all carry `data-k="system"`, and the review found the sector edge press
(F-01). A plan item that says "store" a frame is read as store only; say "store and draw"
(F-02). A specimen page at `reviews/phase-11/type-choices.html` (Google Fonts at view time,
nothing installed) let the user pick a typeface before any download; the plan's step 3
specimens per candidate were not needed.

**Approvals on record.** 2026-10-30: the phase 0 commits, the first phase 1 commit, three
merges to `main` with pushes, the Playwright Chromium download. 2026-10-31: the install of
`@fontsource/archivo`, `@fontsource/jetbrains-mono` and `lucide-react`, `npm ci` per worktree,
the push of the phase 9 plan. 2026-11-01: the pivot (phase 10), decision 1 ("Delete it"),
decision 3 ("Yes, warm palette"), the kickoff prompt (decisions 2 and 4; lanes 10.2 to 10.F
with their commits and `--no-ff` merges into `rebuild/mvp`), "Envelopes" kept, the hint grey
darkened to AA, phase 10 approved, two pushes of `rebuild/mvp`, the merge into `main` and its push; no install. Later on 2026-11-01 (phase 11): the two
word choices ("C2 and TSPI" kept, "Max range"), the download of `@fontsource/geist` and
`@fontsource/geist-mono` (the user's pick of Geist from the specimen page
`reviews/phase-11/type-choices.html`), the merge of phase 11 into `main`, the push of both branches.

**How to run a lane.** `git worktree add .worktrees/<id> -b lane/<id> rebuild/mvp`, then
`npm ci --offline` there (stop and ask if it tries to fetch). Parallel lanes each run the full
gate with their own preview port: `E2E_PORT=<port> npm run gate` (5181 to 5186 were used; dev
servers for pairs on 5191 to 5197). The worker does not commit. The orchestrator runs
`npm run gate` in the worktree, commits on the lane branch, merges with `--no-ff` into
`rebuild/mvp`, runs the gate there, removes the worktree and deletes the branch, then updates
section 7. Workers are picked by `~/.claude/rules/delegation.md`.

**Open items.** Each came from a worker report or a review. The lane 11.1 items are closed
(section 7). Left from the phase 11 review (`reviews/phase-11.md`, notes): N-02 Add waypoints
arms the selected threat in Elevation and the first click there says "Press P to add in Plan";
N-03 a 3D card drops the axon zoom as well as the pan (the camera has a zoom; keep it if the
user wants); N-04 "Max range" at range 0 sits in the height tick column, legible but crowded;
N-06 the parsed-record cache keys on `updated`, so an import that keeps id and `updated` but
changes content draws the old thumbnail; N-07 numbers in the Geist text voice are proportional
(waypoint numbers, the "Max range" box, labels such as "Loiter 60 s"), every numeric column is
Geist Mono and tabular; N-08 Geist draws capital I and lower-case l as bare strokes, no id is
set in the text voice; N-09 board marks at 7 and 8 px ask for weight 700, which is not bundled,
so the browser synthesizes it from 500; N-10 live sizes off the five pairs (11/14.67 rail mono
columns, 12/15 rail names, 13/13 top bar buttons, 11/18 rail group heads, 12/18), for a type
pass. From 11.F: the Library thumbnail draws the first card at the fitted frame (`scene.ts`
carries no frame); the Elevation limit rays are covered by code only, no test presses one.
Left from the phase 10 review: N-10 (data product React keys are indexes), N-21 (the mockup's
stage renders pushed down in headless capture). The perf spec does not measure
the deck PDF (the review timed 20 pages at 162 ms by hand) or a long-task quiet window for
"interactive"; preview latency is taken at the DOM mutation.

From lanes 10.2 to 10.6:
- The inspector leaves out `chainTime` (still read by `preview.ts` and `derived.ts`), the
  sensor `model` and the asset `entered` fields (still live in the domain; the templates write
  them), a path Id and Speed field, and the event system select (`sensorKey`). Each returns
  only when the user asks.
- The Build bar wraps Save as card and the readout to a second line at 1440 px; the mockup
  does the same.
- The Elevation camera never reads the sticky bounds, so an add in Elevation still rescales the
  axis (inherited from 9.2).
- `metricsCfg.dLink` is dropped on legacy import. `Area` has only `pts`; circles draw as
  polygons and the inspector guesses a circle at 16 or more vertices.
- `importJson` refuses records with no schema stamp and the mockup's `profile-studio/3`.
- IndexedDB itself is untested (no `fake-indexeddb`); `LibraryScreen` calls `listVignettes` and
  `loadVignette` with no catch. A template copy is saved 500 ms after its first edit. Duplicate
  and template copies take `PROF-n` ids (user, 2026-10-31). `exportLibrary(current)` does not
  add an open profile that was never saved.
- Legacy import sets site lat and lon to 0 and keeps the MOP text as a question note (mapping
  free text onto DroneScore rows would invent measures, principle 1.1).
- Preview semantics: Assess is unclipped; Engage without a Target falls back to first effector
  reach. `derived.ts` `flown` is empty (the debrief overlay is deferred).
- The root `package.json` stays CommonJS so `legacy/test/smoke.js` runs; Vite and Playwright
  configs are `.mts`. `e2e/perf/budgets.spec.ts` runs outside the gate:
  `npx playwright test -c e2e/perf/playwright.perf.config.mts`, `PERF_HEADED=1` for the GPU run.

**Known problems for the team.**

1. Ports and the browser. Port 5173 is the user's rangeboard dev server; use
   `.claude/launch.json` "dev" (`npm run dev -- --port 5174 --strictPort`) for browser checks.
   Playwright serves `vite preview` on 5175 and the perf spec on 5177. Playwright cannot drive
   native HTML5 drag; use click-to-arm then click, or synthetic drag events, and say so in the
   report.
2. The internet. The user does not allow downloads without asking. Sources are local in
   `~/Desktop/MASTER/VALKRYN/`. `npm ci --offline` and `npm uninstall --offline` work from the
   cache; a worker stops and reports if npm tries to fetch. The mockup links Google Fonts; the
   port bundles the same families, so no fetch is needed.
3. DroneScore wins over C4 (`docs/reference/jiatf-401.md` section b).
4. rangeboard (`~/projects/rangeboard`) and vos are read-only.
5. Words. User-facing T&E text uses the `stat-te-terminology` skill ("Envelopes" is an allowed
   exception for the board layer).
6. Autosave writes to IndexedDB for `localhost:5174`; clear site data between browser checks
   when it matters. The legacy app and the mockup keep their own storage (`profileStudio.v3`
   in localStorage for the mockup) and seed CUAS-001.

**Pruned on 2026-11-01 for this handoff.** The phase 11 kickoff text and the lane 11.1 open
list (closed in section 7); `git show 5bb3922:docs/plan.md` has them. Earlier prunes:
`git show 0b216e2:docs/plan.md` has the section 8 before 10.F.
