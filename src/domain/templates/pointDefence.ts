// Point defence, single quadrotor (spec section 9, row 1). Legacy CUAS-001 laydown.
import { directApproach } from '../behaviors';
import type { Template } from './types';
import { effector, hypothesis, question, sensor, setting, threat, vignette } from './build';

const q = () =>
  question(
    'Does the layer detect, identify and defeat a Group 1 ISR quadrotor before it reaches the defended asset?',
    'Legacy MOP: initial detection at or above 3.0 km; positive ID before 2.0 km; effect observed within 20 s of engage.',
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
      threats: [
        threat('T1', 'g1-quad-isr', directApproach({ x: 3100, y: 3000 }, { x: 60, y: 50 }, 120)),
      ],
      sensors: [
        sensor('RDR-1', 'radar', 0, 0, 4000),
        sensor('RF-1', 'rf', 180, -90, 3000),
        sensor('EO-1', 'eoir', -140, 70, 2500, { fovDeg: 60, bearingDeg: 45 }),
      ],
      effectors: [effector('EW-1', 'ew', 0, 0, 1500)],
      measures: [m112, setting('2.1.3', '>=', 2000, 'm'), setting('3.1.2', '>=', 80, '%')],
    });
  },
};
