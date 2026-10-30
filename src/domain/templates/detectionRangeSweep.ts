// Detection range sweep (spec section 9, row 7). One quadrotor on a straight run-in; the sweep
// hint varies threat altitude (src/engine/sweep.ts, 'threat-altitude'). No effector: the question
// is about Find.
import { directApproach } from '../behaviors';
import type { Template } from './types';
import { hypothesis, question, sensor, setting, threat, vignette } from './build';

const LEVELS = [30, 60, 120, 240, 400];

const q = () =>
  question(
    'How does the detection range of a Group 1 quadrotor change with its altitude from 30 to 400 m?',
    'Sweep factor: threat altitude, levels 30, 60, 120, 240, 400 m AGL. The baseline run is at 120 m.',
  );

export const detectionRangeSweep: Template = {
  id: 'detection-range-sweep',
  name: 'Detection range sweep',
  question: q().text,
  steps: ['find', 'fix', 'track', 'target'],
  mainMeasures: ['1.1.2'],
  sweep: { factor: { kind: 'threat-altitude', levels: LEVELS }, levels: LEVELS },
  make: () => {
    const Q = q();
    const m = setting('1.1.2', '>=', 3000, 'm');
    return vignette({
      name: 'Detection range sweep',
      questions: [Q],
      hypotheses: [hypothesis(Q, m, { low: 2500, high: 4000 })],
      threats: [
        threat('T1', 'g1-quad-isr', directApproach({ x: 0, y: 5500 }, { x: 0, y: 60 }, 120)),
      ],
      sensors: [
        sensor('RDR-1', 'radar', 0, 0, 4000),
        sensor('RF-1', 'rf', 180, -90, 3000),
        sensor('EO-1', 'eoir', -140, 70, 2500, { fovDeg: 60, bearingDeg: 0 }),
      ],
      measures: [m],
    });
  },
};
