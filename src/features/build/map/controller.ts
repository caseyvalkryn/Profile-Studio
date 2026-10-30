// The imperative side of the map. MapLibre lives here, outside React: the map and its sources
// are created once and every store change becomes a setData on the sources that changed.
import { Map as MlMap, type GeoJSONSource } from 'maplibre-gl';
import { forTarget } from '../../../commands/registry';
import type { AssetKind } from '../../../commands/types';
import { bearingTo, centroid } from '../../../engine/geo';
import type { Vignette } from '../../../domain/types';
import { previewOf, useDocument } from '../../../state/document';
import { useUi, type ArmedItem, type UiState } from '../../../state/ui';
import { ASSET_MIME, parseAssetPayload } from './dnd';
import { boundsToLngLat, makeFrame, type BoundsM, type Frame, type XY } from './frame';
import {
  FeatureCache,
  assetBounds,
  coveringAt,
  fc,
  gridFeatures,
  handleFeatures,
  highlightFeature,
  threatPositions,
  threatsFeature,
  type FC,
  type Feature,
  type GridLabel,
  layerUpdates,
} from './geojson';
import { DRAG_LABELS, dragStep, startDrag, type DragStart } from './handles';
import { hitTest, type Hit } from './hit';
import { PROMOTE_KEY, SOURCES, blankStyle, layers, readColors, type SourceName } from './layers';
import { drawStep, type DrawEvent, type PathDraft } from './pathDraw';
import { commitPath, placeItem } from './place';
import { formatBearing, formatRange } from './units';

/** Pointer tolerance for hits, screen pixels. */
export const TOL_PX = 8;
/** Movement under this many pixels is a click, not a drag or a pan. */
const CLICK_PX = 4;
/** During a drag, preview-dependent layers update at most this often (spec: 100 ms). */
const DRAG_PREVIEW_MS = 100;
const FIT_PADDING_PX = 48;
const EMPTY_BOUNDS: BoundsM = [-2000, -2000, 2000, 2000];

type Press = { px: XY; p: XY; hit: Hit | null; shift: boolean };

export type MenuTarget = { kind: AssetKind; pointer: XY };

export class MapController {
  readonly map: MlMap;
  private frame: Frame | null = null;
  private cache: FeatureCache | null = null;
  private doc: Vignette | null = null;
  private ready = false;
  private unsubs: (() => void)[] = [];
  private raf = 0;
  private rafHover = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastDynamicAt = 0;
  private threatPos = new Map<string, XY>();
  private covering = new Set<string>();
  private press: Press | null = null;
  private drag: DragStart | null = null;
  private draft: PathDraft | null = null;
  private cursorPx: XY | null = null;
  private cursorM: XY | null = null;
  private labels = new Map<string, HTMLDivElement>();
  private grid: GridLabel[] = [];

  constructor(
    private el: HTMLElement,
    private overlay: HTMLElement,
    private tip: HTMLElement,
  ) {
    const doc = useDocument.getState().doc;
    this.doc = doc;
    this.map = new MlMap({
      container: el,
      style: blankStyle(readColors()),
      center: doc ? [doc.site.lon, doc.site.lat] : [0, 0],
      zoom: 12,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      keyboard: false,
      boxZoom: false,
      renderWorldCopies: false,
    });
    this.map.touchZoomRotate?.disableRotation?.();
    this.map.on('load', () => this.onLoad());
    this.map.on('move', () => this.schedule());
    this.map.on('moveend', () => this.renderGrid());

    el.addEventListener('mousedown', this.onDown, true);
    el.addEventListener('mousemove', this.onHoverMove);
    el.addEventListener('mouseleave', this.onLeave);
    el.addEventListener('dblclick', this.onDblClick, true);
    el.addEventListener('dragover', this.onDragOver);
    el.addEventListener('drop', this.onDrop);
    window.addEventListener('keydown', this.onKey, true);

    this.unsubs.push(
      useDocument.subscribe((s, prev) => {
        if (s.doc !== prev.doc) this.onDoc(s.doc, prev.doc);
      }),
      useUi.subscribe((s, prev) => this.onUi(s, prev)),
    );
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (mq?.addEventListener) {
      const f = () => this.applyColors();
      mq.addEventListener('change', f);
      this.unsubs.push(() => mq.removeEventListener('change', f));
    }
  }

