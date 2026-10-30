# Phase 2 review (lane 2.R)

Branch `lane/2.R` at e5db6ed. Gate: `npm run gate` passes (typecheck, lint, 224 tests, build).
Scratch checks ran from the scratchpad through vitest with the engine imported by absolute path;
their output is quoted under each finding.

## Verdict

The transfer, the domain layer, the interval math and the determinism story are sound. The
scorecard is not yet, for two reasons. First, the Identify stage is governed by rangeboard's
threat-classification ladder (speed over 50 km/h, attack intent, or proximity inside 1.5 times
an effector's reach to become "suspected", then "hostile" by matrix declaration or by entering the
reach), not by the spec's dwell plus correct-ID probability; a pCorrectId of 0 yields 100 percent
identification, a 10 m/s threat with no nearby effector is never identified, and the default test
vignette records an ID time of 104 s against a 5 s dwell. Second, 3.1.3 and 5.1 report the range
at the first shot from the first shooter, where DroneScore records the range at defeat; the gap is
72 to 456 m in the test vignette. Both need a fix lane before any scorecard is shown. The rest is
a short list of undeclared adapter losses and schema gaps.

## Findings

### F-01 blocker: Identify comes from rangeboard's proximity and speed ladder, not the ID model
`src/engine/run.ts:132` (`identifyS = a.classificationAtS.hostileAtS`) with
`src/engine/sim/playback/sim.ts:409-441`.
Defect: `hostileAtS` needs the "suspected" rung first, which rangeboard grants only for speed
above `SUSPECT_SPEED_KPH` (50), attack intent (never set by the adapter), or ground range within
1.5 times a connected effector's `maxRangeM`; "hostile" then follows from either the matrix
declaration or entering the effector reach. The spec (section 6 item 2) models identification
after `idDwellS` with `pCorrectId`; the ladder ignores both in the common case.
Evidence (scratch A, why2): pCorrectId = 0 on every sensor, 20 of 20 rows `identified_ok` true at
`id_range_m` 2496 (the 2500 m reach), 2.1.2 = 100 percent "meets". Threat at 10 m/s, effector
3 km off-axis with 400 m reach, pCorrectId = 1: stage `track` in 5 of 5 rows, `id_time_s` null;
the same at 20 m/s: `identify`, `id_time_s` 5 s. Default vignette (12 m/s): matrix declared hostile
at 88.5 s, `hostileAtS` 187.5 s (3750 m = 1.5 x 2500), `id_time_s` 104 s.
Fix: derive `identifyS` in `run.ts` from the per-sensor declaration (observation `firstClassifyS`
plus the band `timeToDeclareS`, when the classify draw declared hostile), and have the adapter set
attack intent on the UAS spec so the ladder's "suspected" gate never delays the shot; record in the
plan that the rangeboard proximity rung still opens the release gate.

### F-02 blocker: 3.1.3 and 5.1 report the range at the first shot, not at defeat
`src/engine/run.ts:205-213` and `src/engine/score.ts:118-128`.
Defect: `engagement_range_m` is the ground range from the first shot's effector at the first shot
time; DroneScore 3.1.3 records "Distance to the target at defeat (m)" in that field, and 5.1 is its
mean in km. With interceptor flyout and shoot-look-shoot the target closes between shot and kill.
Evidence (scratch G): over 40 defeated rows, `engagement_range_m` minus the range at the kill
effect position was 456, 90, 72, 330, 264, 330 m; `time_to_intercept_s` 38, 6, 6 s.
Fix: compute `engagement_range_m` at `killEvent.tEffectS` from `killEvent.effectorId`'s position for
Success rows; keep the shot range in the trace (`positions.engage`) for the Engage view. Note the
field's DroneScore name on the scorecard so "engagement" is not read as the shot.

### F-03 major: Target time carries 5 s of undeclared link latency
`src/engine/adapter.ts:330-343` (connections without `latencyS`) with
`src/engine/sim/playback/killChain.ts:77` and `doctrineFactors.ts:73-77`.
Defect: under doctrine a connection with no `latencyS` takes the rangeboard default (sensor to C2
2 s, C2 to effector 3 s), so `readyS` = gate + 5 s + `assignS`. The vignette's chain time is
`decisionS` + `assignS` only. A second phenomenology also halves `decisionS`
(`CONFIRMED_DECLARE_FACTOR` 0.5, `sim.ts:576`), which nothing in the UI states.
Evidence (scratch H): identify 187.5 s, target 200.5 s, chain time 8 s, difference 13 s.
Fix: set `latencyS: 0` on every adapter connection (the doctrine dwells already carry chain time);
either document the confirmed-ID halving on the Target input or make it a declared default.

