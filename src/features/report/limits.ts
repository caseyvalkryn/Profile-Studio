// Limits of the simulation that apply to the open vignette, for the scope of inference. Each line
// comes from the vignette itself and from a declared loss in `LOSSES` (src/engine/adapter.ts):
// `waypointHolds` (the runs fly through every hold) and `altitudeProfile` (each threat flies level
// at its first waypoint altitude).
import type { Vignette } from '../../domain/types';
import { threatAltitudeM } from '../../engine/adapter';
import type { Units } from '../../state/ui';
import { altitude, text } from '../shared/units';

/** Altitudes closer than this (metres) count as the same level. */
const LEVEL_TOLERANCE_M = 0.5;

export function simulationLimits(v: Vignette, units: Units): string[] {
  const lines: string[] = [];
  for (const t of v.threats) {
    const holds = t.path
      .map((w, i) => ({ n: i + 1, s: w.holdS }))
      .filter((h) => h.s > 0)
      .map((h) => `${Math.round(h.s)} s at waypoint ${h.n}`);
    if (holds.length)
      lines.push(
        `${t.id} holds ${holds.join(', ')}. The runs do not fly the hold: ${t.id} passes each ` +
          'waypoint without stopping. The results do not cover a hovering or loitering threat.',
      );
    const first = threatAltitudeM(t);
    const zs = t.path.map((w) => w.z);
    if (zs.some((z) => Math.abs(z - first) > LEVEL_TOLERANCE_M)) {
      const lo = text(altitude(Math.min(...zs), units));
      const hi = text(altitude(Math.max(...zs), units));
      lines.push(
        `The runs fly ${t.id} level at ${text(altitude(first, units))}, its first waypoint ` +
          `altitude. The drawn altitudes from ${lo} to ${hi} are not flown, so the results do ` +
          'not cover a climb or a dive.',
      );
    }
  }
  return lines;
}
