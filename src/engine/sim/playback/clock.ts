/**
 * Engine sample step, seconds: the default sweep step and the grid of the
 * series builders and the chart kit. The sweep itself runs at the manifest
 * step (`McSettings.sweepStepS`, default DT) through a SweepClock below.
 */
export const DT = 0.5;

/**
 * DT step count of a sample time, rounded; two samples DT apart never share
 * it. The engine's samples can sit off the grid (t = delayS + k * DT), so a
 * rounded count, not a grid placement, keys a draw (series.ts keeps its own
 * grid placement, a different question).
 */
export function stepIndex(tS: number): number {
  return stepCount(tS, DT);
}

/** Step count of a sample time at an arbitrary step, rounded. stepIndex is stepCount at DT. */
export function stepCount(tS: number, stepS: number): number {
  return Math.round(tS / stepS);
}

/** Tolerance for a sample time landing on a window edge or the base grid, seconds. */
const STEP_EPS = 1e-9;

/** One fine-step request: `stepS` in force on [fromS, toS) for `effectorId`. */
export interface FineStepRequest {
  effectorId: string;
  fromS: number;
  toS: number;
  stepS: number;
}

/**
 * The step contract of one sweep (sim.ts per threat, attrition.ts per run).
 *
 * `baseS` is the manifest step; the sweep advances `t = clock.next(t)` from
 * `originS`. With no request `next(t)` is exactly `t + baseS`, the same
 * accumulation as the old `t += DT` loop, so every sample time at 0.5 s is
 * bit-identical to the fixed step.
 *
 * Fine step: `requestFineStep(effectorId, fromS, toS,
 * stepS)` asks for `stepS` (clamped to baseS) on [fromS, toS). It may be
 * called before or during the sweep; it takes effect at the next `next(t)`.
 * Honoured only inside the window: the sweep enters the window at `fromS`
 * (when fromS falls between two base samples), samples at the finest
 * requested step of every window containing t, lands on `toS`, then returns
 * to the base grid `originS + k * baseS` at the first grid time after the
 * window. A request with a non-positive step, an empty window, or a window
 * that ends at or before `t` changes nothing. Requests are per clock, so a
 * burst in one replicate never touches another.
 */
export interface SweepClock {
  readonly baseS: number;
  readonly originS: number;
  /** The requests made so far, in call order (read-only view for tests and reports). */
  readonly requests: readonly FineStepRequest[];
  requestFineStep(effectorId: string, fromS: number, toS: number, stepS: number): void;
  /** The step in force at t: the finest step of every window containing t, else baseS. */
  stepAt(t: number): number;
  /** The sample time after t; see the interface comment for the window rules. */
  next(t: number): number;
  /** Every sample time from originS through endS inclusive under the requests made so far. */
  samples(endS: number): number[];
}

/** The clock of one sweep at `baseS` (the manifest step) from `originS`. */
export function createSweepClock(baseS: number = DT, originS = 0): SweepClock {
  if (!(baseS > 0) || !Number.isFinite(baseS))
    throw new Error(`Sweep step must be positive: ${baseS}`);
  const requests: FineStepRequest[] = [];
  const stepAt = (t: number): number => {
    let step = baseS;
    for (const r of requests) {
      if (r.fromS - STEP_EPS <= t && t < r.toS - STEP_EPS) step = Math.min(step, r.stepS);
    }
    return step;
  };
  const next = (t: number): number => {
    // The fixed-step path: the exact accumulation of the old loop.
    if (requests.length === 0) return t + baseS;
    const step = stepAt(t);
    if (step < baseS) {
      // Inside a window: the fine step, landing on the earliest window end ahead.
      let end = Number.POSITIVE_INFINITY;
      for (const r of requests) {
        if (r.fromS - STEP_EPS <= t && t < r.toS - STEP_EPS) end = Math.min(end, r.toS);
      }
      return Math.min(t + step, end);
    }
    // Outside every window: the next base grid time, unless a window opens first.
    const k = (t - originS) / baseS;
    const onGrid = Math.abs(k - Math.round(k)) < STEP_EPS;
    let candidate = onGrid ? t + baseS : originS + (Math.floor(k + STEP_EPS) + 1) * baseS;
    for (const r of requests) {
      if (r.fromS > t + STEP_EPS && r.fromS < candidate - STEP_EPS && r.toS > r.fromS)
        candidate = r.fromS;
    }
    return candidate;
  };
  return {
    baseS,
    originS,
    requests,
    requestFineStep(effectorId, fromS, toS, stepS) {
      if (!(stepS > 0) || !Number.isFinite(stepS) || !(toS > fromS)) return;
      requests.push({ effectorId, fromS, toS, stepS: Math.min(stepS, baseS) });
    },
    stepAt,
    next,
    samples(endS) {
      const out: number[] = [];
      for (let t = originS; t <= endS + STEP_EPS; t = next(t)) out.push(t);
      return out;
    },
  };
}
