// Limits of the simulation that apply to the open vignette, for the scope of inference. Each line
// comes from the vignette itself and from a declared loss in `LOSSES` (src/engine/adapter.ts):
// `waypointHolds` (the runs fly through every hold) and `altitudeProfile` (each threat flies level
// at its first waypoint altitude).
import type { Threat, Vignette } from '../../domain/types';
import { threatAltitudeM, threatSpeedMs } from '../../engine/adapter';
import type { Units } from '../../state/ui';
import { altitude, text } from '../shared/units';

/** Altitudes closer than this (metres) count as the same level. */
const LEVEL_TOLERANCE_M = 0.5;

/** m:ss for a time in seconds. */
function mss(s: number): string {
  const r = Math.round(s);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
}

/** Seconds from the start of the flight to the arrival at each waypoint, earlier holds included. */
function arrivalS(t: Threat): number[] {
  const speed = threatSpeedMs(t);
  let s = 0;
  return t.path.map((w, i) => {
    const p = t.path[i - 1];
    if (p) s += (speed > 0 ? Math.hypot(w.x - p.x, w.y - p.y, w.z - p.z) / speed : 0) + p.holdS;
    return s;
  });
}

export function simulationLimits(v: Vignette, units: Units): string[] {
  const lines: string[] = [];
  for (const t of v.threats) {
    const at = arrivalS(t);
    const n = t.path.length;
    const holds = t.path
      .map((w, i) => ({ i, s: w.holdS }))
      .filter((h) => h.s > 0)
      .map(
        (h) =>
          `${Math.round(h.s)} s at waypoint ${h.i + 1} of ${n}, ${mss(at[h.i]!)} into its flight`,
      );
    if (holds.length)
      lines.push(
        `${t.id} is drawn to hover ${holds.join('; ')}. The runs do not stop there: ${t.id} ` +
          'flies on without pausing. The results cover the threat in motion along its path and ' +
          'do not cover a threat that stops and hovers.',
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
