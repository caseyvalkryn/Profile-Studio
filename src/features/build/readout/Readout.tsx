// The readout (legacy/js/51-panel-readout.js): one mono line per track with range, height, speed,
// closing speed, time to the asset, window, margin and the sensors that hold it. It follows the
// selection, then the hover, else it lists every track. Pin keeps a baseline; during a drag the
// pre-drag record is the baseline. Deltas show in colour: "Margin +0:12 (-0:04)".
import { archetypeById } from '../../../domain/catalog';
import type { Threat, Vignette } from '../../../domain/types';
import { useDocument } from '../../../state/document';
import { useUi, type Units } from '../../../state/ui';
import { focusRing } from '../../../ui/focus';
import { showToast } from '../../shell/toastStore';
import { pick } from '../inspector/resolve';
import { hText, spdText, tText, vText } from '../inspector/parse';
import { delta, mmss, signed, type Delta } from './format';
import { useBoard } from '../board/store';
import { readoutAtFor } from './source';
import { useReadout } from './store';
import type { ReadoutAt, ReadoutSource } from './types';

export type ReadoutProps = {
  /** 'panel' shows when `ui.panels.readout` is on; 'strip' when `ui.stripTab` is 'readout'. */
  variant?: 'panel' | 'strip';
  /** The source for one vignette. Default: `readoutAtFor` in ./source. */
  atFor?: (v: Vignette) => ReadoutAt;
};

/** The threats the readout follows: the selection, then the hover, else every threat. */
export function targetThreats(v: Vignette, selected: readonly string[], hover: string | null) {
  const of = (keys: readonly string[]): Threat[] => {
    const out: Threat[] = [];
    for (const k of keys) {
      const p = pick(v, k);
      if (!p) continue;
      if (p.kind === 'threat') out.push(p.value);
      else if (p.kind === 'waypoint') out.push(p.threat);
      else if (p.kind === 'group') out.push(...p.members);
      else if (p.kind === 'event') {
        const t = v.threats.find((x) => x.key === p.value.threatKey);
        if (t) out.push(t);
      }
    }
    return [...new Set(out)];
  };
  const sel = of(selected);
  if (sel.length) return { threats: sel, all: false };
  const hov = hover ? of([hover]) : [];
  if (hov.length) return { threats: hov, all: false };
  return { threats: v.threats, all: true };
}

const TONE = { good: 'text-state-covered', bad: 'text-state-warning', none: 'text-muted' };

function D({ d }: { d: Delta | null }) {
  return d ? <span className={TONE[d.tone]}> {d.text}</span> : null;
}

function Line({
  id,
  a,
  b,
  units,
}: {
  id: string;
  a: ReadoutSource | null;
  b: ReadoutSource | null;
  units: Units;
}) {
  if (!a)
    return (
      <li className="font-mono text-data">
        <span className="font-medium">{id}</span> <span className="text-muted">--</span>
      </li>
    );
  const f = (x: string) => <span className="whitespace-nowrap">{x}</span>;
  return (
    <li
      aria-label={`${id} readout`}
      className="flex flex-wrap gap-x-2 font-mono text-data whitespace-nowrap"
    >
      <span className="font-medium">{id}</span>
      {f(hText(a.r, units))}
      {f(vText(a.z, units))}
      {f(spdText(a.spd, units))}
      {f(`${a.vc >= 0 ? '+' : ''}${spdText(a.vc, units)}`)}
      <span>
        To asset {a.tta === null ? 'no entry' : a.tta === 0 ? 'inside' : mmss(a.tta)}
        <D d={b ? delta(a.tta, b.tta, true) : null} />
      </span>
      <span>
        Window {a.window === null ? '--' : mmss(a.window)}
        <D d={b ? delta(a.window, b.window, true) : null} />
      </span>
      <span className={a.margin !== null && a.margin < 0 ? 'text-state-warning' : ''}>
        Margin {a.margin === null ? '--' : signed(a.margin)}
        <D d={b ? delta(a.margin, b.margin, true) : null} />
      </span>
      <span className="text-state-covered">
        {a.covering.length ? a.covering.join(' ') : 'none'}
      </span>
    </li>
  );
}

