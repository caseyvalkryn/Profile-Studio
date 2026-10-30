# vos reference

What vos (`~/Projects/vos`) actually is, for later integration. Decision on record: FIT LATER.
Build the Profile Studio MVP standalone first, then port it as a training sub-route that reuses
the vos map and debrief views. Nothing here is a license to couple now.

## Frontend stack (fact, from `frontend/package.json`)

React 18.3.1, Vite ^8.0.16, TypeScript ~5.6.3, Zustand ^5.0.2, @tanstack/react-query ^5.90.16,
maplibre-gl ^6.9.0, milsymbol ^3.0.4, @turf/turf ^7.3.3, recharts 2.15.2, Tailwind 4.1.12
(`@tailwindcss/vite` 4.3.1), Radix UI primitives pinned per-package (not shadcn's copy-in
pattern; vos imports `@radix-ui/react-*` directly and wraps them under `src/components/ui/`).
Also present: react-router-dom ^7.18.2, lucide-react, sonner, driver.js (page tours), vitest
^4.1.3, eslint ^10.2.1.

## Backend summary (fact, from `/Users/caseytalbot/Projects/vos/CLAUDE.md` and `README.md`)

Rust/Axum backend, sqlx on PostgreSQL 16 + PostGIS, Redis, S3; one crate `vos`, hexagonal layout
per domain (`api/`, `application/`, `domain/`, `ports/`, `adapters/`). Auth is OIDC via Cognito
with PKCE, httpOnly JWT cookies validated per request. Authorization is OpenFGA
(`backend/openfga/model.fga`). TypeScript API types are generated from Rust with ts-rs into
`frontend/src/api/generated/`; `npm run generate-types` == `cargo test --lib export_bindings`,
and CI checks the generated output is committed.

## Training feature (`vos/frontend/src/features/training/`)

Fact, from reading the files. A self-contained prototype, no backend: every run is fixture data.

- `fixtures.ts` (9,548 lines) is the data model. Header comment (lines 7–55) names four
  primitives: event, event type, entity, scenario. `ll(x, y)` (lines 76–78) converts scenario
  metres (x east, y north of a site origin) to `[lat, lng]` using a flat-earth local frame:
  `FARP_LAT`/`FARP_LON` (lines 74–75) is the origin, `M_PER_DEG_LAT = 111_320` with
  `M_PER_DEG_LON` scaled by `cos(lat)`.
- `shared/TrainingMap.tsx` (3,714 lines) is the MapLibre view: markers via milsymbol and a
  custom `rangeSymbol.ts`, terrain DEM tiles proxied by the Vite dev server, a `lngLat(x, y)`
  wrapper (line ~36) around `ll()` for MapLibre's `[lng, lat]` order.
  `shared/threats.ts` (49 lines) computes `threatsFrom(systemId, t, events)`: every track a
  system can see at a time, sorted by range, each tagged with the envelope/ring it falls inside.
  `shared/reachShape.ts` (48 lines) is pure geometry: `reachShape(...)` returns an ellipse (round
  trip, drone+host at the foci) or circle (one-way) outline in scenario metres, no DOM, no map
  dependency — a clean port candidate.
- `shared/TimelineBar.tsx` (1,452 lines) is the scrubber/event strip.
- `shared/zulu.ts` (30 lines): `zulu(t, epoch, offset)` converts run-clock seconds to a Zulu
  `HHMMZ` string; `shared/metar.ts` (45 lines): `metar(met, epoch, offset)` formats a synthetic
  METAR line from fixture weather data. Both are pure string formatters.
