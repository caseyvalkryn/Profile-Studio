// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEFAULTS, toScenario, toSwerling } from './adapter';
import { runTrial } from './sim/playback/trial';
import { testSensor, testThreat, testVignette } from './testVignette';

describe('toScenario', () => {
  it('maps the vignette onto a scenario runTrial accepts', () => {
    const v = testVignette();
    const { scenario, manifest } = toScenario(v, 7);
    expect(scenario.seed).toBe(7);
    expect(manifest.seed).toBe(7);
    expect(scenario.sweepStepS).toBe(DEFAULTS.sweepStepS);
    expect(scenario.entities.map((e) => e.kind).sort()).toEqual(
      ['asset', 'c2', 'effector', 'sensor', 'sensor', 'uas', 'uas'].sort(),
    );
    // Frame: vignette y north becomes rangeboard y south.
    const path = scenario.paths.find((p) => p.entityId === 'T-01')!;
    expect(path.points[0]).toEqual({ x: 0, y: -6000 });
    expect(scenario.connections.map((c) => `${c.fromId}>${c.toId}`).sort()).toEqual(
      ['N-01>E-01', 'S-01>N-01', 'S-02>N-01'].sort(),
    );
    const result = runTrial(scenario, manifest);
    expect(result.assessments.map((a) => a.uasId)).toEqual(['T-01', 'T-02']);
    expect(result.assessments.every((a) => a.firstDetectS != null)).toBe(true);
  });

  it('emitting threats are rf-detectable, fiber threats are not', () => {
    const v = testVignette({
      threats: [testThreat('T-01', 'g1-fpv-rf'), testThreat('T-02', 'g1-fpv-fiber')],
      sensors: [testSensor('S-01', 'rf', 4000)],
    });
    const { scenario, manifest } = toScenario(v, 1);
    const uas = (id: string) => scenario.library.find((m) => m.id === `spec:${id}`)!.uas!;
    expect(uas('T-01').navMode).toBe('rf-manual');
    expect(uas('T-02').navMode).toBe('fiber');
    const result = runTrial(scenario, manifest);
    const by = new Map(result.assessments.map((a) => [a.uasId, a]));
    expect(by.get('T-01')!.firstDetectS).not.toBeNull();
    expect(by.get('T-02')!.firstDetectS).toBeNull();
  });

  it('a sector sensor only detects inside its sector', () => {
    // Threat runs in from the north and stops 300 m north of the sensor; a 60 deg sector
    // facing south never sees it.
    const threat = testThreat('T-01', 'g1-quad-isr');
    threat.path[1]!.y = 300;
    const south = testVignette({
      threats: [threat],
      sensors: [testSensor('S-01', 'radar', 5000, { fovDeg: 60, bearingDeg: 180 })],
    });
    const north = testVignette({
      threats: [threat],
      sensors: [testSensor('S-01', 'radar', 5000, { fovDeg: 60, bearingDeg: 0 })],
    });
    const s = toScenario(south, 1);
    const n = toScenario(north, 1);
    expect(s.scenario.library[0]!.sensor!.sectorDeg).toBe(60);
    expect(runTrial(s.scenario, s.manifest).assessments[0]!.firstDetectS).toBeNull();
    expect(runTrial(n.scenario, n.manifest).assessments[0]!.firstDetectS).not.toBeNull();
  });

  it('radar maps the Swerling Pd model onto rangeboard placard terms', () => {
    const { scenario } = toScenario(testVignette(), 1);
    const radar = scenario.library.find((m) => m.id === 'spec:S-01')!.sensor!;
    expect(radar.sensorType).toBe('radar');
    expect(radar.rangeBasis).toBe('sourced');
    expect(radar.detectRangeM).toBe(5000);
    expect(radar.placardPd).toBeGreaterThan(0.5);
    expect(radar.placardPd).toBeLessThan(1);
    expect(radar.updateRateS).toBe(1);
    expect(radar.trackInitM).toBe(3);
    expect(radar.trackInitN).toBe(5);
    expect(radar.trackDropMisses).toBe(10);
    expect(radar.classification!.bands[0]!.timeToDeclareS).toBe(5);
    expect(toSwerling(2)).toBe(1);
    expect(toSwerling(4)).toBe(3);
    expect(toSwerling(0)).toBe(0);
  });
});
