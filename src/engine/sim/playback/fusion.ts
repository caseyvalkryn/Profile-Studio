import type { Scenario } from '../model/types';
import { effectiveDoctrine, entityActive } from '../model/types';
import { defaultLinkLatencyS } from '../analysis/doctrineFactors';
import { DT, stepCount } from './clock';
import { predict, PROCESS_NOISE_Q, quality, symmetrize, ZERO_COVARIANCE } from './kalman';
import type { Covariance4, FusedTrack, TrackEstimate, TrackState } from './trackTypes';

/**
 * Track-to-track fusion at a C2 node. `fuseTracks` combines member sensor
 * tracks in information form: the fused information is the sum of the member
 * inverse covariances, the fused covariance its inverse and the fused state the
 * covariance-weighted mean. `createFusionStage` runs it once per sweep step for
 * one threat. Board meters throughout.
 *
 * Latency. At time t the C2 holds each sensor's estimate as of t - latency. The
 * stage keeps a per-sensor ring of past estimates (latency / DT + 1 entries)
 * and carries the delayed entry to t with the tracker's constant-velocity
 * `predict`, so the covariance grows by the process noise over the delay. A
 * ring rather than a predict-only path, because the estimate as of t - latency
 * is not recoverable from the estimate at t. A truth member is exact at t, so
 * it bypasses the latency and a fusion holding one is the truth at t with zero
 * covariance and `source: 'truth'`.
 *
 * With no C2 node every live sensor track fuses at the sensors with no latency.
 * A sensor with no C2 link on a board that has links also fuses at the sensors
 * (NO_C2) and competes with the nodes on quality.
 *
 * With `truthTracks` off, the stage drops truth members from a fusion that has
 * at least one estimate member, so a sensor with no range or azimuth accuracy
 * cannot make a mixed fusion exact. A fusion whose members are all truth
 * stands. With the switch on nothing is dropped.
 */

/**
 * Fire-control quality floor on the fused track, in the tracker's quality scale
 * (kalman.ts `quality`): 0.5 is a position 1 sigma of QUALITY_SCALE_M, 50 m.
 * The stable track condition of sim.ts requires the fused quality at or above
 * it.
 */
export const FC_QUALITY_MIN = 0.5;

/**
 * Diagonal regularization for a member covariance that is singular but not
 * zero, m^2 or (m/s)^2. 1e-6 is far below any sensor accuracy in the library,
 * so it makes the inverse exist without moving a live member's weight.
 */
export const COVARIANCE_FLOOR = 1e-6;

/** `c2Id` of a fused track built at the sensors because no C2 node receives them. */
export const NO_C2 = '';

/** True for the all-zero covariance of a truth track. */
export function isZeroCovariance(cov: Covariance4): boolean {
  for (let i = 0; i < 16; i += 1) if (cov[i] !== 0) return false;
  return true;
}

/**
 * Inverse of a 4x4 row-major matrix by Gauss-Jordan elimination with partial
 * pivoting; null when a pivot is zero or not finite (singular input).
 */
export function invert4(m: readonly number[]): number[] | null {
  const a = new Array<number>(32);
  for (let i = 0; i < 4; i += 1) {
    for (let j = 0; j < 4; j += 1) {
      a[8 * i + j] = m[4 * i + j]!;
      a[8 * i + 4 + j] = i === j ? 1 : 0;
    }
  }
  for (let col = 0; col < 4; col += 1) {
    let pivot = col;
    let best = Math.abs(a[8 * col + col]!);
    for (let r = col + 1; r < 4; r += 1) {
      const v = Math.abs(a[8 * r + col]!);
      if (v > best) {
        best = v;
        pivot = r;
      }
    }
    if (!(best > 0) || !Number.isFinite(best)) return null;
    if (pivot !== col) {
      for (let j = 0; j < 8; j += 1) {
        const tmp = a[8 * col + j];
        a[8 * col + j] = a[8 * pivot + j]!;
        a[8 * pivot + j] = tmp!;
      }
    }
    const p = a[8 * col + col]!;
    for (let j = 0; j < 8; j += 1) a[8 * col + j]! /= p;
    for (let r = 0; r < 4; r += 1) {
      if (r === col) continue;
      const f = a[8 * r + col]!;
      if (f === 0) continue;
      for (let j = 0; j < 8; j += 1) a[8 * r + j]! -= f * a[8 * col + j]!;
    }
  }
  const out = new Array<number>(16);
  for (let i = 0; i < 4; i += 1) {
    for (let j = 0; j < 4; j += 1) out[4 * i + j] = a[8 * i + 4 + j]!;
  }
  return out;
}

/** Inverse of a member covariance, regularized by COVARIANCE_FLOOR on the diagonal when singular. */
function memberInformation(cov: Covariance4): number[] | null {
  const inv = invert4(cov);
  if (inv) return inv;
  const floored = [...cov];
  for (let i = 0; i < 4; i += 1) floored[4 * i + i]! += COVARIANCE_FLOOR;
  return invert4(floored);
}

