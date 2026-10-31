// New profile and template copies (spec section 7 "New", study decision 2), and the requests the
// shell answers: go to a route, focus the profile name field.
//
// Shell contract (the top bar): each request is consumed once.
//   nameFocus: focus and select the name field, then `consumeNameFocus()`.
//   route: `consumeRoute()` (it returns the request and clears it), then navigate.
// `nameFocus` and `route.seq` count up on each request, so a repeat request fires again.
// The Library screen passes its own `navigate`; commands, which have no router, leave a route
// request for the shell.
//
// A new profile, a template copy and a duplicate get the legacy short id `PROF-n` (legacy
// `Sc.newId`): the lowest number not used by a stored profile or the open one.
import { create } from 'zustand';
import type { Vignette } from '../../domain';
import { TEMPLATES, templateById, type Template } from '../../domain/templates';
import { useDocument } from '../../state/document';
import { listVignettes } from '../../state/persist';
import { useUi } from '../../state/ui';

export const UNTITLED = 'Untitled profile';

export type LibraryRequests = {
  /** Counts focus requests for the name field; 0 means none yet. */
  nameFocus: number;
  /** The last route request, or null. */
  route: { path: string; seq: number } | null;
  /** Counts writes to the stored library from outside the Library screen (an import). */
  changed: number;
};

export const useLibraryRequests = create<LibraryRequests>()(() => ({
  nameFocus: 0,
  route: null,
  changed: 0,
}));

/** Tell a mounted Library that the stored library changed. */
export function libraryChanged(): void {
  useLibraryRequests.setState((s) => ({ changed: s.changed + 1 }));
}

/** Ask the shell to focus and select the profile name field. */
export function requestNameFocus(): void {
  useLibraryRequests.setState((s) => ({ nameFocus: s.nameFocus + 1 }));
}

/** The shell has focused the name field: clear the request so it does not fire again. */
export function consumeNameFocus(): void {
  useLibraryRequests.setState({ nameFocus: 0 });
}

let routeSeq = 0;

/** Ask the shell to navigate to `path`. */
export function requestRoute(path: string): void {
  useLibraryRequests.setState({ route: { path, seq: ++routeSeq } });
}

/** Take the pending route request, if any, and clear it. */
export function consumeRoute(): { path: string; seq: number } | null {
  const route = useLibraryRequests.getState().route;
  if (route) useLibraryRequests.setState({ route: null });
  return route;
}

/** `PROF-n`, the lowest n not in `ids` (legacy `util.uid('PROF-', lib)`). */
export function nextProfileIdOf(ids: Iterable<string>): string {
  const used = new Set(ids);
  let n = 1;
  while (used.has(`PROF-${n}`)) n++;
  return `PROF-${n}`;
}

/** The next free `PROF-n` among the stored profiles and the open one. */
export async function nextProfileId(): Promise<string> {
  let ids: string[] = [];
  try {
    ids = (await listVignettes()).map((l) => l.id);
  } catch {
    // No storage: only the open profile counts.
  }
  const open = useDocument.getState().doc?.id;
  return nextProfileIdOf(open ? [...ids, open] : ids);
}

export type Go = (path: string) => void;

/** Open a profile in the document store and go to Build (or `path`). */
export function openProfile(v: Vignette, go?: Go, path = '/build'): void {
  useDocument.getState().open(v);
  if (path === '/build') useUi.getState().setWorkspace('build');
  if (go) go(path);
  else requestRoute(path);
}

/** Templates in menu order: the table order, Blank last. */
export function templatesBlankLast(list: readonly Template[] = TEMPLATES): Template[] {
  const blank = (t: Template) => t.id === 'blank';
  return [...list.filter((t) => !blank(t)), ...list.filter(blank)];
}

/** A fresh copy of a template with the id `id`. Not saved: autosave writes it on its first edit. */
export function copyOf(t: Template, id: string, name = t.name): Vignette {
  return { ...t.make(), id, name, updated: new Date().toISOString() };
}

/**
 * "Untitled profile": the Blank template's site and one defended asset. Opens it in Build and
 * asks for the name field. Nothing is saved until the first edit; the rename is one.
 */
export async function newProfile(go?: Go): Promise<Vignette> {
  const blank = templateById('blank');
  if (!blank) throw new Error('The Blank template is missing.');
  const v = copyOf(blank, await nextProfileId(), UNTITLED);
  openProfile(v, go);
  requestNameFocus();
  return v;
}

/** A copy of the template `t`, opened in Build. */
export async function openTemplateCopy(t: Template, go?: Go): Promise<Vignette> {
  const v = copyOf(t, await nextProfileId());
  openProfile(v, go);
  return v;
}

/** A copy of the template `id`, opened in Build. Resolves null for an unknown id. */
export async function newFromTemplate(id: string, go?: Go): Promise<Vignette | null> {
  const t = templateById(id);
  return t ? openTemplateCopy(t, go) : null;
}
