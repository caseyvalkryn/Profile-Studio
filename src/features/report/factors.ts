// The conditions tested: one row per factor setting. The setup table and the scope-of-inference
// text both read this list, so they always agree.
import { archetypeById, SYSTEM_LABELS } from '../../domain/catalog';
import type { Vignette } from '../../domain/types';
import { threatAltitudeM, threatSpeedMs } from '../../engine/adapter';
import type { Units } from '../../state/ui';
import { altitude, elevation, latLon, range, sector, speed, text } from '../shared/units';

export type FactorRow = {
  key: string;
  factor: string;
  id: string;
  type: string;
  setting: string;
};

export type RunInfo = { n: number; seed: number } | null;

/** One offset from the site origin: "1.19 nm E". A value that rounds to zero takes the positive letter. */
function offset(m: number, pos: string, neg: string, units: Units): string {
  const shown = range(Math.abs(m), units);
  const zero = Number(shown.value.replace(/,/g, '')) === 0;
  return `${text(shown)} ${m < 0 && !zero ? neg : pos}`;
}

/** A position in the site frame (x east, y north): "1.19 nm E, 0.94 nm S of the site". */
export function sitePosition(x: number, y: number, units: Units): string {
  return `${offset(x, 'E', 'W', units)}, ${offset(y, 'N', 'S', units)} of the site`;
}

export function factorRows(v: Vignette, run: RunInfo, units: Units): FactorRow[] {
  const elev = text(elevation(v.site.elevM, units));
  const rows: FactorRow[] = [
    {
      key: 'site',
      factor: 'Site',
      id: v.site.name || 'Unnamed site',
      type: '',
      setting: `${latLon(v.site.lat, v.site.lon)}, elevation ${elev}`,
    },
  ];
  for (const t of v.threats)
    rows.push({
      key: t.key,
      factor: 'Threat',
      id: t.id,
      type: archetypeById(t.type)?.name ?? t.type,
      setting: `speed ${text(speed(threatSpeedMs(t), units))}, altitude ${text(altitude(threatAltitudeM(t), units))}`,
    });
  for (const s of v.sensors)
    rows.push({
      key: s.key,
      factor: 'Sensor',
      id: s.id,
      type: SYSTEM_LABELS[s.kind],
      setting: `${sitePosition(s.x, s.y, units)}; range ${text(range(s.rangeM, units))}, sector ${sector(s.fovDeg, s.bearingDeg)}`,
    });
  for (const e of v.effectors)
    rows.push({
      key: e.key,
      factor: 'Effector',
      id: e.id,
      type: SYSTEM_LABELS[e.kind],
      setting: `${sitePosition(e.x, e.y, units)}; range ${text(range(e.rangeM, units))}, sector ${sector(e.fovDeg, e.bearingDeg)}`,
    });
  for (const n of v.nodes)
    rows.push({
      key: n.key,
      factor: 'Node',
      id: n.id,
      type: SYSTEM_LABELS[n.kind],
      setting:
        sitePosition(n.x, n.y, units) +
        (n.rangeM > 0 ? `; range ${text(range(n.rangeM, units))}` : ''),
    });
  rows.push({
    key: 'chain',
    factor: 'Chain time',
    id: 'Target step',
    type: '',
    setting: `decision ${v.chainTime.decisionS} s, assignment ${v.chainTime.assignS} s`,
  });
  rows.push({
    key: 'run',
    factor: 'Replicates',
    id: 'n and seed',
    type: '',
    setting: run ? `n ${run.n}, seed ${run.seed}` : 'No run yet',
  });
  return rows;
}

/** One line per factor setting, for the scope-of-inference text. */
export function factorLine(r: FactorRow): string {
  const name = [r.factor, r.id, r.type].filter(Boolean).join(' ');
  return `${name}: ${r.setting}`;
}
