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

describe('JSON import and export', () => {
  it('round-trips a v5 vignette', () => {
    const v = testVignette();
    expect(importJson(exportJson(v))).toEqual(v);
  });

  it('imports a legacy v4 record by its schema field', () => {
    const v4 = {
      schema: 'profile-studio/4',
      name: 'old',
      scene: { aircraft: [], paths: [], systems: [], volumes: [] },
    };
    const v = importJson(JSON.stringify(v4));
    expect(v.schema).toBe('profile-studio/5');
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
});
