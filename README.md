# Profile Studio

A counter-UAS test-profile planner. Create a profile on a board, iterate it in Plan, Elevation
and 3D, place systems and flight paths, import the range boundary from a KML or KMZ file, save
cards and brief the profile from the app. Measures of performance are named by DroneScore ID
under one F2T2EA step. Profile Studio plans tests; it does not run or score them.

## Run

```sh
npm ci
npm run dev -- --port 5174 --strictPort   # http://localhost:5174/
npm run gate                              # typecheck, lint, unit tests, build, e2e
```

Profiles save to the browser's IndexedDB. Export a profile or the whole library as JSON from
the Library.

## Where things are

- `src/` the app: `engine/`, `domain/`, `state/`, `commands/`, `board/`, `features/`.
- `e2e/` Playwright specs. `fixtures/` test data. `profiles/` the JIOPs profiles with their
  generator and the saved library the app ships and seeds into the Library on start.
- `docs/spec.md` what is built, `docs/design-principles.md`, `docs/decisions.md`,
  `docs/reference/` the DroneScore and JIATF-401 references.
- `legacy/` the frozen ES5 predecessor and `mockup-v3.html`, the design direction.

See `CLAUDE.md` for the working conventions.