### F-04 major: identification is possible with no fire-control track, and `track` needs radar or EO/IR
`src/engine/run.ts:116-124` and `sweep.ts:60-66` (`trackInitAtS` null for RF and acoustic).
Defect: RF-only or acoustic-only vignettes can never pass `track`, so 1.2.1 is 0 percent and
2.1.x null, even though the spec models M-of-N initiation for every sensor kind. Not a wrong
number for mixed vignettes, but a user with an RF-only layout sees a scorecard that stops at Find.
Evidence: read; `stableTrackAtS` doc says "RF and acoustic holds never qualify".
Fix: in `run.ts`, fall back to the first observation interval that lasts `trackM * scanS` for a
sensor with `trackInitAtS` null, and note the fire-control restriction on 1.2.1.

### F-05 minor: track continuity under-credits every hold by one step
`src/engine/run.ts:160-165`. Intervals are inclusive 0.5 s samples; `coveredS` sums `b - a`, so a
one-sample hold earns 0 s and every interval loses half a step. Also, on a late kill (`dead.late`)
`defeated` is false and the window runs to path end although the airframe is dead. Fix: add one
sweep step to each clipped interval; end the window at `dead.tS` whenever `dead` is non-null.

### F-06 minor: altitude is the first waypoint's z for the whole path
`src/engine/adapter.ts:121` (`threatAltitudeM`), feeding `detect_alt_m`, 1.1.3 and 1.5.
Evidence (scratch H): climb 30 to 400 m, run `detect_alt_m` 30, preview `altM` 90 at the same
detection. Fix: declare it in the plan status (only the sweep comment states it) and make the
preview and the run agree, or bound the first-waypoint rule in the UI.

### F-07 minor: sensor `minRangeM` is not modelled in the run
`src/engine/adapter.ts:160-233`. `SensorSpec` has no minimum range field, so `s.minRangeM` is
never read; `geo.ts:195` applies it in the preview. Fix: declare the loss, or post-filter
observations inside `minRangeM` in `run.ts` before the stage ladder.

### F-08 minor: a degenerate interval evaluates decisively
`src/engine/score.ts:149-156, 227-238`. With one qualifying row the bootstrap returns
`{low: v, high: v}` and `evaluate` returns "meets" or "does-not-meet" on n = 1.
Evidence (scratch C): `bootstrap([7])` gives `{7, 7}`; all-equal `[5,5,5]` gives `{5, 5}`.
Fix: return "inconclusive" with a note when n < 2 (or below a stated minimum), matching the
spec's "interval spans the threshold" rule in spirit.

### F-09 minor: `score` ignores `MeasureSetting.unit`
`src/engine/score.ts:206-216`. A threshold entered as 3 with unit "km" on 1.1.2 is compared with
metres. Fix: the measure editor must set `unit` from `measures.ts` and disable editing it, or
`scoreOne` converts km and m thresholds by the row's unit.

### F-10 minor: schema accepts inverted and empty envelopes
`src/domain/schema.ts:80-93, 118-126`. `elMinDeg` 60 with `elMaxDeg` 10, `fovDeg` 0 and
`zMinM` above `zMaxM` parse. Unknown keys are stripped silently (zod default), NaN is rejected.
Evidence (scratch K): `elMin>elMax and fov 0 accepted? true`; `NaN rangeM accepted? false`.
Fix: `refine` each pair (min < max) and `fovDeg` min > 0 (or treat 0 as 360 in the engine).

### F-11 minor: the worker client can hang
`src/workers/simClient.ts:23-38`. No `messageerror` handler (a structured-clone failure on the
reply never settles the promise) and no cancel: a long run cannot be stopped from the UI.
Fix: add `w.onmessageerror` rejecting, and return a handle with `cancel()` that terminates.

### F-12 minor: migrated vignettes score nothing and have zero Target time
`src/domain/migrate.ts:171-180`. `measures: []` is declared; `chainTime {0, 0}` and the site
origin at lat 0, lon 0 are not called out to the user. Fix: seed `measures` from the five
templates' default rows and surface "Target time not set" on import.

### F-13 note: `run` returns `{rows, trace}`, the spec signature says `RunRow[]`
`src/engine/run.ts:259`. Deliberate extension; update spec section 6 item 2.