/** Fused track quality: the tracker's quality map on the fused covariance. */
export function fusedQuality(cov: Covariance4): number {
  return quality(cov);
}

function stateVector(s: TrackState): number[] {
  return [s.x, s.y, s.vx, s.vy];
}

/** Id of the fused track a C2 (or the sensor set) holds on one target. */
export function fusedTrackId(c2Id: string, uasId: string | null): string {
  return `${c2Id || 'sensors'}:fused:${uasId ?? 'false'}`;
}

/**
 * Fuse member tracks, every one already carried to `tS`, into one track at
 * `c2Id`. Information-form weighting: Y = sum(P_i^-1), P = Y^-1,
 * x = P sum(P_i^-1 x_i). A truth member (zero covariance) is exact, so the
 * result is that member's state with zero covariance and `source: 'truth'`.
 * One member returns itself as a fused track. Empty input returns null, as
 * does a set whose covariances cannot be inverted after regularization.
 */
export function fuseTracks(
  members: readonly TrackEstimate[],
  c2Id: string,
  tS: number,
): FusedTrack | null {
  if (members.length === 0) return null;
  const uasId = members.find((m) => m.uasId != null)?.uasId ?? null;
  const sensorIds: string[] = [];
  for (const m of members)
    for (const sid of m.sensorIds) if (!sensorIds.includes(sid)) sensorIds.push(sid);
  const memberTrackIds = members.map((m) => m.id);
  let hits = 0;
  let misses = Number.POSITIVE_INFINITY;
  let coasting = true;
  for (const m of members) {
    hits += m.hits;
    misses = Math.min(misses, m.misses);
    coasting = coasting && m.coasting;
  }
  const common = {
    id: fusedTrackId(c2Id, uasId),
    uasId,
    sensorIds,
    hits,
    misses: Number.isFinite(misses) ? misses : 0,
    coasting,
    c2Id,
    memberTrackIds,
    fusedAtS: tS,
  };
  const truth = members.find((m) => m.source === 'truth' || isZeroCovariance(m.covariance));
  if (truth) {
    return {
      ...common,
      state: { ...truth.state, tS },
      covariance: ZERO_COVARIANCE,
      quality: 1,
      source: 'truth',
    };
  }
  if (members.length === 1) {
    const m = members[0]!;
    return {
      ...common,
      state: { ...m.state, tS },
      covariance: [...m.covariance],
      quality: m.quality,
      source: m.source,
    };
  }
  const Y = new Array<number>(16).fill(0);
  const y = new Array<number>(4).fill(0);
  let used = 0;
  for (const m of members) {
    const info = memberInformation(m.covariance);
    if (!info) continue;
    used += 1;
    const x = stateVector(m.state);
    for (let i = 0; i < 16; i += 1) Y[i]! += info[i]!;
    for (let i = 0; i < 4; i += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += info[4 * i + k]! * x[k]!;
      y[i]! += sum;
    }
  }
  if (used === 0) return null;
  const P = invert4(Y);
  if (!P) return null;
  const cov = symmetrize(P);
  const x = new Array<number>(4).fill(0);
  for (let i = 0; i < 4; i += 1) {
    let sum = 0;
    for (let k = 0; k < 4; k += 1) sum += cov[4 * i + k]! * y[k]!;
    x[i] = sum;
  }
  return {
    ...common,
    state: { x: x[0]!, y: x[1]!, vx: x[2]!, vy: x[3]!, tS },
    covariance: cov,
    quality: fusedQuality(cov),
    source: 'estimate',
  };
}

/** One sensor-to-C2 link a report travels: the sensor, the node and the latency charged. */
export interface C2Link {
  c2Id: string;
  sensorId: string;
  latencyS: number;
}

/**
 * Sensor-to-C2 links among the active entities, in scenario connection
 * order, with the latency rule of killChainRoutes: the connection's
 * `latencyS`, else the doctrine default hop latency when doctrine is
 * enabled, else 0. The first hop of every route through a C2; interop hops
 * beyond the first C2 are not walked, the first node fuses.
 */
export function c2LinksFor(scenario: Scenario, sensorIds: ReadonlySet<string>): C2Link[] {
  const active = new Map(scenario.entities.filter(entityActive).map((e) => [e.id, e]));
  const doctrine = effectiveDoctrine(scenario);
  const links: C2Link[] = [];
  for (const c of scenario.connections) {
    const from = active.get(c.fromId);
    const to = active.get(c.toId);
    if (!from || !to || from.kind !== 'sensor' || to.kind !== 'c2' || !sensorIds.has(from.id))
      continue;
    const latencyS = c.latencyS ?? (doctrine.enabled ? defaultLinkLatencyS(from.kind, to.kind) : 0);
    links.push({ c2Id: to.id, sensorId: from.id, latencyS });
  }
  return links;
}

/**
 * The estimate a C2 holds at `tS` from a sensor ring of consecutive
 * per-step estimates (oldest first, last at `tS`): the entry `latencyS`
 * ago carried to `tS` by the constant-velocity predict. A truth entry
 * bypasses the latency and the current entry is returned. Null when the
 * track is younger than the latency: no report has reached the node yet.
 */
