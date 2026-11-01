# Rangeboard parts survey

Status 2026-11-01: history. The headless engine listed in section 2 was transferred in phase 2
and deleted in lane 10.1 (tag `pre-pivot`). Profile Studio no longer simulates. The file stays
as the record of what rangeboard offers.

Rangeboard is a source of parts, not a template. This document records what exists in
`/Users/caseytalbot/projects/rangeboard` (verified by reading the files), what Profile Studio
would need from each part, and what must not carry over. Layout, form factor and visual design
never transfer. Logic, types and algorithms transfer only where they serve a Profile Studio
principle.

## 1. Stack facts

From `package.json`:

- React 19.2.8, react-dom 19.2.8, react-konva 19.2.5, konva 10.3.1.
- zustand 5.0.15 (single store).
- recharts 3.10.1, sql.js 1.14.2.
- Dev: TypeScript via `tsc -b`, Vite, oxlint 1.75.0, vitest, markdownlint-cli2, ast-grep.
- `npm run check` chains docs, evidence, silent-pattern, bundle, entry-graph, engine, library,
  typecheck, schema, test, lint, format, build. This is rangeboard's own gate; Profile Studio
  has its own CLAUDE.md and does not inherit it.

Profile Studio is Vite + React + TypeScript per its own CLAUDE.md. The stack is compatible
enough that rangeboard source can be read and adapted directly, but nothing here implies
shared tooling config.

## 2. Engine map

All paths below exist under `src/playback/`, `src/analysis/`, `src/model/`, `src/engine/`
unless noted. Line counts are current `wc -l`.

| Path | Lines | Purpose |
| --- | --- | --- |
| `src/playback/sim.ts` | 857 | `assessAllThreats`: per-threat detect/track/ID/target/engage/effect assessment for one replicate. |
| `src/playback/mcRun.ts` | 1263 | Replicate loop, stop rules, stats, sensitivity/sweep/Sobol/Morris request plumbing. |
| `src/playback/attrition.ts` | 841 | `resolveEngagements`: shot resolution, Pk application, attrition bookkeeping. |
| `src/playback/detection.ts` | 466 | `resolvedThresholds` and sensor detection/classification gating. |
| `src/playback/kalman.ts` | 199 | Track filter: `predict`, `update`, `initFromMeasurement`, `quality`. |
| `src/playback/tracker.ts` | 341 | `createTrackManager`, `polarMeasurement`, `trackId`, `truthPathFor`. |
| `src/playback/fusion.ts` | 381 | Multi-sensor track fusion: `fuseTracks`, `createFusionStage`, `c2LinksFor`. |
| `src/playback/killChain.ts` | 212 | `killChainRoutes`: sensor→C2→effector connectivity graph (latency, fire-control gating). **Not** the F2T2EA stage ladder; see §3. |
| `src/playback/radarDwell.ts` | 143 | Radar dwell/scan timing model. |
| `src/playback/sobol.ts` | 225 | `sobolIndices`/`sobolLoop`: Saltelli first-order and total Sobol sensitivity indices. |
| `src/playback/morris.ts` | 242 | `morrisIndices`/`morrisLoop`: elementary-effects screening (mu, muStar, sigma). |
| `src/playback/sweep.ts` | 564 | Parameter sweep loop and cell summaries. |
| `src/playback/pk/beam.ts`, `pk/kinetic.ts` | 108, 256 | Pk models for beam (DE) and kinetic effectors. |
| `src/playback/optimize/{client,gp,loop,polygon}.ts` | — | Bayesian optimization loop (Gaussian process) for placement search. |
| `src/playback/mc.worker.ts`, `trial.worker.ts`, `optimize.worker.ts`, `workerPool.ts` | — | Worker-thread protocol around `mcRun`/`trial`/optimize requests. |
| `src/analysis/radarPd.ts` | 252 | Swerling 0/1/3, Marcum Q detection-probability math (Mahafza citation, see §7). |
| `src/analysis/rfLink.ts` | 143→144 | RF link budget for jam/EW sensing. |
| `src/analysis/sensorEnv/{acoustic,common,eoir,radar,rf}.ts` | — | Per-modality environmental attenuation (weather, terrain, EM background). |
| `src/analysis/stats.ts` | 171 (listed 170; verified 171) | `wilson`, `betaQuantile`, `meanInterval`, `quantile`. |
| `src/analysis/uncertainty.ts` | 252 (listed 251; verified 252) | `sampleScenario`, `uncertainFields`: aleatory/epistemic parameter sampling. |
| `src/analysis/aar.ts` | 128 | `buildAarSummary`: after-action-report rollup from a run record. |
| `src/analysis/requirements.ts` | 358 | Six-gate requirement report: `detect\|track\|identify\|target\|engage\|effect`. |
| `src/analysis/runTimeline.ts` | 733 | `runTimelineOf`: per-entity timeline rows/spans/marks for the timeline UI. |
| `src/analysis/liveStats.ts` | 300 | `buildLiveTimeline`, `liveKpisAt`, `trialKpisAt`: rolling KPIs at a playhead time. |
| `src/engine/index.ts` | 236 | Barrel: re-exports the full headless-safe surface. `vite.engine.config.ts` builds it to `dist-engine/engine.js` for Node. |

