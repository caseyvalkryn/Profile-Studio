// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { predict, PROCESS_NOISE_Q, quality, ZERO_COVARIANCE } from './kalman';
import {
  admitMembers,
  COVARIANCE_FLOOR,
  createFusionStage,
  delayedMember,
  FC_QUALITY_MIN,
  fuseTracks,
  invert4,
  NO_C2,
} from './fusion';
import type { Covariance4, TrackEstimate } from './trackTypes';

function diag(px: number, py: number, pvx: number, pvy: number): Covariance4 {
  const c = new Array<number>(16).fill(0);
  c[0] = px;
  c[5] = py;
  c[10] = pvx;
  c[15] = pvy;
  return c;
}

function estimate(over: Partial<TrackEstimate> & { id: string; sensorId: string }): TrackEstimate {
  const { sensorId, ...rest } = over;
  return {
    uasId: 'u',
    sensorIds: [sensorId],
    state: { x: 100, y: 200, vx: 10, vy: -5, tS: 4 },
    covariance: diag(100, 100, 25, 25),
    quality: quality(diag(100, 100, 25, 25)),
    hits: 3,
    misses: 0,
    coasting: false,
    source: 'estimate',
    ...rest,
  };
}

const close = (a: readonly number[], b: readonly number[], tol = 1e-9) => {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i += 1) expect(Math.abs(a[i]! - b[i]!)).toBeLessThan(tol);
};