export function delayedMember(
  ring: readonly TrackEstimate[],
  latencyS: number,
  tS: number,
  stepS = DT,
): TrackEstimate | null {
  const last = ring[ring.length - 1];
  if (!last) return null;
  if (last.source === 'truth') return last;
  const back = stepCount(latencyS, stepS);
  const entry = ring[ring.length - 1 - back];
  if (!entry) return null;
  if (back === 0) return entry;
  const dt = tS - entry.state.tS;
  if (!(dt > 0)) return entry;
  const carried = predict(entry.state, entry.covariance, dt, PROCESS_NOISE_Q);
  return { ...entry, state: carried.state, covariance: carried.cov, quality: quality(carried.cov) };
}

/** The per-step fusion of one threat's sensor tracks; see the module comment. */
export interface FusionStage {
  /** Once per step, before the sweep steps the tracker. */
  begin(): void;
  /** The tracker's sink: one live sensor estimate this step. */
  observe(estimate: TrackEstimate): void;
  /** Once per step, after the sweep: the fused track at `tS`, or null when nothing has reached a node. */
  fuse(tS: number): FusedTrack | null;
  /** Sensor ids that emitted an estimate this step, with the estimate. Valid until the next `begin`. */
  readonly current: ReadonlyMap<string, TrackEstimate>;
  /** True when some sensor links to a C2 node: fusion happens at the node after latency. */
  readonly viaC2: boolean;
}

/**
 * Members admitted to one fusion: with `truthTracks` off, truth members are
 * dropped when an estimate member is present. Returns the input when nothing
 * is dropped.
 */
export function admitMembers(
  members: readonly TrackEstimate[],
  truthTracks: boolean,
): readonly TrackEstimate[] {
  if (truthTracks) return members;
  if (!members.some((m) => m.source === 'estimate')) return members;
  return members.filter((m) => m.source !== 'truth');
}

/**
 * Build the fusion stage of one threat over `links` (c2LinksFor). With links,
 * each C2 fuses the delayed reports of its linked sensors, the sensors with no
 * link fuse at the sensors (NO_C2), and the fused track with the highest
 * quality is the step's picture; ties go to link order, then the unlinked set.
 * Duplicate links from one sensor to one node count once, with the first link's
 * latency. Without links every current estimate fuses at the sensors.
 */
export function createFusionStage(
  links: readonly C2Link[],
  truthTracks = false,
  stepS = DT,
): FusionStage {
  const current = new Map<string, TrackEstimate>();
  const rings = new Map<string, TrackEstimate[]>();
  const ringDepth = new Map<string, number>();
  const byC2 = new Map<string, C2Link[]>();
  for (const link of links) {
    const list = byC2.get(link.c2Id);
    if (list) {
      if (list.some((l) => l.sensorId === link.sensorId)) continue;
      list.push(link);
    } else byC2.set(link.c2Id, [link]);
    const depth = stepCount(link.latencyS, stepS) + 1;
    ringDepth.set(link.sensorId, Math.max(ringDepth.get(link.sensorId) ?? 1, depth));
  }
  const viaC2 = byC2.size > 0;
  const fuseAdmitted = (members: readonly TrackEstimate[], c2Id: string, tS: number) =>
    fuseTracks(admitMembers(members, truthTracks), c2Id, tS);
  return {
    current,
    viaC2,
    begin() {
      current.clear();
    },
    observe(estimate) {
      const sensorId = estimate.sensorIds[0];
      if (sensorId == null) return;
      current.set(sensorId, estimate);
      if (!viaC2) return;
      const depth = ringDepth.get(sensorId);
      if (depth == null) return;
      let ring = rings.get(sensorId);
      if (!ring) {
        ring = [];
        rings.set(sensorId, ring);
      }
      ring.push(estimate);
      if (ring.length > depth) ring.shift();
    },
    fuse(tS) {
      if (!viaC2) return fuseAdmitted([...current.values()], NO_C2, tS);
      // A sensor that emitted nothing this step dropped its track: its ring restarts.
      for (const [sensorId, ring] of rings) if (!current.has(sensorId)) ring.length = 0;
      let best: FusedTrack | null = null;
      const members: TrackEstimate[] = [];
      for (const [c2Id, c2Links] of byC2) {
        members.length = 0;
        for (const link of c2Links) {
          const ring = rings.get(link.sensorId);
          if (!ring) continue;
          const member = delayedMember(ring, link.latencyS, tS, stepS);
          if (member) members.push(member);
        }
        const fused = fuseAdmitted(members, c2Id, tS);
        if (fused && (!best || fused.quality > best.quality)) best = fused;
      }
      // Sensors with no C2 link fuse at the sensors and compete on quality.
      members.length = 0;
      for (const [sensorId, estimate] of current)
        if (!ringDepth.has(sensorId)) members.push(estimate);
      if (members.length > 0) {
        const fused = fuseAdmitted(members, NO_C2, tS);
        if (fused && (!best || fused.quality > best.quality)) best = fused;
      }
      return best;
    },
  };
}