### F-14 note: `id_time_s` origin is first detection
`src/engine/run.ts:197`. DroneScore says "Time to correct identification"; first detection is the
defensible origin. State it on the 2.1.3t row.

### F-15 note: 1.1.3 slant uses AGL altitude, not altitude above the sensor mount
`src/engine/score.ts:84-90`. Error is the mount height (2 to 3 m). No action for the MVP.

## Preview semantics (question 6)

(a) Assess = max(engage + tte, effector window start), unclipped. Legacy `21-derive.js:220`
does exactly this; it is right for the MVP because Assess is a planning estimate of when the
effect lands, and clipping it would hide a late effect instead of showing the margin, which the
`marginS` field already carries. Keep it, and show a negative margin in red rather than clipping.

(b) Engage without Target falls back to first effector reach (`preview.ts:149`). Legacy had no
Target gate at all, so this is parity; for the MVP it should stay but be labelled "geometry only"
on the stage, since a vignette with no EO/IR never produces Track or Target and the user must
not read first reach as a decision time.

## Confirmed correct

- Stage ladder order and `outcome` consistency: `defeat` iff Success; Miss iff shot without
  defeat (late kill included); No Attempt otherwise. `classify` never emitted; 2.1.1 and 3a.2
  null with the note (scratch E and run tests).
- `detect_range_m` is ground range from `firstDetectSensorId` at `firstDetectS` (1.1.2); 1.1.3
  is hypot of ground and altitude as DroneScore says.
- Proportion denominators: 1.2.1 tracked given detected; 2.1.2 identified given tracked; 3.1.1
  engaged given identified; 3.1.2, 5.4, 5.4e defeated given engaged (No Attempt excluded).
- Wilson: n = 0 guarded with a null note; p = 0 gives lo = 0, p = 1 gives hi = 1; z = 1.96.
- `evaluate` touch rules: low = threshold meets on `>=`; high = threshold meets on `<=`;
  the other edge is inconclusive. Consistent with the operators.
- Bootstrap: seeded mulberry32, percentile method, deterministic across calls (scratch C).
- Determinism: same (vignette, n, seed) equal (run tests, sweep scratch F); `sweep` leaves the
  input untouched (JSON equal before and after); no `Math.random`, `Date.now` or Map-order reads
  in `src/engine` outside `ids.ts` (`newKey`) and `migrate.ts` (`updated` timestamp).
- Replicate ids: `idHash('rep-<seed>-<i>')` had 0 collisions over 200k ids for seeds 1 and 42;
  the manifest forces this hashing (`trial.ts:29`), so the derivation cannot be bypassed.
- Sector handling: fov 90 at bearing 350 covers a run-in from 005 and not from 060 in both the
  run (defeat in 5 of 5; none in 5 of 5) and the preview (scratch D). Bearings pass through the
  y flip unchanged (`sim/geometry/geo.ts:12`).
- Elevation limits and mount height reach `sensorEnv/common.ts:116`; RF-silent archetypes map to
  `navMode: 'fiber'` (adapter test). `assignS` lands on `EffectorSpec.targetS`, so the per-type
  `TARGET_S` table is bypassed (why scratch: `targetS: 3`).
- Swerling 2 to 1 and 4 to 3: `pdFromSnr` is single-scan (np = 1), where cases 1 and 2, and 3
  and 4, are identical. No Pd change.
- The shot leaves at the first in-range step under `max-range` (window opens at 2500 m reach,
  292 s at 12 m/s); no hidden track-quality gate delays it (raw and gated windows equal).
- `measures.ts`: all 67 rows match the reference table on id, name, recorded text, stored
  field and collector (scratch J, 0 mismatches); steps match jiatf-401 section c, areas 4 and
  5 carry `system`; 5.5 interceptors and 5.5b per minute are distinct rows.
- `nextId`: lowest unused number, `DA` then `DA-2`, zero-padded Q and H ids (scratch K).
- Fence: no React, DOM, zustand or `src/workers` import under `src/engine`; the eslint rule
  covers react, state, ui, features, `window` and `document`.
- Worker client handles the `error` message and `onerror`, and terminates the worker on settle.

## Scratch checks

Files: `scratchpad/review.scratch.test.ts`, `why.scratch.test.ts`, `why2.scratch.test.ts`, run
with `npx vitest run --config scratchpad/vitest.scratch.config.mts` from the worktree. All passed;
the findings above quote their console output.
