import type { Threat, Vignette } from '../../domain/types';
import { testSensor, testThreat, testVignette } from '../../engine/testVignette';
import { hoverTrackHold } from '../../domain/templates/hoverTrackHold';
import { surrogateRacetrack } from '../../domain/templates/surrogateRacetrack';
import { swarmSplit } from '../../domain/templates/swarmSplit';
import { simulationLimits } from './limits';

/** The test vignette with its radar only: no sensor-limit line. */
const radarOnly = (over: Partial<Vignette> = {}) =>
  testVignette({ sensors: [testSensor('S-01', 'radar', 5000)], ...over });

function threat(over: (t: Threat) => void): Threat {
  const t = testThreat('T1', 'g1-quad-isr');
  over(t);
  return t;
}

describe('simulationLimits', () => {
  it('states nothing for a level path with no hold', () => {
    expect(simulationLimits(radarOnly(), 'nav')).toEqual([]);
  });

  it('states that a waypoint hold is not flown', () => {
    const t = threat((x) => {
      x.path[1]!.holdS = 60;
    });
    const [line, ...rest] = simulationLimits(radarOnly({ threats: [t] }), 'nav');
    expect(rest).toEqual([]);
    expect(line).toMatch(
      /^T1 is drawn to hover 60 s at waypoint 2 of \d+, \d+:\d\d into its flight\./,
    );
    expect(line).toContain('The runs do not stop there');
    expect(line).toContain('do not cover a threat that stops and hovers');
    // The orbit is a loiter that the runs do fly (review 7.R F-01).
    expect(line).not.toMatch(/loiter/i);
  });

  it('Hover track hold: the hover is waypoint 16 of 17, timed from the start of the flight', () => {
    const v = hoverTrackHold.make();
    const [line, ...rest] = simulationLimits(v, 'nav');
    // the only other line is the sharp detection edge of RF-1 and EO-1
    expect(rest).toHaveLength(1);
    expect(rest[0]).toMatch(/^The runs give RF-1 and EO-1 a sharp detection edge/);
    const t = v.threats[0]!;
    expect(t.path[15]!.holdS).toBe(60);
    expect(t.path).toHaveLength(17);
    expect(line).toMatch(
      /^T1 is drawn to hover 60 s at waypoint 16 of 17, \d+:\d\d into its flight\./,
    );
  });

  it('states the level flight at the first waypoint altitude in the display units', () => {
    const t = threat((x) => {
      x.path[1]!.z = 400;
    });
    const [line] = simulationLimits(radarOnly({ threats: [t] }), 'nav');
    expect(line).toBe(
      'The runs fly T1 level at 328 ft AGL, its first waypoint altitude. The drawn altitudes ' +
        'from 328 ft AGL to 1,312 ft AGL are not flown, so the results do not cover a climb or a dive.',
    );
    expect(simulationLimits(radarOnly({ threats: [t] }), 'si')[0]).toContain('100 m AGL');
  });

  it('uses no internal names', () => {
    const t = threat((x) => {
      x.path[1]!.holdS = 30;
      x.path[1]!.z = 300;
    });
    for (const l of simulationLimits(radarOnly({ threats: [t] }), 'nav')) {
      expect(l).not.toMatch(/engine|monte carlo|rangeboard|adapter/i);
      expect(l).not.toContain('holdS');
    }
  });

  it('states the sharp detection edge for RF, EO/IR and acoustic sensors only (LOSSES.logisticWidth)', () => {
    const v = testVignette({
      threats: [],
      sensors: [
        testSensor('S-01', 'radar', 5000),
        testSensor('S-02', 'eoir', 2500),
        testSensor('S-03', 'acoustic', 1000),
      ],
    });
    expect(simulationLimits(v, 'nav')).toEqual([
      'The runs give S-02 and S-03 a sharp detection edge at the range where the sensor model ' +
        'puts the probability of detection at 0.5 (S-02 1.08 nm, S-03 0.43 nm): a target inside ' +
        'that range can be detected and one beyond it cannot. The gradual fall-off in the ' +
        'probability of detection near that range is not modelled, so the results do not show ' +
        'the mix of detections and misses a real sensor gives there.',
    ]);
    expect(simulationLimits(v, 'si')[0]).toContain('(S-02 2.00 km, S-03 0.80 km)');
    // Swarm has RF-1 and EO-1; Surrogate racetrack has a radar only.
    expect(simulationLimits(swarmSplit.make(), 'nav').join(' ')).toMatch(
      /RF-1 and EO-1 a sharp detection edge/,
    );
    expect(simulationLimits(surrogateRacetrack.make(), 'nav').join(' ')).not.toMatch(
      /detection edge/,
    );
  });

  it('states that a minimum range is applied to detect and track only (LOSSES.sensorMinRange)', () => {
    const v = radarOnly({ threats: [] });
    expect(simulationLimits(v, 'nav')).toEqual([]);
    v.sensors[0]!.minRangeM = 200;
    expect(simulationLimits(v, 'nav')).toEqual([
      "The runs drop detections of a target inside a sensor's minimum range (S-01 0.11 nm) from " +
        'the detection and track measures only. Identification and the engagement decision ' +
        'still use those detections, so the results can show a target identified or engaged ' +
        'earlier than a sensor blind inside its minimum range allows.',
    ]);
  });

  it('names no internal loss or engine term in the sensor lines', () => {
    const v = testVignette({ threats: [] });
    v.sensors[0]!.minRangeM = 100;
    const lines = simulationLimits(v, 'nav');
    expect(lines).toHaveLength(2);
    for (const l of lines)
      expect(l).not.toMatch(/r50|logistic|engine|rangeboard|minRangeM|ladder/i);
  });
});
