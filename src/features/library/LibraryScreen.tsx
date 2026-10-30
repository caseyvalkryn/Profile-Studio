// The Library workspace (spec section 7): templates first, saved vignettes below, search over
// both, import JSON. Delete is undoable for 8 s with no confirm dialog (principle 2.4).
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { newKey } from '../../domain/ids';
import type { Step } from '../../domain/measures';
import type { Vignette } from '../../domain/types';
import { useDocument } from '../../state/document';
import {
  deleteVignette,
  exportJson,
  importJson,
  listVignettes,
  loadVignette,
  saveVignette,
  type VignetteListing,
} from '../../state/persist';
import { useUi } from '../../state/ui';
import { Button, Menu, Tooltip } from '../../ui';
import { focusRing } from '../../ui/focus';
import { absoluteTime, relativeTime } from './format';
import { Thumbnail, ThumbnailPlaceholder } from './Thumbnail';
import type { Template } from './types';

/** How long a deleted vignette can be restored. */
export const UNDO_MS = 8000;

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

const isBlank = (t: Template) => t.id === 'blank' || t.name.toLowerCase() === 'blank';

function matches(query: string, ...texts: string[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return texts.some((t) => t.toLowerCase().includes(q));
}

function download(name: string, text: string) {
  if (typeof URL.createObjectURL !== 'function') return;
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^\w.-]+/g, '_') || 'vignette'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function LibraryScreen({ templates = [] }: { templates?: Template[] }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [saved, setSaved] = useState<VignetteListing[]>([]);
  const [loaded, setLoaded] = useState<Record<string, Vignette>>({});
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [message, setMessage] = useState('');
  const pendingRef = useRef<PendingDelete | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Templates in the order given, Blank last. Thumbnails are cached per template id.
  const ordered = useMemo(
    () => [...templates.filter((t) => !isBlank(t)), ...templates.filter(isBlank)],
    [templates],
  );
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
    void listVignettes().then((list) => {
      if (live) setSaved(list);
    });
    return () => {
      live = false;
    };
  }, []);

  // Load each saved vignette once per `updated`, for its thumbnail and its question text.
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

  const openVignette = (v: Vignette) => {
    useDocument.getState().open(v);
    useUi.getState().setWorkspace('build');
    navigate('/build');
  };

  const openTemplate = async (t: Template) => {
    const v: Vignette = {
      ...t.make(),
      id: newKey(),
      name: t.name,
      updated: new Date().toISOString(),
    };
    await saveVignette(v);
    openVignette(v);
  };

  const openSaved = async (id: string) => {
    const v = await loadVignette(id);
    if (v) openVignette(v);
  };

  const duplicate = async (id: string) => {
    const v = await loadVignette(id);
    if (!v) return;
    const copy: Vignette = {
      ...structuredClone(v),
      id: newKey(),
      name: `${v.name} copy`,
      updated: new Date().toISOString(),
    };
    await saveVignette(copy);
    await refresh();
  };

  const exportOne = async (id: string) => {
    const v = await loadVignette(id);
    if (v) download(v.name, exportJson(v));
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

  const importText = async (text: string) => {
    try {
      const vs = importJson(text);
      for (const v of vs) await saveVignette(v);
      await refresh();
      setMessage(`Imported ${vs.length} ${vs.length === 1 ? 'vignette' : 'vignettes'}`);
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const importFile = async (file: File | undefined) => {
    if (file) await importText(await file.text());
  };

  const onDrop = (e: DragEvent) => {
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    e.preventDefault();
    void importFile(file);
  };

  const shownTemplates = ordered.filter((t) => matches(query, t.name, t.question));
  const shownSaved = saved.filter((s) => {
    if (pending?.id === s.id) return false;
    const v = loaded[s.id];
    return matches(query, s.name, ...(v ? v.questions.map((q) => q.text) : []));
  });

  return (
    <div
      className="h-full overflow-y-auto bg-surface-0 px-6 py-5 text-text"
      onDragOver={(e) => {
        if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
      }}
      onDrop={onDrop}
    >
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-sm font-medium">Library</h1>
        <input
          type="search"
          aria-label="Search templates and saved vignettes"
          placeholder="Search by name or question"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={`h-7 w-72 rounded-sm border border-surface-3 bg-surface-1 px-2 text-sm placeholder:text-muted ${focusRing}`}
        />
        <div className="ml-auto flex items-center gap-2">
          {message ? (
            <span role="status" className="text-xs text-muted">
              {message}
            </span>
          ) : null}
          <Button
            variant="default"
            tooltip="Import a profile-studio/5 or legacy profile-studio/4 JSON file. You can also drop it here."
            onClick={() => fileRef.current?.click()}
          >
            Import JSON
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
        </div>
      </div>

      <section aria-label="Templates">
        <h2 className="mb-2 text-xs text-muted">Templates</h2>
        <ul className="flex gap-3 overflow-x-auto pb-2">
          {shownTemplates.map((t) => (
            <li key={t.id} className="w-56 shrink-0">
              <button
                type="button"
                aria-label={`Open template ${t.name}`}
                onClick={() => void openTemplate(t)}
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

      <section aria-label="Saved vignettes" className="mt-6">
        <h2 className="mb-2 text-xs text-muted">Saved</h2>
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
        {saved.length === 0 ? (
          <p className="text-xs text-muted">Saved vignettes appear here.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-surface-3 border-y border-surface-3">
            {shownSaved.map((s) => {
              const v = loaded[s.id];
              return (
                <li key={s.id} className="flex items-center gap-3 py-2" data-testid="saved-row">
                  <div className="w-24 shrink-0">
                    {v ? (
                      <Thumbnail vignette={v} title={`${s.name} map`} />
                    ) : (
                      <ThumbnailPlaceholder title={`${s.name} map`} />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void openSaved(s.id)}
                    className={`min-w-0 flex-1 truncate text-left text-sm hover:text-accent ${focusRing}`}
                  >
                    {s.name}
                  </button>
                  <Tooltip content={absoluteTime(s.updated)}>
                    <span tabIndex={0} className={`font-mono text-xs text-muted ${focusRing}`}>
                      {relativeTime(s.updated)}
                    </span>
                  </Tooltip>
                  <Menu
                    align="end"
                    trigger={
                      <Button size="sm" aria-label={`Actions for ${s.name}`}>
                        ⋯
                      </Button>
                    }
                    items={[
                      { id: 'open', label: 'Open', onSelect: () => void openSaved(s.id) },
                      { id: 'dup', label: 'Duplicate', onSelect: () => void duplicate(s.id) },
                      { id: 'export', label: 'Export JSON', onSelect: () => void exportOne(s.id) },
                      { id: 'delete', label: 'Delete', onSelect: () => remove(s) },
                    ]}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
