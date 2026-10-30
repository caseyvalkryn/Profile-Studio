/**
 * Parameter sweep: one or two factors, each with levels. Every cell applies its levels to a
 * copy of the vignette, runs n replicates at the same seed and scores the vignette's
 * measures. Pure and deterministic: the same inputs give the same cells.
 */
import type { Sensor, Threat, Vignette, Waypoint } from '../domain/types';
import { run } from './run';
import { score } from './score';
import type { Score, ScoreOptions } from './score';

export type FactorKind =
  | 'threat-speed'
  | 'threat-altitude'
  | 'approach-bearing'
  | 'sensor-range'
  | 'sensor-position-offset';

export type Factor = {
  kind: FactorKind;
  /** Levels in the factor's unit: m/s, m AGL, degrees, m, m. */
  levels: number[];
  /** Threat or sensor id the factor applies to; every one of that kind when absent. */
  target?: string;
};

export type SweepCell = { levels: number[]; scores: Score[] };

export type Sweep = { factors: Factor[]; cells: SweepCell[] };

function rotate(w: Waypoint, about: Waypoint, deg: number): Waypoint {
  const rad = (deg * Math.PI) / 180;
  const dx = w.x - about.x;
  const dy = w.y - about.y;
  // Clockwise rotation (bearing sense) in an x-east, y-north frame.
  return {
    ...w,
    x: about.x + dx * Math.cos(rad) + dy * Math.sin(rad),
    y: about.y - dx * Math.sin(rad) + dy * Math.cos(rad),
  };
}

function applyThreat(t: Threat, f: Factor, level: number): Threat {
  if (f.target && f.target !== t.id) return t;
  switch (f.kind) {
    case 'threat-speed':
      return { ...t, speedMs: level };
    case 'threat-altitude':
      return { ...t, path: t.path.map((w) => ({ ...w, z: level })) };
    case 'approach-bearing': {
      // Rotate the path about its last waypoint (the objective) so the run-in comes from `level`.
      const end = t.path[t.path.length - 1];
      if (!end || t.path.length < 2) return t;
      const first = t.path[0]!;
      const current = (Math.atan2(first.x - end.x, first.y - end.y) * 180) / Math.PI;
      return { ...t, path: t.path.map((w) => rotate(w, end, level - current)) };
    }
    default:
      return t;
  }
}

function applySensor(s: Sensor, f: Factor, level: number): Sensor {
  if (f.target && f.target !== s.id) return s;
  switch (f.kind) {
    case 'sensor-range': {
      const pd = s.model.pd;
      const scale = s.rangeM > 0 ? level / s.rangeM : 1;
      // Scale the Pd reference with the drawn range so the model keeps its shape.
      const model =
        pd.kind === 'swerling'
          ? { ...s.model, pd: { ...pd, refRangeM: pd.refRangeM * scale } }
          : { ...s.model, pd: { ...pd, r50M: pd.r50M * scale, widthM: pd.widthM * scale } };
      return { ...s, rangeM: level, model };
    }
    case 'sensor-position-offset':
      // Offset along the sensor's bearing, metres.
      return {
        ...s,
        x: s.x + level * Math.sin((s.bearingDeg * Math.PI) / 180),
        y: s.y + level * Math.cos((s.bearingDeg * Math.PI) / 180),
      };
    default:
      return s;
  }
}

/** The vignette with one factor level applied. Pure. */
export function applyFactor(v: Vignette, f: Factor, level: number): Vignette {
  return {
    ...v,
    threats: v.threats.map((t) => applyThreat(t, f, level)),
    sensors: v.sensors.map((s) => applySensor(s, f, level)),
  };
}

function grid(factors: Factor[]): number[][] {
  if (factors.length === 0) return [[]];
  const [head, ...rest] = factors;
  const tail = grid(rest);
  return head!.levels.flatMap((l) => tail.map((t) => [l, ...t]));
}

export function sweep(
  v: Vignette,
  factors: Factor[],
  n: number,
  seed: number,
  opts: ScoreOptions = {},
): Sweep {
  if (factors.length < 1 || factors.length > 2) throw new Error('sweep: one or two factors');
  const cells: SweepCell[] = [];
  for (const levels of grid(factors)) {
    let cell = v;
    factors.forEach((f, i) => {
      cell = applyFactor(cell, f, levels[i]!);
    });
    const { rows } = run(cell, n, seed);
    cells.push({ levels, scores: score(rows, cell.measures, { seed, ...opts }) });
  }
  return { factors, cells };
}
