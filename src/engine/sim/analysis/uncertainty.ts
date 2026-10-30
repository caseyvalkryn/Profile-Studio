/**
 * Parameter spreads: which library fields carry uncertainty, how wide, and how a
 * scenario is sampled from them. Pure; the engine reads the sampled scenario.
 *
 * Unit conventions, one place:
 * - lognormal `sigmaDb` is a POWER ratio in decibels: the sample is
 *   `nominal * 10^(sigmaDb * z / 10)`, so a 3 dB sigma is a factor of 2 at one sigma.
 * - triangular `lo` and `hi` are FRACTIONS of the nominal (`-0.2` is 20 percent under,
 *   `+0.3` is 30 percent over) with the mode at the nominal. One row serves every value.
 * - beta from the PF table (`pseudo`): `trials` is a pseudo-count and the mean sits at the
 *   nominal (`a = nominal * trials`, `b = (1 - nominal) * trials`). Beta from a provenance
 *   row is a stated count (`successes` of `trials`) under a Jeffreys prior
 *   (`a = successes + 0.5`, `b = failures + 0.5`), so an all-success row keeps a spread.
 */
import type { Connection, FireDoctrine, Scenario, SpecModel, Spread } from '../model/types';
import { effectiveDoctrine } from '../model/types';
import { rcsM2For } from '../model/rcsFactors';
import { bdaSFor, defaultLinkLatencyS, targetSFor, trackInitSFor } from './doctrineFactors';
import { DEFAULT_PK } from '../playback/pk';
import { betaQuantile } from './stats';

import { FIELDS_BY_KIND, hasSpec, modelsInUse, PF_SPREAD, spreadFor } from './parameterBasis';
export { PF_SPREAD, spreadFor, uncertainFields } from './parameterBasis';
export type { PfSpreadRow, UncertainField } from './parameterBasis';

const SQRT_2PI = Math.sqrt(2 * Math.PI);

/** erf by its Maclaurin series; used below 2.5 where it converges to double precision. */
function erfSeries(x: number): number {
  let term = x;
  let sum = x;
  const x2 = x * x;
  for (let n = 1; n < 200; n++) {
    term *= -x2 / n;
    const add = term / (2 * n + 1);
    sum += add;
    if (Math.abs(add) < 1e-17 * Math.abs(sum)) break;
  }
  return (2 / Math.sqrt(Math.PI)) * sum;
}

