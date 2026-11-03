import { vi } from 'vitest';
import { testVignette } from '../engine/testVignette';
import { SCHEMA, type Vignette } from '../domain';
import { useDocument } from './document';
import {
  deleteVignette,
  exportJson,
  exportLibrary,
  flushAutosave,
  importJson,
  lastListing,
  listVignettes,
  listWithRecords,
  loadVignette,
  saveVignette,
  seedLibrary,
  setDb,
  startAutosave,
  type VignetteDb,
} from './persist';

/** A v7 record without the fields v7 added, as a v6 record would carry it. */
function withoutV7<T extends { collection?: unknown; class?: unknown; version?: unknown }>(
  v: T,
): Omit<T, 'collection' | 'class' | 'version'> {
  const out: Partial<T> = { ...v };
  delete out.collection;
  delete out.class;
  delete out.version;
  return out as Omit<T, 'collection' | 'class' | 'version'>;
}

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
  it('round-trips a v7 profile; the export carries timed and the import drops it', () => {
    const v = testVignette();
    const text = exportJson(v);
    expect(JSON.parse(text).threats[0].timed).toBeDefined();
    expect(importJson(text)).toEqual([v]);
  });

  it('exports timed per path as [x, y, z, arrive, depart] with holds, whole m and s', () => {
    const v = testVignette({ threats: [] });
    v.threats = [
      {
        key: 't',
        id: 'T1',
        type: 'g1-quad-isr',
        speedMs: 10,
        group: '',
        path: [
          { key: 'w0', x: 0.4, y: 0, z: 100, holdS: 0 },
          { key: 'w1', x: 300, y: 400, z: 100, holdS: 60 },
          { key: 'w2', x: 300, y: 400, z: 220.6, holdS: 0 },
        ],
      },
    ];
    const out = JSON.parse(exportJson(v)) as { threats: { timed: number[][] }[] };
    expect(out.threats[0]!.timed).toEqual([
      [0, 0, 100, 0, 0],
      [300, 400, 100, 50, 110],
      [300, 400, 221, 122, 122],
    ]);
  });

  it('round-trips a v6 record to v7: export then import loses nothing', () => {
    const rest = withoutV7(testVignette());
    const v6 = {
      ...rest,
      schema: 'profile-studio/6',
      site: { ...rest.site, name: 'Toughstump' },
      hypotheses: [],
      runs: [],
      report: { ...rest.report, summary: '', slides: [] },
    };
    const [v7] = importJson(JSON.stringify(v6));
    expect(v7).toMatchObject({ schema: SCHEMA, collection: 'Toughstump', class: 'Custom' });
    expect(v7!.version).toBe(1);
    expect('runs' in v7! || 'hypotheses' in v7!).toBe(false);
    expect(importJson(exportJson(v7!))).toEqual([v7]);
  });

  it('round-trips a v7 record to v8: the stamp changes and nothing else', () => {
    const v = testVignette();
    const v7 = { ...JSON.parse(exportJson(v)), schema: 'profile-studio/7' };
    const [v8] = importJson(JSON.stringify(v7));
    expect(v8).toEqual(v);
    expect(v8!.schema).toBe(SCHEMA);
    expect(importJson(exportJson(v8!))).toEqual([v]);
  });

  it("refuses the mockup's own stamp", () => {
    expect(() => importJson('{"schema":"profile-studio/3"}')).toThrow(
      /Unknown record stamp: profile-studio\/3/,
    );
  });

  it('imports a single legacy v4 record by its schema field', () => {
    const out = importJson(JSON.stringify(v4('old')));
    expect(out).toHaveLength(1);
    expect(out[0]!.schema).toBe(SCHEMA);
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

  it('a save, a duplicate and a delete keep the cached listing current (11.F, N-05)', async () => {
    const db = mockDb();
    setDb(db);
    await saveVignette(
      testVignette({ id: 'a', collection: 'Range A', updated: '2026-01-01T00:00:00Z' }),
    );
    await listVignettes();
    expect(db.getAll).toHaveBeenCalledTimes(1);
    await saveVignette(
      testVignette({ id: 'b', collection: 'Range B', updated: '2026-02-01T00:00:00Z' }),
    );
    expect(lastListing()!.map((l) => [l.id, l.collection])).toEqual([
      ['b', 'Range B'],
      ['a', 'Range A'],
    ]);
    await saveVignette(
      testVignette({ id: 'a', collection: 'Range C', updated: '2026-03-01T00:00:00Z' }),
    );
    expect(lastListing()!.map((l) => [l.id, l.collection])).toEqual([
      ['a', 'Range C'],
      ['b', 'Range B'],
    ]);
    await deleteVignette('b');
    expect(lastListing()!.map((l) => l.id)).toEqual(['a']);
    expect(db.getAll).toHaveBeenCalledTimes(1);
  });

  it('listWithRecords reads the store once and parses each record once per updated (11.1)', async () => {
    const db = mockDb();
    setDb(db);
    await saveVignette(testVignette({ id: 'a', name: 'A', updated: '2026-01-01T00:00:00Z' }));
    await saveVignette(testVignette({ id: 'b', name: 'B', updated: '2026-02-01T00:00:00Z' }));
    await saveVignette({ id: 'bad', name: 'Bad', updated: '2025-01-01T00:00:00Z' } as Vignette);
    const one = await listWithRecords();
    expect(db.getAll).toHaveBeenCalledTimes(1);
    expect(db.get).not.toHaveBeenCalled();
    expect(one.list.map((l) => l.id)).toEqual(['b', 'a', 'bad']);
    expect(Object.keys(one.records).sort()).toEqual(['a', 'b']);
    expect(lastListing()).toBe(one.list);
    // unchanged records come back from the cache; an edited one parses again
    await saveVignette(testVignette({ id: 'a', name: 'A2', updated: '2026-03-01T00:00:00Z' }));
    const two = await listWithRecords();
    expect(two.records.b).toBe(one.records.b);
    expect(two.records.a).not.toBe(one.records.a);
    expect(two.records.a!.name).toBe('A2');
  });

  it('lists what the Library card needs, a stored v6 record under its site name', async () => {
    setDb(mockDb());
    const v = testVignette({ id: 'a', collection: 'North', class: 'Surrogate', version: 4 });
    v.questions = [{ key: 'q', id: 'Q-01', text: 'Why?', note: '' }];
    await saveVignette(v);
    const v6 = withoutV7(testVignette({ id: 'b' }));
    await saveVignette({ ...v6, site: { ...v6.site, name: 'South' } } as unknown as Vignette);
    const byId = Object.fromEntries((await listVignettes()).map((l) => [l.id, l]));
    expect(byId.a).toMatchObject({
      collection: 'North',
      class: 'Surrogate',
      version: 4,
      question: 'Why?',
      cards: 0,
      paths: 2,
      firstCard: null,
    });
    expect(byId.b).toMatchObject({ collection: 'South', class: 'Custom', version: 1 });
  });

  it('exportLibrary then importJson round-trips every stored profile', async () => {
    setDb(mockDb());
    const a = testVignette({ id: 'a', name: 'A', updated: '2026-01-01T00:00:00Z' });
    const b = testVignette({ id: 'b', name: 'B', updated: '2026-02-01T00:00:00Z' });
    await saveVignette(a);
    await saveVignette(b);
    const text = await exportLibrary();
    expect(JSON.parse(text).schema).toBe(SCHEMA);
    expect(JSON.parse(text).library[0].threats[0].timed.length).toBeGreaterThan(0);
    expect(importJson(text)).toEqual([b, a]);
  });
});