export function Readout({ variant = 'panel', atFor = readoutAtFor }: ReadoutProps) {
  const doc = useDocument((s) => s.doc);
  const drag = useDocument((s) => s.drag);
  const visible = useUi((s) => (variant === 'strip' ? s.stripTab === 'readout' : s.panels.readout));
  const keys = useUi((s) => s.selectedKeys);
  const hover = useUi((s) => s.hoverKey);
  const tS = useUi((s) => s.tS);
  const units = useUi((s) => s.units);
  // the board's range reference (the Ref select): 'asset' or a system id
  const ref = useBoard((s) => s.ref);
  const pinned = useReadout((s) => s.pinned);
  const dragBase = useReadout((s) => s.dragBase);
  if (!visible) return null;

  const dragging = dragBase ?? drag?.base ?? null;
  const baseRec = dragging ?? pinned?.record ?? null;
  const base = baseRec && doc && baseRec !== doc ? atFor(baseRec) : null;

  let body;
  let line: { text: string; warn: boolean } | null = null;
  if (!doc) {
    body = <p className="font-mono text-body">No profile</p>;
  } else {
    const at = atFor(doc);
    const { threats, all } = targetThreats(doc, keys, hover);
    const one = !all && threats.length === 1 ? threats[0]! : null;
    const arch = one ? archetypeById(one.type) : null;
    body = (
      <>
        {dragging && drag ? (
          <div className="font-mono text-body text-accent">{drag.label}</div>
        ) : one ? (
          <div className="truncate">
            <span className="font-mono">{one.id}</span>
            {one.group ? <span className="font-mono text-muted">{`  ${one.group}`}</span> : null}
            {arch ? <span className="font-medium">{`  ${arch.name}`}</span> : null}
          </div>
        ) : (
          <>
            <div className="truncate font-mono text-body">{doc.id}</div>
            <div className="text-micro text-muted">{doc.name}</div>
          </>
        )}
        <div className="mt-1.5 mb-0.5 text-micro font-medium text-muted">
          <span className="tracking-caps">at</span> <span>{tText(tS)}</span>
        </div>
        <ul className="flex flex-col gap-1">
          {threats.map((t) => {
            const a = at(t.id, tS, ref);
            const bt = base && baseRec?.threats.some((x) => x.id === t.id) ? base : null;
            return (
              <Line key={t.key} id={t.id} a={a} b={bt ? bt(t.id, tS, ref) : null} units={units} />
            );
          })}
        </ul>
      </>
    );
    const empty = !doc.threats.length && !doc.sensors.length && !doc.effectors.length;
    if (empty) line = { text: 'Press A to add. Drag anything to move it.', warn: false };
    else {
      const short = threats.find((t) => t.path.length < 2);
      if (short) line = { text: `${short.id} needs two waypoints.`, warn: true };
    }
  }

  const toggle = () => {
    const s = useReadout.getState();
    if (s.pinned) s.clear();
    else {
      s.pin();
      showToast('Baseline pinned.');
    }
  };

  const strip = variant === 'strip';
  return (
    <section
      aria-label="Readout"
      className={
        strip
          ? 'overflow-x-auto bg-surface-1 px-4 py-1 text-text'
          : 'max-h-80 min-h-[120px] overflow-y-auto border-b border-surface-3 bg-surface-1 px-2.5 pt-1.5 pb-2 text-text'
      }
    >
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-micro font-medium tracking-caps uppercase">Readout</h2>
        {pinned ? (
          <span className="ml-auto text-micro text-muted">vs pinned {pinned.label}</span>
        ) : null}
        <button
          type="button"
          aria-pressed={!!pinned}
          title={pinned ? 'Clear the baseline' : 'Pin the baseline'}
          onClick={toggle}
          className={`${pinned ? '' : 'ml-auto'} h-ctl-mini rounded-[3px] border border-surface-3 bg-surface-1 px-1.5 text-micro hover:bg-surface-2 ${focusRing}`}
        >
          {pinned ? 'Clear' : 'Pin'}
        </button>
      </div>
      {body}
      <div
        className={`mt-1.5 min-h-[18px] border-t border-surface-3 pt-1 text-micro ${
          line?.warn ? 'text-state-warning' : 'text-muted'
        }`}
      >
        {line?.text ?? ''}
      </div>
    </section>
  );
}

export default Readout;
