// Local persistence in IndexedDB (database `profile-studio`, store `vignettes`), JSON import and
// export, and autosave of the open document.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { importLegacyV4 } from '../domain/migrate';
import { parseVignette } from '../domain/schema';
import { SCHEMA, type Vignette } from '../domain/types';
import { useDocument } from './document';

export const DB_NAME = 'profile-studio';
export const DB_VERSION = 1;
export const AUTOSAVE_MS = 500;

interface StudioDb extends DBSchema {
  vignettes: { key: string; value: Vignette };
}

/** The part of the idb database the functions here use. Tests pass a mock. */
export type VignetteDb = Pick<IDBPDatabase<StudioDb>, 'get' | 'put' | 'delete' | 'getAll'>;

export type VignetteListing = { id: string; name: string; updated: string };

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
 * Ids this session has seen in the store (listed, loaded or saved). Autosave writes a run result
 * on a stored vignette at once; an unsaved template copy is first written on its first edit.
 */
const storedIds = new Set<string>();

export async function saveVignette(v: Vignette): Promise<void> {
  await (await getDb()).put('vignettes', v);
  storedIds.add(v.id);
}

export async function loadVignette(id: string): Promise<Vignette | null> {
  const v = await (await getDb()).get('vignettes', id);
  if (v) storedIds.add(v.id);
  return v ?? null;
}

/** Saved vignettes, newest first. */
export async function listVignettes(): Promise<VignetteListing[]> {
  const all = await (await getDb()).getAll('vignettes');
  for (const v of all) storedIds.add(v.id);
  return all
    .map((v) => ({ id: v.id, name: v.name, updated: v.updated }))
    .sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0));
}

export async function deleteVignette(id: string): Promise<void> {
  await (await getDb()).delete('vignettes', id);
  storedIds.delete(id);
}

export function exportJson(v: Vignette): string {
  return JSON.stringify(v, null, 2);
}

function importRecord(data: unknown): Vignette {
  const schema =
    typeof data === 'object' && data !== null ? (data as { schema?: unknown }).schema : undefined;
  if (schema === SCHEMA) return parseVignette(data);
  if (schema === 'profile-studio/4') return importLegacyV4(data);
  throw new Error(
    `Unknown record stamp: ${String(schema)}. Expected ${SCHEMA} or profile-studio/4.`,
  );
}

/**
 * Parse an import file into vignettes. Accepts a single v5 vignette, a single legacy v4 record, the
 * legacy library export `{schema: 'profile-studio/4', library: [...]}`, or a plain array of
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
 * keeps saving on each edit. A system change (a run result) on a copy that no edit has touched
 * writes nothing either (review 7.R F-06); the first edit then writes it with its runs. A
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
    // A run, or a drag step, on an unedited, unsaved template copy: not a reason to save it.
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
