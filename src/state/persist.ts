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

export async function saveVignette(v: Vignette): Promise<void> {
  await (await getDb()).put('vignettes', v);
}

export async function loadVignette(id: string): Promise<Vignette | null> {
  const v = await (await getDb()).get('vignettes', id);
  return v ?? null;
}

/** Saved vignettes, newest first. */
export async function listVignettes(): Promise<VignetteListing[]> {
  const all = await (await getDb()).getAll('vignettes');
  return all
    .map((v) => ({ id: v.id, name: v.name, updated: v.updated }))
    .sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0));
}

export async function deleteVignette(id: string): Promise<void> {
  await (await getDb()).delete('vignettes', id);
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

/** True when a vignette with this id is in the database. */
async function isStored(id: string): Promise<boolean> {
  return (await loadVignette(id)) !== null;
}

/**
 * Save the open document 500 ms after its last change. Returns a function that stops autosave.
 * A pending save is written at once, not dropped, when another vignette opens, when the document
 * closes, when autosave stops, and on `pagehide`. Opening a vignette writes nothing unless it is
 * new (`isSaved` says it is not stored yet). `save` defaults to saveVignette; save errors go to
 * `onError`.
 */
export function startAutosave(
  save: (v: Vignette) => Promise<void> = saveVignette,
  onError: (err: unknown) => void = (err) => console.error('Autosave failed', err),
  delayMs = AUTOSAVE_MS,
  isSaved: (id: string) => Promise<boolean> = isStored,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: Vignette | null = null;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const v = pending;
    pending = null;
    if (v) save(v).catch(onError);
  };

  const unsub = useDocument.subscribe((s, prev) => {
    if (s.doc === prev.doc) return;
    const doc = s.doc;
    if (!doc || !prev.doc || doc.id !== prev.doc.id) {
      // A switch: write the previous document's pending edit first.
      flush();
      if (!doc) return;
      isSaved(doc.id)
        .then((saved) => {
          // A new vignette is written once. An edit since then already has a save pending.
          if (saved || pending || useDocument.getState().doc !== doc) return;
          return save(doc);
        })
        .catch(onError);
      return;
    }
    pending = doc;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, delayMs);
  });

  const win = typeof window === 'undefined' ? null : window;
  win?.addEventListener('pagehide', flush);

  return () => {
    flush();
    unsub();
    win?.removeEventListener('pagehide', flush);
  };
}
