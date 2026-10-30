// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CancelledError, runInWorker, startRun, startSweep } from './simClient';
import { testVignette } from '../engine/testVignette';

type Handler = ((ev: { data?: unknown; message?: string }) => void) | null;

class FakeWorker {
  static last: FakeWorker | null = null;
  onmessage: Handler = null;
  onerror: Handler = null;
  onmessageerror: Handler = null;
  terminated = false;
  posted: unknown[] = [];
  constructor() {
    FakeWorker.last = this;
  }
  postMessage(m: unknown) {
    this.posted.push(m);
  }
  terminate() {
    this.terminated = true;
  }
}

describe('simClient', () => {
  vi.stubGlobal('Worker', FakeWorker);
  afterEach(() => {
    FakeWorker.last = null;
  });

  it('resolves on done and terminates the worker', async () => {
    const h = startRun(testVignette(), 2, 1);
    const w = FakeWorker.last!;
    expect(w.posted).toHaveLength(1);
    w.onmessage!({ data: { type: 'done', rows: [], trace: [], scores: [] } });
    await expect(h).resolves.toEqual({ rows: [], trace: [], scores: [] });
    await expect(h.promise).resolves.toEqual({ rows: [], trace: [], scores: [] });
    expect(w.terminated).toBe(true);
  });

  it('rejects on messageerror instead of hanging', async () => {
    const p = runInWorker(testVignette(), 2, 1);
    const w = FakeWorker.last!;
    w.onmessageerror!({});
    await expect(p).rejects.toThrow(/deserialised/);
    expect(w.terminated).toBe(true);
  });

  it('forwards sweep progress before the result', async () => {
    const seen: [number, number][] = [];
    const h = startSweep(
      testVignette(),
      [{ kind: 'threat-speed', levels: [10, 20] }],
      2,
      1,
      (d, t) => seen.push([d, t]),
    );
    const w = FakeWorker.last!;
    w.onmessage!({ data: { type: 'progress', done: 1, total: 2 } });
    w.onmessage!({ data: { type: 'done', sweep: { factors: [], cells: [] } } });
    await expect(h).resolves.toEqual({ factors: [], cells: [] });
    expect(seen).toEqual([[1, 2]]);
  });

  it('cancel terminates the worker and rejects with CancelledError', async () => {
    const h = startSweep(testVignette(), [{ kind: 'threat-speed', levels: [10, 20] }], 2, 1);
    const w = FakeWorker.last!;
    h.cancel();
    await expect(h).rejects.toBeInstanceOf(CancelledError);
    expect(w.terminated).toBe(true);
    // A late reply after cancel changes nothing.
    w.onmessage!({ data: { type: 'done', sweep: { factors: [], cells: [] } } });
    await expect(h.promise).rejects.toBeInstanceOf(CancelledError);
  });
});
