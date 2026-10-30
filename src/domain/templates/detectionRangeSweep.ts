// Detection range sweep (spec section 9, row 7). One quadrotor on a straight run-in; the sweep
// varies threat altitude (src/engine/sweep.ts, 'threat-altitude') and is stored on the vignette,
// so "Run sweep" reads it. No effector: the question is about Find. The radar's lower beam edge
// sits 2 degrees above the horizon, so a low target enters the radar beam late and the altitude
// has an effect. The radio horizon is beyond the 4 km radar range at every level (review 6 F-14).
// Laydown (build.ts rule, 16.5 m/px): the run-in from the north ends on an asset north west of
// the radar; the RF and EO/IR sensors sit east of that line, the EO/IR sector looking up it.
import { directApproach } from '../behaviors';
import type { Template } from './types';
import { defendedAsset, hypothesis, question, sensor, setting, threat, vignette } from './build';

const ASSET = { x: -600, y: 600 };

const LEVELS = [30, 60, 120, 240, 400];
const FACTOR = { kind: 'threat-altitude', levels: LEVELS } as const;

/**
 * Scope of inference text for the AAR (review 6 F-14). It is a stored note, so it names no
 * distance or altitude unit; the levels show in the sweep chart in the display units (7.R F-17).
 */
export const SWEEP_SCOPE =
  'Factor: threat altitude at the five levels in the sweep chart, from treetop height to the ' +
  "top of the low-altitude band. The radar's lower beam edge is 2° above the horizon. Below " +
  'it, the RF or EO/IR sensor finds the target first, at a shorter range. The model has no ' +
  'terrain masking, multipath or ground clutter, and the radio horizon is beyond the radar ' +
  'range at every level. Conclusions apply only to this laydown and these levels.';

const q = () =>
  question(
    'How does the detection range of a Group 1 quadrotor change with its altitude across the swept levels?',
    'Sweep factor: threat altitude at five levels, from treetop height to the top of the low-altitude band; the levels show in the sweep chart in the display units. The baseline run is the middle level.',
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
      threats: [threat('T1', 'g1-quad-isr', directApproach({ x: 0, y: 5500 }, ASSET, 120))],
      sensors: [
        sensor('RDR-1', 'radar', 0, 0, 4000, { elMinDeg: 2 }),
        sensor('RF-1', 'rf', 900, 300, 3000),
        sensor('EO-1', 'eoir', 650, -500, 2500, { fovDeg: 60, bearingDeg: 340 }),
      ],
      areas: [defendedAsset(250, ASSET)],
      measures: [m],
    });
    v.sweep = { factors: [{ ...FACTOR, levels: [...LEVELS] }] };
    v.report.sections = { scope: SWEEP_SCOPE };
    return v;
  },
};
