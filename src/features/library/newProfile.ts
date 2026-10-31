// New profile and template copies (spec section 7 "New", study decision 2), and the requests the
// shell answers: go to a route, focus the profile name field.
//
// Shell contract (lane 9.1.3 top bar, after merge):
//   const nameFocus = useLibraryRequests((s) => s.nameFocus);
//   useEffect(() => { if (nameFocus) { input.focus(); input.select(); } }, [nameFocus]);
//   const route = useLibraryRequests((s) => s.route);
//   useEffect(() => { if (route) navigate(route.path); }, [route]);
// `nameFocus` and `route.seq` count up on each request, so a repeat request fires again.
// The Library screen passes its own `navigate`; commands, which have no router, leave a route
// request for the shell.
import { create } from 'zustand';
import { newKey, type Vignette } from '../../domain';
import { TEMPLATES, templateById, type Template } from '../../domain/templates';
import { useDocument } from '../../state/document';
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

/** Ask the shell to navigate to `path`. */
export function requestRoute(path: string): void {
  useLibraryRequests.setState((s) => ({ route: { path, seq: (s.route?.seq ?? 0) + 1 } }));
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

/** A fresh copy of a template with a new id. Not saved: autosave writes it on its first edit. */
export function copyOf(t: Template, name = t.name): Vignette {
  return { ...t.make(), id: newKey(), name, updated: new Date().toISOString() };
}

/**
 * "Untitled profile": the Blank template's site and one defended asset. Opens it in Build and
 * asks for the name field. Nothing is saved until the first edit; the rename is one.
 */
export function newProfile(go?: Go): Vignette {
  const blank = templateById('blank');
  if (!blank) throw new Error('The Blank template is missing.');
  const v = copyOf(blank, UNTITLED);
  openProfile(v, go);
  requestNameFocus();
  return v;
}

/** A copy of the template `id`, opened in Build. Returns null for an unknown id. */
export function newFromTemplate(id: string, go?: Go): Vignette | null {
  const t = templateById(id);
  if (!t) return null;
  const v = copyOf(t);
  openProfile(v, go);
  return v;
}
