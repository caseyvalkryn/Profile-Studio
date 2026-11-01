// Display ids, for the rename check of a system id.
import type { Vignette } from '../../../domain/types';

/** Every display id of a path, system or volume in the profile. */
export function displayIds(v: Vignette): string[] {
  return [
    ...v.threats.map((r) => r.id),
    ...v.sensors.map((r) => r.id),
    ...v.effectors.map((r) => r.id),
    ...v.nodes.map((r) => r.id),
    ...v.areas.map((r) => r.id),
  ];
}
