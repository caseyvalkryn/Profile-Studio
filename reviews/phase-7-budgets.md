# Phase 7 budgets (lane 7.3)

Measured 2026-10-30 on branch lane/7.3 at fcb417b. Every budget in `docs/spec.md` section 11,
5 samples each unless stated. Script: `e2e/perf/budgets.spec.ts`, run with
`npx playwright test -c e2e/perf/playwright.perf.config.mts` (port 5177, one worker, production
build on `vite preview`). The default `npm run e2e` ignores `e2e/perf/`.

## Results

| Budget | Value measured | Median | Worst | Result | Method |
| --- | --- | --- | --- | --- | --- |
| Map drag, 60 fps, 40 threats x 15 sensors | rAF rate during a 2 s ring drag (RDR-1) | 60.0 fps | 59.5 fps | Pass | Headless, SwiftShader WebGL; ~60 Hz mouse moves; rAF ticks counted in page |
| | worst frame gap, ring drag | 16.8 ms | 33.2 ms | Pass | Same; one 33 ms gap (one dropped frame) in 1 of 5 drags |
| | rAF rate during a 2 s waypoint drag (T1 wp 1) | 60.0 fps | 60.0 fps | Pass | Same |
| | worst frame gap, waypoint drag | 16.8 ms | 16.8 ms | Pass | Same |
| | ring drag, headed, Metal GPU, 120 Hz panel | 116.0 fps | 98.0 fps (gap 50.0 ms) | Pass | `PERF_HEADED=1`; first drag of the session has the long gap |
| | waypoint drag, headed, Metal GPU | 119.5 fps | 119.0 fps (gap 17.0 ms) | Pass | Same |
| Preview after an edit, 100 ms | ring-drag mousemove to timeline svg change, 40 x 15 | 25.3 ms | 26.6 ms | Pass | 12.4 method (MutationObserver on timeline svg and map readout), headless |
| | mousemove to map value readout change | 25.3 ms | 26.6 ms | Pass | Same; headed: median 26.9 ms, worst 28.1 ms |
| Run of 200 replicates, 6 threats, 5 s | Run click to "Run R-n done", swarm template | 2338 ms | 2372 ms | Pass | Run button; n rewritten 100 to 200 at `Worker.postMessage` (no n field in the UI) |
| | progress updates | 201 texts, 0/100 then 1/200 to 200/200 | | Pass | MutationObserver on the "Run progress" status |
| | UI responds during the run | click on the name field focused it 34 to 42 ms after Run | | Pass | Focus event fired before done in 5 of 5 |
| | main-thread worst rAF gap during the run | 33.4 ms | 250.0 ms | Note | 250 ms only on the first run of a page; see below |
| First load, interactive in 2 s | `/` cold cache: FCP | 40 ms | 48 ms | Pass | Performance API, fresh context per sample |
| | `/`: template card click handled | 73 ms | 74 ms | Pass | Capture-phase click listener; Build shown at 109 ms |
| | `/` at 4x CPU throttle: FCP / click / Build | 132 / 166 / 278 ms | 136 / 166 / 280 ms | Pass | CDP `Emulation.setCPUThrottlingRate` 4 |
| | `/build`, stored 40 x 15 vignette: FCP / map grid / click | 32 / 176 / 785 ms | 36 / 178 / 840 ms | Pass | Click on the Library nav link; warm HTTP cache (seeded from `/` first) |
| | `/build` at 4x throttle: FCP / map grid / click | 112 / 514 / 1201 ms | 116 / 530 / 1232 ms | Pass | Same, throttled |
| Entry bundle, 500 kB gzip | entry chunk `index-*.js` | 77.8 kB | | Pass | gzip (zlib default) of `dist/assets` |
| | everything loaded on `/` before the first click | 211.0 kB | | Pass | Resource Timing entries before the click: index 77.8, PromptNumber 116.7, rolldown-runtime 0.4, index.css 15.9, PromptNumber.css 0.2 |
| | MapView chunk (lazy, loads on Build) | 286.5 kB | | Note | Vite warns: chunk over 500 kB raw (1058.9 kB) |

Node (vitest and Playwright's Node runner, 3 to 5 runs):

| Check | Median | Worst | Budget |
| --- | --- | --- | --- |
| `map.perf.test.ts` GeoJSON build, 40 x 15 | 0.073 ms | 0.077 ms | 4 ms |
| `map.perf.test.ts` one drag move | 0.184 ms | 0.185 ms | 2 ms |
| `preview.perf.test.ts` preview, 40 x 15 | 18.8 ms | 19.1 ms | 100 ms |
| `run(v, 200, seed)` headless, swarm template (6 threats) | 3050 ms | 3094 ms | 5 s |

## Method and machine

- Apple M4 Pro, 14 cores, 24 GB. Node v22.23.4. Playwright 1.64.1 with Chromium 156.0.8078.4.
- Headless runs use SwiftShader (software WebGL); the headed rerun of the drag test uses ANGLE
  Metal on the M4 Pro. Headless rAF is capped at 60 Hz; the headed panel runs at 120 Hz.
- CPU throttling: none, and 4x through CDP for the first-load rows only.
- The drag vignette is built with the domain builders (`src/domain/templates/build.ts`): 40 threats
  with 3 waypoints in the north-east quadrant, 15 sensors, one EW effector. It is written into
  IndexedDB (`profile-studio`/`vignettes`) and opened through `/build`.
- Frame rate is the count of rAF ticks over the drag. It shows the main thread kept up; it does not
  measure GPU compositor time.
- First load "click" is when the app's click handler ran. Playwright clicks as soon as the element
  is actionable, so this is an upper bound on time to interactive. `/` loads with a cold cache;
  `/build` loads with a warm cache, because the vignette is seeded from the same origin first.
- The run test cannot set n in the UI: Run sends `DEFAULT_RUN_N` = 100
  (`src/commands/commands.ts:422`). An init script rewrites `n` to 200 on the run request at
  `Worker.prototype.postMessage`. The first progress text reads 0/100 because the store entry is
  created with the UI's n (`src/state/runs.ts:171`) before the worker reports total 200.

## Failures

None. Every budget passes on this machine.

Margins and notes for the record:

1. Run of 200 x 6 uses about half the budget in the browser (2.34 s) and 61 percent in Node
   (3.05 s; Node is slower here than the worker, cause not investigated). The cost is per
   replicate in `src/engine/run.ts:414` (`runTrial` once per replicate in the loop at line 407). A laptop slower than an M4 Pro
   by 1.6x would miss 5 s.
2. Main thread stalls up to 250 ms during the first run of a page. Later runs show 17 to 33 ms.
   Likely cause: the first run's progress patches re-render the run bar 200 times
   (`src/state/runs.ts:188`, one `patch` per replicate) plus first-use code at done. Not profiled.
3. Opening `/build` with a 40 x 15 vignette: the first click lands about 600 ms after the map grid
   draws (785 ms unthrottled, 1.2 s at 4x). The main thread is busy after the map appears,
   likely the preview and timeline for 40 threats plus MapLibre setup. Inside 2 s at 4x.
4. The first ring drag of a session has one 33 to 50 ms gap (one or two dropped frames). Later
   drags show none.
5. `docs/plan.md` section 8 records "Entry 169 kB gzip". The build now splits it into `index`
   (77.8 kB) and a shared `PromptNumber` chunk (116.7 kB), both loaded on `/`; with CSS, 211 kB.
