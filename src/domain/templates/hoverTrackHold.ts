// Hover track hold (spec section 9, row 2). The run ignores waypoint holds (LOSSES.waypointHolds),
// so the loiter is drawn as one slow orbit turn of about 60 s at the quadrotor's cruise speed
// (circumference 754 m at 12 m/s), followed by the hover hold for the preview and the timeline.
// The question is answered by track continuity over that orbit, which the run does fly.
import { directApproach, hoverAndStare, orbit } from '../behaviors';
import type { Template } from './types';
import { effector, hypothesis, question, sensor, setting, threat, vignette } from './build';

const LOITER = { x: 1060, y: 1060 }; // 1.5 km from the radar, bearing 045

/** Scope of inference text for the AAR (review 6 F-18). */
export const HOVER_SCOPE =
  'The Monte Carlo run does not fly waypoint holds. It flies through the 60 s hover without ' +
  'stopping, so 1.2.2 Track Continuity is measured over the orbit turn and the run-in, not over ' +
  'a stationary hover. A finding on track hold against a hovering target needs a further test.';
const q = () =>
  question(
    'Does the radar hold the track through a 60 s loiter at 1.5 km?',
    'The loiter is one slow orbit turn (about 60 s) then a 60 s hover. The Monte Carlo flies through the hover hold; the preview dwells. Legacy MOP: track continuity at or above 95 percent inside 3 km.',
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
    const runIn = directApproach(LOITER, { x: 60, y: 50 }, 120).slice(1);
    const v = vignette({
      name: 'Hover track hold',
      questions: [Q],
      hypotheses: [hypothesis(Q, m, { low: 90, high: 100 })],
      threats: [threat('T1', 'g1-quad-isr', [...approach, ...loiter, ...hover, ...runIn])],
      sensors: [
        sensor('RDR-1', 'radar', 0, 0, 4000),
        sensor('RF-1', 'rf', 180, -90, 3000),
        sensor('EO-1', 'eoir', -140, 70, 2500, { fovDeg: 60, bearingDeg: 45 }),
      ],
      effectors: [effector('EW-1', 'ew', 0, 0, 1500)],
      measures: [m],
    });
    v.report.sections = { scope: HOVER_SCOPE };
    return v;
  },
};
