// Local persistence in IndexedDB (database `profile-studio`, store `vignettes`), JSON import and
// export, and autosave of the open document.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  importLegacyV4,
  parseVignette,
  SCHEMA,
  SCHEMA_V5,
  SCHEMA_V6,
  type Card,
  type ProfileClass,
  type Vignette,
} from '../domain';
import { previewOf, useDocument } from './document';

export const DB_NAME = 'profile-studio';
export const DB_VERSION = 1;
export const AUTOSAVE_MS = 500;

interface StudioDb extends DBSchema {
  vignettes: { key: string; value: Vignette };
}

/** The part of the idb database the functions here use. Tests pass a mock. */
export type VignetteDb = Pick<IDBPDatabase<StudioDb>, 'get' | 'put' | 'delete' | 'getAll'>;

/** One saved profile as the Library lists it: what its card shows, without parsing the record. */
export type VignetteListing = {
  id: string;
  name: string;
  updated: string;
  /** The Library group; a record stored before v7 lists under its site name. */
  collection: string;
  class: ProfileClass;
  version: number;
  /** The first question with text, or ''. */
  question: string;
  cards: number;
  paths: number;
  /** The first card, for the thumbnail, or null. */
  firstCard: Card | null;
};

/** The listing of one stored record, v5 to v7. Read defensively: the record is not parsed. */
export function listingOf(v: Vignette): VignetteListing {
  const old = v as Partial<Vignette>;
  return {
    id: v.id,
    name: v.name,
    updated: v.updated,
    collection: old.collection ?? v.site?.name ?? '',
    class: old.class ?? 'Custom',
    version: old.version ?? 1,
    question: (v.questions ?? []).find((q) => q.text)?.text ?? '',
    cards: old.cards?.length ?? 0,
    paths: v.threats?.length ?? 0,
    firstCard: old.cards?.[0] ?? null,
  };
}

let dbPromise: Promise<VignetteDb> | null = null;

function openStudioDb(): Promise<VignetteDb> {
  return openDB<StudioDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('vignettes'))
        db.createObjectStore('vignettes', { keyPath: 'id' });
    },
  });
}

export function getDb(): Promise<VignetteDb> {
  if (!dbPromise) dbPromise = openStudioDb();
  return dbPromise;
}

/** Replace the database, for tests. Pass null to reopen the real one on next use. */
export function setDb(db: VignetteDb | null): void {
  dbPromise = db ? Promise.resolve(db) : null;
}

/**
 * Ids this session has seen in the store (listed, loaded or saved). Autosave writes an edit on a
 * stored profile at once; an unsaved template copy is first written on its first edit.
 */
const storedIds = new Set<string>();

export async function saveVignette(v: Vignette): Promise<void> {
  await (await getDb()).put('vignettes', v);
  storedIds.add(v.id);
}

export async function loadVignette(id: string): Promise<Vignette | null> {
  const v = await (await getDb()).get('vignettes', id);
  if (!v) return null;
  storedIds.add(v.id);
  // A record stored at v5 or v6 migrates on load; parseVignette accepts v5, v6 and v7.
  return parseVignette(v);
}

const newestFirst = (a: VignetteListing, b: VignetteListing) =>
  a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0;

/** The last listing read this session, so a screen that only needs it does not read again. */
let listed: VignetteListing[] | null = null;

/** The listing the last read returned, or null before the first read. */
export function lastListing(): VignetteListing[] | null {
  return listed;
}

/** Saved vignettes, newest first. */
export async function listVignettes(): Promise<VignetteListing[]> {
  const all = await (await getDb()).getAll('vignettes');
  for (const v of all) storedIds.add(v.id);
  listed = all.map(listingOf).sort(newestFirst);
  return listed;
}

/** Parsed records by id, kept while the stored `updated` is the same. Read-only: thumbnails. */
const parsedCache = new Map<string, { updated: string; v: Vignette | null }>();

