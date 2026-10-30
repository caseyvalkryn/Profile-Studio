/**
 * Track types: the estimated state a sensor track carries, the fused track a
 * C2 node builds from several of them, the classification matrix a declaration
 * reads, and the measurement the tracker consumes. Board meters throughout:
 * +x east, +y south, m/s for velocity.
 */

/** Estimated kinematic state in board meters and m/s, stamped with the update time. */
export interface TrackState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Simulation time of the last update, seconds. */
  tS: number;
}

/**
 * A 4x4 symmetric covariance over (x, y, vx, vy), flat and row-major: index
 * `4 * row + col`, so `[0]` is var(x), `[5]` var(y), `[10]` var(vx), `[15]`
 * var(vy), and `[1]` equals `[4]` (cov(x, y)). Sixteen entries.
 */
export type Covariance4 = readonly number[];

/** Which path produced a track: the Kalman estimate, the truth path, or a false alarm. */
export type TrackSource = 'estimate' | 'truth' | 'false';

/** One sensor-level track and its uncertainty. */
export interface TrackEstimate {
  id: string;
  /** The target the track follows; null for a false track. */
  uasId: string | null;
  /** Sensors whose measurements built the track. */
  sensorIds: string[];
  state: TrackState;
  covariance: Covariance4;
  /**
   * Track quality in (0, 1], a function of the position covariance: 1 at zero
   * covariance, falling as the position 1 sigma grows (kalman.ts `quality`).
   */
  quality: number;
  /** Measurements that updated the track. */
  hits: number;
  /** Scans the track missed since its last hit. */
  misses: number;
  /** True while the track predicts without a measurement. */
  coasting: boolean;
  source: TrackSource;
}

/** A track a C2 node fused from member sensor tracks. */
export interface FusedTrack extends TrackEstimate {
  c2Id: string;
  /** Ids of the sensor tracks fused into this one. */
  memberTrackIds: string[];
  /** Simulation time of the fusion, seconds. */
  fusedAtS: number;
}

export type { ClassificationBand, ClassificationMatrix } from '../model/types';

/**
 * One Cartesian measurement with its 2x2 noise, in board meters. The tracker
 * converts a sensor's polar accuracy (range, azimuth) to this frame.
 */
export interface TrackMeasurement {
  sensorId: string;
  /** Simulation time of the measurement, seconds. */
  tS: number;
  x: number;
  y: number;
  /** Measurement noise, 1 sigma along x, meters. */
  sigmaXM: number;
  /** Measurement noise, 1 sigma along y, meters. */
  sigmaYM: number;
  /** Correlation of the x and y noise, in [-1, 1]. */
  rhoXY: number;
  /** The target measured; null for a false alarm. */
  uasId: string | null;
}

/** Opt-in current-trial capture of track estimates; default and ensemble paths allocate no history. */
export type TrackEstimateSink = (estimate: TrackEstimate) => void;
