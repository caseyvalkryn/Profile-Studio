// Fiber FPV, no RF (spec section 9, row 5). Three sensors of different kinds, so the preview's
// first-detection sensor and the per-sensor windows show which one detects a threat that emits
// nothing. The run rows carry no detecting-sensor field, so 1.1.1 scores the layer as a whole.
// Laydown (build.ts rule): the approach from the south east ends on an asset east of the radar,
// clear of the sensor cluster; the EO/IR sensor looks south east up the approach.
import { terrainFollowingIngress } from '../behaviors';
import type { Template } from './types';
import { defendedAsset, hypothesis, question, sensor, setting, threat, vignette } from './build';

const ASSET = { x: 600, y: 400 };

const q = () =>
  question(
    'Which sensor detects a fiber-optic FPV that emits no RF, and does the layer detect it at all?',
    'The RF detector cannot see this threat (catalog: no RF emission). Read the first-detection sensor in the preview. 1.1.1 scores the layer; the run rows do not name the detecting sensor.',
  );

export const fiberFpv: Template = {
  id: 'fiber-fpv',
  name: 'Fiber FPV, no RF',
  question: q().text,
  steps: ['find', 'fix', 'track', 'target'],
  mainMeasures: ['1.1.1'],
  make: () => {
    const Q = q();
    const m = setting('1.1.1', '>=', 90, '%');
    const path = terrainFollowingIngress({ x: 2400, y: -2400 }, ASSET, 40, 60, 600, 10);
    return vignette({
      name: 'Fiber FPV, no RF',
      questions: [Q],
      hypotheses: [hypothesis(Q, m, { low: 60, high: 100 })],
      threats: [threat('T1', 'g1-fpv-fiber', path, 15)],
      sensors: [
        sensor('RF-1', 'rf', -300, 750, 3000),
        sensor('RDR-1', 'radar', 0, 0, 4000),
        sensor('EO-1', 'eoir', -700, -200, 2500, { fovDeg: 60, bearingDeg: 135 }),
      ],
      areas: [defendedAsset(250, ASSET)],
      measures: [m],
    });
  },
};
