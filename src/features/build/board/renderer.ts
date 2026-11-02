// The per-layer DOM writer. One `<g data-layer>` per registry layer; each render calls
// render.scene and writes innerHTML only on the groups whose fragment changed. A fragment changes
// when any ctx field in its `inputs` changed; a time tick (t or hoverT only) renders only the
// layers that read time (`opts.only`). The hit list is kept from the last full render.
import { VIEW_TO_CAM, render, type Hit, type Scene, type Sel, type Size } from '../../../board';
import type { Cam } from '../../../board/cameras';
import { bounds as geoBounds, type Bounds } from '../../../board/geo';
import { list, type CtxField, type Ghost } from '../../../board/layers';
import type { BoardView, Fragment } from '../../../board/render';
import type { Derived } from '../../../engine/derived';
import { useDocument } from '../../../state/document';
import { useUi } from '../../../state/ui';
import { boardDerived, boardScene } from './derived';
import { useBoard } from './store';
import { selFromKey } from './tools';

export type Last = {
  cam: Cam;
  hits: Hit[];
  W: number;
  H: number;
  rec: Scene;
  d: Derived;
  sel: Sel;
};

type Sig = Record<CtxField, unknown>;

const TICK_FIELDS = new Set<CtxField>(['t', 'hoverT']);

const ARIA: Record<string, string> = {
  plan: 'Board in plan',
  elev: 'Board in elevation',
  axon: 'Board in axonometric',
};

/** Writes the board SVG from the stores. `size()` gives the stage size in board pixels. */
export class BoardRenderer {
  readonly svg: SVGSVGElement;
  readonly groups = new Map<string, SVGGElement>();
  private frag = new Map<string, string>();
  private sig: Sig | null = null;
  private raf = 0;
  /** The record id the sticky camera bounds belong to; a new id drops them. */
  private lastRecId: string | null = null;
  private unsub: (() => void)[] = [];
  last: Last | null = null;
  /** Count of DOM writes per layer, for tests. */
  writes: Record<string, number> = {};
  /** Count of render.scene calls, full and partial, for tests. */
  renders = { full: 0, partial: 0 };

  constructor(
    svg: SVGSVGElement,
    private readonly size: () => Size,
  ) {
    this.svg = svg;
    svg.innerHTML = '';
    for (const L of list()) {
      const g = svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('data-layer', L.id);
      svg.appendChild(g);
      this.groups.set(L.id, g);
    }
  }

  /** Subscribe to the stores; every change batches into one requestAnimationFrame. */
  attach(): void {
    const s = () => this.schedule();
    this.unsub.push(useDocument.subscribe(s), useUi.subscribe(s), useBoard.subscribe(s));
    this.render();
  }

  detach(): void {
    for (const u of this.unsub) u();
    this.unsub = [];
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    pending.delete(this);
  }

