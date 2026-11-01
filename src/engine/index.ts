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