- `debrief/` is the page: `DebriefPage.tsx` (1,405 lines) composes the map, timeline, annotation
  and feed panels. `ScorecardTab.tsx` (428 lines) and `MetricsTab.tsx` (76 lines) render
  `ScoreCell[]` from `scorecardFor`/`scorecardOfRun`. `CompareTab.tsx` (340 lines) diffs runs
  side by side via `alignRuns`. `debrief/chainSteps.ts` (68 lines) is the kill-chain model: a
  fixed `LINKS` array —
  `Detect → Cue → Hostile → Authorized → OWA away (Launch) → Impact → BDA` — each mapped to the
  first matching event type on a contact, with an owner tag (`sys`/`roc`/`uas`). This is vos's
  concrete instance of F2T2EA-shaped reasoning, though vos itself calls the steps by these
  domain names, not literally "F2T2EA."
- `worlds/nttr.ts` (1,374 lines) is the world that *does* use the literal F2T2EA label: line
  1018 declares `{ id: 'th-f2t2ea', name: 'F2T2EA' }`, and lines 1067–1094 group scorecard cells
  by `group: 'Find' | 'Fix' | 'Track' | 'Target' | 'Engage' | 'Assess'` (plus a `'Mission'`
  group for top-line pass/fail). This is the closer structural match to Profile Studio's
  DroneScore/F2T2EA grouping (`stage_reached`) than `chainSteps.ts` is.
- `design/` (20 files: `DesignPage.tsx`, `EventsPage.tsx`, `ScenariosPage.tsx`,
  `ChainStepEditor.tsx`, `GeometryPanel.tsx`, `NetworkDiagram.tsx`, etc.) is the scenario/event
  authoring UI — the "author a vignette" side vos already has, parallel to what Profile Studio's
  planner builds standalone.

## The module-level `setWorld` state trap (fact)

`fixtures.ts` lines 68–72 document it directly: most of the file's exports (`FARP_LAT`,
`WORLD_MAP`, `RUN_EVENTS`, `EVENTS`, `SCENARIO_DESIGN`, etc. — see the `let`/`export let`
bindings at lines 74–8061) are module-level mutable `let` bindings. `setWorld(k)` (defined at
line 9395, called at module load line 9547 and on a `worldRoute` key-change listener line 9548)
reassigns them in place so every importer reads "the active world" without threading it through
props or context. Tests must wrap assertions in `withWorld({ world, run }, () => …)` to get a
consistent snapshot; reading these exports outside that wrapper, or after an unawaited async gap
that crosses a `setWorld` call elsewhere, can read a different world than the one you set up.
This is explicitly not a pattern to copy — see Portability rules below.

## vos conventions a port must follow (fact, from `vos/.claude/CLAUDE.md` and `vos/CLAUDE.md`)

- **Clarify-first.** Before writing code: identify ambiguities that would materially change the
  solution, ask the minimum clarifying questions, don't proceed until there's consensus on
  intent and architecture. A standard default may be proposed explicitly and confirmed instead.
- **Testing.** Business logic gets thorough tests of every public API; the testing boundary is
  "public," not every function. Mocks replace real adapters. Always add tests for changes.
- **Frontend rules called out explicitly:** dark text on light backgrounds and vice versa; key
  editable list rows by a stable id minted at creation, never by a user-editable field or array
  index; never render an empty-string value in a Radix `<SelectItem>` (it throws).
- **Design tokens** live in `frontend/src/styles/theme.css` as CSS custom properties on `:root`
  (`--background`, `--primary`, `--chart-1`…`--chart-5`, `--radius`, etc.), most as `oklch(...)`
  or hex, consumed by Tailwind 4's `@theme`/`@custom-variant dark (&:is(.dark *))` mechanism.
- **Gates live in `.github/workflows/ci.yml`.** Frontend job (`frontend typecheck, lint & tests
  (vitest)`) runs, in order: `npm ci --legacy-peer-deps`, `npm run typecheck`, `npm run lint`,
  `npm test`. Backend CI runs `cargo fmt --check`, clippy with `-D warnings`, `cargo test
  --all-targets` for both `aws,cli` and `azure,cli` feature sets, and checks the ts-rs generated
  types are in sync. A separate job builds and smoke-tests the frontend Docker image.
