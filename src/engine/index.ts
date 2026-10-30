// Pure TS engine. No React, no DOM, no app layers (enforced in eslint.config.mjs).
// src/engine/sim is the rangeboard headless trial closure, transferred as is (lane 2.3a).
export { runTrial } from './sim/playback/trial';
export { assessAllThreats } from './sim/playback/sim';
export { createTrialManifest } from './sim/playback/trialTypes';
export type { TrialManifest, TrialResult } from './sim/playback/trialTypes';
export type { Scenario } from './sim/model/types';
export { wilson, meanInterval, quantile } from './sim/analysis/stats';
export type { Interval } from './sim/analysis/stats';
export { mulberry32, idHash, hashU01 } from './sim/geometry/prng';
