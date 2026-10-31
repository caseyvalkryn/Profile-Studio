// Public engine surface. Pure: no React, DOM or app state.
export { preview } from './preview';
export { derived, byId, RUNGS, STAGES } from './derived';
export type {
  Derived,
  DerivedStage,
  DerivedStages,
  StageName,
  Ladder,
  Rung,
  RungName,
  WindowSummary,
  Warning,
  FirstSee,
  LastSee,
  SystemTime,
  IdEntry,
  System,
} from './derived';
export { at, readoutAt, originAt, nearestOnPolygon } from './at';
export type { Readout, RangeRef, ReadoutContext } from './at';
export { resolveTokens, legacyUnits, fmtN, mmss } from './tokens';
export type { ResolvedText, TokenIssue, TokenOptions, UnitMode } from './tokens';
export { envelopesAt, hull } from './envelopes';
export type { Envelope, Hull } from './envelopes';
export { trackLineFor } from './trackLine';
export type { TrackSpan, TrackState, TrackLineInput } from './trackLine';
export { crossingsFor } from './crossings';
export type { Crossing } from './crossings';
export { stops, nextStop, prevStop } from './stops';
export { rangeSeriesOf, rangeSeriesCache } from './rangeSeries';
export type { RangeSample } from './rangeSeries';
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
