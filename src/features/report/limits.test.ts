import type { Threat } from '../../domain/types';
import { testThreat, testVignette } from '../../engine/testVignette';
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
    expect(line).toContain('T1 holds 60 s at waypoint 2.');
    expect(line).toContain('The runs do not fly the hold');
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