`.oxlintrc.json` fences `src/playback/**`, `src/analysis/**`, `src/geometry/**`, `src/engine/**`
with `no-restricted-imports` on `react`, `react-dom`, `konva`, `react-konva` and
`no-restricted-globals` on `window`, `document`. This is the real mechanism keeping the engine
UI-free; Profile Studio should copy the fence, not just the convention.

### Correction to the prior survey

The prior survey described `killChain.ts` as defining DET/ID/TGT/ENG/DEF/LEAK kill-chain
stages. It does not. `killChain.ts` is a graph-connectivity module: it computes, per effector,
the minimum-latency sensor→C2→effector route and which sensors satisfy fire-control gating. The
actual F2T2EA-style stage ladder lives in `src/panels/analysis/ThreatPicture.tsx` (UI) and
`src/analysis/threatAggregation.ts` (data) as six gates: **D (detect) → TRK (track) → ID
(identify) → TGT (target) → ENG (engage) → FX (effect)**, plus the two outcomes `LEAKED` and
`DEFEATED`. `src/analysis/requirements.ts` names the same six gates as
`RequirementGateId = 'detect' | 'track' | 'identify' | 'target' | 'engage' | 'effect'`. See §3.

The prior survey also omitted real engine dependencies that the transitive closure below
needed: `src/geometry/{geo,prng,slant}.ts`, `src/analysis/{doctrineFactors,ewPhysics,
parameterBasis,sensorEnv,classPriors,classPriors.generated}.ts`, `src/model/{applyOverrides,
basisJson,integration,integrationData,rcsFactors,scenario,signatureFactors}.ts`, and in
`src/playback/`: `attritionReport.ts`, `ballistics.ts`, `classification.ts`, `clock.ts`,
`deadTimes.ts`, `directedEnergy.ts`, `falseTracks.ts`, `flight.ts`, `hpm.ts`, `intercept.ts`,
`killClip.ts`, `operator.ts`, `pk.ts`, `policy.ts`, `raid.ts`, `shot.ts`, `sweepState.ts`,
`trackTypes.ts`, `trial.ts`, `trialTypes.ts`, `tracks.ts`. All verified to exist and to be
pulled in by a real import chain (not guessed).

### Headless single-trial closure

Entry point: `runTrial(scenario: Scenario, manifest: TrialManifest): TrialResult` in
`src/playback/trial.ts`. This is the same function the engine CLI (`scripts/run-engine.mjs` via
`dist-engine/engine.js`, built by `npm run engine:build` from `vite.engine.config.ts`) and
`scripts/test-engine-cli.mjs` exercise outside the browser.

Traced by following every relative import from `src/playback/trial.ts` transitively (script-run,
not hand-counted): **59 files, 16,290 lines total.** Full file list with line counts:

