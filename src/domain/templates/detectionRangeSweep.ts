// Detection range sweep (spec section 9, row 7). One quadrotor on a straight run-in; the sweep
// varies threat altitude (src/engine/sweep.ts, 'threat-altitude') and is stored on the vignette,
// so "Run sweep" reads it. No effector: the question is about Find. The radar's lower beam edge
// sits 2 degrees above the horizon, so a low target enters the radar beam late and the altitude
// has an effect. The radio horizon is beyond the 4 km radar range at every level (review 6 F-14).
import { directApproach } from '../behaviors';
import type { Template } from './types';
import { hypothesis, question, sensor, setting, threat, vignette } from './build';

const LEVELS = [30, 60, 120, 240, 400];
const FACTOR = { kind: 'threat-altitude', levels: LEVELS } as const;

/** Scope of inference text for the AAR (review 6 F-14). */
export const SWEEP_SCOPE =
  'Factor: threat altitude at 30, 60, 120, 240 and 400 m AGL (about 100 to 1,300 ft AGL). ' +
  "The radar's lower beam edge is 2° above the horizon. Below it, the RF or EO/IR sensor finds " +
  'the target first, at a shorter range. The model has no terrain masking, multipath or ground ' +
  'clutter, and the radio horizon is beyond the 4 km (2.2 nm) radar range at every level. ' +
  'Conclusions apply only to this laydown and these levels.';

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
  sweep: { factor: { ...FACTOR, levels: [...LEVELS] }, levels: LEVELS },
  make: () => {
    const Q = q();
    const m = setting('1.1.2', '>=', 3000, 'm');
    const v = vignette({
      name: 'Detection range sweep',
      questions: [Q],
      hypotheses: [hypothesis(Q, m, { low: 2500, high: 4000 })],
      threats: [
        threat('T1', 'g1-quad-isr', directApproach({ x: 0, y: 5500 }, { x: 0, y: 60 }, 120)),
      ],
      sensors: [
        sensor('RDR-1', 'radar', 0, 0, 4000, { elMinDeg: 2 }),
        sensor('RF-1', 'rf', 180, -90, 3000),
        sensor('EO-1', 'eoir', -140, 70, 2500, { fovDeg: 60, bearingDeg: 0 }),
      ],
      measures: [m],
    });
    v.sweep = { factors: [{ ...FACTOR, levels: [...LEVELS] }] };
    v.report.sections = { scope: SWEEP_SCOPE };
    return v;
  },
};