describe('shipped profiles', () => {
  it('seedLibrary writes a missing record and a newer one, and keeps an edit made since', async () => {
    const db = mockDb();
    const stale = testVignette({ id: 'JIOP-9', updated: '2026-11-01T00:00:00Z' });
    const edited = testVignette({ id: 'PROF-9', updated: '2026-11-04T00:00:00Z', name: 'mine' });
    await db.put('vignettes', stale);
    await db.put('vignettes', edited);
    const shipped = [
      testVignette({ id: 'JIOP-8', updated: '2026-11-03T00:00:00Z' }),
      testVignette({ id: 'JIOP-9', updated: '2026-11-03T00:00:00Z', name: 'shipped' }),
      testVignette({ id: 'PROF-9', updated: '2026-11-03T00:00:00Z', name: 'shipped' }),
    ];
    expect(await seedLibrary(db, shipped)).toBe(2);
    expect((await db.get('vignettes', 'JIOP-8'))?.updated).toBe('2026-11-03T00:00:00Z');
    expect((await db.get('vignettes', 'JIOP-9'))?.name).toBe('shipped');
    expect((await db.get('vignettes', 'PROF-9'))?.name).toBe('mine');
    expect(await seedLibrary(db, shipped)).toBe(0);
  });

  it('seedLibrary refuses a record with an unknown stamp', async () => {
    await expect(seedLibrary(mockDb(), [{ schema: 'x', id: 'A' }])).rejects.toThrow(/stamp/);
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
    const stop = startAutosave(save);
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

  it('stop and pagehide write a pending save; opening a vignette writes nothing', async () => {
    const save = vi.fn<(v: Vignette) => Promise<void>>(async () => {});
    useDocument.getState().open(testVignette({ id: 'A' }));
    const stop = startAutosave(save);
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

  it('writes nothing when a new vignette (a template copy) opens', async () => {
    const save = vi.fn<(v: Vignette) => Promise<void>>(async () => {});
    useDocument.getState().close();
    const stop = startAutosave(save);
    useDocument.getState().open(testVignette({ id: 'N' }));
    vi.advanceTimersByTime(1000);
    await Promise.resolve();
    window.dispatchEvent(new Event('pagehide'));
    useDocument.getState().close();
    stop();
    expect(save).not.toHaveBeenCalled();
  });

  it('writes a new vignette 500 ms after its first edit', async () => {
    const save = vi.fn<(v: Vignette) => Promise<void>>(async () => {});
    useDocument.getState().close();
    const stop = startAutosave(save);
    useDocument.getState().open(testVignette({ id: 'N' }));
    useDocument.getState().edit('Rename', (d) => {
      d.name = 'N-edited';
    });
    vi.advanceTimersByTime(499);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(names(save)).toEqual(['N:N-edited']);
    stop();
  });

  it('a cancelled drag on a just-opened vignette writes nothing', async () => {
    const save = vi.fn<(v: Vignette) => Promise<void>>(async () => {});
    useDocument.getState().close();
    const stop = startAutosave(save);
    useDocument.getState().open(testVignette({ id: 'N' }));
    const s = useDocument.getState();
    s.beginDrag('Move');
    useDocument.getState().updateDrag((d) => {
      d.name = 'dragging';
    });
    useDocument.getState().cancelDrag();
    vi.advanceTimersByTime(1000);
    stop();
    expect(save).not.toHaveBeenCalled();
  });

  it('flushAutosave writes a pending edit at once (route change, 7.R F-06)', async () => {
    const save = vi.fn<(v: Vignette) => Promise<void>>(async () => {});
    useDocument.getState().close();
    const stop = startAutosave(save);
    useDocument.getState().open(testVignette({ id: 'F' }));
    useDocument.getState().edit('Rename', (d) => {
      d.name = 'F-edited';
    });
    vi.advanceTimersByTime(100);
    await flushAutosave();
    expect(names(save)).toEqual(['F:F-edited']);
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(1);
    stop();
    await flushAutosave();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('a re-opened saved vignette keeps saving on each edit', async () => {
    const save = vi.fn<(v: Vignette) => Promise<void>>(async () => {});
    useDocument.getState().close();
    const stop = startAutosave(save);
    useDocument.getState().open(testVignette({ id: 'S', name: 'stored' }));
    useDocument.getState().edit('Rename', (d) => {
      d.name = 'S1';
    });
    vi.advanceTimersByTime(600);
    useDocument.getState().edit('Rename', (d) => {
      d.name = 'S2';
    });
    vi.advanceTimersByTime(600);
    useDocument.getState().undo();
    vi.advanceTimersByTime(600);
    expect(names(save)).toEqual(['S:S1', 'S:S2', 'S:S1']);
    stop();
  });
});
