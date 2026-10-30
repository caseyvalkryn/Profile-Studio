import type { Threat } from '../../domain/types';
import { testThreat, testVignette } from '../../engine/testVignette';
import { hoverTrackHold } from '../../domain/templates/hoverTrackHold';
import { simulationLimits } from './limits';

function threat(over: (t: Threat) => void): Threat {
  const t = testThreat('T1', 'g1-quad-isr');
  over(t);
  return t;
}

describe('simulationLimits', () => {
  it('states nothing for a level path with no hold', () => {
    expect(simulationLimits(testVignette(), 'nav')).toEqual([]);
  });

  it('states that a waypoint hold is not flown', () => {
    const t = threat((x) => {
      x.path[1]!.holdS = 60;
    });
    const [line, ...rest] = simulationLimits(testVignette({ threats: [t] }), 'nav');
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
    expect(rest).toEqual([]);
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
    const [line] = simulationLimits(testVignette({ threats: [t] }), 'nav');
    expect(line).toBe(
      'The runs fly T1 level at 328 ft AGL, its first waypoint altitude. The drawn altitudes ' +
        'from 328 ft AGL to 1,312 ft AGL are not flown, so the results do not cover a climb or a dive.',
    );
    expect(simulationLimits(testVignette({ threats: [t] }), 'si')[0]).toContain('100 m AGL');
  });

  it('uses no internal names', () => {
    const t = threat((x) => {
      x.path[1]!.holdS = 30;
      x.path[1]!.z = 300;
    });
    for (const l of simulationLimits(testVignette({ threats: [t] }), 'nav')) {
      expect(l).not.toMatch(/engine|monte carlo|rangeboard|adapter/i);
      expect(l).not.toContain('holdS');
    }
  });
});
