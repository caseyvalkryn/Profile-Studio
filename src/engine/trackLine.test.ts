// @vitest-environment node
import { trackLineFor } from './trackLine';
import type { TimedPoint, Window } from './geo';

// A straight 200 s path; sensor windows are given directly.
const timed: TimedPoint[] = [
  { x: 0, y: 4000, z: 100, t0: 0, t1: 0 },
  { x: 0, y: 0, z: 100, t0: 200, t1: 200 },
];
const win = (tIn: number, tOut: number): Window => ({ tIn, tOut, rIn: 0, rOut: 0 });

describe('trackLineFor', () => {
  it('is empty before Find', () => {
    expect(
      trackLineFor({ timed, findT: null, fixT: 20, trackT: 50, sensorWindows: [[win(10, 200)]] }),
    ).toEqual([]);
  });

  it('runs pending, unknown, identity under continuous cover', () => {
    const spans = trackLineFor({
      timed,
      findT: 10,
      fixT: 20,
      trackT: 50,
      sensorWindows: [[win(10, 200)]],
    });
    expect(spans).toEqual([
      { t0: 10, t1: 20, state: 'pending' },
      { t0: 20, t1: 50, state: 'unknown' },
      { t0: 50, t1: 200, state: 'identity' },
    ]);
  });

  it('coasts for COAST_S then is lost across a cover gap, and resumes after it', () => {
    const spans = trackLineFor({
      timed,
      findT: 10,
      fixT: 20,
      trackT: null,
      sensorWindows: [[win(10, 60)], [win(100, 200)]],
    });
    expect(spans).toEqual([
      { t0: 10, t1: 20, state: 'pending' },
      { t0: 20, t1: 60, state: 'unknown' },
      { t0: 60, t1: 70, state: 'coast' },
      { t0: 70, t1: 100, state: 'lost' },
      { t0: 100, t1: 200, state: 'unknown' },
    ]);
  });

  it('a gap shorter than the coast time never reaches lost, and a gap to the path end counts', () => {
    const spans = trackLineFor({
      timed,
      findT: 10,
      fixT: null,
      trackT: null,
      sensorWindows: [[win(10, 60), win(65, 150)]],
      coastS: 10,
    });
    expect(spans.map((s) => s.state)).toEqual(['pending', 'coast', 'pending', 'coast', 'lost']);
    expect(spans[spans.length - 1]).toEqual({ t0: 160, t1: 200, state: 'lost' });
  });
});