```
400 src/analysis/classPriors.generated.ts
105 src/analysis/classPriors.ts
182 src/analysis/doctrineFactors.ts
215 src/analysis/ewPhysics.ts
142 src/analysis/parameterBasis.ts
253 src/analysis/radarPd.ts
144 src/analysis/rfLink.ts
185 src/analysis/sensorEnv.ts
 60 src/analysis/sensorEnv/acoustic.ts
132 src/analysis/sensorEnv/common.ts
287 src/analysis/sensorEnv/eoir.ts
109 src/analysis/sensorEnv/radar.ts
204 src/analysis/sensorEnv/rf.ts
171 src/analysis/stats.ts
252 src/analysis/uncertainty.ts
253 src/geometry/geo.ts
 44 src/geometry/prng.ts
 47 src/geometry/slant.ts
 91 src/model/applyOverrides.ts
 15 src/model/basisJson.ts
528 src/model/integration.ts
2749 src/model/integrationData.ts
147 src/model/libraryField.ts
 48 src/model/rcsFactors.ts
 82 src/model/scenario.ts
 72 src/model/signatureFactors.ts
1424 src/model/types.ts
841 src/playback/attrition.ts
188 src/playback/attritionReport.ts
 58 src/playback/ballistics.ts
 71 src/playback/classification.ts
118 src/playback/clock.ts
153 src/playback/deadTimes.ts
466 src/playback/detection.ts
210 src/playback/directedEnergy.ts
313 src/playback/falseTracks.ts
281 src/playback/flight.ts
381 src/playback/fusion.ts
103 src/playback/hpm.ts
600 src/playback/intercept.ts
199 src/playback/kalman.ts
212 src/playback/killChain.ts
222 src/playback/killClip.ts
188 src/playback/operator.ts
 23 src/playback/pk.ts
108 src/playback/pk/beam.ts
256 src/playback/pk/kinetic.ts
158 src/playback/policy.ts
143 src/playback/radarDwell.ts
 50 src/playback/raid.ts
343 src/playback/shot.ts
857 src/playback/sim.ts
565 src/playback/sweep.ts
136 src/playback/sweepState.ts
 84 src/playback/trackTypes.ts
341 src/playback/tracker.ts
 80 src/playback/tracks.ts
 78 src/playback/trial.ts
123 src/playback/trialTypes.ts
```

Note: `src/playback/mcRun.ts` (the replicate loop) does not call `runTrial` — it calls
`assessAllThreats` from `sim.ts` directly, which is already in the closure above. So the same
59-file closure covers both "one recorded trial" (`runTrial`) and "one replicate inside an MC
run" (`assessAllThreats`). `mcRun.ts` itself adds the stop-rule/stats layer on top and is not
required for a single trial.

### DroneScore field emission

None of these modules emit DroneScore fields today. To get `stage_reached`, `detect_range_m`,
`detect_alt_m`, `track_continuity_pct`, `track_error_m`, `id_range_m`, `id_time_s`,
`identified_ok`, `engagement_range_m`, `time_to_intercept_s`, `outcome`, `false_alarms` per run,
the minimal modification is a thin mapper at the `assessAllThreats`/`runTrial` boundary (new
code in Profile Studio, not a rangeboard file edit) that reads the existing per-threat row shape
(`ThreatOperationalRow`/`TrialThreatRow` in `threatAggregation.ts`, and `TrialResult` in
`trialTypes.ts`) and projects it to the DroneScore field names. The underlying values already
exist close to 1:1: `row.detected`/`firstDetectS` → `stage_reached`/timing basis, `row.trackNow`/
`trackContinuity` → `track_continuity_pct`, `row.identified`/`hostileAtS` → `identified_ok`/
`id_time_s`, `row.engaged`/`firstShotS` → `engagement_range_m` source data/`time_to_intercept_s`,
`leaked(row)`/`row.effectMet` → `outcome`. Range and altitude at each stage are not currently
carried as named fields on the row; they would need to be read off `observations`/`tracks` in
`TrialResult` at the stage transition. `false_alarms` would come from `falseTracks.ts`
(`prepareFalseTracks`, `falseTrackRatePerScan`), which rangeboard uses for false-track injection,
not false-alarm counting — this needs new counting logic, not a rename.

