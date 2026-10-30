// Public engine surface. Pure: no React, DOM or app state.
export { preview } from './preview';
export type {
  Preview,
  ThreatPreview,
  Stages,
  StageTime,
  FirstDetection,
  PreviewOptions,
} from './preview';
export { toScenario, DEFAULTS, toSwerling, threatAltitudeM, threatSpeedMs } from './adapter';
export { run, replicateRunId, stageAtLeast, stageRank } from './run';
export type { RunResult, RunTrace, TraceKey, TracePoint, Progress } from './run';
export { score, scoreOne, evaluate, bootstrap, MEASURE_FORMULAS } from './score';
export type { Score, ScoreOptions, Evaluation, MeasureFormula } from './score';
export { sweep, applyFactor } from './sweep';
export type { Sweep, SweepCell, Factor, FactorKind } from './sweep';
export { runTrial } from './sim/playback/trial';
export { createTrialManifest } from './sim/playback/trialTypes';
export type { TrialManifest, TrialResult } from './sim/playback/trialTypes';
export type { Scenario } from './sim/model/types';
export { wilson, meanInterval, quantile } from './sim/analysis/stats';
export type { Interval } from './sim/analysis/stats';
export { mulberry32, idHash, hashU01 } from './sim/geometry/prng';
