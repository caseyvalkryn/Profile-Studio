// Templates (spec section 9), in table order with Blank last. Lane 6.1 contract.
import { blank } from './blank';
import { deltaWingOwa } from './deltaWingOwa';
import { detectionRangeSweep } from './detectionRangeSweep';
import { fiberFpv } from './fiberFpv';
import { hoverTrackHold } from './hoverTrackHold';
import { pointDefence } from './pointDefence';
import { surrogateRacetrack } from './surrogateRacetrack';
import { swarmSplit } from './swarmSplit';
import type { Template } from './types';

export type { Template } from './types';

export const TEMPLATES: Template[] = [
  pointDefence,
  hoverTrackHold,
  swarmSplit,
  deltaWingOwa,
  fiberFpv,
  surrogateRacetrack,
  detectionRangeSweep,
  blank,
];

export function templateById(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
