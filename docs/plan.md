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
| Phase 13 | The four readings of the user's request (section 6, phase 13: persisted time state per profile; one selection and hover across strip, board and inspector with a Cards row; a card is a frame or a slice with a Frame panel; one glyph vocabulary with state colour) confirmed by poll; the merge of `rebuild/mvp` into `main` approved, no push | User, 2026-11-01 |
| Phase 14 | KML and KMZ import approved ("Write phase 14 and approved to begin. Keep it simple, clean, minimal, but fully capable and intuitive for the user"); a new `range` area kind; the sample files stay out of the repo; the six readings in section 6 stand until the user says otherwise | User, 2026-11-02 |
| Site origin (14.R F-01) | A site file whose centre lies more than 50 km from the profile's site moves the site to the file's centre in the same undo step, and the toast says so ("Move the site to the file"; the alternatives were to refuse with one sentence, or to let the first file always set the site) | User, 2026-11-02 (poll) |
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
5. Each lane works on branch `lane/<id>` from `main`. The orchestrator merges in plan order,
   then runs the gate once on `main`. (`rebuild/mvp` was the work branch through row 14.M; the
   user collapsed the repo to `main` alone on 2026-11-02 and the branch was deleted, local and
   remote.)
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

### Phase 13. The timeline as the plan's clock, the Brief as the teaching space (opens 2026-11-01)

