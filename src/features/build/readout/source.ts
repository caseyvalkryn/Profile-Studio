// The readout's default source over the phase 4 preview. Lane 9.2.6 rewires `readoutAtFor` to the
// derive layer (`derived.at(threatId, tS, ref)` in src/engine/at.ts); the Readout reads nothing else.
import type { Vignette } from '../../../domain/types';
import { bearingTo, closingSpeed, posAt } from '../../../engine/geo';
import { previewOf } from '../../../state/document';
import type { ReadoutAt, ReadoutSource } from './types';

/** The reference the readout measures from: the defended asset (legacy `ui.cam.ref` default). */
export const DEFAULT_REF = 'asset';

/** `at` for one vignette. `ref` is accepted for the contract; this interim source uses the asset. */
export function readoutAtFor(v: Vignette): ReadoutAt {
  const pv = previewOf(v);
  const sensors = v.sensors;
  return (threatId, tS) => {
    const t = v.threats.find((x) => x.id === threatId);
    const tp = t ? pv.threats[t.key] : undefined;
    if (!t || !tp || !tp.timed.length) return null;
    const p = posAt(tp.timed, tS);
    const o = pv.origin;
    const covering = sensors
      .filter((s) => (pv.windows[s.key]?.[t.key] ?? []).some((w) => tS >= w.tIn && tS <= w.tOut))
      .map((s) => s.id);
    const entry = tp.assetEntryS;
    const out: ReadoutSource = {
      x: p.x,
      y: p.y,
      z: p.z,
      r: Math.hypot(p.x - o.x, p.y - o.y),
      brg: bearingTo(o, p),
      hdg: p.holding ? null : (((90 - (Math.atan2(p.hy, p.hx) * 180) / Math.PI) % 360) + 360) % 360,
      spd: Math.hypot(p.vx, p.vy),
      vc: closingSpeed(tp.timed, tS, o),
      tta: entry === null ? null : Math.max(0, entry - tS),
      window: tp.window.geometricS,
      margin: tp.window.marginS,
      covering,
    };
    return out;
  };
}