function parsedOf(raw: Vignette): Vignette | null {
  const hit = parsedCache.get(raw.id);
  if (hit && hit.updated === raw.updated) return hit.v;
  let v: Vignette | null;
  try {
    v = parseVignette(raw);
  } catch {
    v = null; // a record that does not parse lists, and draws the placeholder
  }
  parsedCache.set(raw.id, { updated: raw.updated, v });
  return v;
}

/**
 * The Library's one read: the listing, newest first, and each record parsed for its thumbnail
 * (absent when it does not parse). Parses are cached per id and `updated`, so a return to the
 * Library parses only what changed. The records are shared: do not edit them.
 */
export async function listWithRecords(): Promise<{
  list: VignetteListing[];
  records: Record<string, Vignette>;
}> {
  const all = await (await getDb()).getAll('vignettes');
  const records: Record<string, Vignette> = {};
  for (const raw of all) {
    storedIds.add(raw.id);
    const v = parsedOf(raw);
    if (v) records[raw.id] = v;
  }
  listed = all.map(listingOf).sort(newestFirst);
  return { list: listed, records };
}

/** Every stored profile, newest first, parsed: a record stored at v5 or v6 comes back as v7. */
export async function loadAllVignettes(): Promise<Vignette[]> {
  const all = await (await getDb()).getAll('vignettes');
  for (const v of all) storedIds.add(v.id);
  return all
    .map((v) => parseVignette(v))
    .sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0));
}

export async function deleteVignette(id: string): Promise<void> {
  await (await getDb()).delete('vignettes', id);
  storedIds.delete(id);
  parsedCache.delete(id);
}

/** A waypoint as exported: x, y, z, arrive, depart, in whole metres and seconds. */
export type TimedWaypoint = [number, number, number, number, number];

/**
 * The record as exported (spec section 10): the v7 record with `timed` on each threat, the
 * resolved waypoint times from the preview's path timing (leg length over speed, plus holds).
 */
export function exportRecord(v: Vignette): Vignette & {
  threats: (Vignette['threats'][number] & { timed: TimedWaypoint[] })[];
} {
  const p = previewOf(v);
  return {
    ...v,
    threats: v.threats.map((t) => ({
      ...t,
      timed: (p.threats[t.key]?.timed ?? []).map((q): TimedWaypoint => [
        Math.round(q.x),
        Math.round(q.y),
        Math.round(q.z),
        Math.round(q.t0),
        Math.round(q.t1),
      ]),
    })),
  };
}

export function exportJson(v: Vignette): string {
  return JSON.stringify(exportRecord(v), null, 2);
}

/**
 * The library as one JSON: `{schema, library}` with every stored profile, newest first, all at
 * the current schema and with `timed` on each threat. `current` (the open profile) replaces its
 * stored copy; an unsaved one is left out.
 */
export async function exportLibrary(current: Vignette | null = null): Promise<string> {
  const library = (await loadAllVignettes()).map((v) =>
    exportRecord(current && v.id === current.id ? current : v),
  );
  return JSON.stringify({ schema: SCHEMA, library }, null, 2);
}

/** The record without the export's derived `timed` on each threat. */
function withoutTimed(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return data;
  const threats = (data as { threats?: unknown }).threats;
  if (!Array.isArray(threats)) return data;
  return {
    ...data,
    threats: threats.map((t: unknown) => {
      if (typeof t !== 'object' || t === null) return t;
      const rest = { ...(t as Record<string, unknown>) };
      delete rest.timed;
      return rest;
    }),
  };
}

function importRecord(data: unknown): Vignette {
  const schema =
    typeof data === 'object' && data !== null ? (data as { schema?: unknown }).schema : undefined;
  if (schema === SCHEMA || schema === SCHEMA_V6 || schema === SCHEMA_V5)
    return parseVignette(withoutTimed(data));
  if (schema === 'profile-studio/4') return importLegacyV4(data);
  throw new Error(
    `Unknown record stamp: ${String(schema)}. Expected ${SCHEMA}, ${SCHEMA_V6}, ${SCHEMA_V5} or profile-studio/4.`,
  );
}

