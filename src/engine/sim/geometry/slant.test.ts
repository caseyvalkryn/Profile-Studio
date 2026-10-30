// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { elevationDeg, groundRangeM, radioHorizonM, slantRangeM } from './slant';

describe('slantRangeM and groundRangeM', () => {
  it('is the hypotenuse of the ground range and the altitude difference', () => {
    expect(slantRangeM(3000, 4000)).toBeCloseTo(5000);
    expect(slantRangeM(1000, 0)).toBeCloseTo(1000);
  });

  it('projects a slant range onto the ground plane', () => {
    // Mohajer-6 at 14,000 ft (4,267 m) on the Giraffe 1X 12,649 m detect slant.
    expect(Math.abs(groundRangeM(12649, 4267) - 11907)).toBeLessThan(1);
  });

  it('round trips ground to slant to ground', () => {
    for (const [g, h] of [
      [500, 30],
      [11907, 4267],
      [40000, 100],
    ]) {
      expect(groundRangeM(slantRangeM(g!, h!), h!)).toBeCloseTo(g!, 6);
    }
  });

  it('returns 0 when the altitude difference reaches the slant range', () => {
    expect(groundRangeM(1000, 1000)).toBe(0);
    expect(groundRangeM(1000, 4000)).toBe(0);
  });
});

describe('elevationDeg', () => {
  it('is 45 degrees when the climb equals the ground range', () => {
    expect(elevationDeg(1000, 1000)).toBeCloseTo(45);
  });

  it('is 0 on the horizontal and negative below it', () => {
    expect(elevationDeg(1000, 0)).toBeCloseTo(0);
    expect(elevationDeg(1000, -1000)).toBeCloseTo(-45);
  });
});

describe('radioHorizonM', () => {
  it('adds the horizon of each end', () => {
    // 4.12 * (sqrt(4) + sqrt(91.44)) km.
    expect(radioHorizonM(4, 91.44)).toBeCloseTo(47637, 0);
    expect(radioHorizonM(4, 0)).toBeCloseTo(8240, 0);
  });

  it('clamps a negative height to 0', () => {
    expect(radioHorizonM(-10, 100)).toBeCloseTo(radioHorizonM(0, 100));
  });
});
