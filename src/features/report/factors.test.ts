import { testEffector, testSensor, testVignette } from '../../engine/testVignette';
import { factorLine, factorRows, sitePosition } from './factors';

describe('sitePosition', () => {
  it('writes east and north offsets, negative as W and S, in the display units', () => {
    expect(sitePosition(2204, -1741, 'nav')).toBe('1.19 nm E, 0.94 nm S of the site');
    expect(sitePosition(-1500, 2500, 'si')).toBe('1.50 km W, 2.50 km N of the site');
  });

  it('takes E and N for one offset that rounds to zero', () => {
    expect(sitePosition(-1500, -2, 'nav')).toBe('0.81 nm W, 0.00 nm N of the site');
    expect(sitePosition(-1, 2204, 'si')).toBe('0.00 km E, 2.20 km N of the site');
  });

  it('says "at the site" when both offsets round to zero (review 7.R F-19)', () => {
    expect(sitePosition(0, 0, 'nav')).toBe('at the site');
    expect(sitePosition(-1, -2, 'nav')).toBe('at the site');
    expect(sitePosition(4, -4, 'si')).toBe('at the site');
    expect(sitePosition(10, 0, 'nav')).toBe('0.01 nm E, 0.00 nm N of the site');
  });
});

describe('factorRows', () => {
  const v = testVignette({
    sensors: [testSensor('RF-1', 'rf', 3000, { x: 2204, y: -1741 })],
    effectors: [testEffector('E-01', { x: -926, y: 0 })],
  });

  it('puts each sensor and effector position in the factor line', () => {
    const lines = factorRows(v, null, 'nav').map(factorLine);
    expect(lines).toContain(
      'Sensor RF-1 RF detector: 1.19 nm E, 0.94 nm S of the site; range 1.62 nm, sector 360°',
    );
    expect(lines.find((l) => l.startsWith('Effector E-01'))).toContain(
      '0.50 nm W, 0.00 nm N of the site; range 1.35 nm',
    );
  });

  it('lists each C2 or TSPI node with its position', () => {
    const node = factorRows(v, null, 'si').find((r) => r.factor === 'Node');
    expect(node).toMatchObject({ id: 'N-01', type: 'C2 node' });
    expect(node?.setting).toBe('0.03 km W, 0.03 km S of the site');
  });

  it('follows the units toggle', () => {
    const si = factorRows(v, null, 'si').find((r) => r.id === 'RF-1');
    expect(si?.setting).toMatch(/^2\.20 km E, 1\.74 km S of the site; range 3\.00 km/);
  });
});
