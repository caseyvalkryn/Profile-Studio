import { vi } from 'vitest';
import { testVignette } from '../engine/testVignette';
import type { Vignette } from '../domain/types';
import { useDocument } from './document';
import {
  deleteVignette,
  exportJson,
  importJson,
  listVignettes,
  loadVignette,
  saveVignette,
  setDb,
  startAutosave,
  type VignetteDb,
} from './persist';

function mockDb(): VignetteDb {
  const m = new Map<string, Vignette>();
  return {
    put: vi.fn(async (_s: string, v: Vignette) => {
      m.set(v.id, v);
      return v.id;
    }),
    get: vi.fn(async (_s: string, id: string) => m.get(id)),
    getAll: vi.fn(async () => [...m.values()]),
    delete: vi.fn(async (_s: string, id: string) => {
      m.delete(id);
    }),
  } as unknown as VignetteDb;
}

afterEach(() => setDb(null));

const v4 = (name: string) => ({
  schema: 'profile-studio/4',
  id: name,
  name,
  scene: { aircraft: [], paths: [], systems: [], volumes: [] },
});

describe('JSON import and export', () => {
  it('round-trips a v5 vignette', () => {
    const v = testVignette();
    expect(importJson(exportJson(v))).toEqual([v]);
  });

  it('imports a single legacy v4 record by its schema field', () => {
    const out = importJson(JSON.stringify(v4('old')));
    expect(out).toHaveLength(1);
    expect(out[0]!.schema).toBe('profile-studio/5');
    expect(out[0]!.name).toBe('old');
  });

  it('imports every record of the legacy library export', () => {
    const lib = { schema: 'profile-studio/4', library: [v4('a'), v4('b'), v4('c')] };
    expect(importJson(JSON.stringify(lib)).map((v) => v.name)).toEqual(['a', 'b', 'c']);
  });

  it('imports a plain array of v4 and v5 records', () => {
    const out = importJson(JSON.stringify([v4('a'), testVignette({ name: 'five' })]));
    expect(out.map((v) => v.name)).toEqual(['a', 'five']);
  });

  it('fails the whole library import on one bad record and names its position', () => {
    const lib = { schema: 'profile-studio/4', library: [v4('a'), { schema: 'x' }, v4('c')] };
    expect(() => importJson(JSON.stringify(lib))).toThrow(/^Record 2 of 3: Unknown record stamp/);
    expect(() => importJson('[]')).toThrow(/no records/);
  });

  it('rejects an unknown stamp and bad JSON with a readable error', () => {
    expect(() => importJson('{"schema":"x"}')).toThrow(/Unknown record stamp/);
    expect(() => importJson('nope')).toThrow(/not JSON/);
  });
});

describe('vignette store functions (mocked idb)', () => {
  it('saves, lists newest first, loads and deletes', async () => {
    setDb(mockDb());
    await saveVignette(testVignette({ id: 'a', name: 'A', updated: '2026-01-01T00:00:00Z' }));
    await saveVignette(testVignette({ id: 'b', name: 'B', updated: '2026-02-01T00:00:00Z' }));
    expect((await listVignettes()).map((l) => l.id)).toEqual(['b', 'a']);
    expect((await loadVignette('a'))?.name).toBe('A');
    await deleteVignette('a');
    expect(await loadVignette('a')).toBeNull();
  });
});

describe('autosave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('saves once, 500 ms after the last of several edits', async () => {
    const save = vi.fn(async () => {});
    useDocument.getState().open(testVignette());
    const stop = startAutosave(save);
    for (let i = 0; i < 5; i++) {
      useDocument.getState().edit('n', (d) => {
        d.name = `n${i}`;
      });
      vi.advanceTimersByTime(100);
    }
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(save).toHaveBeenCalledTimes(1);
    expect((save.mock.calls[0] as unknown as [Vignette])[0].name).toBe('n4');
    stop();
    useDocument.getState().edit('m', (d) => {
      d.name = 'm';
    });
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  const names = (save: { mock: { calls: unknown[][] } }) =>
    save.mock.calls.map((c) => `${(c[0] as Vignette).id}:${(c[0] as Vignette).name}`);

  it('saves the pending edit when another vignette opens within 500 ms', async () => {
    const save = vi.fn<(v: Vignette) => Promise<void>>(async () => {});
    useDocument.getState().open(testVignette({ id: 'A' }));
    const stop = startAutosave(save, undefined, undefined, async () => true);
    useDocument.getState().edit('Rename', (d) => {
      d.name = 'A-edited';
    });
    vi.advanceTimersByTime(100);
    useDocument.getState().open(testVignette({ id: 'B' }));
    expect(names(save)).toEqual(['A:A-edited']);
    useDocument.getState().edit('Rename', (d) => {
      d.name = 'B-edited';
    });
    vi.advanceTimersByTime(600);
    await Promise.resolve();
    expect(names(save)).toEqual(['A:A-edited', 'B:B-edited']);
    stop();
  });

  it('stop and pagehide write a pending save; opening a stored vignette writes nothing', async () => {
    const save = vi.fn<(v: Vignette) => Promise<void>>(async () => {});
    useDocument.getState().open(testVignette({ id: 'A' }));
    const stop = startAutosave(save, undefined, undefined, async () => true);
    useDocument.getState().open(testVignette({ id: 'B' }));
    await Promise.resolve();
    expect(save).not.toHaveBeenCalled();
    useDocument.getState().edit('Rename', (d) => {
      d.name = 'paged';
    });
    window.dispatchEvent(new Event('pagehide'));
    expect(names(save)).toEqual(['B:paged']);
    useDocument.getState().edit('Rename', (d) => {
      d.name = 'stopped';
    });
    stop();
    expect(names(save)).toEqual(['B:paged', 'B:stopped']);
    window.dispatchEvent(new Event('pagehide'));
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('writes a new vignette once on open', async () => {
    const save = vi.fn<(v: Vignette) => Promise<void>>(async () => {});
    useDocument.getState().close();
    const stop = startAutosave(save, undefined, undefined, async () => false);
    useDocument.getState().open(testVignette({ id: 'N' }));
    await vi.waitFor(() => expect(names(save)).toEqual(['N:test vignette']));
    stop();
  });
});