## 3. Kill-chain computation and F2T2EA mapping

Rangeboard's per-threat state machine is six ordered gates, defined identically in
`src/analysis/requirements.ts` (`RequirementGateId`) and realized per-threat in
`src/analysis/threatAggregation.ts` (`ThreatOperationalRow`, `trialThreatPictureAt`), displayed
by `src/panels/analysis/ThreatPicture.tsx`:

1. **Detect** — sensor Pd gate. Pd comes from `src/analysis/radarPd.ts` (Swerling 0/1/3 via
   Marcum Q, Mahafza's closed forms) for radar, and `src/analysis/sensorEnv/{eoir,acoustic,rf}.ts`
   for other modalities, combined with range/environment attenuation from `sensorEnv/common.ts`.
2. **Track** — `src/playback/kalman.ts` + `tracker.ts` build per-sensor tracks;
   `src/playback/fusion.ts` fuses multi-sensor tracks into one. Track continuity and gap are
   computed in `threatAggregation.ts` (`trackQualityAt`).
3. **Identify** — classification gate, `src/playback/classification.ts` plus
   `ClassificationMatrix`/`ClassificationBand` in `src/model/types.ts`.
4. **Target** — targetability gate (track quality + kill-chain route available), computed in
   `sim.ts`/`threatAggregation.ts` using `killChain.ts` routes.
5. **Engage** — shot resolution in `src/playback/shot.ts` and `attrition.ts`, gated by the
   effector's Pk model (`pk.ts`, `pk/beam.ts`, `pk/kinetic.ts`, `directedEnergy.ts`, `hpm.ts`).
6. **Effect/Assess** — outcome rollup: `effectObserved`/`effectMet` on the row, and the binary
   outcome `LEAKED` vs `DEFEATED` (`leaked(row)` in `ThreatPicture.tsx`).

| Rangeboard gate | F2T2EA step | DroneScore `stage_reached` |
| --- | --- | --- |
| Detect | Find | detected |
| Track | Fix / Track | tracked |
| Identify | Track (classification) | identified |
| Target | Target | targeted |
| Engage | Engage | engaged |
| Effect (Defeated / Leaked) | Assess | defeated / leaked |

Wilson intervals: `src/analysis/stats.ts`, `wilson(x, n, z = 1.96)`, returns `Interval & { p }`.
Used for binomial rates (Pk, Pd-derived defeat rate) wherever a count-over-n statistic needs a
confidence interval; `statOf` in `mcRun.ts` picks `wilson` as one of four `IntervalMethod`s
(`'t' | 'wilson' | 'rule-of-three' | 'none'`) by sample shape.

Stop rule: `StopRule = 'replicates' | 'halfWidth' | 'budget' | 'cancelled'` in `mcRun.ts`.
`halfWidthReached`/`halfWidthOnEnds` stop a run early once every tracked statistic's confidence
half-width is inside `targetHalfWidth`; `BAND80_MIN_N`/`BAND95_MIN_N` gate when a band is even
shown. `overBudget`/`assertSummaryFits` enforce `ExecutionBudget` (retained-number and wall-time
caps) independent of the statistical stop rule.

Sensitivity: two independent methods, both over the same `UncertainField` set from
`src/analysis/parameterBasis.ts`/`uncertainty.ts`. `morris.ts` runs cheap elementary-effects
screening (`mu`, `muStar`, `sigma`) to rank which fields matter. `sobol.ts` runs the expensive
Saltelli estimator (first-order `S_i`, total `S_Ti`, each with a percentile-bootstrap interval)
over the fields Morris kept, for `SENSITIVITY_RESPONSES = ['leakers','kills','firstDetectS',
'minWarningS','salvos']`.

## 4. Model types worth taking

From `src/model/types.ts` (1424 lines), the sensor/effector/UAS/scenario-relevant types:

- `SensorSpec` (sensor type, role, detect/classify range, sector, elevation, altitude ceiling,
  mount height, resolution, radar `refRcsM2`), `SensorType`, `SensorRole`, `SwerlingCase`.
- `EffectorSpec`, `ClassificationBand`, `ClassificationMatrix` (Pk/engagement envelope data).
- `UasSpec`, `UasGroup` (1–5), `IrSignature`, `JamBehavior`, `JamBand`, `LinkProtocol` — threat
  system definition including EW susceptibility.
- `Entity`, `EntityKind`, `Connection`, `C2Spec`, `SpecModel`, `FormationShape`/`FormationSpec`.
- `Scenario` (the root document type; see `scenario.ts` for construction helpers).
- `FlightPath`, `CapOrbit`, `CapExit` — route/orbit definitions for threat and friendly motion.
- `EnvironmentSpec`, `Precipitation`, `LightLevel`, `EmBackground` — environment that feeds
  sensor Pd and EW propagation.
- `Provenance` (line 549) — per-field sourcing/lineage record. Worth taking as a concept:
  Profile Studio's library pieces (`scripts/build-library.mjs`, `data/library/**`) need the same
  "where did this number come from" discipline DroneScore and the design principles call for.
- `RequirementThresholds`, `AarOutcome`, `AarSummary`, `AarThreatRow`, `AarEffectorShots` —
  shapes behind the AAR; relevant since Profile Studio's design principles name AAR as a
  deliverable.

Rangeboard-specific, drop:

- `Boundary`, `BoundaryType`, `PhaseLineDesignation` (FLOT/FEBA/FSCL/CFL/PL) — ground-maneuver
  graphics, not a counter-UAS test-planning concern.
- `RaidWave`/`RaidPlan` — rangeboard's raid-wave scheduling is a planning construct specific to
  its own scenario authoring flow, not a DroneScore-driven test vignette.
- `McdaVector` — rangeboard-specific multi-criteria decision scoring for its own optimizer UI.
- `BasemapMode`, `FrameSnap`, `GeoRef`, `Underlay` — rangeboard's own canvas/basemap system, tied
  to its Konva board.
- `SystemComponent`/`SystemPreset` — rangeboard's saved-system-preset feature, UI-specific.
- `TestCard`, `RunLogEntry`, `RunValidity` — rangeboard's own run-log/validity bookkeeping; may
  overlap conceptually with Profile Studio's hypothesis/evidence model but the shapes are
  rangeboard's own and should be redesigned against DroneScore, not copied.
- `EngagePolicy`, `Roe`, `LaunchPolicy`, `FireDoctrine` — rangeboard's doctrine/ROE simulation
  layer. Keep only if Profile Studio decides to simulate engagement decisions; otherwise drop.

## 5. UI / IO / gate parts

| Path | Purpose | API | Coupling | Transfer advice |
| --- | --- | --- | --- | --- |
| `src/canvas/interactionRouter.ts` (176) | Pure pointer/keyboard intent → action mapping, no DOM/store writes inside. | Takes raw intent, returns an action value. | Imports `Entity` (model) and `Tool` (store) types only — no store reads/writes. | Transfer as-is logic: the pure intent→action shape is exactly what a from-scratch canvas needs; keep the type-only coupling and rewire to Profile Studio's own store type. |
| `src/panels/CommandPalette.tsx` (267) | Command palette (keyboard-driven action list). | React component. | `useStore` from rangeboard's zustand store, `RING_KEYS` from `state/rings`. | Rewrite with idea: keep "typed command palette over a pure action list," drop the direct store coupling and rangeboard-specific ring vocabulary. |
| `src/canvas/ContextMenu.tsx` (379) | Right-click context menu driving the same action vocabulary. | React component. | `useStore`, `state/selectors`, `state/rings`, `state/layers`. | Rewrite with idea: the design principle "right-click anything to see what you can do to it" is explicitly Profile Studio's own (`design-principles.md` §2.2), so this is validation the pattern works, not code to copy. Menu-construction logic (grouping, enablement) may transfer; store calls do not. |
| `src/panels/Palette.tsx` (618) | Drag source for placing library items on the canvas, custom `dataTransfer` MIME type. | React component; drag handlers. | `useStore`, `state/labels`. | Transfer the drag-with-custom-MIME technique as-is logic (it is the correct way to carry a typed payload through native DnD); rewrite the palette UI itself. |
| `src/canvas/layers/PlacementPreviewLayer.tsx` | Konva layer showing a ghost placement while dragging/optimizing. | React-Konva component. | `state/analysisBasis`, `state/runState`, `useStore`. | Rewrite with idea only — it is a Konva layer, and Profile Studio's board is a fresh build (§6). The idea (live ghost preview tied to optimizer output) is worth keeping. |
| `src/canvas/layers/SystemHandleLayer.tsx` | Konva layer for drag handles on placed systems (range rings, sectors). | React-Konva component. | `state/camera`, `useStore`. | Rewrite with idea: "drag a ring to set range, drag a sector edge to set FOV" (design principle §2.3) is the idea; the Konva implementation does not transfer. |
| `src/ui/kit.tsx` | Base UI primitives (buttons, `State` tone chip, etc.), explicitly documented as reading only `index.css` classes and importing no store. | React components. | None (by design — see file's own doc comment). | Transfer as-is logic for the discipline ("no store import in base UI kit"); the actual components/classes should be rebuilt against Profile Studio's own visual design. |
| `src/ui/usePopover.ts`, `rovingTabs.ts`, `typingTarget.ts` | Headless interaction hooks: popover positioning, roving-tabindex keyboard nav, "is an input focused" detection. | Hooks, no visual output. | None found beyond React itself. | Transfer as-is logic — these are UI-framework-general utilities with no rangeboard-specific coupling. |
| `src/panels/timeline/*` (Axis, Controls, Gutter, LaneMarks, Legend, Overview, Plot, hit-testing, viewport gestures, seek/selection hooks) | The run timeline: per-entity lanes, zoom/pan, seek, tooltip text. | Multiple components + pure modules (`hit.ts`, `layout.ts`, `fold.ts`, `viewportActions.ts`). | Timeline data comes from `runTimelineOf` (analysis layer, engine-safe); the pure layout/hit/fold modules have no store coupling and are unit-tested standalone. | Transfer the pure modules (`hit.ts`, `layout.ts`, `fold.ts`, `tooltipText.ts`, `timeViewport.ts`) as-is logic; rewrite the rendering components against Profile Studio's visual design, feeding them from the same `RunTimelineModel` shape if it still fits DroneScore's kill-chain display. |
| `src/charts/{ChartFrame,BandChart,SweepMap,SobolChart,Ladder,tokens,exportPng}.tsx/ts` | Recharts-based chart components for MC bands, sweep maps, Sobol bars, kill-chain ladder, and PNG export of any chart. | React components; `exportPng.ts` is a pure canvas-to-PNG function. | `tokens.ts` centralizes color/spacing tokens read by every chart (no store coupling found). | Rewrite the components against Profile Studio's own chart design (see the `dataviz` skill for palette/form rules); `exportPng.ts`'s rasterization technique can transfer as-is logic. |
| `src/io/runRecordPackage.ts` | Versioned envelope for one saved `RunRecord`: parse + import into the run store. | `parseRunRecordPackage`-style functions (see file). | Depends on `model/runRecord`, `model/libraryField`, `playback/mcRun` types only — no UI coupling. | Transfer as-is logic for the versioned-envelope pattern; the record shape itself should be redesigned around DroneScore fields. |
| `src/io/exportCsv.ts` | Per-table CSV export of a `RunRecord` (threats, effectors, sensitivity), RFC 4180 quoting, unit-suffixed headers, statistics keep their own interval/confidence/n. | Pure function(s) over `RunRecord`. | `model/runRecord` only. | Transfer as-is logic — the "every statistic carries its own interval and denominator, unavailable is empty not zero" discipline is exactly right for DroneScore measures and should be kept even if the record shape changes. |
| `src/io/exportSqlite.ts` | Run history as one SQLite file via sql.js, `run_id`-keyed tables, same unit/interval discipline as the CSV export. | Pure function(s) over an array of records. | `model/runRecord`. | Transfer as-is logic for the schema discipline; re-key columns to DroneScore field names. |
| `src/io/generateRuntimeSchema.mjs` | Dev-only generator: walks `model/types.ts` with the TypeScript compiler API to emit a runtime validation schema. | Node script. | TypeScript compiler, `src/model/types.ts`. | Transfer as-is logic once Profile Studio has a comparably large `types.ts` worth generating a schema from; premature before then. |
| `scripts/check-silent.mjs` + `scripts/silent/*` | ast-grep-based lint gate forbidding silent failure patterns (empty catch, swallowed promise rejection, etc.), with its own rule-test suite. | CLI script + ast-grep rule YAML. | None (operates on source text). | Transfer as-is logic — this is a generically useful gate, not rangeboard-specific. Needs ast-grep as a dependency. |
| `scripts/check-entry-graph.mjs` | Freezes the npm packages and "guarded" modules (engine/analysis/charts/analysis-panels/generated-data) reachable from `src/main.tsx`, fails on an unreviewed increase. | CLI script using the TypeScript compiler API. | Reads `scripts/entry-graph.json` as its frozen baseline. | Transfer as-is logic — directly useful for Profile Studio to keep its own engine tree UI-free and its entry bundle from silently growing. |

## 6. Do not carry

- `src/App.tsx` — 1270 lines. Root component monolith.
- `src/state/store.ts` — 1953 lines. Single zustand store for the whole app.
- `src/panels/Inspector.tsx` — 1724 lines. Property-inspector monolith.
- `src/index.css` — 7322 lines of component-specific CSS rules, entangled with the above.
- The Konva board: `src/canvas/CanvasStage.tsx` plus all of `src/canvas/layers/*.tsx`
  (ThreatWez, Tile, Underlay, Footprint, Callout, Track, SystemHandle, PlacementPreview,
  Engagement, Grid, Entity, Path, Range, Boundary, Connection layers) — a full react-konva
  canvas stack built around rangeboard's own store and interaction model.
- `window.__store` — found in `src/main.tsx`: a global escape hatch exposing the store for e2e
  tests. Test-infrastructure coupling, not a part.
- The evidence ledger process: `scripts/check-evidence.mjs`, `scripts/e2e/board-shell.e2e.mjs`,
  `src/analysis/calibrate.ts`, `src/analysis/runValidity.ts`, `src/state/analysisBasis.ts`,
  `src/state/playbackCommands.ts`, and the evidence-related code paths inside `Inspector.tsx`,
  `io/persist.ts`, `model/integration.ts`, `model/integrationData.ts`, `model/libraryField.ts`,
  `canvas/layers/ConnectionLayer.tsx`. This is rangeboard's own run-validity/evidence-tracking
  workflow, bound tightly to its store and panel structure; Profile Studio's AAR
  hypothesis/evidence model (per its design principles) should be designed fresh, not grafted
  from this.

## 7. Licensing / provenance note

`src/analysis/radarPd.ts` and its test file cite **Mahafza** (Bassem R. Mahafza, *Radar Systems
Analysis and Design Using MATLAB*) by name in comments for the Swerling/Marcum-Q closed-form
detection-probability formulas. No other citation name (Richards, Skolnik, Balanis) appears
anywhere in `src/`; the prior survey's mention of "Richards" alongside Mahafza was not found and
should be dropped. If any of `radarPd.ts`'s formulas are transferred into Profile Studio, carry
the Mahafza citation comment forward — it is attributing a textbook formula, not copying
rangeboard's code verbatim, but the attribution should move with the math.
