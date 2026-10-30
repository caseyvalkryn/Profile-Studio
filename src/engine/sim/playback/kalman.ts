import type { Covariance4, TrackMeasurement, TrackState } from './trackTypes';

/**
 * Constant-velocity Kalman filter over (x, y, vx, vy) in board meters and
 * m/s, with the flat row-major `Covariance4` of the track contract. Pure
 * functions: every call returns new arrays. The process model is continuous
 * white-noise acceleration (CWNA) with spectral density q in m^2/s^3; the
 * measurement is position only with a full 2x2 noise from `TrackMeasurement`.
 */

/**
 * Process noise spectral density for a small UAS, m^2/s^3, from
 * q = a^2 * tau with a near 1 m/s^2 over about 1 s (a heading change, a gust).
 */
export const PROCESS_NOISE_Q = 1;

/**
 * Position 1 sigma at which quality is 0.5, meters: the scale of a small
 * interceptor's terminal seeker basket and of the library's resolution cells.
 */
export const QUALITY_SCALE_M = 50;

/**
 * Initial velocity 1 sigma per axis, m/s, when a track opens from one position
 * measurement: a 30 m/s speed at a uniform heading has a per-axis rms of
 * 30 / sqrt(2) = 21 m/s.
 */
export const INIT_SPEED_SIGMA_MPS = 20;

/** The zero covariance of a truth track. */
export const ZERO_COVARIANCE: Covariance4 = Object.freeze(new Array<number>(16).fill(0));

/**
 * Predict the state and covariance forward by dtS under constant velocity
 * with CWNA process noise of spectral density q. Per axis the process
 * covariance is q * [[dt^3/3, dt^2/2], [dt^2/2, dt]]; x and y are
 * independent. The predicted covariance is symmetrized.
 */
export function predict(
  state: TrackState,
  cov: Covariance4,
  dtS: number,
  q: number,
): { state: TrackState; cov: Covariance4 } {
  const T = dtS;
  const next: TrackState = {
    x: state.x + state.vx * T,
    y: state.y + state.vy * T,
    vx: state.vx,
    vy: state.vy,
    tS: state.tS + T,
  };
  // F P F^T with F = [[I, T I], [0, I]]: block by block on the 2x2 quadrants.
  const P = cov;
  const out = new Array<number>(16).fill(0);
  const q3 = (q * T * T * T) / 3;
  const q2 = (q * T * T) / 2;
  const q1 = q * T;
  for (let i = 0; i < 2; i += 1) {
    for (let j = 0; j < 2; j += 1) {
      const pp = P[4 * i + j]!;
      const pv = P[4 * i + (j + 2)]!;
      const vp = P[4 * (i + 2) + j]!;
      const vv = P[4 * (i + 2) + (j + 2)]!;
      out[4 * i + j] = pp + T * (pv + vp) + T * T * vv;
      out[4 * i + (j + 2)] = pv + T * vv;
      out[4 * (i + 2) + j] = vp + T * vv;
      out[4 * (i + 2) + (j + 2)] = vv;
    }
  }
  out[0]! += q3;
  out[5]! += q3;
  out[2]! += q2;
  out[8]! += q2;
  out[7]! += q2;
  out[13]! += q2;
  out[10]! += q1;
  out[15]! += q1;
  return { state: next, cov: symmetrize(out) };
}

/**
 * Position-only update in Joseph form, P = (I - K H) P (I - K H)^T + K R K^T,
 * so the covariance stays symmetric positive semidefinite for any gain.
 * H selects (x, y); R is the measurement's 2x2 noise.
 */
