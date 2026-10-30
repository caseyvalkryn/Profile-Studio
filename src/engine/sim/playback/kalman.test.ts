// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Covariance4, TrackMeasurement, TrackState } from './trackTypes';
import {
  INIT_SPEED_SIGMA_MPS,
  initFromMeasurement,
  positionSigmaM,
  predict,
  PROCESS_NOISE_Q,
  quality,
  QUALITY_SCALE_M,
  update,
} from './kalman';

function measurement(x: number, y: number, tS: number, sigma: number): TrackMeasurement {
  return { sensorId: 's', tS, x, y, sigmaXM: sigma, sigmaYM: sigma, rhoXY: 0, uasId: 'u' };
}

/** Run predict then update for n steps at period T with a fixed measurement noise. */
function iterate(
  n: number,
  T: number,
  r: number,
  q: number,
): { state: TrackState; cov: Covariance4 } {
  let { state, cov } = initFromMeasurement(measurement(0, 0, 0, r), INIT_SPEED_SIGMA_MPS);
  for (let k = 1; k <= n; k += 1) {
    ({ state, cov } = predict(state, cov, T, q));
    ({ state, cov } = update(state, cov, measurement(0, 0, k * T, r)));
  }
  return { state, cov };
}

/**
 * Closed form of the steady-state gains for the per-axis constant-velocity
 * filter with continuous white-noise acceleration (CWNA), the process model
 * predict() implements: per axis F = [[1, T], [0, 1]], Q = q [[T^3/3, T^2/2],
 * [T^2/2, T]], H = [1, 0], R = r^2.
 *
 * Derivation. Write the predicted covariance M = [[m11, m12], [m12, m22]],
 * S = m11 + r^2, alpha = m11 / S, beta = T m12 / S (the position gain and
 * the velocity gain times T). The Riccati fixed point M = F (M - M H^T S^-1
 * H M) F^T + Q gives three scalar equations:
 *   (1) m22 - p22 = m12^2 / S = q T          so S = q T^3 / beta^2
 *   (2) m12 alpha = T p22 + q T^2 / 2
 *   (3) m11 alpha = 2 T m12 (1 - alpha) + T^2 p22 + q T^3 / 3
 * Eliminating p22 and S from (3) with (1) and (2):
 *   alpha^2 - 2 beta + alpha beta + beta^2 / 6 = 0                  (A)
 * With the tracking index lambda^2 = q T^3 / r^2 and r^2 = S (1 - alpha):
 *   lambda^2 = beta^2 / (1 - alpha)                                 (B)
 * Put s = sqrt(1 - alpha), so beta = lambda s and alpha = 1 - s^2; (A)
 * becomes the palindromic quartic
 *   s^4 - lambda s^3 + (lambda^2 / 6 - 2) s^2 - lambda s + 1 = 0,
 * which divided by s^2 in w = s + 1/s reads w^2 - lambda w + lambda^2/6 - 4
 * = 0, so w = (lambda + sqrt(lambda^2 / 3 + 16)) / 2 (the root with w >= 2)
 * and s = (w - sqrt(w^2 - 4)) / 2 (the root in (0, 1]). Then
 *   alpha = 1 - s^2,  beta = lambda s.
 * (This is the CWNA counterpart of the Kalata relation; the piecewise-constant
 * model would give beta = 2 (2 - alpha) - 4 sqrt(1 - alpha) instead.)
 */
function closedFormGains(T: number, r: number, q: number): { alpha: number; beta: number } {
  const lambda = Math.sqrt(q * T * T * T) / r;
  const w = (lambda + Math.sqrt((lambda * lambda) / 3 + 16)) / 2;
  const s = (w - Math.sqrt(w * w - 4)) / 2;
  return { alpha: 1 - s * s, beta: lambda * s };
}

