// The Build bar's one-line readout (mockup `readout()`, line 397). The scene: "n paths · n events ·
// t s". A selected threat or one of its waypoints: "T1 · 2.3 nm · 23 kt · 422 s", the plan
// distance along its path, its speed and its end time, in the display units.
import { find } from '../../../commands/select';
import type { Vignette } from '../../../domain/types';
import type { Preview } from '../../../engine/preview';
import type { Units } from '../../../state/ui';
import { compactSpeed, formatDistance } from '../../shared/units';

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

export function readoutLine(
  doc: Vignette,
  preview: Preview,
  selectedKey: string | undefined,
  units: Units,
): string {
  const f = selectedKey ? find(doc, selectedKey) : null;
  const threat = f?.kind === 'threat' ? f.value : f?.kind === 'waypoint' ? f.threat : null;
  const p = threat ? preview.threats[threat.key] : undefined;
  if (threat && p) {
    const w = p.timed;
    let d = 0;
    for (let i = 1; i < w.length; i++)
      d += Math.hypot(w[i]!.x - w[i - 1]!.x, w[i]!.y - w[i - 1]!.y);
    const end = Math.round(w[w.length - 1]?.t1 ?? 0);
    return `${threat.id} · ${formatDistance(d, units)} · ${compactSpeed(p.speedMs, units)} · ${end} s`;
  }
  return `${plural(doc.threats.length, 'path')} · ${plural(doc.events.length, 'event')} · ${Math.round(preview.tmaxS)} s`;
}