export function update(
  state: TrackState,
  cov: Covariance4,
  measurement: TrackMeasurement,
): { state: TrackState; cov: Covariance4 } {
  const P = cov;
  const rxx = measurement.sigmaXM * measurement.sigmaXM;
  const ryy = measurement.sigmaYM * measurement.sigmaYM;
  const rxy = measurement.rhoXY * measurement.sigmaXM * measurement.sigmaYM;
  // Innovation covariance S = H P H^T + R, 2x2.
  const s00 = P[0]! + rxx;
  const s01 = P[1]! + rxy;
  const s11 = P[5]! + ryy;
  const det = s00 * s11 - s01 * s01;
  if (!(det > 0)) return { state: { ...state, tS: measurement.tS }, cov: symmetrize([...P]) };
  const i00 = s11 / det;
  const i01 = -s01 / det;
  const i11 = s00 / det;
  // Gain K = P H^T S^-1, 4x2: row k is (P[k][0], P[k][1]) times S^-1.
  const K = new Array<number>(8);
  for (let k = 0; k < 4; k += 1) {
    const a = P[4 * k]!;
    const b = P[4 * k + 1]!;
    K[2 * k] = a * i00 + b * i01;
    K[2 * k + 1] = a * i01 + b * i11;
  }
  const dx = measurement.x - state.x;
  const dy = measurement.y - state.y;
  const next: TrackState = {
    x: state.x + K[0]! * dx + K[1]! * dy,
    y: state.y + K[2]! * dx + K[3]! * dy,
    vx: state.vx + K[4]! * dx + K[5]! * dy,
    vy: state.vy + K[6]! * dx + K[7]! * dy,
    tS: measurement.tS,
  };
  // A = I - K H, 4x4: column 0 and 1 carry -K, the rest is the identity.
  const A = new Array<number>(16).fill(0);
  for (let k = 0; k < 4; k += 1) {
    A[4 * k + k] = 1;
    A[4 * k]! -= K[2 * k]!;
    A[4 * k + 1]! -= K[2 * k + 1]!;
  }
  // AP = A P.
  const AP = new Array<number>(16).fill(0);
  for (let i = 0; i < 4; i += 1) {
    for (let j = 0; j < 4; j += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += A[4 * i + k]! * P[4 * k + j]!;
      AP[4 * i + j] = sum;
    }
  }
  // out = AP A^T + K R K^T.
  const out = new Array<number>(16).fill(0);
  for (let i = 0; i < 4; i += 1) {
    const ki0 = K[2 * i]!;
    const ki1 = K[2 * i + 1]!;
    // (K R)_i = (ki0 rxx + ki1 rxy, ki0 rxy + ki1 ryy)
    const kr0 = ki0 * rxx + ki1 * rxy;
    const kr1 = ki0 * rxy + ki1 * ryy;
    for (let j = 0; j < 4; j += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += AP[4 * i + k]! * A[4 * j + k]!;
      out[4 * i + j] = sum + kr0 * K[2 * j]! + kr1 * K[2 * j + 1]!;
    }
  }
  return { state: next, cov: symmetrize(out) };
}

/**
 * Open a track from one position measurement: the position is the
 * measurement with its noise as covariance, the velocity is zero with
 * variance speedSigmaMps^2 per axis and no cross terms.
 */
export function initFromMeasurement(
  m: TrackMeasurement,
  speedSigmaMps: number,
): { state: TrackState; cov: Covariance4 } {
  const cov = new Array<number>(16).fill(0);
  cov[0] = m.sigmaXM * m.sigmaXM;
  cov[5] = m.sigmaYM * m.sigmaYM;
  cov[1] = m.rhoXY * m.sigmaXM * m.sigmaYM;
  cov[4] = cov[1];
  cov[10] = speedSigmaMps * speedSigmaMps;
  cov[15] = cov[10];
  return { state: { x: m.x, y: m.y, vx: 0, vy: 0, tS: m.tS }, cov };
}

/** Position 1 sigma, meters: the root of the mean of var(x) and var(y). */
export function positionSigmaM(cov: Covariance4): number {
  return Math.sqrt(Math.max(0, (cov[0]! + cov[5]!) / 2));
}

/**
 * Track quality in (0, 1] from the position covariance:
 * 1 / (1 + positionSigmaM / QUALITY_SCALE_M). Exactly 1 at zero covariance,
 * 0.5 at QUALITY_SCALE_M, falling toward 0 as the ellipse grows.
 */
export function quality(cov: Covariance4): number {
  return 1 / (1 + positionSigmaM(cov) / QUALITY_SCALE_M);
}

/** Average each off-diagonal pair so rounding never breaks symmetry. */
export function symmetrize(p: number[]): Covariance4 {
  for (let i = 0; i < 4; i += 1) {
    for (let j = i + 1; j < 4; j += 1) {
      const mean = (p[4 * i + j]! + p[4 * j + i]!) / 2;
      p[4 * i + j] = mean;
      p[4 * j + i] = mean;
    }
  }
  return p;
}