describe('kalman constant-velocity filter', () => {
  it('converges to the closed-form steady-state gains of the CWNA tracking index', () => {
    for (const [T, r, q] of [
      [0.5, 20, PROCESS_NOISE_Q],
      [1, 5, 1],
      [4, 50, 0.3],
    ]) {
      // Steady-state predicted covariance M after many cycles: alpha = m11 / (m11 + r^2),
      // beta = T m12 / (m11 + r^2).
      const converged = iterate(2000, T!, r!, q!);
      const { cov } = predict(converged.state, converged.cov, T!, q!);
      const S = cov[0]! + r! * r!;
      const alpha = cov[0]! / S;
      const beta = (T! * cov[2]!) / S;
      const expected = closedFormGains(T!, r!, q!);
      expect(Math.abs(alpha - expected.alpha)).toBeLessThan(1e-6);
      expect(Math.abs(beta - expected.beta)).toBeLessThan(1e-6);
      // The y axis is the same filter.
      expect(Math.abs(cov[5]! / (cov[5]! + r! * r!) - expected.alpha)).toBeLessThan(1e-6);
      expect(Math.abs((T! * cov[7]!) / (cov[5]! + r! * r!) - expected.beta)).toBeLessThan(1e-6);
    }
  });

  it('stays symmetric positive semidefinite after 1000 predict and update steps', () => {
    const { cov } = iterate(1000, 0.5, 15, PROCESS_NOISE_Q);
    for (let i = 0; i < 4; i += 1) {
      expect(cov[4 * i + i]).toBeGreaterThan(0);
      for (let j = 0; j < 4; j += 1) expect(cov[4 * i + j]).toBe(cov[4 * j + i]);
    }
    // Sylvester's criterion on the leading principal minors, and Cauchy-Schwarz on every pair.
    const m2 = cov[0]! * cov[5]! - cov[1]! * cov[4]!;
    expect(m2).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < 4; i += 1) {
      for (let j = i + 1; j < 4; j += 1) {
        expect(cov[4 * i + j]! * cov[4 * i + j]!).toBeLessThanOrEqual(
          cov[4 * i + i]! * cov[4 * j + j]! * (1 + 1e-12),
        );
      }
    }
  });

  it('coasting grows the position sigma monotonically and an update lowers it', () => {
    let { state, cov } = iterate(50, 0.5, 15, PROCESS_NOISE_Q);
    let last = positionSigmaM(cov);
    for (let k = 0; k < 20; k += 1) {
      ({ state, cov } = predict(state, cov, 0.5, PROCESS_NOISE_Q));
      const sigma = positionSigmaM(cov);
      expect(sigma).toBeGreaterThan(last);
      last = sigma;
    }
    const before = positionSigmaM(cov);
    ({ cov } = update(state, cov, measurement(state.x, state.y, state.tS, 15)));
    expect(positionSigmaM(cov)).toBeLessThan(before);
  });

  it('moves the state toward the measurement and carries the constant velocity', () => {
    let { state, cov } = initFromMeasurement(measurement(0, 0, 0, 5), INIT_SPEED_SIGMA_MPS);
    for (let k = 1; k <= 200; k += 1) {
      ({ state, cov } = predict(state, cov, 0.5, PROCESS_NOISE_Q));
      ({ state, cov } = update(state, cov, measurement(10 * k * 0.5, -3 * k * 0.5, k * 0.5, 5)));
    }
    expect(state.vx).toBeCloseTo(10, 1);
    expect(state.vy).toBeCloseTo(-3, 1);
    expect(state.tS).toBe(100);
  });

  it('quality is 1 at zero covariance and 0.5 at the quality scale', () => {
    expect(quality(new Array<number>(16).fill(0))).toBe(1);
    const cov = new Array<number>(16).fill(0);
    cov[0] = QUALITY_SCALE_M * QUALITY_SCALE_M;
    cov[5] = QUALITY_SCALE_M * QUALITY_SCALE_M;
    expect(quality(cov)).toBeCloseTo(0.5, 12);
  });

  it('initFromMeasurement carries the measurement noise and the initial speed sigma', () => {
    const m: TrackMeasurement = {
      sensorId: 's',
      tS: 3,
      x: 1,
      y: 2,
      sigmaXM: 4,
      sigmaYM: 2,
      rhoXY: 0.5,
      uasId: 'u',
    };
    const { state, cov } = initFromMeasurement(m, 7);
    expect(state).toEqual({ x: 1, y: 2, vx: 0, vy: 0, tS: 3 });
    expect(cov[0]).toBe(16);
    expect(cov[5]).toBe(4);
    expect(cov[1]).toBe(4);
    expect(cov[4]).toBe(4);
    expect(cov[10]).toBe(49);
    expect(cov[15]).toBe(49);
  });
});
