// Surrogate racetrack with truth (spec section 9, row 6). Legacy SURR-001: a piston target drone
// flies the reference racetrack at 300 m with RTK truth; two TSPI stations. Radar only, so the
// preview reaches Find and Fix. 1.2.3 is the mean ground-plane track error over the pattern.
import { racetrack } from '../behaviors';
import type { Template } from './types';
import {
  area,
  defendedAsset,
  hypothesis,
  node,
  question,
  sensor,
  setting,
  threat,
  vignette,
} from './build';

const RT: [number, number][] = [
  [1000, -800],
  [2800, -800],
  [3100, -500],
  [3100, 500],
  [2800, 800],
  [1000, 800],
  [700, 500],
  [700, -500],
];

const q = () =>
  question(
    'How accurate is the radar track against RTK truth on a known racetrack at 300 m?',
    'Legacy MOP: track position error, 90th percentile, at most 15 m. The score is the mean error over the pattern (ground plane; the simulated track carries no altitude).',
  );

export const surrogateRacetrack: Template = {
  id: 'surrogate-racetrack',
  name: 'Surrogate racetrack with truth',
  question: q().text,
  steps: ['find', 'fix'],
  mainMeasures: ['1.2.3'],
  make: () => {
    const Q = q();
    const m = setting('1.2.3', '<=', 15, 'm');
    const tm1 = node('TM-1', 'tspi', 600, -400, 3500);
    const rtk = node('TM-2', 'tspi', -500, -300, 0);
    return vignette({
      name: 'Surrogate racetrack with truth',
      questions: [Q],
      hypotheses: [hypothesis(Q, m, { low: 5, high: 15 })],
      threats: [
        threat('T1', 'g3-target-piston', racetrack({ x: 1900, y: 0 }, 2400, 1600, 300, 1), 33),
      ],
      sensors: [sensor('RDR-1', 'radar', 0, 0, 4000)],
      nodes: [tm1, rtk],
      areas: [defendedAsset(250), area('REF-1', 'ref', 'Reference racetrack', RT)],
      measures: [m],
      report: {
        summary: '',
        notes: '',
        dataSources: ['RTK GPS truth, 20 Hz', 'Radar track, 1 Hz, with covariance'],
        truth: {
          source: 'RTK GPS, 20 Hz, cm class',
          intervalS: 10,
          stationKeys: [tm1.key, rtk.key],
        },
        slides: [],
      },
    });
  },
};