/** erfc for x >= 2.5 by the Lentz continued fraction, accurate to double precision there. */
function erfcTail(x: number): number {
  const tiny = 1e-300;
  let f = tiny;
  let c = f;
  let d = 0;
  for (let n = 0; n < 300; n++) {
    const an = n === 0 ? 1 : n / 2;
    d = x + an * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = x + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = c * d;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return (Math.exp(-x * x) / Math.sqrt(Math.PI)) * f;
}

/** Complementary error function, full double precision on both branches. */
function erfc(x: number): number {
  if (x < 0) return 2 - erfc(-x);
  if (x < 2.5) return 1 - erfSeries(x);
  return erfcTail(x);
}

/**
 * Standard normal quantile by Acklam's rational approximation with one Halley refinement
 * step through erfc. Tested against 1.959964 at p 0.975. Returns -Infinity at 0 and
 * Infinity at 1.
 */
export function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
    -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  let x: number;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x =
      (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  } else if (p <= 1 - pLow) {
    const q = p - 0.5;
    const r = q * q;
    x =
      ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
      (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x =
      -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  const e = 0.5 * erfc(-x / Math.SQRT2) - p;
  const u = e * SQRT_2PI * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

const BETA_EPS = 1e-9;

/** The hash uniform is [0, 1); u is clamped to [U_EPS, 1 - U_EPS] so every quantile is finite. */
const U_EPS = 2 ** -32;

/**
 * Inverse-CDF sample of one spread at u in (0, 1) around the nominal value.
 * Lognormal: `nominal * 10^(sigmaDb * z / 10)` with `z = normalQuantile(u)`; sigmaDb is a
 * power ratio. Triangular: mode at the nominal, bounds `nominal * (1 + lo)` and
 * `nominal * (1 + hi)` (lo and hi are fractions); u 0.5 returns the nominal only when the
 * bounds are symmetric, an asymmetric spread returns its median. Beta: `betaQuantile(u, a,
 * b)` with `a = nominal * trials`, `b = (1 - nominal) * trials` (a PF table spread), or the
 * stated counts under a Jeffreys prior, `a = successes + 0.5`, `b = trials - successes +
 * 0.5` (a provenance row spread; 2 of 2 or 61 of 61 would otherwise be the constant 1);
 * the result is clamped to the open interval (0, 1). `u` is clamped to [U_EPS, 1 - U_EPS]
 * first, so u 0 from the hash never takes a lognormal to 0.
 */
export function sampleSpread(nominal: number, spread: Spread, uRaw: number): number {
  const u = Math.min(1 - U_EPS, Math.max(U_EPS, uRaw));
  if (spread.kind === 'lognormal') {
    return nominal * Math.pow(10, (spread.sigmaDb * normalQuantile(u)) / 10);
  }
  if (spread.kind === 'triangular') {
    const a = nominal * (1 + spread.lo);
    const c = nominal * (1 + spread.hi);
    const width = c - a;
    if (width <= 0) return nominal;
    const fMode = (nominal - a) / width;
    if (u < fMode) return a + Math.sqrt(u * width * (nominal - a));
    return c - Math.sqrt((1 - u) * width * (c - nominal));
  }
  const rowCounts = !isTableSpread(spread);
  const mean = Math.min(1 - BETA_EPS, Math.max(BETA_EPS, nominal));
  const a = rowCounts ? spread.successes + 0.5 : mean * spread.trials;
  const b = rowCounts ? spread.trials - spread.successes + 0.5 : (1 - mean) * spread.trials;
  const x = betaQuantile(u, Math.max(a, BETA_EPS), Math.max(b, BETA_EPS));
  return Math.min(1 - BETA_EPS, Math.max(BETA_EPS, x));
}

/**
 * A beta spread from a provenance row states real counts and is used as is; the PF table
 * beta carries `pseudo` and is rescaled so its mean sits at the nominal. The flag, not
 * object identity, tells them apart, so a clone or a save keeps the distinction.
 */
function isTableSpread(spread: Spread): boolean {
  return spread.kind === 'beta' && spread.pseudo === true;
}

/** The parameter sampler: a uniform in [0, 1), or null to keep the field at its nominal. */
export type ParamSampler = (modelId: string, field: string) => number | null;

/** Draw-and-write for one library model; returns the same object when nothing changed. */
function sampleModel(model: SpecModel, doctrine: FireDoctrine, u: ParamSampler): SpecModel {
  if (!hasSpec(model)) return model;
  const fields = FIELDS_BY_KIND[model.kind] ?? [];
  let next: SpecModel | null = null;
  for (const field of fields) {
    const spread = spreadFor(model, field);
    if (!spread) continue;
    const uv = u(model.id, field);
    if (uv == null) continue;
    // A null nominal (an L3 accuracy field, a c2 with no median) draws nothing: the
    // engine's fallback path is not a value to spread.
    const nominal = nominalOf(model, field, doctrine);
    if (!Number.isFinite(nominal)) continue;
    const v = sampleSpread(nominal, spread, uv);
    next = next ?? cloneSpec(model);
    const spec = (next.sensor ?? next.effector ?? next.uas ?? next.c2) as unknown as Record<
      string,
      unknown
    >;
    spec[field] = v;
  }
  return next ?? model;
}

function cloneSpec(model: SpecModel): SpecModel {
  if (model.sensor) return { ...model, sensor: { ...model.sensor } };
  if (model.effector) return { ...model, effector: { ...model.effector } };
  if (model.uas) return { ...model, uas: { ...model.uas } };
  if (model.c2) return { ...model, c2: { ...model.c2 } };
  return { ...model };
}

/** The field's nominal: the spec value, else the resolver the engine uses. */
function nominalOf(model: SpecModel, field: string, doctrine: FireDoctrine): number {
  if (model.sensor) {
    if (field === 'detectRangeM') return model.sensor.detectRangeM;
    if (field === 'trackInitS') return trackInitSFor(model.sensor, doctrine);
    // The accuracy fields have no resolver: a null stays null.
    const v = (model.sensor as unknown as Record<string, unknown>)[field];
    return typeof v === 'number' ? v : NaN;
  }
  if (model.c2) return model.c2.decisionLatencyS ?? NaN;
  if (model.effector) {
    const fx = model.effector;
    if (field === 'pk') return fx.pk ?? DEFAULT_PK[fx.effectorType];
    if (field === 'engageTimeS') return fx.engageTimeS;
    if (field === 'targetS') return targetSFor(fx, doctrine);
    return bdaSFor(fx, doctrine);
  }
  return model.uas ? rcsM2For(model.uas) : NaN;
}

/**
 * A scenario whose library carries the sampled values. Pure; the input is untouched. The
 * result has new `library`, `connections` and `doctrine` objects and shares every other
 * reference. A field whose nominal is absent takes the engine resolver's value and the
 * sample is written into the field (a connection with no `latencyS` takes the kind default).
 * A `null` from `u` keeps that field at its nominal: the spec field is not written and an
 * absent `latencyS` stays absent. Only library models in use (an active entity references
 * them) are sampled; an unused model is returned as the same object.
 */
export function sampleScenario(scenario: Scenario, u: ParamSampler): Scenario {
  const doctrine = effectiveDoctrine(scenario);
  const inUse = modelsInUse(scenario);
  const library = scenario.library.map((m) => (inUse.has(m.id) ? sampleModel(m, doctrine, u) : m));
  const kindOf = new Map(scenario.entities.map((e) => [e.id, e.kind]));
  const latency = PF_SPREAD.latencyS?.spread;
  const connections: Connection[] = scenario.connections.map((c) => {
    if (!latency) return c;
    const uv = u(c.id, 'latencyS');
    if (uv == null) return c;
    const nominal =
      c.latencyS ??
      (doctrine.enabled
        ? defaultLinkLatencyS(kindOf.get(c.fromId) ?? 'sensor', kindOf.get(c.toId) ?? 'c2')
        : 0);
    return { ...c, latencyS: sampleSpread(nominal, latency, uv) };
  });
  const declare = PF_SPREAD.declareHostileS?.spread;
  const uDeclare = declare && doctrine.enabled ? u('doctrine', 'declareHostileS') : null;
  const nextDoctrine: FireDoctrine =
    declare && uDeclare != null
      ? { ...doctrine, declareHostileS: sampleSpread(doctrine.declareHostileS, declare, uDeclare) }
      : { ...doctrine };
  return { ...scenario, library, connections, doctrine: nextDoctrine };
}