  destroy() {
    for (const u of this.unsubs) u();
    this.unsubs = [];
    if (this.drag) useDocument.getState().cancelDrag();
    this.drag = null;
    this.endPress();
    cancelAnimationFrame(this.raf);
    cancelAnimationFrame(this.rafHover);
    if (this.timer) clearTimeout(this.timer);
    const el = this.el;
    el.removeEventListener('mousedown', this.onDown, true);
    el.removeEventListener('mousemove', this.onHoverMove);
    el.removeEventListener('mouseleave', this.onLeave);
    el.removeEventListener('dblclick', this.onDblClick, true);
    el.removeEventListener('dragover', this.onDragOver);
    el.removeEventListener('drop', this.onDrop);
    window.removeEventListener('keydown', this.onKey, true);
    this.map.remove();
  }

  /** The current path draft, for tests and the cursor. */
  get drawing(): PathDraft | null {
    return this.draft;
  }

  // ---- sources ----

  private onLoad() {
    for (const name of SOURCES)
      this.map.addSource(name, {
        type: 'geojson',
        data: fc([]) as never,
        ...(PROMOTE_KEY.includes(name) ? { promoteId: 'key' } : {}),
      });
    for (const l of layers(readColors()).slice(1)) this.map.addLayer(l);
    this.ready = true;
    this.onDoc(this.doc, null);
    this.fit(false);
  }

  private setData(name: SourceName, data: FC) {
    const src = this.map.getSource(name) as GeoJSONSource | undefined;
    src?.setData(data as unknown as Parameters<GeoJSONSource['setData']>[0]);
  }

  private onDoc(next: Vignette | null, prev: Vignette | null) {
    this.doc = next;
    if (!this.ready) return;
    if (!next) {
      for (const n of SOURCES) this.setData(n, fc([]));
      this.cache = null;
      this.renderLabels();
      return;
    }
    const f = this.frame;
    if (!f || f.lat0 !== next.site.lat || f.lon0 !== next.site.lon) {
      this.frame = makeFrame(next.site);
      this.cache = new FeatureCache(this.frame);
      prev = null;
      this.renderGrid();
    }
    for (const [n, data] of layerUpdates(prev, next, this.cache!)) this.setData(n, data);
    this.renderHighlight();
    this.schedule();
    if (prev && prev.id !== next.id) this.fit(false);
  }

  private onUi(s: UiState, prev: UiState) {
    if (s.selectedKeys !== prev.selectedKeys || s.hoverKey !== prev.hoverKey)
      this.renderHighlight();
    if (s.tS !== prev.tS) this.schedule();
    if (s.fitSeq !== prev.fitSeq) this.fit(true);
    if (s.theme !== prev.theme) requestAnimationFrame(() => this.applyColors());
    if (s.tool !== prev.tool) this.onTool(s);
    if (s.tool !== prev.tool || s.measureFrom !== prev.measureFrom || s.armed !== prev.armed) {
      this.renderDraft();
      this.setCursor(null);
    }
  }

  private onTool(s: UiState) {
    if (s.tool !== 'path' && this.draft) this.drawEvent({ t: 'cancel' });
    // "Add threat here" sets the path tool with the new threat selected: extend that threat.
    if (s.tool === 'path' && !this.draft && this.doc && s.selectedKeys.length === 1) {
      const t = this.doc.threats.find((x) => x.key === s.selectedKeys[0]);
      if (t && t.path[0])
        this.drawEvent({
          t: 'start',
          type: t.type,
          p: t.path[0],
          extend: t.key,
          points: t.path.map((w) => ({ x: w.x, y: w.y })),
        });
    }
  }

  private applyColors() {
    if (!this.ready) return;
    for (const l of layers(readColors())) {
      const paint = (l as { paint?: Record<string, unknown> }).paint ?? {};
      for (const [k, v] of Object.entries(paint)) {
        try {
          this.map.setPaintProperty(l.id, k as never, v as never);
        } catch {
          // a layer missing during teardown
        }
      }
    }
  }

  private renderHighlight() {
    const d = this.doc;
    if (!this.ready || !d || !this.cache || !this.frame) return;
    const ui = useUi.getState();
    this.setData('highlight', highlightFeature(d, this.cache, ui.selectedKeys, ui.hoverKey));
    this.setData('handles', handleFeatures(this.frame, d, ui.selectedKeys));
  }