  schedule(): void {
    if (this.raf) return;
    pending.add(this);
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      pending.delete(this);
      this.render();
    });
  }

  /** The view the render reads, from ui and the board store. */
  view(rec: Scene, size: Size): { view: BoardView; sig: Sig; ghost: Ghost | null } {
    const ui = useUi.getState();
    const b = useBoard.getState();
    const bounds = this.stickyBounds(rec);
    const d = boardDerived(useDocument.getState().doc!);
    const proj = VIEW_TO_CAM[ui.view];
    const sel = selFromKey(rec, ui.selectedKeys[0], b.selIndex);
    const hover = selFromKey(rec, ui.hoverKey);
    const path = sel.kind === 'path' ? sel.id : null;
    const view: BoardView = {
      proj,
      yaw: b.yaw,
      pitch: b.pitch,
      ref: b.ref,
      bounds,
      zoom: b.zoom,
      px: b.px,
      py: b.py,
      units: ui.units,
      layers: b.layers,
      t: ui.timeOn ? ui.tS : null,
      sel,
      hover,
      focus: [],
      placing: b.placing,
      ruler: b.ruler,
      snap: b.snap,
      hoverT: b.hoverT,
      elevationMode: ui.elevationMode,
      path,
    };
    const camSig = [
      proj,
      size.W,
      size.H,
      b.zoom,
      b.px,
      b.py,
      b.yaw,
      b.pitch,
      b.ref,
      ui.elevationMode,
      path,
      bounds.cx + ',' + bounds.cy + ',' + bounds.ext,
      rec.id,
    ].join('|');
    const origin = d.origin;
    const sig: Sig = {
      profile: rec,
      scene: rec.scene,
      derived: d,
      cam: camSig,
      t: ui.timeOn ? ui.tS : null,
      sel: sel.kind + '|' + sel.id + '|' + sel.i,
      hover: hover.kind + '|' + hover.id + '|' + hover.i,
      focus: '',
      layers: JSON.stringify(b.layers),
      units: ui.units,
      thumb: false,
      edit: true,
      placing: b.placing,
      ruler: b.ruler,
      ghost: b.ghost,
      hoverT: b.hoverT,
      ref: b.ref,
      origin: origin.x + ',' + origin.y + ',' + origin.z,
    };
    return { view, sig, ghost: b.ghost };
  }

  /**
   * The camera bounds (useBoard.bounds). They stick across edits so an add or a drag does not
   * refit the camera; Fit (null) or another record id recomputes them from the scene. Deviation:
   * legacy 44-render.js recomputes PS.geo.bounds on every render.
   */
  private stickyBounds(rec: Scene): Bounds {
    let b = useBoard.getState().bounds;
    if (rec.id !== this.lastRecId) {
      this.lastRecId = rec.id;
      b = null;
    }
    if (!b) {
      b = geoBounds(rec.scene);
      useBoard.getState().set({ bounds: b });
    }
    return b;
  }

  render(): void {
    const doc = useDocument.getState().doc;
    if (!doc) {
      for (const g of this.groups.values()) if (g.innerHTML) g.innerHTML = '';
      this.frag.clear();
      this.sig = null;
      this.last = null;
      return;
    }
    const rec = boardScene(doc);
    const d = boardDerived(doc);
    const size = this.size();
    const { view, sig, ghost } = this.view(rec, size);
    const changed = new Set<CtxField>();
    if (this.sig) {
      for (const k of Object.keys(sig) as CtxField[]) if (sig[k] !== this.sig[k]) changed.add(k);
    }
    // lane 13.3: the cursor time as `--t` on the root for the key point marks' CSS state
    // (board.css .kp); set before the early returns so a tick never skips it
    if (!this.sig || changed.has('t')) {
      if (sig.t == null) this.svg.style.removeProperty('--t');
      else this.svg.style.setProperty('--t', String(sig.t));
    }
    const tick =
      !!this.sig && this.last && changed.size > 0 && [...changed].every((k) => TICK_FIELDS.has(k));
    if (this.sig && this.last && changed.size === 0) return;
    let only: string[] | undefined;
    if (tick) {
      only = list()
        .filter((L) => L.inputs.some((f) => changed.has(f)))
        .map((L) => L.id);
      if (!only.length) {
        this.sig = sig;
        return;
      }
    }
    const out = render.scene(rec, view, size, { derived: d, edit: true, ghost, only });
    if (only) this.renders.partial++;
    else this.renders.full++;
    const seen = new Set<string>();
    for (const f of out.fragments) this.write(f, seen);
    if (!only) {
      for (const [id, g] of this.groups) {
        if (!seen.has(id) && this.frag.get(id)) {
          g.innerHTML = '';
          this.frag.set(id, '');
        }
      }
      this.svg.setAttribute('viewBox', '0 0 ' + size.W + ' ' + size.H);
      this.svg.setAttribute('preserveAspectRatio', out.cam.preserveAspectRatio);
      this.svg.setAttribute('class', 'board edit');
      this.svg.setAttribute('data-proj', out.cam.kind);
      this.svg.setAttribute('role', 'img');
      this.svg.setAttribute('aria-label', ARIA[out.cam.kind] || ARIA.plan!);
      this.last = {
        cam: out.cam,
        hits: out.hits,
        W: size.W,
        H: size.H,
        rec,
        d,
        sel: view.sel as Sel,
      };
    } else if (this.last) {
      this.last = { ...this.last, cam: out.cam, rec, d };
    }
    this.sig = sig;
  }

  private write(f: Fragment, seen: Set<string>): void {
    seen.add(f.layerId);
    if (this.frag.get(f.layerId) === f.svg) return;
    const g = this.groups.get(f.layerId);
    if (!g) return;
    g.innerHTML = f.svg;
    this.frag.set(f.layerId, f.svg);
    this.writes[f.layerId] = (this.writes[f.layerId] || 0) + 1;
    g.setAttribute('data-rev', String(this.writes[f.layerId]));
  }
}

const pending = new Set<BoardRenderer>();

/** Run every pending batched render now (tests and the perf check). */
export function boardFlush(): void {
  for (const r of [...pending]) {
    if (r['raf']) {
      cancelAnimationFrame(r['raf']);
      r['raf'] = 0;
    }
    pending.delete(r);
    r.render();
  }
}
