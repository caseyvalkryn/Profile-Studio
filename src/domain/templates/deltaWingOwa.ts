// Delta wing one-way attack, low ingress (spec section 9, row 4). Legacy OWA-001 laydown: radar
// 9 km, EO/IR 5 km looking south west, kinetic 3 km, engagement zone in the south west quadrant.
// The ingress is low (100 m) with a pop-up to 300 m at 2.4 km and a terminal descent; the run
// flies flat at 100 m (LOSSES.altitudeProfile), so the question rests on range and time.
import { terrainFollowingIngress } from '../behaviors';
import type { Template } from './types';
import {
  area,
  defendedAsset,
  effector,
  hypothesis,
  question,
  sensor,
  setting,
  threat,
  vignette,
} from './build';

const q = () =>
  question(
    'Is the engagement decision early enough to defeat a 46 m/s one-way attack outside 2 km?',
    'Legacy MOP: initial detection at or above 8.0 km; engage decision at or above 2.5 km; time from engage to effect at most 15 s. DroneScore 3.1.3 is the range at defeat, not at the engage decision, so the planning value is 2.0 km; 3.1.4 counts interceptor flight time, planning value 30 s. The run flies the drawn path at 100 m; the pop-up and descent show in the profile view only.',
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
    const path = terrainFollowingIngress(
      { x: -9200, y: -8200 },
      { x: -120, y: -100 },
      100,
      300,
      2400,
      20,
    );
    return vignette({
      name: 'Delta wing one-way attack, low ingress',
      questions: [Q],
      hypotheses: [hypothesis(Q, m313, { low: 1500, high: 2500 })],
      threats: [threat('T1', 'g3-delta-owa', path, 46)],
      sensors: [
        sensor('RDR-1', 'radar', 0, 0, 9000),
        sensor('EO-1', 'eoir', -140, 70, 5000, { fovDeg: 30, bearingDeg: 225 }),
      ],
      effectors: [effector('KIN-1', 'kinetic', 0, 0, 3000)],
      areas: [
        defendedAsset(300),
        area(
          'WEZ-1',
          'wez',
          'Engagement zone',
          [
            [-3000, -3000],
            [-300, -3000],
            [-300, -300],
            [-3000, -300],
          ],
          1200,
        ),
      ],
      measures: [setting('1.1.2', '>=', 8000, 'm'), m313, setting('3.1.4', '<=', 30, 's')],
    });
  },
};
