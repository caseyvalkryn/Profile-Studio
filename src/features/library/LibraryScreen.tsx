// The Library workspace (spec section 7, the mockup's Collect): New first, the templates in one
// row, saved profiles below grouped by collection (the open profile's group first, then by name;
// newest profile first), search over id, name, question, class and collection. Per card: the
// thumbnail from its first card, name, question, the line "id vN · class · n cards · n paths",
// then Open, Brief, Duplicate, Export, Delete with an inline Yes or No row, then undo for 8 s.
// Import and Export library. The bar has no title: the workspace segment names the screen
// (principle 5.1).
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, shortcutLabel } from '../../commands/registry';
import type { Step } from '../../domain/measures';
import type { Vignette } from '../../domain/types';
import { useDocument } from '../../state/document';
import {
  deleteVignette,
  flushAutosave,
  listVignettes,
  loadVignette,
  saveVignette,
  type VignetteListing,
} from '../../state/persist';
import { Button, Menu, Tooltip } from '../../ui';
import { focusRing } from '../../ui/focus';
import { absoluteTime, metaLine, relativeTime } from './format';
import { SEARCH_ID } from './commands';
import { exportLibraryFile, exportProfileFile, importText } from './io';
import {
  newProfile,
  nextProfileId,
  openProfile,
  openTemplateCopy,
  templatesBlankLast,
  useLibraryRequests,
} from './newProfile';
import { Thumbnail, ThumbnailPlaceholder } from './Thumbnail';
import type { Template } from './types';

/** How long a deleted profile can be restored. */
export const UNDO_MS = 8000;

/** The group heading for profiles with no collection. */
export const NO_COLLECTION = 'No collection';

const headingOf = (collection: string) => collection || NO_COLLECTION;

const STEP_LABEL: Record<Step, string> = {
  find: 'Find',
  fix: 'Fix',
  track: 'Track',
  target: 'Target',
  engage: 'Engage',
  assess: 'Assess',
  system: 'System',
};

type PendingDelete = { id: string; name: string; timer: ReturnType<typeof setTimeout> };