describe('invert4', () => {
  it('inverts a diagonal and a full symmetric matrix back to the identity', () => {
    const d = diag(4, 2, 0.5, 8);
    close(invert4(d)!, diag(0.25, 0.5, 2, 0.125));
    const m = [4, 1, 0.5, 0, 1, 3, 0, 0.2, 0.5, 0, 2, 0.1, 0, 0.2, 0.1, 5];
    const inv = invert4(m)!;
    const id = new Array<number>(16).fill(0);
    for (let i = 0; i < 4; i += 1) {
      for (let j = 0; j < 4; j += 1) {
        let s = 0;
        for (let k = 0; k < 4; k += 1) s += m[4 * i + k]! * inv[4 * k + j]!;
        id[4 * i + j] = s;
      }
    }
    close(id, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('returns null for a singular matrix', () => {
    expect(invert4(diag(1, 0, 1, 1))).toBeNull();
    expect(invert4(ZERO_COVARIANCE)).toBeNull();
  });
});

describe('fuseTracks', () => {
  it('two equal independent tracks halve the covariance and keep the state', () => {
    const a = estimate({ id: 'a:u', sensorId: 'a' });
    const b = estimate({ id: 'b:u', sensorId: 'b' });
    const fused = fuseTracks([a, b], 'c2', 4)!;
    close(fused.covariance, diag(50, 50, 12.5, 12.5));
    expect(fused.state).toEqual({ x: 100, y: 200, vx: 10, vy: -5, tS: 4 });
    expect(fused.quality).toBeCloseTo(quality(diag(50, 50, 12.5, 12.5)), 12);
    expect(fused.c2Id).toBe('c2');
    expect(fused.memberTrackIds).toEqual(['a:u', 'b:u']);
    expect(fused.sensorIds).toEqual(['a', 'b']);
    expect(fused.hits).toBe(6);
    expect(fused.source).toBe('estimate');
    expect(fused.fusedAtS).toBe(4);
  });

  it('weights the state by information: a member four times as precise pulls the mean 80 percent of the way', () => {
    const a = estimate({ id: 'a:u', sensorId: 'a', state: { x: 0, y: 0, vx: 0, vy: 0, tS: 4 } });
    const b = estimate({
      id: 'b:u',
      sensorId: 'b',
      state: { x: 100, y: 0, vx: 0, vy: 0, tS: 4 },
      covariance: diag(25, 25, 25, 25),
    });
    const fused = fuseTracks([a, b], 'c2', 4)!;
    expect(fused.state.x).toBeCloseTo(80, 9);
    expect(fused.covariance[0]).toBeCloseTo(20, 9);
  });

  it('a truth member dominates: the fused track is the truth with zero covariance', () => {
    const a = estimate({ id: 'a:u', sensorId: 'a' });
    const truth = estimate({
      id: 't:u',
      sensorId: 't',
      state: { x: 5, y: 6, vx: 7, vy: 8, tS: 4 },
      covariance: ZERO_COVARIANCE,
      quality: 1,
      source: 'truth',
    });
    const fused = fuseTracks([a, truth], 'c2', 4)!;
    expect(fused.state).toEqual({ x: 5, y: 6, vx: 7, vy: 8, tS: 4 });
    expect(fused.covariance).toBe(ZERO_COVARIANCE);
    expect(fused.quality).toBe(1);
    expect(fused.source).toBe('truth');
    expect(fused.memberTrackIds).toEqual(['a:u', 't:u']);
  });

  it('one member returns itself as a fused track; none returns null', () => {
    const a = estimate({ id: 'a:u', sensorId: 'a' });
    const fused = fuseTracks([a], NO_C2, 4)!;
    expect(fused.state).toEqual(a.state);
    expect(fused.covariance).toEqual(a.covariance);
    expect(fused.covariance).not.toBe(a.covariance);
    expect(fused.quality).toBe(a.quality);
    expect(fused.c2Id).toBe(NO_C2);
    expect(fused.id).toBe('sensors:fused:u');
    expect(fuseTracks([], 'c2', 4)).toBeNull();
  });

  it('regularizes a singular non-zero member with the documented floor', () => {
    // Zero velocity variance with a finite position variance is singular.
    const a = estimate({ id: 'a:u', sensorId: 'a', covariance: diag(100, 100, 0, 0) });
    const b = estimate({ id: 'b:u', sensorId: 'b' });
    const fused = fuseTracks([a, b], 'c2', 4)!;
    // Position: 1/(100 + floor) + 1/100, within 1e-6 of 50. Velocity: the floored member carries 1 / 1e-6 of information.
    expect(fused.covariance[0]).toBeCloseTo(50, 5);
    expect(fused.covariance[10]).toBeCloseTo(1 / (1 / COVARIANCE_FLOOR + 1 / 25), 12);
  });

  it('FC_QUALITY_MIN is the quality of a 50 m position sigma', () => {
    expect(FC_QUALITY_MIN).toBe(0.5);
    expect(quality(diag(2500, 2500, 1, 1))).toBeCloseTo(FC_QUALITY_MIN, 12);
  });
});

describe('delayedMember', () => {
  const ring = [0, 0.5, 1, 1.5, 2].map((tS, i) =>
    estimate({
      id: 'a:u',
      sensorId: 'a',
      state: { x: 10 * i, y: 0, vx: 20, vy: 0, tS },
      hits: i + 1,
    }),
  );

  it('returns the entry latency ago carried to tS by the constant-velocity predict', () => {
    const m = delayedMember(ring, 1, 2)!;
    const expected = predict(ring[2]!.state, ring[2]!.covariance, 1, PROCESS_NOISE_Q);
    expect(m.state).toEqual(expected.state);
    close(m.covariance, expected.cov);
    expect(m.quality).toBeCloseTo(quality(expected.cov), 12);
    expect(m.hits).toBe(3);
  });

  it('zero latency is the current entry; a track younger than the latency has not arrived', () => {
    expect(delayedMember(ring, 0, 2)).toBe(ring[4]);
    expect(delayedMember(ring, 2.5, 2)).toBeNull();
    expect(delayedMember([], 0, 2)).toBeNull();
  });

  it('a truth entry bypasses the latency', () => {
    const truth = [
      estimate({
        id: 't:u',
        sensorId: 't',
        covariance: ZERO_COVARIANCE,
        quality: 1,
        source: 'truth',
      }),
    ];
    expect(delayedMember(truth, 2, 4)).toBe(truth[0]);
  });
});

describe('createFusionStage', () => {
  it('without links fuses every current estimate at the sensors with no latency', () => {
    const stage = createFusionStage([]);
    expect(stage.viaC2).toBe(false);
    stage.begin();
    stage.observe(estimate({ id: 'a:u', sensorId: 'a' }));
    stage.observe(estimate({ id: 'b:u', sensorId: 'b' }));
    const fused = stage.fuse(4)!;
    expect(fused.c2Id).toBe(NO_C2);
    close(fused.covariance, diag(50, 50, 12.5, 12.5));
    stage.begin();
    expect(stage.fuse(4.5)).toBeNull();
  });

  it('with a link the report arrives after the latency and is carried forward; a drop restarts the ring', () => {
    const stage = createFusionStage([{ c2Id: 'c2', sensorId: 'a', latencyS: 1 }]);
    expect(stage.viaC2).toBe(true);
    const at = (i: number) =>
      estimate({ id: 'a:u', sensorId: 'a', state: { x: 10 * i, y: 0, vx: 20, vy: 0, tS: i / 2 } });
    stage.begin();
    stage.observe(at(0));
    expect(stage.fuse(0)).toBeNull();
    stage.begin();
    stage.observe(at(1));
    expect(stage.fuse(0.5)).toBeNull();
    stage.begin();
    stage.observe(at(2));
    const fused = stage.fuse(1)!;
    const expected = predict(at(0).state, at(0).covariance, 1, PROCESS_NOISE_Q);
    expect(fused.c2Id).toBe('c2');
    expect(fused.state).toEqual({ ...expected.state, tS: 1 });
    close(fused.covariance, expected.cov);
    // No estimate this step: the track dropped, the ring restarts.
    stage.begin();
    expect(stage.fuse(1.5)).toBeNull();
    stage.begin();
    stage.observe(at(4));
    expect(stage.fuse(2)).toBeNull();
  });

  it('with truthTracks on a truth member reaches the node at once; the node with the best quality wins', () => {
    const stage = createFusionStage(
      [
        { c2Id: 'far', sensorId: 'a', latencyS: 2 },
        { c2Id: 'near', sensorId: 'a', latencyS: 0 },
        { c2Id: 'near', sensorId: 't', latencyS: 3 },
      ],
      true,
    );
    stage.begin();
    stage.observe(estimate({ id: 'a:u', sensorId: 'a' }));
    stage.observe(
      estimate({
        id: 't:u',
        sensorId: 't',
        covariance: ZERO_COVARIANCE,
        quality: 1,
        source: 'truth',
      }),
    );
    const fused = stage.fuse(4)!;
    expect(fused.c2Id).toBe('near');
    expect(fused.source).toBe('truth');
    expect(fused.quality).toBe(1);
  });

  it('drops a truth member beside an estimate member when truthTracks is off; all-truth stands; on, truth dominates', () => {
    const est = estimate({ id: 'a:u', sensorId: 'a' });
    const truth = estimate({
      id: 't:u',
      sensorId: 't',
      covariance: ZERO_COVARIANCE,
      quality: 1,
      source: 'truth',
    });
    const truth2 = estimate({
      id: 'r:u',
      sensorId: 'r',
      covariance: ZERO_COVARIANCE,
      quality: 1,
      source: 'truth',
    });
    expect(admitMembers([est, truth], false)).toEqual([est]);
    expect(admitMembers([est, truth], true)).toEqual([est, truth]);
    expect(admitMembers([truth, truth2], false)).toEqual([truth, truth2]);
    const off = createFusionStage([], false);
    off.begin();
    off.observe(est);
    off.observe(truth);
    const fusedOff = off.fuse(4)!;
    expect(fusedOff.source).toBe('estimate');
    expect(fusedOff.memberTrackIds).toEqual(['a:u']);
    close(fusedOff.covariance, est.covariance);
    const on = createFusionStage([], true);
    on.begin();
    on.observe(est);
    on.observe(truth);
    const fusedOn = on.fuse(4)!;
    expect(fusedOn.source).toBe('truth');
    expect(fusedOn.memberTrackIds).toEqual(['a:u', 't:u']);
    const allTruth = createFusionStage([], false);
    allTruth.begin();
    allTruth.observe(truth);
    allTruth.observe(truth2);
    const fusedTruth = allTruth.fuse(4)!;
    expect(fusedTruth.source).toBe('truth');
    expect(fusedTruth.quality).toBe(1);
    expect(fusedTruth.memberTrackIds).toEqual(['t:u', 'r:u']);
  });

  it('a sensor with no C2 link fuses at the sensors and wins the pick on quality', () => {
    const stage = createFusionStage([{ c2Id: 'c2', sensorId: 'a', latencyS: 0 }]);
    stage.begin();
    stage.observe(
      estimate({
        id: 'a:u',
        sensorId: 'a',
        covariance: diag(400, 400, 25, 25),
        quality: quality(diag(400, 400, 25, 25)),
      }),
    );
    stage.observe(estimate({ id: 'b:u', sensorId: 'b' }));
    const fused = stage.fuse(4)!;
    expect(fused.c2Id).toBe(NO_C2);
    expect(fused.memberTrackIds).toEqual(['b:u']);
    close(fused.covariance, diag(100, 100, 25, 25));
    // The linked sensor alone: the node's picture stands.
    stage.begin();
    stage.observe(estimate({ id: 'a:u', sensorId: 'a' }));
    expect(stage.fuse(4.5)!.c2Id).toBe('c2');
  });

  it('duplicate links from one sensor to one node count the member once', () => {
    const stage = createFusionStage([
      { c2Id: 'c2', sensorId: 'a', latencyS: 0 },
      { c2Id: 'c2', sensorId: 'a', latencyS: 0 },
    ]);
    stage.begin();
    stage.observe(estimate({ id: 'a:u', sensorId: 'a' }));
    const fused = stage.fuse(4)!;
    expect(fused.memberTrackIds).toEqual(['a:u']);
    close(fused.covariance, diag(100, 100, 25, 25));
  });
});
