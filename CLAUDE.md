# Profile Studio

Counter-UAS test-profile planner: build a vignette on a map, run it, score it against DroneScore
measures, export an AAR stated as a hypothesis. The legacy app is plain ES5 scripts in `legacy/`, loaded by
`legacy/index.html`. It is being rebuilt as a production MVP in React, TypeScript and Vite.

## The standard

DroneScore measures are the gold standard. Name every metric by its DroneScore ID and name, and
place it under one F2T2EA step (Find, Fix, Track, Target, Engage, Assess).

- Read `docs/reference/dronescore-measures.md` before you add, rename or compute a measure.
- Read `docs/reference/jiatf-401.md` for JIATF-401 C4 conventions, the F2T2EA mapping and the
  handbook vocabulary.
- Read `docs/design-principles.md` before you design or change any UI, chart or export.
- Use the `stat-te-terminology` skill for user-facing T&E wording.

## Starting cold

Read `docs/design-principles.md`, `docs/spec.md`, then `docs/plan.md`. The plan's status table
says which lane is next. Each lane names the reference it needs:

- `docs/reference/legacy-app.md`: what the ES5 app does today, as a parity checklist.
- `docs/reference/rangeboard-parts.md`: engine and UI parts to transfer, with paths and APIs.
- `docs/reference/vos.md`: vos facts and the portability rules for the MVP.
- `docs/reference/sources.md`: the local VALKRYN library, with the top 10 for this project.
- `docs/reference/artifact-study.md`: the upgrade scope (phase 9): what the legacy app does
  well, the gap list with decisions, and the decisions of 2026-10-31.

## Decisions on record (2026-10-30)

- 2026-10-31: the upgrade (plan phase 9) ports the legacy interface in `legacy/` one to one onto
  the MVP engine, domain and state. `src/board/` is the renderer; MapLibre leaves in lane 9.2.6.
  The legacy app is the parity oracle, served at `/legacy/index.html` on the dev server.

- vos (`~/Projects/vos`): fit later. Build the standalone MVP first, then port it as a training
  sub-route that reuses the vos map and debrief views.
- Profile Studio is designed from first principles (`docs/design-principles.md`). rangeboard
  (`~/projects/rangeboard`) is a source of parts, not a template. Transfer and modify any piece
  that serves a principle (its headless engine in `src/playback` and `src/analysis` is the main
  one). Its layout, form factor and visual design do not carry over by default.
- F2T2EA grouping over DroneScore `stage_reached` is confirmed. See `docs/reference/jiatf-401.md`
  section c.
- Sources live in `~/Desktop/MASTER/VALKRYN`. Use local sources only.

## Gate

MVP: `npm run gate` runs typecheck, lint, unit tests and build. Run it before you mark any lane
done. Legacy app: `npm run legacy:smoke` runs every case in `legacy/test/cases/` against the
scripts in `legacy/index.html` order.

## Orchestration

`docs/plan.md` sections 5, 7 and 8 are the operating manual: lane rules, the status table and
the handoff. Lanes run in git worktrees under `.worktrees/<lane>` (ignored by git, ESLint and
Prettier). Reviews live in `reviews/phase-<n>.md`; each review is followed by a fix lane.
