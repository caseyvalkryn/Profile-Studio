import { LAYER_GROUPS, groupOn, withGroup } from './layers';

describe('the five layer groups', () => {
  it('are Reach, Events, Envelopes, Telemetry, Labels over the board layer ids', () => {
    expect(LAYER_GROUPS.map((g) => g.label)).toEqual([
      'Reach',
      'Events',
      'Envelopes',
      'Telemetry',
      'Labels',
    ]);
  });

  it('read the board default for a missing id and write every member', () => {
    const telemetry = LAYER_GROUPS[3]!;
    expect(groupOn({}, telemetry)).toBe(false); // telemetry defaults off
    expect(groupOn({}, LAYER_GROUPS[0]!)).toBe(true);
    const on = withGroup({ reach: false }, telemetry, true);
    expect(on).toEqual({ reach: false, telemetry: true, target: true });
    expect(groupOn(on, telemetry)).toBe(true);
    expect(groupOn({ telemetry: true, target: false }, telemetry)).toBe(false);
  });
});
