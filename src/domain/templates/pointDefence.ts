// Point defence, single quadrotor (spec section 9, row 1). Legacy CUAS-001 laydown, spread per
// the laydown rule in build.ts: radar at the datum, RF detector east, EO/IR south west looking
// up the approach, jammer south, the defended asset north west with the approach ending on it.
import { directApproach } from '../behaviors';
import type { Template } from './types';
import {
  defendedAsset,
  effector,
  hypothesis,
  question,
  sensor,
  setting,
  threat,
  vignette,
} from './build';

const ASSET = { x: -500, y: 500 };

const q = () =>
  question(
    'Does the layer detect, identify and defeat a Group 1 ISR quadrotor before it reaches the defended asset?',
    'Planning values are the thresholds on 1.1.2 Detection Range (ground), 2.1.3 Identification Range and 3.1.2 Probability of Kill (Pk), in the display units in the results table.',
  );

export const pointDefence: Template = {
  id: 'point-defence',
  name: 'Point defence, single quadrotor',
  question: q().text,
  steps: ['find', 'fix', 'track', 'target', 'engage', 'assess'],
  mainMeasures: ['1.1.2', '2.1.3', '3.1.2'],
  make: () => {
    const Q = q();
    const m112 = setting('1.1.2', '>=', 3000, 'm');
    return vignette({
      name: 'Point defence, single quadrotor',
      questions: [Q],
      hypotheses: [hypothesis(Q, m112, { low: 3000, high: 4000 })],
      threats: [threat('T1', 'g1-quad-isr', directApproach({ x: 3100, y: 3000 }, ASSET, 120))],
      sensors: [
        sensor('RDR-1', 'radar', 0, 0, 4000),
        sensor('RF-1', 'rf', 750, 250, 3000),
        sensor('EO-1', 'eoir', -700, -200, 2500, { fovDeg: 60, bearingDeg: 45 }),
      ],
      effectors: [effector('EW-1', 'ew', 0, -550, 1500)],
      areas: [defendedAsset(250, ASSET)],
      measures: [m112, setting('2.1.3', '>=', 2000, 'm'), setting('3.1.2', '>=', 80, '%')],
    });
  },
};
