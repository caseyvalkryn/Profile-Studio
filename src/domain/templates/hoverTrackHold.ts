// Hover track hold (spec section 9, row 2). The run ignores waypoint holds (LOSSES.waypointHolds),
// so the loiter is drawn as one slow orbit turn of about 60 s at the quadrotor's cruise speed
// (circumference 754 m at 12 m/s), followed by the hover hold for the preview and the timeline.
// The question is answered by track continuity over that orbit, which the run does fly.
// Laydown as Point defence (build.ts laydown rule); the run-in ends on the defended asset.
import { directApproach, hoverAndStare, orbit } from '../behaviors';
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

const LOITER = { x: 1060, y: 1060 }; // 1.5 km from the radar, bearing 045
const ASSET = { x: -500, y: 500 };

/**
 * Scope of inference note for the AAR (review 6 F-18, review 7 item 6b). The limit itself (the
 * runs do not stop at the hover) is the generated line from `simulationLimits` (review 7.R F-01);
 * this note says only what 1.2.2 covers here.
 */
export const HOVER_SCOPE =
  '1.2.2 Track Continuity is measured over the orbit turn and the run-in that the runs fly.';
const q = () =>
  question(
    'Does the radar hold a continuous track through a 60 s loiter inside its coverage?',
    'The loiter is one slow orbit turn of about 60 s, then a 60 s hover. The threshold on 1.2.2 Track Continuity is in the results table.',
  );

export const hoverTrackHold: Template = {
  id: 'hover-track-hold',
  name: 'Hover track hold',
  question: q().text,
  steps: ['find', 'fix', 'track', 'target', 'engage', 'assess'],
  mainMeasures: ['1.2.2'],
  make: () => {
    const Q = q();
    const m = setting('1.2.2', '>=', 95, '%');
    const approach = directApproach({ x: 3100, y: 3000 }, { x: LOITER.x, y: LOITER.y + 120 }, 120);
    const loiter = orbit(LOITER, 120, 120, 1);
    const hover = hoverAndStare(LOITER, 120, 60);
    const runIn = directApproach(LOITER, ASSET, 120).slice(1);
    const v = vignette({
      name: 'Hover track hold',
      questions: [Q],
      hypotheses: [hypothesis(Q, m, { low: 90, high: 100 })],
      threats: [threat('T1', 'g1-quad-isr', [...approach, ...loiter, ...hover, ...runIn])],
      sensors: [
        sensor('RDR-1', 'radar', 0, 0, 4000),
        sensor('RF-1', 'rf', 750, 250, 3000),
        sensor('EO-1', 'eoir', -700, -200, 2500, { fovDeg: 60, bearingDeg: 45 }),
      ],
      effectors: [effector('EW-1', 'ew', 0, -550, 1500)],
      areas: [defendedAsset(250, ASSET)],
      measures: [m],
    });
    v.report.sections = { scope: HOVER_SCOPE };
    return v;
  },
};