  /** One update per animation frame for time, preview and labels. Slower during a drag. */
  private schedule() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.renderDynamic();
    });
  }

  private renderDynamic() {
    const d = this.doc;
    if (!this.ready) return;
    if (d && this.frame) {
      const dragging = useDocument.getState().drag !== null;
      const now = performance.now();
      const wait = this.lastDynamicAt + DRAG_PREVIEW_MS - now;
      if (dragging && wait > 0) {
        if (!this.timer)
          this.timer = setTimeout(() => {
            this.timer = null;
            this.schedule();
          }, wait);
      } else {
        this.lastDynamicAt = now;
        const pv = previewOf(d);
        const tS = useUi.getState().tS;
        this.threatPos = threatPositions(d, pv, tS);
        this.setData('threats', threatsFeature(this.frame, this.threatPos));
        this.renderCoverage(d, coveringAt(pv, tS));
      }
    }
    this.renderLabels();
  }

  private renderCoverage(d: Vignette, next: Set<string>) {
    const setState = this.map.setFeatureState?.bind(this.map);
    if (!setState) return;
    const sourceOf = (key: string) =>
      d.sensors.some((s) => s.key === key)
        ? 'sensors'
        : d.effectors.some((e) => e.key === key)
          ? 'effectors'
          : null;
    for (const key of new Set([...this.covering, ...next])) {
      const on = next.has(key);
      if (on === this.covering.has(key)) continue;
      const source = sourceOf(key);
      if (source) setState({ source, id: key }, { covering: on });
    }
    this.covering = next;
  }

  private renderGrid() {
    if (!this.ready || !this.frame) return;
    const c = this.map.getCanvas();
    const w = c.clientWidth || c.width || 800;
    const h = c.clientHeight || c.height || 600;
    const a = this.toM({ x: 0, y: 0 });
    const b = this.toM({ x: w, y: h });
    const sx = Math.abs(b.x - a.x);
    const sy = Math.abs(b.y - a.y);
    const bounds: BoundsM = [
      Math.min(a.x, b.x) - sx,
      Math.min(a.y, b.y) - sy,
      Math.max(a.x, b.x) + sx,
      Math.max(a.y, b.y) + sy,
    ];
    const g = gridFeatures(this.frame, bounds, this.mPerPx());
    this.setData('grid', g.lines);
    this.grid = g.labels;
    this.schedule();
  }

  private renderLabels() {
    const f = this.frame;
    const d = this.doc;
    const want = new Map<string, { text: string; px: XY; cls: string }>();
    if (f && d) {
      const at = (x: number, y: number) => {
        const q = this.map.project(f.toLngLat(x, y));
        return { x: q.x, y: q.y };
      };
      for (const s of [...d.sensors, ...d.effectors, ...d.nodes])
        want.set(s.key, { text: s.id, px: at(s.x, s.y), cls: 'asset' });
      for (const a of d.areas)
        if (a.pts.length) {
          const c = centroid(a.pts);
          want.set(a.key, { text: a.id, px: at(c.x, c.y), cls: 'area' });
        }
      for (const t of d.threats) {
        const q = this.threatPos.get(t.key);
        if (q) want.set(t.key, { text: t.id, px: at(q.x, q.y), cls: 'threat' });
      }
      const c = this.map.getCanvas();
      const h = c.clientHeight || c.height || 600;
      for (const g of this.grid) {
        const q = g.axis === 'x' ? at(g.value, 0) : at(0, g.value);
        const px = g.axis === 'x' ? { x: q.x + 3, y: h - 16 } : { x: 4, y: q.y - 14 };
        want.set(`grid:${g.axis}:${g.value}`, { text: g.text, px, cls: 'grid' });
      }
    }
    for (const [key, el] of this.labels)
      if (!want.has(key)) {
        el.remove();
        this.labels.delete(key);
      }
    for (const [key, w] of want) {
      let el = this.labels.get(key);
      if (!el) {
        el = document.createElement('div');
        el.dataset.label = w.cls;
        el.className =
          w.cls === 'grid'
            ? 'absolute left-0 top-0 font-mono text-[10px] text-muted whitespace-nowrap'
            : 'absolute left-0 top-0 font-mono text-[11px] text-text whitespace-nowrap';
        this.overlay.appendChild(el);
        this.labels.set(key, el);
      }
      if (el.textContent !== w.text) el.textContent = w.text;
      const dx = w.cls === 'grid' ? 0 : 8;
      el.style.transform = `translate(${Math.round(w.px.x + dx)}px, ${Math.round(w.px.y + (w.cls === 'grid' ? 0 : 4))}px)`;
    }
  }

  private fit(animate: boolean) {
    if (!this.ready || !this.frame) return;
    const b = (this.doc && assetBounds(this.doc)) || EMPTY_BOUNDS;
    const pad = 1;
    const box: BoundsM = [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad];
    this.map.fitBounds(boundsToLngLat(this.frame, box), {
      padding: FIT_PADDING_PX,
      duration: animate ? 200 : 0,
      maxZoom: 17,
    });
  }

  // ---- pointer ----

  private px(e: { clientX: number; clientY: number }): XY {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private toM(px: XY): XY {
    const ll = this.map.unproject([px.x, px.y]);
    return this.frame ? this.frame.fromLngLat(ll.lng, ll.lat) : { x: 0, y: 0 };
  }

  /** Metres per screen pixel at the view centre. */
  mPerPx(): number {
    const c = this.map.getCanvas();
    const x = (c.clientWidth || c.width || 800) / 2;
    const y = (c.clientHeight || c.height || 600) / 2;
    const a = this.toM({ x, y });
    const b = this.toM({ x: x + 100, y });
    return Math.hypot(b.x - a.x, b.y - a.y) / 100 || 1;
  }

  private hitAt(p: XY): Hit | null {
    if (!this.doc) return null;
    const ui = useUi.getState();
    return hitTest(this.doc, p, TOL_PX * this.mPerPx(), ui.selectedKeys, this.threatPos);
  }

  private onDown = (e: MouseEvent) => {
    if (e.button !== 0 || !this.doc || !this.frame) return;
    const px = this.px(e);
    const p = this.toM(px);
    const ui = useUi.getState();
    const placing = this.draft || ui.armed || ui.tool === 'measure';
    const hit = placing ? null : this.hitAt(p);
    if (hit) {
      // A press on something is ours: keep it from panning the map.
      e.stopPropagation();
      e.preventDefault();
      if (!e.shiftKey && !ui.selectedKeys.includes(hit.key)) ui.setSelection([hit.key]);
    }
    this.press = { px, p, hit, shift: e.shiftKey };
    window.addEventListener('mousemove', this.onWinMove);
    window.addEventListener('mouseup', this.onWinUp);
  };

  private onWinMove = (e: MouseEvent) => {
    const pr = this.press;
    if (!pr || !this.doc) return;
    const px = this.px(e);
    if (!this.drag) {
      if (!pr.hit || Math.hypot(px.x - pr.px.x, px.y - pr.px.y) < CLICK_PX) return;
      const d = startDrag(this.doc, pr.hit, pr.p, pr.px, pr.shift);
      if (!d) return;
      this.drag = d;
      const ui = useUi.getState();
      if (!ui.selectedKeys.includes(d.key)) ui.setSelection([d.key]);
      useDocument.getState().beginDrag(DRAG_LABELS[d.handle]);
    }
    const step = dragStep(this.drag, this.toM(px), px, e.altKey, useUi.getState().units);
    useDocument.getState().updateDrag(step.recipe);
    this.showTip(px, step.label);
  };

  private onWinUp = (e: MouseEvent) => {
    const pr = this.press;
    this.endPress();
    if (this.drag) {
      this.drag = null;
      useDocument.getState().endDrag();
      this.hideTip();
      return;
    }
    if (!pr) return;
    const px = this.px(e);
    if (Math.hypot(px.x - pr.px.x, px.y - pr.px.y) >= CLICK_PX) return; // a pan
    this.click(pr.p, pr.hit, pr.shift);
  };

  private endPress() {
    this.press = null;
    window.removeEventListener('mousemove', this.onWinMove);
    window.removeEventListener('mouseup', this.onWinUp);
  }

  /** A click at `p` (map metres). Public for tests. */
  click(p: XY, hit: Hit | null, shift: boolean) {
    const ui = useUi.getState();
    if (this.draft) {
      this.drawEvent({ t: 'click', p, tolM: TOL_PX * this.mPerPx() });
      return;
    }
    if (ui.armed) {
      const item = ui.armed;
      ui.setArmed(null);
      this.place(item, p);
      return;
    }
    if (ui.tool === 'measure') {
      ui.setMeasureFrom(p);
      return;
    }
    if (hit) {
      if (shift) {
        const keys = ui.selectedKeys;
        ui.setSelection(
          keys.includes(hit.key) ? keys.filter((k) => k !== hit.key) : [...keys, hit.key],
        );
      }
      return;
    }
    if (ui.selectedKeys.length) ui.setSelection([]);
  }

  /** Place a library item at `p`. A threat starts path drawing. Public for tests. */
  place(item: ArmedItem, p: XY) {
    const r = placeItem(item, p);
    if ('draw' in r) this.drawEvent({ t: 'start', type: r.draw, p });
    else useUi.getState().setTool('select');
  }

  /** Feed the path drawing state machine. Public for tests. */
  drawEvent(e: DrawEvent) {
    const r = drawStep(this.draft, e);
    this.draft = r.draft;
    const ui = useUi.getState();
    if (r.commit) commitPath(r.commit);
    else if (e.t === 'cancel' && ui.tool === 'path') ui.setTool('select');
    if (e.t === 'start' && ui.tool !== 'path') ui.setTool('path');
    if (this.draft) this.map.doubleClickZoom?.disable();
    else this.map.doubleClickZoom?.enable();
    this.renderDraft();
  }

  private onDblClick = (e: MouseEvent) => {
    if (!this.draft) return;
    e.stopPropagation();
    e.preventDefault();
    this.drawEvent({ t: 'finish' });
  };

  private onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (this.drag && e.key === 'Escape') {
      this.drag = null;
      this.endPress();
      useDocument.getState().cancelDrag();
      this.hideTip();
    } else if (this.draft && (e.key === 'Escape' || e.key === 'Enter')) {
      this.drawEvent({ t: e.key === 'Enter' ? 'finish' : 'cancel' });
    } else return;
    e.stopPropagation();
    e.preventDefault();
  };

  private onLeave = () => {
    this.cursorPx = null;
    this.cursorM = null;
    if (useUi.getState().hoverKey) useUi.getState().setHover(null);
    this.renderDraft();
    if (!this.drag) this.hideTip();
  };

  private onHoverMove = (e: MouseEvent) => {
    this.cursorPx = this.px(e);
    if (this.rafHover) return;
    this.rafHover = requestAnimationFrame(() => {
      this.rafHover = 0;
      if (!this.cursorPx || !this.frame) return;
      this.cursorM = this.toM(this.cursorPx);
      const ui = useUi.getState();
      if (!this.drag && !this.press) {
        const placing = this.draft || ui.armed || ui.tool === 'measure';
        const hit = placing ? null : this.hitAt(this.cursorM);
        const key = hit?.key ?? null;
        if (ui.hoverKey !== key) ui.setHover(key);
        this.setCursor(hit);
      }
      this.renderDraft();
    });
  };

  private setCursor(hit: Hit | null) {
    const ui = useUi.getState();
    const canvas = this.map.getCanvas();
    const placing = this.draft || ui.armed || ui.tool === 'measure';
    canvas.style.cursor = placing
      ? 'crosshair'
      : hit
        ? hit.handle === 'move'
          ? 'move'
          : 'grab'
        : '';
  }

  /** The draft source: the path being drawn with its rubber band, and the measure line. */
  private renderDraft() {
    const f = this.frame;
    if (!this.ready || !f) return;
    const out: Feature[] = [];
    const cur = this.cursorM;
    if (this.draft) {
      const pts = cur ? [...this.draft.points, cur] : this.draft.points;
      out.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: pts.map((p) => f.toLngLat(p.x, p.y)) },
        properties: {},
      });
      for (const p of this.draft.points)
        out.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: f.toLngLat(p.x, p.y) },
          properties: {},
        });
    }
    const ui = useUi.getState();
    if ((ui.tool === 'measure' || ui.measureFrom) && cur && this.cursorPx) {
      const o = ui.measureFrom ?? { x: 0, y: 0 };
      out.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [f.toLngLat(o.x, o.y), f.toLngLat(cur.x, cur.y)],
        },
        properties: {},
      });
      const r = Math.hypot(cur.x - o.x, cur.y - o.y);
      this.showTip(
        this.cursorPx,
        `${formatRange(r, ui.units)} ${formatBearing(bearingTo(o, cur))}`,
      );
    } else if (!this.drag) this.hideTip();
    this.setData('draft', fc(out));
  }

  private showTip(px: XY, text: string) {
    const t = this.tip;
    if (t.textContent !== text) t.textContent = text;
    t.style.transform = `translate(${Math.round(px.x + 14)}px, ${Math.round(px.y + 14)}px)`;
    t.hidden = false;
  }

  private hideTip() {
    this.tip.hidden = true;
  }

  // ---- drop and menus ----

  private onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer?.types.includes(ASSET_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  private onDrop = (e: DragEvent) => {
    const item = parseAssetPayload(e.dataTransfer?.getData(ASSET_MIME));
    if (!item || !this.frame) return;
    e.preventDefault();
    this.place(item, this.toM(this.px(e)));
  };

  /**
   * The right-click target at a client point. Selects what is under the pointer first, because
   * the registry's commands act on the selection. Null while drawing a path.
   */
  menuAt(clientX: number, clientY: number): MenuTarget | null {
    if (!this.frame || this.draft || this.drag) return null;
    const pointer = this.toM(this.px({ clientX, clientY }));
    const hit = this.hitAt(pointer);
    if (!hit) return { kind: 'map', pointer };
    const ui = useUi.getState();
    if (!ui.selectedKeys.includes(hit.key)) ui.setSelection([hit.key]);
    const kind: AssetKind = forTarget(hit.target).length ? hit.target : 'map';
    return { kind, pointer };
  }
}
