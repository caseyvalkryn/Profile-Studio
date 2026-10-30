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

/** Parse a v5 vignette or a legacy v4 profile, chosen by its `schema` field. Throws a readable Error. */
export function importJson(text: string): Vignette {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not JSON.');
  }
  const schema =
    typeof data === 'object' && data !== null ? (data as { schema?: unknown }).schema : undefined;
  if (schema === SCHEMA) return parseVignette(data);
  if (schema === 'profile-studio/4') return importLegacyV4(data);
  throw new Error(
    `Unknown record stamp: ${String(schema)}. Expected ${SCHEMA} or profile-studio/4.`,
  );
}

/**
 * Save the open document 500 ms after its last change. Returns a function that stops autosave.
 * `save` defaults to saveVignette; save errors go to `onError`.
 */
export function startAutosave(
  save: (v: Vignette) => Promise<void> = saveVignette,
  onError: (err: unknown) => void = (err) => console.error('Autosave failed', err),
  delayMs = AUTOSAVE_MS,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsub = useDocument.subscribe((s, prev) => {
    if (s.doc === prev.doc || !s.doc) return;
    const doc = s.doc;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      save(doc).catch(onError);
    }, delayMs);
  });
  return () => {
    if (timer) clearTimeout(timer);
    unsub();
  };
}
