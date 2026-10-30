/**
 * Statistics shared by the analysis and playback engines: the Wilson
 * interval, the beta quantile, the t-based mean interval and the type 7
 * quantile. Pure functions only; no DOM, no React, no external libraries.
 */

export interface Interval {
  lo: number;
  hi: number;
  method: 'wilson';
}

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

function logGamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  const zz = z - 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < LANCZOS.length; i++) x += LANCZOS[i]! / (zz + i + 1);
  const t = zz + LANCZOS.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Continued fraction for the incomplete beta (modified Lentz's method). */
function betaContinuedFraction(x: number, a: number, b: number): number {
  const tiny = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-14) break;
  }
  return h;
}

function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const logFront =
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x);
  const front = Math.exp(logFront);
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(x, a, b)) / a;
  return 1 - (front * betaContinuedFraction(1 - x, b, a)) / b;
}

/** Beta distribution quantile by bisection on the regularized incomplete beta. */
export function betaQuantile(p: number, a: number, b: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (regularizedIncompleteBeta(mid, a, b) < p) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-15) break;
  }
  return (lo + hi) / 2;
}

// One-entry memo: a band pass asks for the same (p, df) once per grid step.
let lastP = NaN;
let lastDf = NaN;
let lastT = NaN;

/** Student t quantile from the incomplete beta relation; exact for every df. */
function tQuantile(p: number, df: number): number {
  if (p === 0.5) return 0;
  if (p === lastP && df === lastDf) return lastT;
  const pp = p < 0.5 ? 1 - p : p;
  const x = betaQuantile(2 * (1 - pp), df / 2, 0.5);
  const t = Math.sqrt((df * (1 - x)) / x);
  lastP = p;
  lastDf = df;
  lastT = p < 0.5 ? -t : t;
  return lastT;
}

/** Wilson interval, the default binomial interval. n must be positive. */
export function wilson(x: number, n: number, z = 1.96): Interval & { p: number } {
  const p = x / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return { p, lo: Math.max(0, center - half), hi: Math.min(1, center + half), method: 'wilson' };
}

/**
 * Mean with a t-based confidence interval. The t quantile is exact from the
 * regularized incomplete beta for every sample size.
 * n = 0 returns NaN fields; n = 1 returns a degenerate interval at the mean.
 * The sample need not be sorted; `sortedMeanInterval` is the same arithmetic
 * on a buffer the caller already owns.
 */
export function meanInterval(
  values: ArrayLike<number>,
  conf = 0.95,
): { mean: number; lo: number; hi: number; sd: number; n: number } {
  return sortedMeanInterval(values, conf);
}

/**
 * `meanInterval` over a buffer the caller owns. No copy. Order is not read
 * for the mean; `statOf` passes the ascending sample so this sum matches the
 * quantile buffer. Two passes: the mean, then the sample variance.
 */
export function sortedMeanInterval(
  sorted: ArrayLike<number>,
  conf = 0.95,
): { mean: number; lo: number; hi: number; sd: number; n: number } {
  const n = sorted.length;
  if (n === 0) return { mean: NaN, lo: NaN, hi: NaN, sd: NaN, n: 0 };
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += sorted[i]!;
  const mean = sum / n;
  if (n === 1) return { mean, lo: mean, hi: mean, sd: 0, n };
  let ss = 0;
  for (let i = 0; i < n; i += 1) {
    const d = sorted[i]! - mean;
    ss += d * d;
  }
  const sd = Math.sqrt(ss / (n - 1));
  const t = tQuantile(1 - (1 - conf) / 2, n - 1);
  const half = (t * sd) / Math.sqrt(n);
  return { mean, lo: mean - half, hi: mean + half, sd, n };
}

/** Quantile with linear interpolation between order statistics (type 7). */
export function quantile(values: number[], q: number): number {
  return sortedQuantile(
    [...values].sort((a, b) => a - b),
    q,
  );
}

/** `quantile` over values already in ascending order; no copy and no sort. */
export function sortedQuantile(sorted: ArrayLike<number>, q: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const pos = Math.min(Math.max(q, 0), 1) * (n - 1);
  const base = Math.floor(pos);
  const frac = pos - base;
  if (base + 1 >= n) return sorted[n - 1]!;
  return sorted[base]! + frac * (sorted[base + 1]! - sorted[base]!);
}
