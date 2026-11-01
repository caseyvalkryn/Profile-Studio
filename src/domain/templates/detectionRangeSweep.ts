// Detection range sweep (spec section 9, row 7). One quadrotor on a straight run-in at the middle
// of five altitude levels. No effector: the question is about Find. The radar's lower beam edge
// sits 2 degrees above the horizon, so a low target enters the radar beam late and the altitude
// has an effect. The radio horizon is beyond the 4 km radar range at every level (review 6 F-14).
// Laydown (build.ts rule, 16.5 m/px): the run-in from the north ends on an asset north west of
// the radar; the RF and EO/IR sensors sit east of that line, the EO/IR sector looking up it.
import { directApproach } from '../behaviors';
import type { Template } from './types';
import { defendedAsset, question, sensor, setting, threat, vignette } from './build';

const ASSET = { x: -600, y: 600 };

const q = () =>
  question(
    'How does the detection range of a Group 1 quadrotor change with its altitude across the swept levels?',
    'Factor: threat altitude at five levels, from treetop height to the top of the low-altitude band. The profile flies the middle level.',
  );

export const detectionRangeSweep: Template = {
  id: 'detection-range-sweep',
  name: 'Detection range sweep',
  question: q().text,
  steps: ['find', 'fix', 'track', 'target'],
  mainMeasures: ['1.1.2'],
  make: () => {
    const Q = q();
    const m = setting('1.1.2', '>=', 3000, 'm');
    const v = vignette({
      name: 'Detection range sweep',
      questions: [Q],
      threats: [threat('T1', 'g1-quad-isr', directApproach({ x: 0, y: 5500 }, ASSET, 120))],
      sensors: [
        sensor('RDR-1', 'radar', 0, 0, 4000, { elMinDeg: 2 }),
        sensor('RF-1', 'rf', 900, 300, 3000),
        sensor('EO-1', 'eoir', 650, -500, 2500, { fovDeg: 60, bearingDeg: 340 }),
      ],
      areas: [defendedAsset(250, ASSET)],
      measures: [m],
    });
    return v;
  },
};