- **Delete dead code** rather than commenting it out "for later." Never skip hooks or bypass
  signing without being told to.

## Portability rules for the MVP

Rules the Profile Studio MVP should follow now so a later port into vos stays a medium-effort
mechanical change, not a rewrite. Each is marked **[vos fact]** (vos already does this, so
matching it is zero-cost alignment) or **[recommendation]** (not required by vos, but keeps the
port cheap).

1. **[vos fact]** Use the same majors where there's no reason not to: React 18, Zustand 5,
   MapLibre GL (vos is on 6.x; stay on a 5.x/6.x line, not Leaflet — vos has both but training
   uses MapLibre), Recharts 2.x, TypeScript ~5.6, Vite. Pinning exact versions isn't required;
   staying on the same major avoids an API-shape rewrite at port time.
2. **[vos fact]** Local metre frame: `ll(x, y)` style conversion from a site origin (lat/lon)
   to geographic coordinates using `M_PER_DEG_LAT = 111_320` and a `cos(lat)`-scaled longitude
   factor. Keep scenario geometry in metres-east/metres-north from an origin; convert to
   lat/lng only at the map-rendering boundary, the same seam vos draws between `fixtures.ts` and
   `TrainingMap.tsx`'s `lngLat()` wrapper.
3. **[recommendation]** Keep the scoring/geometry engine pure TypeScript with no DOM or
   MapLibre imports, the way `reachShape.ts` and `chainSteps.ts` are pure functions over plain
   data. That's what let vos's engine get real public-API test coverage per its own testing
   rule, and it's what makes a module portable without touching the host app's rendering layer.
4. **[recommendation]** Design tokens as CSS custom properties on `:root`, named so they map
   onto Tailwind 4's `@theme` block (`--background`, `--primary`, `--chart-1..5`, `--radius`
   are vos's actual names — reusing them isn't required, but picking the same *shape* of token
   set, flat custom properties rather than a JS theme object, means the port is a file drop, not
   a re-architecture).
5. **[recommendation] No global module-level mutable state for "the active scenario."** vos's
   `setWorld` pattern (reassigning `let` exports) is a known trap it had to build a
   `withWorld(...)` test wrapper to work around. Profile Studio should keep "current plan/run"
   in a store (Zustand, matching vos) or component state, not module-level `let` bindings, so
   the MVP never needs an equivalent escape hatch and ports cleanly into a React tree that
   already owns its own Zustand store.
6. **[vos fact, mapping]** F2T2EA labels: Profile Studio's F2T2EA grouping over DroneScore
   `stage_reached` (Find, Fix, Track, Target, Engage, Assess) maps directly onto two vos
   structures it should be written to match: `worlds/nttr.ts`'s literal `group: 'Find' | 'Fix'
   | 'Track' | 'Target' | 'Engage' | 'Assess'` cell grouping (lines 1067–1094), and
   `debrief/chainSteps.ts`'s `LINKS` chain-of-custody shape (Detect, Cue, Hostile, Authorized,
   Launch, Impact, BDA) for the per-engagement timeline view. Naming Profile Studio's own stage
   values with vos's exact group strings (`'Find'`, `'Fix'`, etc., not `'find'` or `'FIND'`)
   means the later port's scorecard adapter is a lookup table, not a rewrite.
7. **[recommendation]** No backend coupling now. vos's backend (Rust/Axum, ts-rs generated
   types, OpenFGA) is irrelevant to the MVP; Profile Studio should have no code path that
   assumes a `/api/*` backend, generated types, or auth cookies exist, so the later "port as a
   training sub-route" step is purely a frontend drop into `vos/frontend/src/features/training/`
   or a sibling feature folder.
8. **[recommendation]** Match vos's CI shape for the gate (`typecheck` → `lint` → `test`, each
   its own step) even though Profile Studio's own CI doesn't need to mirror vos's workflow file;
   it means the three commands can be copy-pasted into `ci.yml` later without reordering.