function matches(query: string, ...texts: string[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return texts.join(' ').toLowerCase().includes(q);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Group the listing by collection (mockup drawCollect): the open profile's collection first, then
 * by heading name. Profiles stay newest first.
 */
export function groupByCollection(
  list: VignetteListing[],
  activeCollection: string | null,
): { collection: string; profiles: VignetteListing[] }[] {
  const groups = new Map<string, VignetteListing[]>();
  for (const s of list) {
    const g = groups.get(s.collection);
    if (g) g.push(s);
    else groups.set(s.collection, [s]);
  }
  const out = [...groups].map(([collection, profiles]) => ({
    collection,
    profiles: [...profiles].sort((a, b) =>
      a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : a.id < b.id ? -1 : 1,
    ),
  }));
  return out.sort((a, b) => {
    if (a.collection === activeCollection) return -1;
    if (b.collection === activeCollection) return 1;
    const ha = headingOf(a.collection);
    const hb = headingOf(b.collection);
    return ha < hb ? -1 : ha > hb ? 1 : 0;
  });
}

type CardAction = 'open' | 'brief' | 'dup' | 'export' | 'del' | 'yes' | 'no';

/** One saved profile: thumbnail, name, question, id and age, then the actions or the confirm row. */
function SavedCard({
  s,
  v,
  current,
  asking,
  onAction,
}: {
  s: VignetteListing;
  v: Vignette | undefined;
  current: boolean;
  asking: boolean;
  onAction: (a: CardAction) => void;
}) {
  const act = (label: string, a: CardAction, id?: string) => (
    <Button
      key={label}
      id={id}
      size="sm"
      variant="default"
      style={{ paddingInline: 4 }}
      onClick={() => onAction(a)}
    >
      {label}
    </Button>
  );
  return (
    <article
      tabIndex={0}
      data-testid="saved-card"
      aria-label={`${s.name} ${s.id}`}
      aria-current={current}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) {
          e.preventDefault();
          onAction('open');
        }
      }}
      className={`flex min-w-0 flex-col overflow-hidden rounded-md border border-surface-3 bg-surface-1 aria-[current=true]:border-accent ${focusRing}`}
    >
      {/* The picture runs edge to edge over a rule, as the mockup's .pc .pic (review 10.R N-17). */}
      <div className="aspect-[5/3] overflow-hidden border-b border-surface-3 bg-surface-0">
        {v ? (
          <Thumbnail vignette={v} title={`${s.name} ${s.firstCard ? 'first card' : 'map'}`} />
        ) : (
          <ThumbnailPlaceholder title={`${s.name} ${s.firstCard ? 'first card' : 'map'}`} />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1.5 p-2.5">
        <h3 className="m-0 truncate text-sm font-medium" title={s.name}>
          {s.name}
        </h3>
        <p className="m-0 line-clamp-2 min-h-8 text-xs text-muted">{s.question}</p>
        <Tooltip content={`Saved ${relativeTime(s.updated)}, ${absoluteTime(s.updated)}`}>
          <span
            tabIndex={0}
            data-testid="saved-meta"
            className={`min-w-0 font-mono text-xs break-words text-muted ${focusRing}`}
          >
            {metaLine(s)}
          </span>
        </Tooltip>
        <div className="flex min-w-0 items-center gap-0.5">
          {asking ? (
            <>
              <span
                className="min-w-0 truncate text-xs text-state-warning"
                title={`Delete ${s.name}?`}
              >
                Delete {s.name}?
              </span>
              {act('Yes', 'yes', `lib-del-yes-${s.id}`)}
              {act('No', 'no', `lib-del-no-${s.id}`)}
            </>
          ) : (
            <>
              {act('Open', 'open')}
              {act('Brief', 'brief')}
              {act('Duplicate', 'dup')}
              {act('Export', 'export')}
              <span className="ml-auto">{act('Delete', 'del', `lib-del-${s.id}`)}</span>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

export default function LibraryScreen({ templates = [] }: { templates?: Template[] }) {
  const navigate = useNavigate();
  const go = useCallback((path: string) => void navigate(path), [navigate]);
  const activeCollection = useDocument((s) => s.doc?.collection ?? null);
  const openId = useDocument((s) => s.doc?.id ?? null);
  const changed = useLibraryRequests((s) => s.changed);
  const [query, setQuery] = useState('');
  const [saved, setSaved] = useState<VignetteListing[]>([]);
  const [loaded, setLoaded] = useState<Record<string, Vignette>>({});
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [askDel, setAskDel] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const pendingRef = useRef<PendingDelete | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [focusTarget, setFocusTarget] = useState<{ id: string } | null>(null);

  // Templates in the order given, Blank last. Thumbnails are cached per template id.
  const ordered = useMemo(() => templatesBlankLast(templates), [templates]);
  const thumbs = useMemo(() => {
    const out: Record<string, Vignette> = {};
    for (const t of ordered) out[t.id] = t.make();
    return out;
  }, [ordered]);

  const refresh = useCallback(async () => {
    setSaved(await listVignettes());
  }, []);

  useEffect(() => {
    let live = true;
    // Write an edit made less than 500 ms before the route change first (review 7.R F-06).
    void flushAutosave()
      .then(() => listVignettes())
      .then((list) => {
        if (live) setSaved(list);
      });
    return () => {
      live = false;
    };
  }, [changed]);

  // Load each saved profile once per `updated`, for its thumbnail: the render needs the scene.
  const requested = useRef(new Set<string>());
  useEffect(() => {
    for (const s of saved) {
      const tag = `${s.id}@${s.updated}`;
      if (requested.current.has(tag)) continue;
      requested.current.add(tag);
      void loadVignette(s.id).then((v) => {
        if (v) setLoaded((m) => ({ ...m, [v.id]: v }));
      });
    }
  }, [saved]);

  // Focus moves between Delete and the confirm row, as in the legacy panel.
  useEffect(() => {
    if (focusTarget) document.getElementById(focusTarget.id)?.focus();
  }, [focusTarget]);

  const commitDelete = useCallback((p: PendingDelete) => {
    clearTimeout(p.timer);
    void deleteVignette(p.id);
  }, []);

  // A pending delete is written when the screen unmounts.
  useEffect(
    () => () => {
      if (pendingRef.current) commitDelete(pendingRef.current);
      pendingRef.current = null;
    },
    [commitDelete],
  );

  const setPendingDelete = (p: PendingDelete | null) => {
    pendingRef.current = p;
    setPending(p);
  };

  // The copy is not saved here: autosave writes it on its first edit (FR-07).
  const openTemplate = (t: Template) => void openTemplateCopy(t, go);

  const openSaved = async (id: string, path = '/build') => {
    const v = await loadVignette(id);
    if (v) openProfile(v, go, path);
  };

  const duplicate = async (id: string) => {
    const v = await loadVignette(id);
    if (!v) return;
    const copy: Vignette = {
      ...structuredClone(v),
      id: await nextProfileId(),
      name: `${v.name} copy`,
      updated: new Date().toISOString(),
      version: 1,
    };
    await saveVignette(copy);
    setMessage(`${copy.name} added.`);
    await refresh();
  };

  const exportOne = async (id: string) => {
    const v = await loadVignette(id);
    if (v) exportProfileFile(v);
  };

  const remove = (s: VignetteListing) => {
    const prev = pendingRef.current;
    if (prev) {
      commitDelete(prev);
      setSaved((list) => list.filter((x) => x.id !== prev.id));
    }
    const timer = setTimeout(() => {
      const p = pendingRef.current;
      if (!p || p.id !== s.id) return;
      setPendingDelete(null);
      setSaved((list) => list.filter((x) => x.id !== s.id));
      void deleteVignette(s.id);
    }, UNDO_MS);
    setPendingDelete({ id: s.id, name: s.name, timer });
  };

  const undo = () => {
    const p = pendingRef.current;
    if (!p) return;
    clearTimeout(p.timer);
    setPendingDelete(null);
  };

  // The one import path: it refreshes this list and toasts the count; a problem shows here.
  const importFile = async (file: File | undefined) => {
    if (file) setMessage((await importText(await file.text())).join(' '));
  };

  const onDrop = (e: DragEvent) => {
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    e.preventDefault();
    void importFile(file);
  };

  const newCmd = get('profile.new');
  const newShortcut = newCmd ? shortcutLabel(newCmd) : undefined;

  const shownTemplates = ordered.filter((t) => matches(query, t.name, t.question));
  const listed = saved.filter((s) => pending?.id !== s.id);
  const shownSaved = listed.filter((s) =>
    matches(query, s.id, s.name, s.question, s.class, s.collection),
  );
  const groups = groupByCollection(shownSaved, activeCollection);
  const nCollections = new Set(listed.map((s) => s.collection)).size;
  const count = query.trim()
    ? `${shownSaved.length} of ${plural(listed.length, 'profile', 'profiles')}`
    : `${plural(listed.length, 'profile', 'profiles')} · ${plural(nCollections, 'collection', 'collections')}`;

  const onCardAction = (s: VignetteListing, a: CardAction) => {
    if (a === 'open') void openSaved(s.id);
    else if (a === 'brief') void openSaved(s.id, '/brief');
    else if (a === 'dup') void duplicate(s.id);
    else if (a === 'export') void exportOne(s.id);
    else if (a === 'del') {
      setAskDel(s.id);
      setFocusTarget({ id: `lib-del-no-${s.id}` });
    } else if (a === 'no') {
      setAskDel(null);
      setFocusTarget({ id: `lib-del-${s.id}` });
    } else {
      setAskDel(null);
      remove(s);
    }
  };

  return (
    <div
      className="h-full overflow-y-auto bg-surface-0 px-4 py-3 text-text"
      onDragOver={(e) => {
        if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
      }}
      onDrop={onDrop}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex">
          <Button
            variant="accent"
            shortcut={newShortcut}
            tooltip="A new profile with the default site and one defended asset"
            onClick={() => void newProfile(go)}
            className="rounded-r-none"
          >
            New profile
          </Button>
          <Menu
            items={ordered.map((t) => ({
              id: `tpl-${t.id}`,
              label: t.name,
              onSelect: () => openTemplate(t),
            }))}
            trigger={
              <Button
                variant="accent"
                aria-label="From template"
                className="-ml-px rounded-l-none px-2"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    d="M3 4.5 6 7.5 9 4.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Button>
            }
          />
        </span>
        <input
          id={SEARCH_ID}
          type="search"
          aria-label="Search profiles"
          placeholder="Search question, name, class, collection"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={`h-7 w-72 min-w-0 rounded-sm border border-surface-3 bg-surface-1 px-2 text-sm placeholder:text-muted ${focusRing}`}
        />
        <Button
          variant="default"
          tooltip="Import a Profile Studio or legacy JSON file. You can also drop it here."
          onClick={() => fileRef.current?.click()}
        >
          Import
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          aria-label="Import JSON file"
          className="hidden"
          onChange={(e) => {
            void importFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <Button
          variant="default"
          tooltip="Every saved profile as one JSON file"
          onClick={() => void exportLibraryFile()}
        >
          Export library
        </Button>
        {message ? (
          <span role="status" className="text-xs text-muted">
            {message}
          </span>
        ) : null}
        <span className="text-xs text-muted" data-testid="library-count">
          {count}
        </span>
      </div>

      <section aria-label="Templates">
        <h2 className="ps-t-label mt-0 mb-2">Templates</h2>
        <ul className="flex gap-3 overflow-x-auto pb-2">
          {shownTemplates.map((t) => (
            <li key={t.id} className="w-56 shrink-0">
              <button
                type="button"
                aria-label={`Open template ${t.name}`}
                onClick={() => openTemplate(t)}
                className={`flex h-full w-full flex-col gap-2 rounded-md border border-surface-3 bg-surface-1 p-2 text-left hover:border-accent ${focusRing}`}
              >
                <Thumbnail vignette={thumbs[t.id]!} title={`${t.name} map`} />
                <span className="text-sm font-medium">{t.name}</span>
                {t.question ? (
                  <span className="line-clamp-2 text-xs text-muted">{t.question}</span>
                ) : null}
                {t.steps.length ? (
                  <span className="mt-auto flex flex-wrap gap-1" aria-label="F2T2EA steps">
                    {t.steps.map((s) => (
                      <span
                        key={s}
                        data-step={s}
                        className="rounded-sm border border-surface-3 px-1 text-[10px] leading-4 text-muted"
                      >
                        {STEP_LABEL[s]}
                      </span>
                    ))}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Saved profiles" className="mt-6">
        {pending ? (
          <p role="status" className="mb-2 text-xs text-muted">
            Deleted {pending.name}.{' '}
            <button
              type="button"
              onClick={undo}
              className={`text-text underline hover:text-accent ${focusRing}`}
            >
              Undo
            </button>
          </p>
        ) : null}
        {listed.length === 0 ? (
          <p className="text-xs text-muted">Saved profiles appear here.</p>
        ) : groups.length === 0 ? (
          <p className="py-6 text-sm text-muted">No profile matches. Clear the search.</p>
        ) : (
          groups.map((g) => (
            <section key={g.collection} aria-label={headingOf(g.collection)} className="mb-5">
              <h2 className="ps-t-label mt-0 mb-2">
                {headingOf(g.collection)}
                <span className="ml-1.5 font-mono tracking-normal">{g.profiles.length}</span>
              </h2>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
                {g.profiles.map((s) => (
                  <SavedCard
                    key={s.id}
                    s={s}
                    v={loaded[s.id]}
                    current={openId === s.id}
                    asking={askDel === s.id}
                    onAction={(a) => onCardAction(s, a)}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </section>
    </div>
  );
}
