import { vi } from 'vitest';
import { testVignette } from '../engine/testVignette';
import type { RunRow } from '../domain/types';

const rows: RunRow[] = [
  {
    run: 1,
    threat: 'T-01',
    stage_reached: 'detect',
    detect_range_m: 4000,
    detect_alt_m: 100,
    track_continuity_pct: null,
    track_error_m: null,
    id_range_m: null,
    id_time_s: null,
    identified_ok: null,
    engagement_range_m: null,
    time_to_intercept_s: null,
    outcome: 'No Attempt',
  },
];

vi.mock('../workers/simClient', () => ({
  runInWorker: vi.fn(
    async (_v: unknown, n: number, _seed: number, onProgress?: (d: number, t: number) => void) => {
      onProgress?.(1, n);
      onProgress?.(n, n);
      return { rows, trace: [], scores: [] };
    },
  ),
  sweepInWorker: vi.fn(async () => ({ factors: [], cells: [] })),
}));

const { useDocument } = await import('./document');
const { useRuns, RUN_FAILED, EDITED_DURING_RUN, CLOSED_DURING_RUN } = await import('./runs');
const { runInWorker } = await import('../workers/simClient');

const withHypotheses = () =>
  testVignette({
    hypotheses: [
      {
        key: 'h1',
        id: 'H-01',
        question: '',
        measure: '1.1.2',
        op: '>=',
        value: 0.9,
        prediction: { low: 0.8, high: 0.95 },
        lockedAt: null,
      },
      {
        key: 'h2',
        id: 'H-02',
        question: '',
        measure: '1.1.2',
        op: '>=',
        value: 0.9,
        prediction: null,
        lockedAt: null,
      },
    ],
  });

beforeEach(() => {
  useDocument.getState().open(withHypotheses());
  useRuns.setState({ results: {}, order: [], activeKey: null, compareKeys: [], sweep: null });
  vi.mocked(runInWorker).mockClear();
});

describe('runs store', () => {
  it('posts progress, stores the result and appends a RunSummary outside undo history', async () => {
    const seen: number[] = [];
    const unsub = useRuns.subscribe((s) => {
      const e = s.activeKey ? s.results[s.activeKey] : undefined;
      if (e) seen.push(e.progress.done);
    });
    const key = await useRuns.getState().startRun(10, 7);
    unsub();
    expect(key).toBeTruthy();
    const entry = useRuns.getState().results[key!]!;
    expect(entry.status).toBe('done');
    expect(entry.result?.rows).toEqual(rows);
    expect(seen).toContain(1);
    expect(entry.progress).toEqual({ done: 10, total: 10 });
    const doc = useDocument.getState().doc!;
    expect(doc.runs[0]).toMatchObject({ key, id: 'R-1', n: 10, seed: 7, rows });
    expect(useDocument.getState().history).toEqual([]);
    expect(entry.note).toBeNull();
    expect(runInWorker).toHaveBeenCalledTimes(1);
  });

  it('locks hypotheses with a prediction on the first run only', async () => {
    await useRuns.getState().startRun(5, 1);
    const h = useDocument.getState().doc!.hypotheses;
    const lockedAt = h[0]!.lockedAt;
    expect(lockedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(h[1]!.lockedAt).toBeNull();
    await new Promise((r) => setTimeout(r, 5));
    await useRuns.getState().startRun(5, 2);
    expect(useDocument.getState().doc!.hypotheses[0]!.lockedAt).toBe(lockedAt);
    expect(useDocument.getState().history).toEqual([]);
    expect(useDocument.getState().doc!.runs.map((r) => r.id)).toEqual(['R-2', 'R-1']);
  });

  it('undo after a run leaves the lock, the snapshot and the run in place', async () => {
    useDocument.getState().edit('Rename', (d) => {
      d.name = 'renamed';
    });
    const key = await useRuns.getState().startRun(5, 1);
    useDocument.getState().undo();
    useDocument.getState().undo();
    const doc = useDocument.getState().doc!;
    expect(doc.name).toBe('test vignette');
    expect(doc.hypotheses[0]!.lockedAt).not.toBeNull();
    expect(doc.runs.map((r) => r.key)).toEqual([key]);
    expect(useRuns.getState().results[key!]!.predictions).toEqual([
      { hypothesis: 'h1', measure: '1.1.2', op: '>=', value: 0.9, low: 0.8, high: 0.95 },
    ]);
  });

  it('stores a run on a vignette edited mid-run with a note, and skips a closed one', async () => {
    let release: () => void = () => {};
    vi.mocked(runInWorker).mockImplementationOnce(
      () => new Promise((res) => (release = () => res({ rows, trace: [], scores: [] }))),
    );
    const p = useRuns.getState().startRun(5, 1);
    await Promise.resolve();
    expect(await useRuns.getState().startRun(5, 9)).toBeNull();
    useDocument.getState().edit('Rename', (d) => {
      d.name = 'mid-run';
    });
    release();
    const key = await p;
    expect(useRuns.getState().results[key!]!.note).toBe(EDITED_DURING_RUN);
    expect(useDocument.getState().doc!.runs).toHaveLength(1);

    vi.mocked(runInWorker).mockImplementationOnce(
      () => new Promise((res) => (release = () => res({ rows, trace: [], scores: [] }))),
    );
    const q = useRuns.getState().startRun(5, 2);
    await Promise.resolve();
    useDocument.getState().open(testVignette({ id: 'other' }));
    release();
    const key2 = await q;
    expect(useRuns.getState().results[key2!]!.note).toBe(CLOSED_DURING_RUN);
    expect(useDocument.getState().doc!.runs).toHaveLength(0);
  });

  it('maps a worker failure to a user sentence and keeps the raw text', async () => {
    vi.mocked(runInWorker).mockRejectedValueOnce(new Error('sim worker failed'));
    const key = await useRuns.getState().startRun(5, 1);
    const e = useRuns.getState().results[key!]!;
    expect(e).toMatchObject({ status: 'error', error: RUN_FAILED, detail: 'sim worker failed' });
    expect(useDocument.getState().doc!.runs).toHaveLength(0);
  });

  it('drops the result of a cancelled run', async () => {
    let release: () => void = () => {};
    vi.mocked(runInWorker).mockImplementationOnce(
      () => new Promise((res) => (release = () => res({ rows, trace: [], scores: [] }))),
    );
    const p = useRuns.getState().startRun(5, 1);
    await Promise.resolve();
    useRuns.getState().cancel();
    release();
    const key = await p;
    expect(useRuns.getState().results[key!]!.status).toBe('cancelled');
    expect(useDocument.getState().doc!.runs).toHaveLength(0);
  });

  it('compares at most four runs', () => {
    useRuns.getState().setCompare(['a', 'b', 'c', 'd', 'e']);
    expect(useRuns.getState().compareKeys).toEqual(['a', 'b', 'c', 'd']);
    useRuns.getState().toggleCompare('e');
    expect(useRuns.getState().compareKeys).toHaveLength(4);
    useRuns.getState().toggleCompare('a');
    expect(useRuns.getState().compareKeys).toEqual(['b', 'c', 'd']);
  });
});
