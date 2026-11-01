// Swarm of six, split (spec section 9, row 3). Legacy MULTI-001: six Group 1 elements from the
// north east as one group, splitting into two elements of three. 2.3 Track Quantity is an entered
// measure (vendor sheet), so the scorecard shows it from the radar's entered value, not the run.
// Laydown (build.ts rule): the defended asset sits west of the radar and the group ends on it;
// the split fans the elements across track up to 850 m either side of that end, so the jammer
// sits beyond the asset on the approach axis, where its 1.5 km reach covers both fans.
import { directApproach, split, wp } from '../behaviors';
import type { Template } from './types';
import {
  defendedAsset,
  effector,
  entered,
  question,
  sensor,
  setting,
  threat,
  vignette,
} from './build';

const ASSET = { x: -900, y: 100 };
const START = { x: 3200, y: 2200 };
/**
 * Line-abreast spacing of the six in the group, metres: 29 px at the default Build view
 * (14.4 m/px), so each start reads apart and is its own click target (review 7.R F-11).
 */
const FORMATION_M = 420;
/** Spacing of the three in an element after the split, metres. */
const FAN_M = 150;

const q = () =>
  question(
    'Does the system track all six elements and engage both elements of the group after the split?',
    '2.3 Track Quantity is entered from the vendor sheet (planning value 6). The group splits about a third of the way along the approach.',
  );

export const swarmSplit: Template = {
  id: 'swarm-split',
  name: 'Swarm of six, split',
  question: q().text,
  steps: ['find', 'fix', 'track', 'target', 'engage', 'assess'],
  mainMeasures: ['1.2.1', '2.3', '3.1.1'],
  make: () => {
    const Q = q();
    const m121 = setting('1.2.1', '>=', 90, '%');
    const group = directApproach(START, ASSET, 100);
    const elements = split(group, 0.35, 2, 1400);
    // The six fly line abreast to the split point, then each element of three fans about its
    // own track. Every threat has its own start and split point, so no two waypoints share a
    // point (review 7.R F-11).
    const len = Math.hypot(ASSET.x - START.x, ASSET.y - START.y);
    const across = { x: (ASSET.y - START.y) / len, y: -(ASSET.x - START.x) / len };
    const shift = (w: { x: number; y: number; z: number }, m: number) =>
      wp({ x: w.x + across.x * m, y: w.y + across.y * m }, w.z);
    const paths = elements.flatMap(([start, at, end], ei) =>
      [0, 1, 2].map((j) => {
        const k = ei * 3 + j;
        return [
          shift(start!, FORMATION_M * (k - 2.5)),
          shift(at!, FORMATION_M * (k - 2.5)),
          shift(end!, FAN_M * (j - 1)),
        ];
      }),
    );
    const ids = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'];
    const radar = sensor('RDR-1', 'radar', 0, 0, 4000);
    radar.entered['2.3'] = entered(6, 'Planning value; vendor sheet to confirm');
    return vignette({
      class: 'Multi-aircraft',
      name: 'Swarm of six, split',
      questions: [Q],
      threats: paths.map((p, i) => threat(ids[i]!, 'g1-swarm-quad', p)),
      sensors: [
        radar,
        sensor('RF-1', 'rf', 750, 250, 3000),
        sensor('EO-1', 'eoir', 200, -800, 2500, { fovDeg: 360 }),
      ],
      effectors: [effector('EW-1', 'ew', -1370, 140, 1500)],
      areas: [defendedAsset(250, ASSET)],
      measures: [m121, setting('2.3', '>=', 6, 'targets'), setting('3.1.1', '>=', 90, '%')],
    });
  },
};
