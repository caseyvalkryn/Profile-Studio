import { testVignette } from '../engine/testVignette';
import { useDocument } from './document';
import {
  MAX_IDS,
  SAVE_DELAY_MS,
  TIME_DEFAULTS,
  TIME_KEY,
  bindTimePersist,
  loadTime,
  saveTime,
  type TimeState,
} from './timePersist';
import { UI_DEFAULTS, useUi } from './ui';

/** A Storage stand-in over a Map. */
function memStore() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}

const T: TimeState = {
  tS: 100,
  timeOn: true,
  loop: { startS: 10, endS: 40 },
  tview: { t0S: 5, t1S: 90 },
  tlH: 320,
  rate: 4,
};

describe('timePersist', () => {
  beforeEach(() => {
    vi.useRealTimers();
    useUi.setState({ ...UI_DEFAULTS });
    useDocument.getState().close();
  });

  it('round-trips a profile time state under one key', () => {
    const s = memStore();
    saveTime('P-1', T, s);
    expect(loadTime('P-1', s)).toEqual(T);
    expect(loadTime('P-2', s)).toBeNull();
    expect(Object.keys(JSON.parse(s.m.get(TIME_KEY)!) as object)).toEqual(['P-1']);
  });

  it('a bad entry leaves the defaults', () => {
    const s = memStore();
    s.m.set(TIME_KEY, 'not json');
    expect(loadTime('P-1', s)).toBeNull();
    s.m.set(
      TIME_KEY,
      JSON.stringify({ 'P-1': { tS: 'x', timeOn: 1, loop: { startS: 9, endS: 2 }, tlH: 9999 } }),
    );
    expect(loadTime('P-1', s)).toEqual({ ...TIME_DEFAULTS, tlH: 720 });
    // a store that throws
    const bad = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(loadTime('P-1', bad)).toBeNull();
    expect(() => saveTime('P-1', T, bad)).not.toThrow();
  });

  it('keeps the newest 50 ids', () => {
    const s = memStore();
    for (let i = 0; i < MAX_IDS + 5; i++) saveTime(`P-${i}`, { ...T, tS: i }, s);
    const all = JSON.parse(s.m.get(TIME_KEY)!) as Record<string, unknown>;
    expect(Object.keys(all)).toHaveLength(MAX_IDS);
    expect(loadTime('P-0', s)).toBeNull();
    expect(loadTime('P-4', s)).toBeNull();
    expect(loadTime(`P-${MAX_IDS + 4}`, s)?.tS).toBe(MAX_IDS + 4);
    // saving an old id again makes it the newest
    saveTime('P-5', T, s);
    saveTime('P-new', T, s);
    expect(loadTime('P-5', s)).toEqual(T);
  });

  it('the bind saves after 250 ms and restores when the profile changes', () => {
    vi.useFakeTimers();
    const s = memStore();
    const a = testVignette();
    const b = { ...testVignette(), id: 'V-other' };
    const off = bindTimePersist(s);
    useDocument.getState().open(a);
    expect(useUi.getState().tS).toBe(0);
    useUi.setState({ tS: 42, timeOn: true, rate: 8 });
    expect(loadTime(a.id, s)).toBeNull();
    vi.advanceTimersByTime(SAVE_DELAY_MS);
    expect(loadTime(a.id, s)).toMatchObject({ tS: 42, timeOn: true, rate: 8 });
    // another profile with no entry opens on the defaults
    useUi.setState({ tS: 50 });
    useDocument.getState().open(b);
    expect(useUi.getState()).toMatchObject({ tS: 0, timeOn: false, rate: 1 });
    // the pending save went to the profile it belonged to
    expect(loadTime(a.id, s)?.tS).toBe(50);
    useDocument.getState().open(a);
    expect(useUi.getState()).toMatchObject({ tS: 50, timeOn: true, rate: 8 });
    // an edit of the profile id keeps the time and saves it under the new id
    useDocument.getState().edit('set id', (d) => void (d.id = 'V-renamed'));
    expect(useUi.getState().tS).toBe(50);
    useUi.setState({ tS: 60 });
    vi.advanceTimersByTime(SAVE_DELAY_MS);
    expect(loadTime('V-renamed', s)?.tS).toBe(60);
    off();
  });
});