The user's request of 2026-11-01, late: "Comprehensively upgrade the timeline and briefing
features and capabilities. The timeline should be persistent and the linking feature between the
plan, which builds the timeline, profile, geometry, events, objects, and overall plan. The brief
allows for the teaching of it, and should be a space where any individual frame or slice of the
planned event can be assessed, observed, analyzed, and taught. The timeline in the brief should
be as robust as the plan (because it's the time). Include glyphs, color distinction, iconography,
and a high level of polish." Rows 12.1 to 12.4 built the shared strip; this phase makes it the
plan's clock and makes the Brief teach from it. Section 5 rules apply. Lanes branch from
`rebuild/mvp` as `lane/13.x`. The orchestrator's readings of the request, each an assumption
on record until the user says otherwise:

1. Persistent: the time state of a profile (the cursor, time on, the loop, the zoom span, the
   strip height and the rate) survives a workspace switch and a reload. It is interface state
   (not an undo step, not in the record) kept per profile id in localStorage beside the theme.
2. Linked: the strip, the board and the inspector share one selection and one hover in both
   directions. A press on a strip row selects the system; a press on a key point glyph sets the
   time and selects the system that gives the step; the board's hover of a system lights its
   rows. The deck sits on the time axis: a Cards row draws each card at its time, so the plan,
   its events and its cards read on one clock.
3. Frame and slice: a card is a frame (a time) or a slice (a time range with a rate, the
   `Card.clip` field of spec section 5, no longer deferred). The Brief shows what is true in
   the frame: the step each threat has reached, its next step, its range and height, who holds
   it, the engage margin and the time to the defended asset; for a slice, what happens inside
   it. The strip in Brief has every Build control except the edits (a bead drag).
4. Glyphs and colour: the seven glyphs of lane 12.4 are the one vocabulary for a key point on
   the strip, the board and the notes panel. Colour means state (principle 5.2): a reached key
   point in the text ink, the current one in the accent, a future one dim. No new colour.

#### 13.1 The strip: persistence, linking, the Cards row, state colour (`opus-high`, 5400 s)

Owned: `src/features/timeline/*` (new files allowed; split `Timeline.tsx` when a part is
separable, for example the play bar, the lane svg and the axis), `src/state/ui.ts`, a new
`src/state/timePersist.ts` with its test, the bind site in `src/App.tsx` (beside `bindTheme`).
Exports `timelineCommands` from `src/features/timeline/commands.ts` (registered by 13.W; until
then the strip's menu lists the ids and 13.W wires them).

1. Persistence. `timePersist.ts`: load and save `{tS, timeOn, loop, tview, tlH, rate}` per
   profile id under `profileStudio.time` (one JSON object keyed by id, the newest 50 ids kept)
   through the same guarded `Storage` pattern as `shell/theme.ts`. Bound in `App.tsx`: restore
   when the document id changes, save on each change of those fields (debounced 250 ms). A
   missing or bad entry leaves the defaults. The Build stash of Brief still restores the Build
   time on exit (12.3); persistence sits under it.
2. Linking. The row of a system (the pill, its id, its bars) is a press target: a press selects
   the system (`ui.setSelection([sys.key])`), hover sets `ui.setHover(sys.key)`; a row whose
   system is selected or hovered draws its label in the accent and its bars at full opacity
   while the others stay. A press on a key point glyph sets the time to the point and selects
   the system that gives it (its `system` id's key; a DA glyph selects the threat). The lane
   header press keeps selecting the threat. Both work in Build and Brief. The selection and the
   hover of a system on the board or the inspector light its rows on the strip (read
   `selectedKeys` and `hoverKey`; a system's rows appear under each threat it sees).
3. The Cards row. Under the DA row (above the first lane): one row, 14 px, labelled "Cards" in
   the gutter, with a marker per card that has a time: a 12 px rounded square in the surface
   fill with the card's number (1-based position in the deck) in the mono mark size; a card with
   a slice draws a 6 px band from `clip.t0S` to `clip.t1S` under its marker at `t0S`. The
   current card (`ui.cardKey`) draws in the accent. A press in Brief sets `ui.setCardKey(key)`
   (the Brief applies it); a press in Build sets the time to the card's time (and the loop to
   its slice when it has one). A card without a time draws nothing. The title names the card.
4. State colour. The glyphs of a lane read the time cursor when time is on: a point at or
   before the cursor is reached (the text ink), the latest reached is current (the accent, and a
   1.5 px halo ring), a point after the cursor is dim (`--text-subtle`); with time off every
   glyph draws as today. The same three states in the legend's hover title, not as entries.
5. Brief parity. In Brief the strip keeps every control of Build but the bead drag: the row and
   glyph presses, the loop by Shift drag, the zoom, the overview pan, the grip, the context menu
   with Set time here, Loop from here, Clear loop, Fit run, Fit action, and the two new items
   from `timelineCommands`: `timeline.saveFrameHere` (set the time to the press time, then
   `card.save` through the registry's run; label "Save a frame here") and
   `timeline.saveSliceFromLoop` (label "Save the loop as a slice"; enabled when a loop is set;
   writes the current card's clip in Brief or a new card's in Build through a function 13.2
   exports as `setSlice(key, clip)` in `src/features/brief/cards.ts`; until the merge, call it
   through a dynamic import as `brief/commands.ts` does). The bead stays a press target in
   Brief (sets the time, selects the event).
6. Polish. The lane header carries the step reached at the cursor as a short word after the
   threat id when the gutter has room at the current width ("T1 Track" in the muted ink; the
   gutter grows to 72 px when any lane needs it, `GUT_L` becomes a function of the lanes); the
   cursor time chip gains the step reached of the selected threat ("t+0:10 · Track") when one
   is selected; the row separators stop at the gutter; the play bar's loop select becomes an
   icon button group (Lucide `Repeat`, `Repeat1` for the range, with the tooltip) only if the
   bar stays one line at 1100 px, else it stays a select. Every new mark on the design tokens.

Tests: unit tests for `timePersist` (round trip, a bad entry, the 50-id cap), `buildLanes` with
the Cards row, the glyph state classes, the row press and the glyph press (selection and time),
the Cards row press in both modes. Gate green; the entry budget 300 kB gzip. Screenshots:
Build and Brief at 1440 x 900, light and dark, with the CUAS-001 fixture at t+1:40 and a
selected sensor, under `reviews/phase-13/13.1-*.jpg`.

#### 13.2 The Brief: the frame, the slice, the teaching panel (`opus-high`, 5400 s)

Owned: `src/features/brief/*`, `src/features/build/cards/cards.ts` (applyCard reads the
slice), `src/domain/schema.ts` and `types.ts` only for the `Clip` comment and defaults (no
stamp bump: `clip` is already in v7). Exports `setSlice(key: string, clip: Clip | null)` and
`sliceFromLoop()` from `src/features/brief/cards.ts` for 13.1's commands.

1. The slice. `Card.clip` is live: `setSlice` writes it as one undo step ("set card c2
   slice"); `sliceFromLoop` takes `ui.loop` into the current card (Brief) or a new frame card
   (Build), rate from `ui.rate`, beats empty. `applyCard` on a card with a slice sets the loop
   to the slice, the rate to its rate and the time to `t0S` (time on); on a frame it sets the
   time as today and clears the loop. The notes panel's Card section gains a Slice field: from,
   to (mono, "m:ss", `parseTime` of the strip), rate (the eight rates) and a Clear button. The
   stage head reads "t+0:10 to t+0:40 · x2" for a slice. The strip shows the slice as the loop
   band (12.1 draws the loop; nothing new there). P and Space play the slice from its start when
   the cursor is outside it. Save a frame (C) inside a slice keeps the frame only.
2. The Frame panel. A new section at the top of the notes panel, "Frame at t+0:10" (or "Full
   run" with time off), one block per threat in focus (every threat when the focus names none,
   at most six): the glyph and name of the step reached (the key point at or before t), the
   next step with its countdown ("Engage in 0:12"), range, height, speed and closing speed in
   the display units, the systems that hold it as the strip's pills with ids, the engage margin
   ("margin +18 s", the hostile ink when negative), and the time to the defended asset. A press
   on the next step moves the time there. Reads `boardDerived(v).at` (the readout's source),
   `stages`, `window` and `daEntry`. With a slice, a second list "Inside the slice": every key
   point, authored event and window start or end between t0 and t1, in time order, each a press
   that moves the time. The Readout display keeps the one-line readout under the caption.
3. Key points with glyphs. The Key points section draws the 12.4 glyph before each step
   (import `stageGlyph` from `../timeline/glyphs`) with the state colour of 13.1 item 4 (the
   classes `tl-reached`, `tl-current`, `tl-future`; the strip's stylesheet is imported by the
   strip, which Brief always mounts). The current step reads "now".
4. Teaching aids. Under the stage, the presenter aids line gains the current step of the threat
   in focus as a glyph and word, and "Next: 2 Card 4 at t+1:40" names the next card's time (or
   its slice). The stage caption's empty state in a card reads "Write what the viewer must see
   at t+0:10." (principle 6.1). The print deck prints the frame time (or the slice) under the
   card name and the Frame panel's lines as a small table under the caption.
5. Iconography. The stage head buttons keep Lucide; add `Scissors` for "Set the slice from the
   loop" (runs `sliceFromLoop`), enabled when a loop is set, with the tooltip saying why when
   not. The notes panel section heads carry no icons (principle 5.10: an icon sits beside its
   label; a head is a label).

Tests: `cards.test.ts` for `setSlice`, `sliceFromLoop`, `applyCard` with a slice; a Frame panel
test on the test deck (step reached, next step countdown, the systems, the slice list);
`BriefWorkspace.test.tsx` for the Slice field and the head text. Gate green. Screenshots:
Brief with a frame card and with a slice card, light and dark, under
`reviews/phase-13/13.2-*.jpg`.

#### 13.3 The board: key point marks on the track (`opus-high`, 4800 s)

Owned: `src/board/layers/events.ts`, `src/board/symbols.ts`, `src/board/board.css`,
`src/board/render.test.ts`, `src/board/__snapshots__/*`, `src/board/layers/index.ts` only if a
layer input changes. The renderer contract of phase 9 holds (no React, store or DOM import).

1. The marks. The events layer draws each threat's F2T2EA key points (`derived.stages`, the
   `t` of each step with a value) and its defended asset entry (`daEntry`) on its track at the
   position at that time (`timed` through the engine's `at`, as the first-see ticks do), as the
   same seven glyphs the strip draws (`src/features/timeline/glyphs.tsx` is the geometry: r = 4,
   Find open circle, Fix circle with a 1.5 dot, Track diamond r + 0.5, Target circle with a
   cross, Engage filled triangle, Assess square with a tick, DA a 3 by 9 bar), 1 px stroke in
   the muted ink, the open shapes filled with the board surface, as `symbols.keyPoint(stage,
   sx, sy)`. A mark carries `data-k="keypoint"`, `data-id="<threat id>"`, `data-stage` and a
   `<title>` "T1 Track · 1:40 · RDR-1" (the strip's title text). Marks are not hit targets.
2. State colour at the time cursor (the layer reads `ctx.t`): reached marks in the text ink,
   the current one in the accent with a halo, future ones at 45 percent; with time off, every
   mark in the muted ink. The classes `kp-reached`, `kp-current`, `kp-future` in `board.css`
   on the tokens.
3. Declutter: a mark yields to the datablock and the event beads (the labels layer's declutter
   list is not touched; marks are 9 px and sit on the line). Two marks within 6 px of each other
   draw the later one 10 px along the track's normal. The thumb mode (`ctx.thumb`) draws no
   marks. The Elevation and 3D cameras draw them at the projected point.
4. Parity: `render.test.ts` keeps byte parity with the legacy renderer by the
   `PHASE_10_DEVIATIONS` mechanism (add `PHASE_13_DEVIATIONS` that patches the legacy source to
   emit the same fragment, or exclude the `keypoint` groups from the compared bytes with a
   comment that says why). Snapshots updated. Perf: a full render stays under 1.5 ms at 40 x 15
   (`render.perf.test.ts`).

Report every difference from the legacy layer with its reason. Screenshots: Build Plan,
Elevation and 3D with the CUAS-001 fixture at t+1:40, under `reviews/phase-13/13.3-*.jpg`
(a Playwright script against the dev server on 5193; never the orchestrator's browser).

#### 13.W Wiring (`opus-medium`, 3600 s)

After the three merges. Owns `src/commands/commands.ts`, `src/features/commands/*`,
`src/App.tsx`, `e2e/*`, `docs/spec.md` section 7 and 8, `docs/design-principles.md` items 5.8
and 8.5 and 8.6. Registers `timelineCommands`; replaces 13.1's dynamic import of `setSlice`
with the direct call if the chunk split allows (the Brief chunk stays lazy; if not, the dynamic
import stays and the reason is in the report); the shortcut sheet lists the new commands; one
e2e spec `12-20-timeline.spec.ts` (a row press selects the sensor on the board and the
inspector; the glyph press moves the time; the Cards row opens card 2 in Brief; the time
persists over a reload) and one `12-21-slice.spec.ts` (Save the loop as a slice, the head text,
P plays inside the slice). Spec section 7 Build and Brief and section 8 (menu table rows,
keys) amended; principle 8.6 drops clips from the deferred list and 8.5 names the one glyph
vocabulary; spec section 5 `Clip` loses "deferred". Gate green; entry size reported.

#### 13.R Review and 13.F Fixes

`opus-high` with the browser at 1440 x 900: the four lanes against the spec, the principles,
the four readings above and the mockup; `reviews/phase-13.md`; then the fix lane; then the
user's approval and the merge into `main`.

### Phase 14. The site from a KML or KMZ file (opens 2026-11-02)

The user's request of 2026-11-02: "What would it take for this application to have the
capability to seamlessly ingest kmz files and create the range/area to scale?", then "Write
phase 14 and approved to begin. Keep it simple, clean, minimal, but fully capable and intuitive
for the user." The two sample files (`TST Ranch.kmz`, `UAS Fly Area.kmz`, Google Earth Pro
exports) each hold one Placemark with one Polygon of 19 and 22 vertices, about 690 by 500 m and
340 by 430 m, the fly area inside the ranch with the bounding-box centres 108 m apart (review
14.R N-01 corrected the first text's 270 m). They stay out of the repo (real site coordinates); tests use
synthetic fixtures. Section 5 rules apply. Lanes branch from `main` as `lane/14.x`. The
orchestrator's readings, each an assumption on record until the user says otherwise:

1. Polygons become areas, nothing else. A KML Point, LineString, image overlay, folder tree or
   style is ignored in this phase. A Placemark with several polygons (MultiGeometry) gives
   several areas; an inner ring (a hole) is dropped. The Placemark name is the area label; a
   file with no polygon is an error and changes nothing.
2. A new area kind `range` ("Range area", id prefix `RNG`) holds site boundaries and fly areas.
   It draws as a plain solid outline in the ghost ink with no fill, under every other volume;
   its default top is 0 (a flat footprint, like the asset), and the inspector edits bottom and
   top as for any area. The schema stamp moves to `profile-studio/8`; v7 migrates by stamp only
   (no field changes), and import accepts v8, v7, v6, v5 and legacy v4.
3. To scale: the board is a flat local plane in metres, so one projection serves. East is
   `(lon - lon0) * mE` and north is `(lat - lat0) * mN`, with the metres per degree taken at
   the origin's latitude on WGS84 (`mN = 111132.92 - 559.82 cos 2φ + 1.175 cos 4φ`,
   `mE = 111412.84 cos φ - 93.5 cos 3φ`; review 14.R F-02 amended the equator constants of the
   first text, which were 0.34 percent short in north at 35°) and north as the board's
   positive y (confirmed against `cameras.ts`). At a few kilometres this is exact to well
   under a metre. No library, no UTM, no basemap.
4. The origin is the profile's site. When the site is unset (latitude and longitude both 0),
   or when the file's centre lies more than 50 km from the site (every template carries a
   stand-in site, Blank's is 35.05, -117.6; user decision of 2026-11-02 on review 14.R F-01,
   "Move the site to the file"), the import sets the site to the centre of the file's
   bounding box in the same undo step and the toast says so. Otherwise the file projects
   against the site, so a second file of the same site lands at its true offset from the
   first. The user can still type the site on the Profile tab.
5. Two entries, one function. In Build: a palette command "Import a site file" (group map) that
   opens a file picker, and a KML or KMZ file dropped on the board. In the Library: the Import
   button and a drop accept `.kml` and `.kmz` beside JSON and create a new profile named after
   the file (Untitled profile's defaults, no defended asset, site from the file), then open
   Build. Both call one `importSiteFile(doc, file)` and are one undo step named
   "import <file name>". After the import the imported areas are the selection (the 14.1
   multi-selection), the board refits to show them, and a toast says "2 areas from TST
   Ranch.kmz". A bad file (not a zip, no `.kml` inside, not KML, no polygon) is one readable
   sentence in the toast or the Library message line, and the document does not change.
6. The KMZ reader is local: a zip's local file headers walked in an `ArrayBuffer`, method 0
   (stored) copied, method 8 (deflate) inflated by the platform `DecompressionStream`
   (`deflate-raw`; Chromium, Safari 16.4 and later, Node 22 in vitest). The first entry whose
   name ends in `.kml` is the document. The KML is parsed by the platform `DOMParser`. No new
   dependency; no download.

#### 14.1 The domain: the kind, the stamp, the parser, the projection (`opus-medium`, 3000 s)

Owned: `src/domain/types.ts`, `src/domain/schema.ts`, `src/domain/catalog.ts` (the area
tables), `src/domain/migrate.ts` (the kind list), `src/domain/migrateV5.ts` (v7 to v8 by stamp;
rename allowed), `src/state/persist.ts` (the stamps accepted and written), a new
`src/domain/siteFile.ts` with `siteFile.test.ts`, `src/board/board.css` (`.vol-range`), the
snapshot and schema tests that the stamp and the kind touch, `fixtures/kml/` (synthetic: one
KML with two polygons around a fictional point, and the same zipped as a KMZ with a deflated
entry, built by a script the lane commits beside them), spec section 5 item 4 (the stamp) and
the Area row of the terms table.

1. `range` in `AreaKind`, the zod enum, `AREA_KINDS` (last), `AREA_LABELS` ("Range area"),
   `AREA_DEFAULTS` (`zMaxM` 0, prefix `RNG`), the legacy import's kind list. It appears in the
   rail's Areas group, the quick add and the inspector's kind select with no further code.
2. `.vol-range`: stroke the ghost ink, no dash, no fill, drawn first among the volumes so a
   boundary sits under the asset and the zones (`layers/volumes.ts` keeps the record order; the
   lane sorts `range` first in the layer or states why not). Plan, Elevation and 3D all draw it
   through the existing volume code; the Elevation and 3D prisms work as for any area.
3. The stamp: `SCHEMA` is `profile-studio/8`, `SCHEMA_V7` is the old constant; `migrateV7ToV8`
   restamps; `parseVignette` and `importRecord` accept v8, v7, v6, v5, legacy v4; the library
   export writes v8. Tests: a v7 record round-trips; a v8 record with a `range` area parses; a
   v7 reader's rejection is not tested (there is none).
4. `siteFile.ts` exports: `readKmz(buf: ArrayBuffer): Promise<string>` (the KML text; throws
   "This file is not a KMZ." or "The KMZ has no KML document."), `parseKml(text): SitePolygon[]`
   (`{name, ring: [lon, lat][]}` with the closing vertex dropped and fewer than three vertices
   skipped; throws "This file is not KML." or "The file has no polygon."),
   `localFrom(origin: {lat, lon}, [lon, lat]): [x, y]` (reading 3), `centreOf(polygons)`
   (reading 4), and `siteAreas(doc, polygons): {areas: Area[], site?: {lat, lon}}` that gives
   the `range` areas with ids from `nextId` and labels from the names (the file's stem when a
   name is empty), plus the site to set when the document's is unset. Pure functions; no store.
5. Tests on the fixtures: the KMZ inflates to the KML; both polygons parse with the right vertex
   counts; the projected extent of a 600 by 400 m test rectangle is 600 by 400 within 1 m and
   north is positive y; the origin rule both ways; every error sentence.

#### 14.2 The entries: Build command and drop, Library import (`opus-medium`, 3000 s; after 14.1)

Owned: `src/commands/commands.ts` (the `build.importSite` command and `importSiteFile`),
`src/features/build/palette/commands.ts` (the row, group map, no shortcut),
`src/features/build/board/Board.tsx` (the file branch of `onDrop` and `onDragOver`),
`src/features/library/LibraryScreen.tsx` (accept, the new profile path), the e2e
`e2e/12-27-site-file.spec.ts` (Playwright `setInputFiles` with the KMZ fixture, and a drop via
a `DataTransfer` built in the page), spec section 7 Library and Build lines, section 8 (the
drop), acceptance item 27.

1. `importSiteFile(doc, file)` in `commands.ts`: reads the file (`.kmz` through `readKmz`,
   anything else as text), `parseKml`, `siteAreas`, then one `edit('import ' + file.name)` that
   pushes the areas and sets the site when given; then `setSelection(keys)`, the board refit
   (`fit()` in `features/build/board/tools.ts`), and `showToast('n areas from <name>')`.
   Errors go to the toast as the thrown sentence. Not a command id by itself; the command
   `build.importSite` ("Import a site file", `when` needs an open document) opens a hidden
   file input (`accept=".kml,.kmz"`) and calls it.
2. The board drop: `onDragOver` accepts `Files` too; `onDrop` with a file whose name ends in
   `.kml` or `.kmz` calls `importSiteFile` and returns; the asset payload branch is unchanged.
3. The Library: `accept=".json,.kml,.kmz,application/json"`, label "Import file"; the drop too.
   A KML or KMZ makes a new profile through the New path (name the file stem, no defended
   asset), opens Build, then `importSiteFile`; the Library message line reports the count or
   the error. JSON import is unchanged.
4. The e2e: open the Library, import the KMZ fixture, expect Build with two `range` volumes
   (`.vol-range` count 2), the inspector "2 selected", the toast text, the grid labels showing
   the fitted extent; undo removes both; drop the KML fixture on the board and expect the areas
   again at the same place (the site is now set, so the second import lands on the first).
5. Spec: the Library line lists KML and KMZ; the Build interaction list gets "Import a site
   file"; acceptance 27: "A KML or KMZ file with polygons, imported from the Library or dropped
   on the board, draws each polygon as a range area at true scale about the site; two files of
   one site land at their true offset; one undo removes an import."

#### 14.R Review and 14.F Fixes

`opus-high` with the browser at 1440 x 900: the two lanes against the spec, the principles and
the six readings above, with the two sample files from the user's Downloads imported by hand
(not committed) to confirm the scale and the offset; `reviews/phase-14.md`; then the fix lane;
then the gate on `main` and the user's word before any push.

## 7. Status

The orchestrator updates this table at each merge. `Head` is the `rebuild/mvp` commit after the
merge through row 14.M, and the `main` commit after that. Open items live in section 8, not here. The review screenshots of phases 4 to 9.2 were
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
| 12.1 | done | 6e55294 | the shared timeline (user request of 2026-11-01, from the reference artifact `js/51-panel-timeline.js`): `src/features/timeline/` (the strip, its stylesheet, the F2T2EA key points with definitions) hosted under the Build board in place of the scrub (`Scrub.tsx` deleted) and under the Brief stage when the card's Timeline display is on; `ui.tview` for the zoom; `[` and `]` real in Build and Brief over `engine/stops`; the Brief stage at the live time with the Timeline, Readout and Frame buttons, the readout line and the presenter aids; `snapshotCard`, `setDisplays`, `toggleDisplay`; Brief keys P, C, L; the notes panel's Displays row and Key points section; spec section 7 and principle 8.5 amended; 55 unit files, 495 tests, 7 e2e; entry 237.9 kB gzip; lane height fixed per threat so an added system never moves the board (12-02 and 12-03 held at 3 px) |
| 12.2 | done | lane/12.2 merged | the timeline upgraded as the reference for Build and Brief (user request of 2026-11-01): the two camera thumbnails under the Build board removed (`Thumbnails.tsx` deleted; the bar's view segment switches the view); the strip resizable by a grip on its top edge (`ui.tlH`, 96 to 720 px, default 200; arrows, Home and double click; the board section `min-h-56`); lanes share the area height and, with room, each sensor and effector gets a labelled row with a swatch and its id; the F2T2EA key points as glyphs (`glyphs.tsx`: Find, Fix, Track, Target, Engage, Assess, DA) with two-sided label placement; event labels beside the beads and a warn triangle; a first-see cap on each bar; a legend line; the cursor time readout; 55 unit files, 499 tests, 7 e2e on the lane; three `reviews/phase-12/after-12.2-*.jpg` |
| 12.3 | done | lane/12.3 merged | the Brief stage renders the build and the timeline (user request of 2026-11-01): with no current card the stage draws the live scene at the stashed Build view through a transient card that is never saved, the head reads "Build view · id" and the live time, the readout line shows; the strip always shows under the stage, a card with its Timeline display off collapses it to the play bar (`brief-tl-collapsed`); Save a screenshot downloads the stage as a 2x PNG (`screenshot.ts`); new cards default `timeline: true`; the notes panel lists the question and every threat's key points with no card; e2e 12-19 extended and a second test; 56 unit files, 504 tests, 8 e2e on the lane; two `reviews/phase-12/after-12.3-*.jpg`. After both merges the gate on `rebuild/mvp`: 508 tests, 8 e2e, entry 238.7 kB gzip |
| 12.F | done | lane/12.F merged | the browser check of 12.2 and 12.3 (eight steps pass, no console errors, eight `reviews/phase-12/after-12-*.jpg`) and its two fixes: the cursor time chip flips to the cursor's left near the right edge so the strip edge never clips it; a strip with no threat takes the hint's height, not the grip's. Follow-ups from the check: L toggles a card display as an undo step (by design, 12.1); the toast covers the legend for its few seconds; board labels overlap in Brief ("T1" on the sector edge, "RF-1" on the ring; the "Defended asset" label crosses the DA frame); Build and Brief differ on system id labels with Labels on; Find and Fix glyphs touch at one time; the light theme's filled inputs sit low in contrast; one threat and a tall strip leave the lane foot empty |
| 12.4 | done | lane/12.4 merged | the timeline scale and polish (the user's review of 2026-11-01 of the Build strip, items 1 to 7 chosen by poll, then the reference strip as the bar to pass): the view fits the action span on open (`fit.ts`; `timeline.fitRun`, `timeline.fitAction` in the strip menu; a hand zoom holds); glyphs in the 14 px threat header, no lane text, the legend names all seven; the engage margin bracket; lanes at their content height with a shared row pitch 14 to 24 px, `ui.tlH` now the maximum; a DA row; sensor windows hatched, effector solid, EW hatched the other way; row pills; circled-letter beads; splits as a dashed rule with a circled S or M; axis labels without t+; Time off replaces the Time checkbox; e2e 12-02 and 12-03 read the geometry again after the add (the strip grows a row, so the board reflows on an add: accepted); 57 unit files, 514 tests, 8 e2e; entry 239.9 kB gzip; four `reviews/phase-12/after-12.4-*.jpg`. Open: the auto fit was checked by unit test only (the template runs 365 s); items 8 to 10 of the review wait |
| 13.1 | done | 4fa7825 | the strip as the plan's clock: per-profile time state (`tS`, `timeOn`, `loop`, `tview`, `tlH`, `rate`) persisted under `profileStudio.time` (`src/state/timePersist.ts`, 50 ids, 250 ms debounce, flushed on pagehide, bound in `App.tsx`); system rows and key point glyphs are press targets (a row press selects the system, a glyph press sets the time and selects the system that gives the step, a DA glyph the threat), lit by the board's selection and hover in Build and Brief; a Cards row under the DA row (numbered 12 px markers at each card's time, a 6 px slice band, the current card in the accent; a press opens the card in Brief and sets the time, and the loop for a slice, in Build; hidden when no card has a time); glyph state colour at the cursor (`tl-reached`, `tl-current` with a halo, `tl-future`, defined outside `.tl` for the notes panel); `timelineCommands` (`timeline.saveFrameHere` runs `brief.snapshot` in Brief and `card.save` in Build, `timeline.saveSliceFromLoop` through a guarded dynamic import of 13.2's `sliceFromLoop`) with local menu items until 13.W registers them; the step word after the threat id when it fits (gutter 56 or 72 px, `--tl-gut`), the chip "t+0:10 · Track" for a selected threat, Repeat and Repeat1 loop toggles (the Loop combobox became a group "Loop"); `Timeline.tsx` split into `Axis`, `LaneSvg`, `PlayBar` and `layout`; the Target cross no longer dashed (`.tl-hair`); 58 unit files, 527 tests, 8 e2e; entry 243.02 kB gzip; four `reviews/phase-13/13.1-*.jpg`. Open: event labels under the lanes overlap their circled letters (pre-existing); the chip names the step only for a selected threat |
| 13.2 | done | be5b8fa | the Brief teaches the frame and the slice: `Card.clip` live as the slice (`setSlice` one undo step, also sets the card's time to the slice start; `sliceFromLoop` from the loop into the current card in Brief or a new card after the current one in Build, a toast either way; `applyCard` sets the loop, the rate and the time for a slice and clears the loop for a frame; P plays the slice from its start when the cursor is outside it, Space stays Next card per spec section 8); the notes Slice field (from, to in "m:ss", rate, Clear; a first "from" or "to" makes a 30 s slice); the head "t+1:00 to t+2:00 · x2"; the Frame panel at the top of the notes (`Frame.tsx`, `frameData.ts`: the step reached with its glyph, the next step countdown as a press, range, height, speed, closing, Held by pills, the engage margin in the hostile ink when negative, DA in; at most six threats; "Inside the slice" in time order); key points with state glyphs and "now"; the aids line with the step glyph and "Next: 2 name at t+3:20"; the caption placeholder "Write what the viewer must see at t+1:40."; the print deck with the time line and the frame table (render capped at 108 mm); the Scissors head button "Set the slice from the loop" with its reason; the Brief re-applies the card only when its view, layers, focus, time or slice change (a caption edit no longer resets the time); `Section.tsx` shared; the parser copied into `cards.ts`; after both merges 59 unit files, 543 tests, 8 e2e; entry 243.17 kB, Brief chunk 8.62 kB gzip; four `reviews/phase-13/13.2-*.jpg`. Open: `clipSchema` messages say "clip"; the Build stash does not hold the loop and the rate, so a slice card's loop stays in Build after leaving Brief; the fallback glyph state rules in `brief.css` (13.W) |
| 13.3 | done | dce3481 | the board draws each threat's F2T2EA key points and its defended asset entry on its track as the strip's seven glyphs (`symbols.keyPoint`, r = 4, `--w2` stroke): a static `keypoints` layer with no `t` input (each mark `data-k="keypoint"`, `--kt`, a title "T1 Track · 1:40 · RDR-1"; positions cached per derived object and camera string; Find at the first-see tick) and a `keypoints-now` layer that draws the latest mark at or before the cursor in the accent with a 6 px halo; the time state in CSS (the root svg carries `--t` when time is on, from `render.ts` for cards and the stage and from `renderer.ts` on every tick; `board.css` computes the reached ink and the 45 percent future opacity from `--kt` and `--t`; the DA mark hostile in every state); marks take no pointer events and are no hit targets; none in thumb mode or with Events off; declutter 10 px along the normal within 6 px; parity by stripping the two kp layers and the root style before the byte compare (legacy derive has no stages); three rounds: 16 bucket layers (round 1), one cached layer at 19.7 ms per tick in the gate (round 2), the CSS split at 3.9 to 4.6 ms isolated and 8.3 ms in the gate (round 3; budget 16, no-marks baseline 4.9); 9 keypoints tests, a Board `--t` test; after the merge 60 unit files, 553 tests, 8 e2e; entry 244.57 kB gzip; four `reviews/phase-13/13.3-*.jpg`. Open: `--kt` rounds to 0.1 s while the now layer uses the exact time; a doc-null render leaves the last `--t` until the next render; `render.perf.test.ts` has no stages, so its budget does not exercise the marks; `DerivedView` in `types.ts` lacks `stages` and `daEntry` (a local type in the layer) |
| 13.W | done | c78b1aa | `timelineCommands` registered in Build and Brief (the palette lists them; the sheet shows no key) and the strip's local fallback menu loop removed; the Brief's fallback glyph rules removed (timeline.css covers `brief-glyph`); `BuildStash` holds `loop` and `rate`, copied and restored by `snapshotBuild` and `restoreBuild`; `clipSchema` messages say "slice"; e2e `12-20-timeline` (a row press selects the sensor on the board and the inspector, a glyph press moves the clock, the time persists over a reload after the autosave; the selection does not) and `12-21-slice` (Shift drag sets the loop, the Scissors button saves the slice and the head reads the span, P plays inside it); spec sections 2, 5, 7 and 8 and principles 8.5 and 8.6 amended; 60 unit files, 554 tests, 10 e2e; entry 244.52 kB gzip. Open: the `pagehide` flush of the time state and a reload within 500 ms of the first edit (the profile copy is not yet saved) |
| 13.R | done | f096bc2 | `reviews/phase-13.md`: 0 blockers, 2 majors (a reload in Brief puts the Brief time and loop into Build when the user leaves, because the memory-only stash snapshots the restored Brief state; the lane helpers `mmss`, `parseTime`, `round1`, `stepAt`, `pointStates` and the bar class were written two or three times and two copies already differ), 8 minors (Space on a focused strip button runs the global command; the light future board mark at 2.07:1; "Add event here" enabled in the Brief strip menu; the unsigned margin label touches the Engage glyph; e2e gaps; "Time s" in raw seconds beside the m:ss slice field; the cursor chip covers a tick label; Build Tab never leaves the page, pre-existing), 15 notes; acceptance: linked, the Brief teaches any frame or slice, and the Brief strip as robust as Build pass; persistent and polish partial; entry 244.52 kB gzip; tick 0.37 to 0.48 ms in the perf set, the Swarm at x8 in the browser p95 16.7 ms with no frame over 20 ms; 32 `R-*.jpg` |
| 13.F | done | d9c4f09 | all 10 findings and 7 notes: the Build time state persists while Brief is open (`timePersist` saves the stash's fields and seeds the stash on a restore from Brief; `cardKey` persisted, so a Brief reload reopens the same card and a leave restores Build's time with no loop); one `mmss(s, signed)` in `engine/tokens.ts`, one `parseTime`, `round1`, `stepAt`, `pointStates`, `barClass`, `marginSeconds` and `NO_LOOP_REASON` in `timeline/layout.ts` imported by the Brief (the Brief chunk stays lazy, 8.59 kB); Space and Enter left to a focused button in every workspace, Space stays Next card in Brief (spec section 8 over the 13.2 text); future board marks in `--text-subtle` at opacity 1 (light 4.55:1), the future DA mark floored at 80 percent (about 3.2:1, orchestrator's edit); `menuItemsFor` filters by workspace and the five strip commands are active in Build and Brief; the margin label signed and clear of the Engage glyph; e2e 12-20 adds the Cards row press in Brief and the Brief reload then leave, 12-21 starts P outside the slice and asserts the first sample at the slice start, no `force` clicks, the clock locators exact; the Card time field in m:ss (accessible name "Card time"); a tick label under the cursor chip hides; stale comments gone; the toasts name the card by id; Loop range disabled at the full view ("Zoom the timeline first"); the board mark title "t+1:40"; F-10 (Build Tab, legacy tabFree) and N-02 (the grip branch is live, the review's premise was wrong) declared; 60 unit files, 558 tests, 10 e2e; entry 245.06 kB gzip; four `after-13F-*.jpg`. Notes left: N-04, N-06, N-07, N-08, N-10, N-11, N-12, N-14 |
| 13.M | done | main | phase 13 approved by the user on 2026-11-01 (poll: "Merge to main, no push"; the four readings stand); `rebuild/mvp` merged `--no-ff` into `main` with this handoff; the gate run on `main`; pushed 2026-11-02 |
| 14.1 | done | 0ad42af | drag and select on the board (user request of 2026-11-02, outside a phase; rangeboard `CanvasStage.tsx` marquee as the reference): a mouse drag on the empty board in Plan or Elevation draws the selection rectangle (`board-marquee`, the accent dashed with an 8 percent fill) and selects every system, path and area with a point inside it (`keysInRect` over the hit list: a system by its centre, a path by any waypoint, an area by any vertex; events and planes left out), the count beside the cursor and the ids in the readout (`selectedText`); Shift adds; Shift-click adds or removes one object; a Shift-click on empty keeps the selection; Escape drops a rectangle in progress; every selected key draws `.sel` (`BoardView.selKeys`, the handles stay with the first); a drag on one of several selected objects moves them together by one grid-snapped offset as one undo step with the ghost (`tools.beginGroupDrag`, label "move RDR-1, EO-1" or "move 6 objects"); the arrows nudge them together; the inspector shows "n selected" and expands no row; touch still pans; spec section 7 "Selection" and acceptance item 26; e2e `12-26-marquee`; 60 unit files, 563 tests, 11 e2e; entry 246.70 kB gzip |
| 14.D | done | 2112093 | lane 14.1, the site file domain: a `range` area kind ("Range area", `RNG-` ids, flat by default, a plain ghost outline drawn under the other volumes; the later hit wins a tie so a zone inside a boundary still takes the click); the schema stamp `profile-studio/8` (v7 restamped by `migrateV7ToV8`; import accepts v8, v7, v6, v5 and legacy v4; the library export writes v8); `src/domain/siteFile.ts` (`readKmz` through the zip central directory and `DecompressionStream('deflate-raw')`, `parseKml` by `DOMParser` with MultiGeometry taken and holes dropped, `localFrom` equirectangular about the site with north as positive y confirmed against `cameras.ts`, `centreOf`, `siteAreas` with the origin rule); synthetic `fixtures/kml/` (two polygons around 35.0, -79.0; the KMZ carries a data-descriptor entry so the reader must use the central directory); 14 `siteFile` tests and the v7 to v8 tests; the worker stopped on `ids.ts` (rule 15) and the orchestrator added the `RNG-` prefix; one error sentence beyond the plan's list accepted ("The KML document in the KMZ cannot be read."); 61 unit files, 580 tests, 11 e2e; entry 246.80 kB gzip |
| 14.E | done | 0ca38e9 | lane 14.2, the site file entries: `importSiteFile(file)` in `commands.ts` (a `.kmz` through `readKmz`, else text; `parseKml`; `siteAreas`; one undo step "import <file>" that pushes the range areas and sets an unset site; the areas become the selection; `fit()`; toast "n areas from <file>."; a bad file toasts its sentence, changes nothing and rejects so the Library can show it on its line); the command `build.importSite` ("Import a site file", group map, needs a document; defined in `commands.ts`, not the palette file, to avoid a cycle) with an on-demand hidden picker; a `.kml` or `.kmz` dropped on the board imports (`onDragOver` accepts `Files`); the Library input and drop accept `.kml` and `.kmz` and make a new profile named after the file (a Blank copy with no defended asset and the site reset to unset, because Blank's stand-in site 35.05, -117.6 counts as set) then import; the worker stopped on `library.test.tsx` (rule 15: the input label is now "Import file") and the orchestrator changed the two lookups; e2e 12-27 (import from the Library, 2 range areas, "2 selected", the toast, the name "site", undo removes both, a drop of the KML lands on the same box, width to height 1.5); spec section 7 Library line, section 8 "Import a site file", acceptance 27; open: a non-site file dropped on the board is accepted by dragover then ignored with no message; the Library reads the file twice; 61 unit files, 580 tests, 12 e2e; entry 248.50 kB gzip |
| 14.M | done | main | row 14.1 merged `--no-ff` into `main` (ac91730) on the user's "commit and merge to main" of 2026-11-02; both branches pushed the same day on "push"; worktree refs pruned and the empty `.worktrees/` removed; no lane branch exists |

## 8. Handoff

State on 2026-11-02, end of the fourteenth session. Phase 13 (the timeline as the plan's clock,
the Brief as the teaching space) and row 14.1 (drag and select on the board, a user request of
2026-11-02, outside a phase) are done on `main` (42b7137, pushed). `main` is the only branch:
the user chose it as the single lane by poll on 2026-11-02 and `rebuild/mvp` (last 6b239aa, the
same tree) was deleted, local and remote. The gate is green: 60 unit files, 563 tests, 11
Playwright specs on `vite preview`, build; entry 246.70 kB gzip (budget 300); 100 kB of Geist
woff2 outside the entry. Rows 13.1 to 14.M in section 7 say what landed. Phase 14 in section 6
is still to be written. The four readings of the user's request (section 6, phase 13) are
confirmed by poll (section 1, "Phase 13"). Tag `pre-pivot` (d1f56d1) holds the last head with
the run and score code. No lane is in flight; no worktree and no lane branch exist (pruned
2026-11-02). The review notes left open are N-04, N-06, N-07, N-08, N-10, N-11, N-12 and N-14
of `reviews/phase-13.md`, plus the open items in the 13.1 to 13.W rows and the two follow-ups
of row 14.1 (the inspector rows do not mark each object of a multi-selection, because the row's
current flag also expands it; a drag on a selected path's line moves nothing unless the path is
in a group).

**The product.** A polished version of the v3 mockup `legacy/mockup-v3.html` (served at
`/legacy/mockup-v3.html`): three workspaces (Library, Build, Brief), one board with three
cameras, a whole-scene inspector, cards and a brief. It plans tests as interactive mockups; it
does not run them. The mockup is the parity oracle; the legacy v4 app at `/legacy/index.html`
is a source of parts.

**Decisions.** Section 1 has all of phase 10 and the three of 2026-11-01 that open phase 11:
phase 10 approved and merged, the typeface direction, the scope hold.

**Next.** The next session starts by asking the user, with a poll, which open item opens
phase 14: the 12.4 review items 8 to 10
(the Plan fit on the site with a long path off the frame, the `PROF-n` id for a template copy,
the trailing comma on a first-see label), the phase 13 notes (N-10 the board marks of one
threat do not declutter against another threat's, N-11 the Swarm shows four of six lanes at the
default strip height, N-12 event labels overlap their circled letters and the beads cover the
board marks at the same times, N-07 the perf set omits `keypoints-now` and has no stages, N-08
the two strip commands have no key so the sheet omits them, N-06 `--kt` rounds to 0.1 s, N-04
a card named "at t+1:40" keeps its name when its slice moves, N-14 the dynamic import of
`brief/cards` in `timeline/commands.ts`), the earlier open items (from 12.2 and 12.3: a tall
strip with one threat leaves the lane foot empty; no palette command for Save a screenshot;
the PNG draws text in the canvas's fallback font, not Geist), or the held list (section 6,
"Held for product complete": the vos port, the dropped domain fields, the phase 10 deferred
list). Write the phase into section 6 before any lane.

**Orchestrator prompt.** Paste this to start the next session:

```text
You are the orchestrator for Profile Studio at /Users/caseytalbot/Projects/profile-studio,
branch main (the only branch). Read CLAUDE.md, docs/design-principles.md, docs/spec.md, then docs/plan.md
sections 1 to 5, phases 10, 11 and 13 in section 6, then 7 and 8. Start the dev server from
.claude/launch.json ("dev", port 5174) and use the product at / beside the mockup at
/legacy/mockup-v3.html for ten minutes. Run `npm run gate` to confirm the baseline: 60 unit
files, 563 tests, 11 Playwright specs, build.

Phase 13 and row 14.1 are done, merged into main and pushed. Ask me, with a poll, which of the
section 8 "Next" items opens phase 14, then write the phase into section 6
with lanes, owned files and budgets before any lane starts. Plan section 5 rules apply: one
worker per lane in a worktree under .worktrees/<id>, workers do not commit, gate and git diff
--stat before each --no-ff merge into main, gate on main after, worktree removed, sections 7
and 8 updated. Put every decision to me with the poll tool as soon as it is known.

Ask me before any download (npm install included) and any push.
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

**Lessons from phase 13.** A layer whose string changes on every time tick is rewritten whole
by jsdom (62 KB, 8 ms for 280 marks); the fix was to take `t` out of the static layer and carry
the time state in CSS (`--t` on the root svg, `--kt` per mark, `clamp` and `color-mix`) with a
small `t` layer for the current mark only (13.3, three rounds; bucket layers and a geometry
cache did not do it). A parallel lane that needs a formatter writes its own; the wiring lane
must dedupe by name (`mmss`, `parseTime`, `round1`, `stepAt`) or the review finds the copies
already diverging (F-02). A memory-only stash under a persisted state leaks on reload (F-01):
persist what the stash holds. A lane brief that lets a worker stop on a line outside its files
(rule 15) works: 13.W handed back a tested patch for one test line. A reviewer's premise is
checked in the fix lane too: N-02 named a dead branch that was live.

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

**How to run a lane.** `git worktree add .worktrees/<id> -b lane/<id> main`, then
`npm ci --offline` there (stop and ask if it tries to fetch). Parallel lanes each run the full
gate with their own preview port: `E2E_PORT=<port> npm run gate` (5181 to 5186 were used; dev
servers for pairs on 5191 to 5197). The worker does not commit. The orchestrator runs
`npm run gate` in the worktree, commits on the lane branch, merges with `--no-ff` into
`main`, runs the gate there, removes the worktree and deletes the branch, then updates
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
