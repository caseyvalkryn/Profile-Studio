// Which DroneScore entered rows the inspector offers per asset group (spec section 4).
// This split is a planning choice, not a DroneScore rule: detection, tracking and
// classification rows (areas 1 and 2, including 3a and 3b) go on sensors; defeat rows
// (area 3, including the 5.x KPP rows) go on effectors; the INT interceptor rows go on both.
import { MEASURES, type Measure } from '../../../domain/measures';

export type EnteredGroup = 'sensor' | 'effector';

const INT = (m: Measure) => m.id.startsWith('INT-');

const APPLIES: Record<EnteredGroup, (m: Measure) => boolean> = {
  sensor: (m) => m.area === 1 || m.area === 2 || INT(m),
  effector: (m) => m.area === 3,
};

export type EnteredInput = 'number' | 'yesno' | 'text';

/** How the value is typed, from the DroneScore unit. */
export function inputOf(unit: string): EnteredInput {
  if (unit === 'Y/N') return 'yesno';
  if (unit.includes('text') || unit.includes('/ m') || unit.includes(' or ')) return 'text';
  return 'number';
}

export function enteredRows(group: EnteredGroup): Measure[] {
  return MEASURES.filter((m) => m.sourceClass === 'entered' && APPLIES[group](m));
}