/**
 * Parse an import file into vignettes. Accepts a single v7, v6 or v5 profile, a single legacy v4
 * record, a library export `{schema, library: [...]}` (this app's or the legacy one), or a plain array of
 * records (the shapes the legacy `P.parse` accepts). All or nothing: one bad record fails the
 * import, and the error names its position. Throws a readable Error.
 */
export function importJson(text: string): Vignette[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not JSON.');
  }
  const library =
    typeof data === 'object' && data !== null && !Array.isArray(data)
      ? (data as { library?: unknown }).library
      : undefined;
  const items = Array.isArray(data) ? data : Array.isArray(library) ? library : null;
  if (!items) return [importRecord(data)];
  if (items.length === 0) throw new Error('This file has no records.');
  return items.map((item, i) => {
    try {
      return importRecord(item);
    } catch (err) {
      throw new Error(`Record ${i + 1} of ${items.length}: ${(err as Error).message}`, {
        cause: err,
      });
    }
  });
}

/** The running autosave's flush, so a route change can write a pending edit at once. */
let flushActive: (() => Promise<void>) | null = null;

/**
 * Write the pending autosave now and resolve when it is stored (review 7.R F-06). The Library
 * calls it on mount, so an edit made less than 500 ms before shows in the Saved list.
 */
export function flushAutosave(): Promise<void> {
  return flushActive ? flushActive() : Promise.resolve();
}

/**
 * Save the open document 500 ms after its last change. Returns a function that stops autosave.
 * A pending save is written at once, not dropped, when another vignette opens, when the document
 * closes, when autosave stops, on `pagehide` and on `flushAutosave`. Opening a vignette writes
 * nothing: a template copy is first written on its first edit (FR-07), and a stored vignette
 * keeps saving on each edit. A change that is not a user edit (a drag step held back) on a copy
 * that no edit has touched writes nothing either (review 7.R F-06). A
 * cancelled drag that returns the document to its state at open, with nothing written since,
 * writes nothing. `save` defaults to saveVignette; save errors go to `onError`.
 */
export function startAutosave(
  save: (v: Vignette) => Promise<void> = saveVignette,
  onError: (err: unknown) => void = (err) => console.error('Autosave failed', err),
  delayMs = AUTOSAVE_MS,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: Vignette | null = null;
  // The document as opened, whether anything was written for it since, and whether the user
  // has edited it.
  let opened: Vignette | null = useDocument.getState().doc;
  let written = false;
  let edited = false;

  const flush = (): Promise<void> => {
    if (timer) clearTimeout(timer);
    timer = null;
    const v = pending;
    pending = null;
    if (!v) return Promise.resolve();
    written = true;
    return save(v).catch(onError);
  };

  const schedule = (doc: Vignette) => {
    pending = doc;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), delayMs);
  };

  const unsub = useDocument.subscribe((s, prev) => {
    const userEdit = s.history !== prev.history || s.future !== prev.future;
    if (s.doc === prev.doc) {
      // The end of a drag records it in history without a new document: the first user edit
      // of a copy whose drag steps were held back.
      if (userEdit && s.doc && !edited && s.doc !== opened) {
        edited = true;
        schedule(s.doc);
      }
      return;
    }
    const doc = s.doc;
    if (!doc || !prev.doc || doc.id !== prev.doc.id) {
      // A switch: write the previous document's pending edit first. Opening writes nothing.
      void flush();
      opened = doc;
      written = false;
      edited = false;
      return;
    }
    if (doc === opened && !written) {
      // Back to the document as opened (a cancelled drag): nothing to write.
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
      return;
    }
    if (userEdit) edited = true;
    // A drag step on an unedited, unsaved template copy: not a reason to save it.
    if (!edited && !written && !storedIds.has(doc.id)) return;
    schedule(doc);
  });

  const win = typeof window === 'undefined' ? null : window;
  const onHide = () => void flush();
  win?.addEventListener('pagehide', onHide);
  flushActive = flush;

  return () => {
    void flush();
    unsub();
    win?.removeEventListener('pagehide', onHide);
    if (flushActive === flush) flushActive = null;
  };
}
