// The conditions tested: one row per factor setting. The setup table and the scope-of-inference
// text both read this list, so they always agree.
import { archetypeById, SYSTEM_LABELS } from '../../domain/catalog';
import type { Vignette } from '../../domain/types';
import { threatAltitudeM, threatSpeedMs } from '../../engine/adapter';
import type { Units } from '../../state/ui';
import { altitude, M_PER_FT, range, sector, speed, text } from '../shared/units';

export type FactorRow = {
  key: string;
  factor: string;
  id: string;
  type: string;
  setting: string;
};

export type RunInfo = { n: number; seed: number } | null;

export function factorRows(v: Vignette, run: RunInfo, units: Units): FactorRow[] {
  const elev =
    units === 'nav'
      ? `${Math.round(v.site.elevM / M_PER_FT).toLocaleString('en-US')} ft MSL`
      : `${Math.round(v.site.elevM).toLocaleString('en-US')} m MSL`;
  const rows: FactorRow[] = [
    {
      key: 'site',
      factor: 'Site',
      id: v.site.name || 'Unnamed site',
      type: '',
      setting: `${v.site.lat.toFixed(4)}°, ${v.site.lon.toFixed(4)}°, elevation ${elev}`,
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
      setting: `range ${text(range(s.rangeM, units))}, sector ${sector(s.fovDeg, s.bearingDeg)}`,
    });
  for (const e of v.effectors)
    rows.push({
      key: e.key,
      factor: 'Effector',
      id: e.id,
      type: SYSTEM_LABELS[e.kind],
      setting: `range ${text(range(e.rangeM, units))}, sector ${sector(e.fovDeg, e.bearingDeg)}`,
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
