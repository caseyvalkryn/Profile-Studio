// Delta wing one-way attack, low ingress (spec section 9, row 4). Legacy OWA-001 laydown: radar
// 9 km, EO/IR 5 km looking south west, kinetic 3 km, engagement zone in the south west quadrant.
// The ingress is low (100 m) with a pop-up to 300 m at 2.4 km and a terminal descent; the run
// flies flat at 100 m (LOSSES.altitudeProfile), so the question rests on range and time.
// Laydown (build.ts rule, 31 m/px here): the asset sits south east of the radar so the approach
// crosses the engagement zone and ends 1 km abeam the interceptor, south east of the asset, so
// a late shot finds the threat already at the asset, as in the legacy laydown. The
// EO/IR sensor sits north west of the radar and looks down the approach, so identification
// comes about 5 km out and the interceptor fires at its full range.
import { terrainFollowingIngress } from '../behaviors';
import type { Template } from './types';
import {
  area,
  defendedAsset,
  effector,
  question,
  sensor,
  setting,
  threat,
  vignette,
} from './build';

const ASSET = { x: 900, y: -700 };

const q = () =>
  question(
    'Is the engagement decision early enough to defeat a fast delta wing one-way attack outside the planned defeat range?',
    'Planning values are the thresholds on 1.1.2 Detection Range (ground), 3.1.3 Defeat Range and 3.1.4 Defeat Engagement Time in the results table. 3.1.3 is the range at defeat, not at the engage decision; 3.1.4 counts interceptor flight time.',
  );

export const deltaWingOwa: Template = {
  id: 'delta-wing-owa',
  name: 'Delta wing one-way attack, low ingress',
  question: q().text,
  steps: ['find', 'fix', 'track', 'target', 'engage', 'assess'],
  mainMeasures: ['1.1.2', '3.1.3', '3.1.4'],
  make: () => {
    const Q = q();
    const m313 = setting('3.1.3', '>=', 2000, 'm');
    const path = terrainFollowingIngress({ x: -9200, y: -8200 }, ASSET, 100, 300, 2400, 20);
    return vignette({
      class: 'One-way attack',
      name: 'Delta wing one-way attack, low ingress',
      questions: [Q],
      threats: [threat('T1', 'g3-delta-owa', path, 46)],
      sensors: [
        sensor('RDR-1', 'radar', 0, 0, 9000),
        sensor('EO-1', 'eoir', -1000, 700, 5000, { fovDeg: 30, bearingDeg: 200 }),
      ],
      effectors: [effector('KIN-1', 'kinetic', 1380, -1590, 3000)],
      areas: [
        defendedAsset(300, ASSET),
        area(
          'WEZ-1',
          'wez',
          'Engagement zone',
          [
            [-3300, -3300],
            [-600, -3300],
            [-600, -600],
            [-3300, -600],
          ],
          1200,
        ),
      ],
      measures: [setting('1.1.2', '>=', 8000, 'm'), m313, setting('3.1.4', '<=', 30, 's')],
    });
  },
};
