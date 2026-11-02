// The time state of a profile, kept per profile id (plan phase 13, reading 1): the cursor, time
// on, the loop, the zoom span, the strip height and the rate survive a workspace switch and a
// reload. It is interface state, not an undo step and not in the record, so it lives in
// localStorage beside the theme (`shell/theme.ts`, the same guarded Storage pattern) under one key
// holding one JSON object keyed by profile id, the newest MAX_IDS ids kept.
import { useDocument, type DocumentState } from './document';
import {
  TL_H_DEFAULT,
  TL_H_MAX,
  TL_H_MIN,
  useUi,
  type LoopRange,
  type TimeView,
  type UiState,
} from './ui';

export const TIME_KEY = 'profileStudio.time';
export const MAX_IDS = 50;
export const SAVE_DELAY_MS = 250;

export type TimeState = {
  tS: number;
  timeOn: boolean;
  loop: LoopRange | null;
  tview: TimeView | null;
  tlH: number;
  rate: number;
};

export const TIME_FIELDS = ['tS', 'timeOn', 'loop', 'tview', 'tlH', 'rate'] as const;

export const TIME_DEFAULTS: TimeState = {
  tS: 0,
  timeOn: false,
  loop: null,
  tview: null,
  tlH: TL_H_DEFAULT,
  rate: 1,
};

type Store = Pick<Storage, 'getItem' | 'setItem'>;
/** One stored entry: the time state and `at`, its save order (the newest has the largest). */
type Entry = TimeState & { at: number };

function storage(): Store | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const obj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** One stored value as a time state: each field that is bad takes its default. */
export function cleanTime(raw: unknown): TimeState {
  const r = obj(raw) ? raw : {};
  const loop =
    obj(r.loop) && num(r.loop.startS) && num(r.loop.endS) && r.loop.endS > r.loop.startS
      ? { startS: Math.max(0, r.loop.startS), endS: r.loop.endS }
      : null;
  const tview =
    obj(r.tview) && num(r.tview.t0S) && num(r.tview.t1S) && r.tview.t1S > r.tview.t0S
      ? { t0S: Math.max(0, r.tview.t0S), t1S: r.tview.t1S }
      : null;
  return {
    tS: num(r.tS) && r.tS >= 0 ? r.tS : TIME_DEFAULTS.tS,
    timeOn: typeof r.timeOn === 'boolean' ? r.timeOn : TIME_DEFAULTS.timeOn,
    loop,
    tview,
    tlH: num(r.tlH) ? Math.round(Math.max(TL_H_MIN, Math.min(TL_H_MAX, r.tlH))) : TL_H_DEFAULT,
    rate: num(r.rate) && r.rate > 0 ? r.rate : TIME_DEFAULTS.rate,
  };
}

function readAll(store: Store | null): Record<string, Entry> {
  try {
    const raw = store?.getItem(TIME_KEY);
    const all: unknown = raw ? JSON.parse(raw) : null;
    if (!obj(all)) return {};
    const out: Record<string, Entry> = {};
    for (const [id, e] of Object.entries(all))
      if (obj(e)) out[id] = { ...cleanTime(e), at: num(e.at) ? e.at : 0 };
    return out;
  } catch {
    return {};
  }
}

/** The stored time state of a profile, else null (no entry, or storage that cannot be read). */
export function loadTime(id: string, store: Store | null = storage()): TimeState | null {
  const e = readAll(store)[id];
  return e ? cleanTime(e) : null;
}

/** Store the profile's time state as the newest entry; the oldest past MAX_IDS drop off. */
export function saveTime(id: string, t: TimeState, store: Store | null = storage()): void {
  try {
    if (!store) return;
    const all = readAll(store);
    const at = Math.max(Date.now(), ...Object.values(all).map((e) => e.at + 1));
    all[id] = { ...cleanTime(t), at };
    const keep = Object.entries(all)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, MAX_IDS);
    store.setItem(TIME_KEY, JSON.stringify(Object.fromEntries(keep)));
  } catch {
    // Private mode or a full quota: the time still holds for this tab.
  }
}

/** The six persisted fields of the ui store. */
export function pickTime(s: Pick<UiState, (typeof TIME_FIELDS)[number]>): TimeState {
  return { tS: s.tS, timeOn: s.timeOn, loop: s.loop, tview: s.tview, tlH: s.tlH, rate: s.rate };
}

/**
 * True when the document store change opened a document (open or close reset the history), not
 * an edit: an edit of the profile id keeps the history arrays until its step is pushed.
 */
function opened(s: DocumentState, prev: DocumentState): boolean {
  return s.past !== prev.past && s.past.length === 0 && s.future.length === 0;
}

/**
 * Restore the time state when the open profile changes (its entry, else the defaults), and save
 * each change of the six fields under the open profile's id, 250 ms after the last one. An edit
 * of the profile id keeps the time and saves it under the new id. Returns the unbind.
 */
export function bindTimePersist(store: Store | null = storage()): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingId: string | null = null;
  let restoring = false;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (pendingId) saveTime(pendingId, pickTime(useUi.getState()), store);
    pendingId = null;
  };
  const restore = (id: string) => {
    restoring = true;
    try {
      useUi.setState(loadTime(id, store) ?? TIME_DEFAULTS);
    } finally {
      restoring = false;
    }
  };

  const first = useDocument.getState().doc?.id;
  if (first) restore(first);

  const offDoc = useDocument.subscribe((s, prev) => {
    const id = s.doc?.id ?? null;
    const was = prev.doc?.id ?? null;
    if (id === was) return;
    if (id && was && !opened(s, prev)) {
      // a rename: the same profile, so its time carries over under the new id
      if (pendingId === was) pendingId = id;
      return;
    }
    flush();
    if (id) restore(id);
  });
  const offUi = useUi.subscribe((s, prev) => {
    if (restoring || TIME_FIELDS.every((f) => s[f] === prev[f])) return;
    const id = useDocument.getState().doc?.id;
    if (!id) return;
    if (pendingId && pendingId !== id) flush();
    pendingId = id;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, SAVE_DELAY_MS);
  });
  const onHide = () => flush();
  globalThis.addEventListener?.('pagehide', onHide);

  return () => {
    flush();
    offDoc();
    offUi();
    globalThis.removeEventListener?.('pagehide', onHide);
  };
}
