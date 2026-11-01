// Board gestures, legacy/js/51-panel-board.js one to one: click, repeat click (stack cycle),
// drag (one undo step), pan (middle button, Space, one-finger touch), pinch, wheel zoom at the
// cursor, axon orbit, double-click, right-click or 500 ms long press menu, ruler, rectangle
// area. The stage is the element around the SVG; the label, cursor and hint elements are the
// legacy #bd-label, #bd-cursor and #bd-msg.
import { EFFECTOR_KINDS, SENSOR_KINDS } from '../../../domain/catalog';
import { bearingTo } from '../../../engine/geo';
import { cameras, render, type Hit } from '../../../board';
import { makeUnits } from '../../../board/format';
import { clamp, esc } from '../../../board/svg';
import { execute } from '../../../commands/registry';
import type { Pointer } from '../../../commands/types';
import { useDocument } from '../../../state/document';
import { useUi } from '../../../state/ui';
import type { MenuKind } from '../menu/commands';
import type { MenuTarget } from '../menu/actions';
import { NUDGE_KEYS } from './commands';
import type { BoardRenderer } from './renderer';
import { isElev, legText, snap, type PlanPt, type World } from './snap';
import { useBoard, type BoardPlacing } from './store';
import {
  beginDrag,
  cancelPlacing,
  current,
  finishPlacing,
  keyOfHit,
  nudge,
  pan,
  placeAt,
  readout,
  ruler,
  zoom,
  type DragHandle,
} from './tools';

export type MenuRequest = {
  kind: MenuKind;
  target: MenuTarget;
  pointer: Pointer | null;
  /** Viewport pixels for the menu anchor. */
  clientX: number;
  clientY: number;
};

export type GestureElements = {
  stage: HTMLElement;
  label: HTMLElement;
  cursor: HTMLElement;
  msg: HTMLElement;
};

type Local = { sx: number; sy: number; lx: number; ly: number };
type Pend = {
  id: number;
  x0: number;
  y0: number;
  p0: Local;
  w0: World | null;
  moved: boolean;
  touch: boolean;
  type: string;
  hit?: Hit | null;
  rectOk?: boolean;
  yaw?: number;
  pitch?: number;
  view?: { zoom: number; px: number; py: number };
};

const LONG_PRESS_MS = 500;

function sameHit(a: Hit | null, b: Hit | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.kind === b.kind && a.id === b.id && a.i === b.i;
}

/** The menu kind for a hit (null = empty board). */
export function menuKindOf(
  hit: Hit | null,
  rec: { scene: { systems: { id: string; kind: string }[] } } | null,
): MenuKind {
  if (!hit) return 'map';
  if (hit.kind === 'path') return hit.i != null ? 'waypoint' : 'threat';
  if (hit.kind === 'system') {
    const s = rec && rec.scene.systems.find((x) => x.id === hit.id);
    const k = s ? s.kind : '';
    if ((SENSOR_KINDS as readonly string[]).includes(k)) return 'sensor';
    if ((EFFECTOR_KINDS as readonly string[]).includes(k)) return 'effector';
    return 'node';
  }
  if (hit.kind === 'volume') return hit.i != null ? 'vertex' : 'area';
  if (hit.kind === 'plane') return 'plane';
  if (hit.kind === 'event') return 'event';
  if (hit.kind === 'group') return 'group';
  return 'map';
}

export class BoardGestures {
  private pend: Pend | null = null;
  private drag: DragHandle | null = null;
  private pointers: Record<number, { x: number; y: number }> = {};
  private pinch: { d: number; mx: number; my: number } | null = null;
  private longTimer = 0;
  private moveQ: { ev: PointerEvent; p: Local } | null = null;
  private moveRaf = 0;
  private hoverHit: Hit | null = null;
  private tapHover = false;
  private spaceDown = false;
  private overStage = false;
  private off: (() => void)[] = [];

  constructor(
    private readonly el: GestureElements,
    private readonly renderer: BoardRenderer,
    private readonly onMenu: (req: MenuRequest) => void,
  ) {}

  attach(): void {
    const st = this.el.stage;
    const on = <K extends keyof HTMLElementEventMap>(
      t: HTMLElement | Window,
      k: K | string,
      fn: (e: never) => void,
      opts?: AddEventListenerOptions | boolean,
    ) => {
      t.addEventListener(k, fn as EventListener, opts);
      this.off.push(() => t.removeEventListener(k, fn as EventListener, opts));
    };
    on(st, 'pointerdown', (e: PointerEvent) => this.onDown(e));
    on(st, 'pointermove', (e: PointerEvent) => this.onMove(e));
    on(st, 'pointerup', (e: PointerEvent) => this.onUp(e));
    on(st, 'pointercancel', (e: PointerEvent) => this.onCancel(e));
    on(st, 'pointerleave', () => this.onLeave());
    on(st, 'dblclick', (e: MouseEvent) => this.onDbl(e));
    on(st, 'wheel', (e: WheelEvent) => this.onWheel(e), { passive: false });
    on(st, 'contextmenu', (e: MouseEvent) => this.onContext(e));
    on(st, 'keydown', (e: KeyboardEvent) => this.onKey(e));
    on(st, 'keyup', (e: KeyboardEvent) => this.onKey(e));
    // Space over the board is pan: seen in the capture phase so the play toggle does not run
    on(window, 'keydown', (e: KeyboardEvent) => this.onSpace(e), true);
    on(window, 'keyup', (e: KeyboardEvent) => this.onSpace(e), true);
    this.off.push(
      useBoard.subscribe((s, prev) => {
        if (s.placing !== prev.placing || s.ruler !== prev.ruler) this.syncClasses();
      }),
      // ui.setSelection ends the stack cycle when another key is selected
      useUi.subscribe((s, prev) => {
        if (s.view !== prev.view) this.syncClasses();
      }),
    );
    this.syncClasses();
  }

  detach(): void {
    for (const f of this.off) f();
    this.off = [];
    this.clearLong();
    if (this.moveRaf) cancelAnimationFrame(this.moveRaf);
    this.moveRaf = 0;
  }

  /** Escape: cancel the drag, then the placement, then the ruler. */
  cancel(): boolean {
    if (this.drag) {
      this.drag.cancel();
      this.drag = null;
      this.pend = null;
      this.hideLabel();
      return true;
    }
    if (useBoard.getState().placing) {
      cancelPlacing();
      this.hideLabel();
      return true;
    }
    if (useBoard.getState().ruler) {
      ruler.clear();
      return true;
    }
    return false;
  }

  get dragging(): boolean {
    return !!this.drag;
  }

  // ---------------------------------------------------------- pointer helpers
  private local(ev: { clientX: number; clientY: number }): Local {
    const r = this.el.stage.getBoundingClientRect();
    const last = this.renderer.last;
    const W = last ? last.W : r.width;
    const H = last ? last.H : r.height;
    return {
      sx: (ev.clientX - r.left) * (r.width ? W / r.width : 1),
      sy: (ev.clientY - r.top) * (r.height ? H / r.height : 1),
      lx: ev.clientX - r.left,
      ly: ev.clientY - r.top,
    };
  }
  private worldAt(p: Local): World | null {
    const cam = this.renderer.last && this.renderer.last.cam;
    if (!cam) return null;
    return cam.unproject(p.sx, p.sy);
  }
  private isTouch(ev: PointerEvent | MouseEvent): boolean {
    const t = (ev as PointerEvent).pointerType;
    return t === 'touch' || t === 'pen';
  }
  private hitAt(p: Local, ev: Event | null, touch: boolean): Hit | null {
    const tol = touch ? 14 : 7;
    const last = this.renderer.last;
    let h: Hit | null = last ? render.hitTest(last.hits, p.sx, p.sy, tol) : null;
    if (!h && ev && ev.target && (ev.target as Element).closest) {
      const n = (ev.target as Element).closest('[data-k]');
      if (n && this.el.stage.contains(n) && last) {
        const k = n.getAttribute('data-k');
        const id = n.getAttribute('data-id') || '';
        const i = n.getAttribute('data-i');
        const kind = k === 'wp' ? 'path' : k === 'vertex' ? 'volume' : k || '';
        h =
          last.hits.find(
            (x) => x.kind === kind && x.id === id && String(x.i == null ? '' : x.i) === (i || ''),
          ) || null;
      }
    }
    return h;
  }
  /** All objects under the pointer, one per key, in a stable order (the hit order moves the
   *  selected object, so the cycle sorts by key). */
  private stackAt(p: Local, touch: boolean): Hit[] {
    const last = this.renderer.last;
    if (!last) return [];
    const tol = touch ? 14 : 7;
    const out: Hit[] = [];
    const seen = new Set<string>();
    for (let k = last.hits.length - 1; k >= 0; k--) {
      const h = last.hits[k]!;
      if (h.handle && h.role !== 'centre') continue;
      if (!render.hitTest([h], p.sx, p.sy, tol)) continue;
      const id = h.kind + '|' + h.id + '|' + (h.i == null ? '' : h.i);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(h);
    }
    const key = (h: Hit) => h.kind + '|' + h.id + '|' + (h.i == null ? '' : h.i);
    out.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
    return out;
  }
  private mods(ev: { altKey: boolean; shiftKey: boolean }, p: Local) {
    return { alt: !!ev.altKey, shift: !!ev.shiftKey, sx: p.sx, sy: p.sy };
  }

  // sub: an optional second line in muted ink (the largest downstream change during a drag)
  private showLabel(text: string, p: Local, sub = ''): void {
    const labelEl = this.el.label;
    if (!text && !sub) {
      this.hideLabel();
      return;
    }
    labelEl.textContent = text || '';
    if (sub) {
      const sp = labelEl.ownerDocument.createElement('span');
      sp.className = 't-muted';
      sp.textContent = (text ? '\n' : '') + sub;
      labelEl.appendChild(sp);
    }
    labelEl.classList.remove('hidden');
    const wrap = this.el.stage;
    const mw = wrap.clientWidth || 600;
    const mh = wrap.clientHeight || 400;
    const x = Math.min(p.lx + 14, Math.max(0, mw - labelEl.offsetWidth - 4));
    const y = Math.min(p.ly + 14, Math.max(0, mh - labelEl.offsetHeight - 4));
    labelEl.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
    useBoard.getState().set({ dragLabel: { text, sub: sub || null } });
  }
  private hideLabel(): void {
    this.el.label.classList.add('hidden');
    this.el.label.textContent = '';
    if (useBoard.getState().dragLabel) useBoard.getState().set({ dragLabel: null });
  }

  // returns HTML: the values stay in the t-data box, two spaces apart; the reference words are ui (t-sub)
  cursorText(w: World | null): string {
    const cur = current();
    if (!w || !cur) return '';
    const U = makeUnits(useUi.getState().units);
    const b = useBoard.getState();
    const id = b.ref || 'asset';
    const name = id === 'asset' ? 'asset' : id === 'asset-edge' ? 'asset edge' : id;
    const from =
      id === 'asset' || id === 'asset-edge'
        ? '<span class="t-sub">from ' + esc(name) + '</span>'
        : '<span class="t-sub">from</span> <span class="t-mono-id t-sec">' + esc(name) + '</span>';
    if (isElev(w))
      return esc(U.h(Math.abs(w.r)) + '  ' + U.v(Math.max(0, w.z), 'AGL')) + '  ' + from;
    const sel = this.renderer.last ? this.renderer.last.sel : { kind: null, id: null };
    const o = cur.d.originAt(id, sel.kind === 'path' ? sel.id : null, useUi.getState().tS);
    const r = Math.hypot(w.x - o.x, w.y - o.y);
    const brg = bearingTo(o, w);
    return esc(U.h(r) + '  ' + U.brg(brg)) + '  ' + from;
  }

  private select(h: Hit | null): void {
    const ui = useUi.getState();
    const last = this.renderer.last;
    if (!h || !last) {
      useBoard.getState().set({ selIndex: null });
      if (ui.selectedKeys.length) ui.setSelection([]);
      if (ui.stack) ui.setStack(null);
      return;
    }
    const k = keyOfHit(last.rec, h);
    if (!k) return;
    useBoard.getState().set({ selIndex: k.i == null ? null : { key: k.key, i: k.i } });
    ui.setSelection([k.key]);
  }
  private hover(h: Hit | null): void {
    const ui = useUi.getState();
    const last = this.renderer.last;
    const k = h && last ? keyOfHit(last.rec, h) : null;
    const key = k ? k.key : null;
    if (ui.hoverKey !== key) ui.setHover(key);
  }
  private isWaypoint(h: Hit | null): boolean {
    return !!h && h.kind === 'path' && h.i != null && (h.role == null || h.role === 'centre');
  }
  private draggable(h: Hit | null): boolean {
    if (!h) return false;
    if (h.role === 'insert' || h.role === 'edge' || h.role === 'bead' || h.role === 'hold')
      return true;
    if (h.kind === 'system') return h.role != null;
    if (h.kind === 'event') return true;
    if (h.kind === 'path') return h.i != null;
    const last = this.renderer.last;
    const sel = last ? last.sel : { kind: null, id: null };
    if (h.kind === 'volume')
      return h.i != null || h.role === 'top' || (sel.kind === 'volume' && sel.id === h.id);
    if (h.kind === 'plane') return !!last && last.cam.kind === 'elev';
    return false;
  }
  private clearLong(): void {
    if (this.longTimer) {
      clearTimeout(this.longTimer);
      this.longTimer = 0;
    }
  }
  private openMenu(h: Hit | null, ev: { clientX: number; clientY: number }): void {
    const last = this.renderer.last;
    if (!last) return;
    const kind = menuKindOf(h, last.rec);
    let target: MenuTarget = {};
    if (h) {
      if (h.kind === 'group') target = { letter: h.id };
      else {
        const k = keyOfHit(last.rec, h);
        if (k) {
          target = { key: k.key };
          useBoard.getState().set({ selIndex: k.i == null ? null : { key: k.key, i: k.i } });
        }
      }
    }
    const w = this.worldAt(this.local(ev));
    const pointer: Pointer | null =
      w && !isElev(w) ? { x: w.x, y: w.y, tS: useUi.getState().tS } : null;
    this.onMenu({ kind, target, pointer, clientX: ev.clientX, clientY: ev.clientY });
  }

  // ---------------------------------------------------------- placement ghost
  private placingCursor(
    p: BoardPlacing,
    w: World | null,
    ev: { altKey: boolean; shiftKey: boolean },
  ) {
    if (p.kind === 'formation' || p.kind === 'event' || !w || isElev(w)) return null;
    const cur = current();
    const last = this.renderer.last;
    let pt: { x: number; y: number; label?: string | null } = w;
    let label: string | null = null;
    if (useBoard.getState().snap !== false && !ev.altKey && cur && last) {
      const pts = (p.pts || []) as PlanPt[];
      const from = pts.length ? pts[pts.length - 1]! : null;
      pt = snap(w, {
        scene: cur.rec.scene,
        cam: last.cam,
        modifiers: { alt: !!ev.altKey, shift: !!ev.shiftKey },
        from,
        units: useUi.getState().units,
      });
      label = pt.label || null;
    }
    const q = { x: Math.round(pt.x), y: Math.round(pt.y) };
    return { x: q.x, y: q.y, label, leg: legText(p, q, useUi.getState().units) };
  }

  private snapPlace(w: World | null, ev: { altKey: boolean; shiftKey: boolean }): PlanPt | null {
    const p = useBoard.getState().placing;
    const cur = current();
    const last = this.renderer.last;
    if (!w || isElev(w)) return null;
    if (
      !p ||
      useBoard.getState().snap === false ||
      ev.altKey ||
      p.kind === 'event' ||
      !cur ||
      !last
    )
      return w;
    const pts = (p.pts || []) as PlanPt[];
    const sp = snap(w, {
      scene: cur.rec.scene,
      cam: last.cam,
      modifiers: { alt: false, shift: !!ev.shiftKey },
      from: pts.length ? pts[pts.length - 1]! : null,
      units: useUi.getState().units,
    });
    return { x: sp.x, y: sp.y };
  }

  // ---------------------------------------------------------- pointer events
  private onDown(ev: PointerEvent): void {
    if (ev.button === 2) return;
    const touch = this.isTouch(ev);
    const p = this.local(ev);
    this.el.stage.focus({ preventScroll: true });
    this.pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
    const ids = Object.keys(this.pointers);
    if (ids.length === 2) {
      this.clearLong();
      if (this.drag) {
        this.drag.cancel();
        this.drag = null;
      }
      this.pend = null;
      const a = this.pointers[Number(ids[0])]!;
      const b = this.pointers[Number(ids[1])]!;
      this.pinch = {
        d: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        mx: (a.x + b.x) / 2,
        my: (a.y + b.y) / 2,
      };
      return;
    }
    if (ids.length > 2) return;
    try {
      this.el.stage.setPointerCapture(ev.pointerId);
    } catch {
      /* capture is optional */
    }
    const last = this.renderer.last;
    const cam = last && last.cam;
    const w = this.worldAt(p);
    const b = useBoard.getState();
    const base: Pend = {
      id: ev.pointerId,
      x0: ev.clientX,
      y0: ev.clientY,
      p0: p,
      w0: w,
      moved: false,
      touch,
      type: 'none',
    };

    if (ev.button === 1 || this.spaceDown) {
      ev.preventDefault();
      this.pend = { ...base, type: 'pan' };
      return;
    }
    if (this.tapHover) {
      this.hover(null);
      this.tapHover = false;
    }

    if (b.placing && b.placing.kind !== 'formation') {
      if (b.placing.kind !== 'event' && (!cam || cam.kind !== 'plan')) {
        this.pend = { ...base, type: 'none' };
        return;
      }
      this.pend = {
        ...base,
        type: 'place',
        rectOk: b.placing.kind === 'volume' && !(b.placing.pts && b.placing.pts.length),
      };
      return;
    }
    if (b.ruler) {
      if (!w || isElev(w)) {
        this.pend = { ...base, type: 'none' };
        return;
      }
      ruler.start(w, cam);
      this.pend = { ...base, type: 'ruler' };
      return;
    }
    const h = this.hitAt(p, ev, touch);
    if (cam && cam.kind === 'axon') {
      this.pend = { ...base, type: 'rotate', hit: h, yaw: b.yaw, pitch: b.pitch };
      return;
    }
    this.pend = { ...base, type: h ? 'obj' : 'empty', hit: h };
    if (touch) {
      this.longTimer = window.setTimeout(() => {
        this.longTimer = 0;
        if (!this.pend || this.pend.moved) return;
        const hh = this.pend.hit || null;
        this.pend = null;
        this.openMenu(hh, { clientX: base.x0, clientY: base.y0 });
      }, LONG_PRESS_MS);
    }
  }

  private startGesture(): void {
    const pend = this.pend!;
    const last = this.renderer.last;
    if (pend.type === 'obj') {
      const hit = pend.hit || null;
      if (useDocument.getState().doc && this.draggable(hit) && pend.w0 && last) {
        if (hit!.role !== 'insert' && hit!.role !== 'edge') this.select(hit);
        this.drag = beginDrag(hit, pend.w0, last.cam);
        pend.type = this.drag ? 'drag' : pend.touch ? 'pan' : 'none';
      } else {
        pend.type = pend.touch ? 'pan' : 'none';
      }
    } else if (pend.type === 'empty') {
      pend.type = pend.touch ? 'pan' : 'none';
    } else if (pend.type === 'place' && pend.rectOk) {
      pend.type = 'rect';
    }
    if (pend.type === 'pan') {
      const b = useBoard.getState();
      pend.view = { zoom: b.zoom, px: b.px, py: b.py };
    }
  }

  private processMove(): void {
    this.moveRaf = 0;
    const m = this.moveQ;
    this.moveQ = null;
    if (!m) return;
    const ev = m.ev;
    const p = m.p;
    const w = this.worldAt(p);
    const last = this.renderer.last;
    const b = useBoard.getState();
    const html = last && last.cam.kind !== 'axon' ? this.cursorText(w) : '';
    if (this.el.cursor.innerHTML !== html) this.el.cursor.innerHTML = html;
    b.set({ pointer: { sx: p.sx, sy: p.sy, clientX: ev.clientX, clientY: ev.clientY, world: w } });

    if (this.pinch) {
      const ids = Object.keys(this.pointers);
      if (ids.length < 2) return;
      const a = this.pointers[Number(ids[0])]!;
      const c = this.pointers[Number(ids[1])]!;
      const d = Math.hypot(a.x - c.x, a.y - c.y) || 1;
      const mx = (a.x + c.x) / 2;
      const my = (a.y + c.y) / 2;
      const r = this.el.stage.getBoundingClientRect();
      const k = last && r.width ? last.W / r.width : 1;
      pan((mx - this.pinch.mx) * k, (my - this.pinch.my) * k);
      zoom(d / this.pinch.d, (mx - r.left) * k, (my - r.top) * k, last && last.cam);
      this.pinch = { d, mx, my };
      return;
    }

    const pend = this.pend;
    if (!pend) {
      // hover and placement ghost, no button down
      if (b.placing && b.placing.kind !== 'formation' && b.placing.kind !== 'event') {
        const cur = this.placingCursor(b.placing, w, ev);
        const prev = b.placing.cur as
          { x: number; y: number; label?: string | null } | null | undefined;
        if (cur && (!prev || prev.x !== cur.x || prev.y !== cur.y || prev.label !== cur.label)) {
          b.set({ placing: { ...b.placing, cur: { x: cur.x, y: cur.y }, label: cur.label } });
        }
        this.showLabel(cur ? [cur.leg, cur.label].filter(Boolean).join('  ') : '', p);
        return;
      }
      if (!this.el.label.classList.contains('hidden')) this.showLabel('', p);
      // two-click ruler: the free end follows the pointer until the second click
      if (
        b.ruler &&
        b.ruler.a &&
        !b.ruler.done &&
        w &&
        !isElev(w) &&
        last &&
        last.cam.kind === 'plan'
      ) {
        ruler.move(w, last.cam);
        return;
      }
      if (ev.pointerType === 'mouse') {
        const h = this.hitAt(p, ev, false);
        if (!sameHit(h, this.hoverHit)) {
          this.hoverHit = h;
          this.hover(h);
        }
      }
      return;
    }

    if (!pend.moved && Math.hypot(ev.clientX - pend.x0, ev.clientY - pend.y0) > 3) {
      pend.moved = true;
      this.clearLong();
      this.startGesture();
    }
    if (!pend.moved) return;
    if (pend.type === 'drag' && this.drag) {
      const res = this.drag.move(w, this.mods(ev, p));
      this.showLabel(res.label || '', p, res.largest || '');
    } else if (pend.type === 'pan' && pend.view) {
      const rr = this.el.stage.getBoundingClientRect();
      const kk = last && rr.width ? last.W / rr.width : 1;
      b.set({
        zoom: pend.view.zoom,
        px: pend.view.px + (ev.clientX - pend.x0) * kk,
        py: pend.view.py + (ev.clientY - pend.y0) * kk,
      });
    } else if (pend.type === 'rotate') {
      const r = cameras.axon.rotate(
        pend.yaw == null ? -35 : pend.yaw,
        pend.pitch == null ? 55 : pend.pitch,
        ev.clientX - pend.x0,
        ev.clientY - pend.y0,
      );
      b.set({
        yaw: Math.round(r.yaw * 10) / 10,
        pitch: Math.round(clamp(r.pitch, 8, 86) * 10) / 10,
      });
    } else if (pend.type === 'ruler') {
      if (w && !isElev(w) && last) ruler.move(w, last.cam);
    } else if (pend.type === 'rect') {
      const a0 = pend.w0;
      if (a0 && !isElev(a0) && w && !isElev(w)) {
        const U = makeUnits(useUi.getState().units);
        this.showLabel(U.h(Math.abs(w.x - a0.x)) + ' x ' + U.h(Math.abs(w.y - a0.y)), p);
      }
    }
  }

  private onMove(ev: PointerEvent): void {
    if (this.pointers[ev.pointerId]) this.pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
    this.overStage = true;
    this.moveQ = { ev, p: this.local(ev) };
    if (!this.moveRaf) this.moveRaf = requestAnimationFrame(() => this.processMove());
  }

  /** Run a queued move now (tests). */
  flushMove(): void {
    if (this.moveRaf) {
      cancelAnimationFrame(this.moveRaf);
      this.moveRaf = 0;
    }
    this.processMove();
  }

  private onUp(ev: PointerEvent): void {
    delete this.pointers[ev.pointerId];
    this.clearLong();
    try {
      this.el.stage.releasePointerCapture(ev.pointerId);
    } catch {
      /* capture is optional */
    }
    if (this.pinch) {
      if (Object.keys(this.pointers).length < 2) this.pinch = null;
      return;
    }
    if (this.moveRaf) this.flushMove();
    const g = this.pend;
    this.pend = null;
    if (!g || g.id !== ev.pointerId) return;
    const p = this.local(ev);
    const w = this.worldAt(p);
    const last = this.renderer.last;
    const cam = last && last.cam;
    const b = useBoard.getState();
    if (g.type === 'drag' && this.drag) {
      this.drag.end();
      this.drag = null;
      this.showLabel('', p);
      return;
    }
    if (g.type === 'ruler') {
      ruler.end(w && !isElev(w) ? w : null, cam);
      return;
    }
    if (g.type === 'rect') {
      this.showLabel('', p);
      const a = this.snapPlace(g.w0, ev);
      const c = this.snapPlace(w, ev);
      if (a && c) placeAt(w!, { rect: { a, b: c }, cam });
      return;
    }
    if (g.moved) return;
    if (g.type === 'place') {
      if (b.placing && b.placing.kind === 'event') {
        if (!w) {
          readout('Edit in Plan or Elevation.');
          return;
        }
        placeAt(w, { cam });
      } else {
        const sp = this.snapPlace(w, ev);
        if (sp) placeAt(sp, { cam });
      }
      return;
    }
    if (g.type === 'rotate') {
      if (g.hit) {
        this.select(g.hit);
        if (g.hit.handle || g.hit.role) readout('Edit in Plan or Elevation.');
      } else if (last && last.sel.kind) this.select(null);
      return;
    }
    if (g.type === 'obj') {
      const h = g.hit!;
      if (h.role === 'insert' || h.role === 'edge') return;
      this.clickSelect(h, p, g.touch);
      if (g.touch && !h.handle && !h.role) {
        this.hover(h);
        this.tapHover = true;
      }
      return;
    }
    if (g.type === 'empty' && last && last.sel.kind) this.select(null);
  }

  /** A click selects; a repeat click on the same spot cycles the stack under it (ui.stack). */
  private clickSelect(h: Hit, p: Local, touch: boolean): void {
    const ui = useUi.getState();
    const last = this.renderer.last;
    if ((h.handle && h.role !== 'centre') || (h.role && h.role !== 'centre') || !last) {
      this.select(h);
      return;
    }
    const stack = this.stackAt(p, touch);
    const keys = stack.map((x) => keyOfHit(last.rec, x)).map((k) => (k ? k.key : null));
    const m = stack.length;
    if (m <= 1) {
      this.select(h);
      if (ui.stack) ui.setStack(null);
      return;
    }
    const curKey = ui.selectedKeys[0] || null;
    const at = curKey ? keys.indexOf(curKey) : -1;
    const hk = keyOfHit(last.rec, h);
    let n = Math.max(0, hk ? keys.indexOf(hk.key) : 0);
    if (ui.stack && ui.stack.key === curKey && at >= 0) n = (at + 1) % m;
    this.select(stack[n]!);
    ui.setStack({ key: keys[n] || '', n: n + 1, m });
  }

  private onCancel(ev: PointerEvent): void {
    delete this.pointers[ev.pointerId];
    this.clearLong();
    if (Object.keys(this.pointers).length < 2) this.pinch = null;
    if (this.drag) {
      this.drag.cancel();
      this.drag = null;
    }
    this.pend = null;
    this.hideLabel();
  }

  private onLeave(): void {
    this.overStage = false;
    if (!this.pend) {
      this.el.cursor.textContent = '';
      this.hideLabel();
      if (this.hoverHit) {
        this.hoverHit = null;
        this.hover(null);
      }
      useBoard.getState().set({ pointer: null });
    }
  }

  private onDbl(ev: MouseEvent): void {
    ev.preventDefault();
    const b = useBoard.getState();
    if (b.placing && (b.placing.kind === 'aircraft' || b.placing.kind === 'volume')) {
      finishPlacing();
      return;
    }
    if (b.placing || b.ruler || !useDocument.getState().doc) return;
    const h = this.hitAt(this.local(ev), ev, this.isTouch(ev));
    if (this.isWaypoint(h)) this.removeWaypoint(h!);
  }

  /** Legacy tools.removeWaypoint: a path keeps its last waypoint. */
  private removeWaypoint(h: Hit): void {
    const last = this.renderer.last;
    if (!last || h.i == null) return;
    const p = last.rec.scene.paths.find((x) => x.id === h.id);
    if (!p || !p.pts[h.i]) return;
    if (p.pts.length <= 1) {
      readout(h.id + ' keeps its last waypoint. Delete ' + h.id + ' to remove it.', 'warn');
      return;
    }
    const i = h.i;
    useDocument.getState().edit('delete ' + h.id + ' point ' + (i + 1), (c) => {
      const t = c.threats.find((x) => x.key === p.key);
      if (t) t.path.splice(i, 1);
    });
    const ui = useUi.getState();
    if (ui.selectedKeys[0] === p.pts[i]!.key) ui.setSelection([p.key]);
  }

  private onWheel(ev: WheelEvent): void {
    ev.preventDefault();
    const p = this.local(ev);
    const dy = ev.deltaMode === 1 ? ev.deltaY * 16 : ev.deltaY;
    zoom(Math.exp(-dy * 0.0015), p.sx, p.sy, this.renderer.last && this.renderer.last.cam);
  }

  private onContext(ev: MouseEvent): void {
    ev.preventDefault();
    if (!useDocument.getState().doc || useBoard.getState().placing) return;
    this.openMenu(this.hitAt(this.local(ev), ev, false), ev);
  }

  // Space over the board is pan: consume it so the play toggle does not run
  private onSpace(ev: KeyboardEvent): void {
    if (ev.key !== ' ') return;
    const a = document.activeElement;
    const tag = a ? String(a.tagName || '').toLowerCase() : '';
    if (
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      (a && (a as HTMLElement).isContentEditable)
    )
      return;
    this.spaceDown = ev.type === 'keydown';
    if (this.overStage && ev.type === 'keydown' && !ev.metaKey && !ev.ctrlKey && !ev.altKey) {
      ev.preventDefault();
      ev.stopPropagation();
    }
  }

  // keys the board owns while focused: Enter during placement, Escape during a drag, placement or
  // ruler, the arrows as nudge with a selection
  private onKey(ev: KeyboardEvent): void {
    if (ev.type !== 'keydown' || ev.key === ' ') return;
    const b = useBoard.getState();
    if (ev.key === 'Escape' && (this.drag || b.placing || b.ruler)) {
      this.cancel();
      ev.preventDefault();
      return;
    }
    if (
      ev.key === 'Enter' &&
      b.placing &&
      (b.placing.kind === 'aircraft' || b.placing.kind === 'volume')
    ) {
      finishPlacing();
      this.hideLabel();
      ev.preventDefault();
      return;
    }
    const nk = NUDGE_KEYS[ev.key];
    if (nk && !ev.metaKey && !ev.ctrlKey && !ev.altKey && useUi.getState().selectedKeys.length) {
      const r = execute(nk, undefined, ev.shiftKey ? 'large' : undefined);
      if (r !== true) {
        // not registered (before lane 9.2.6): nudge directly
        const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[
          ev.key as 'ArrowLeft'
        ];
        const k = ev.shiftKey ? 5 : 1;
        nudge(d[0]! * k, d[1]! * k);
      }
      ev.preventDefault();
      ev.stopPropagation();
    }
  }

  private syncClasses(): void {
    const b = useBoard.getState();
    const st = this.el.stage;
    const axon = useUi.getState().view === '3d';
    st.classList.toggle('bd-place', !!b.placing || !!b.ruler);
    st.classList.toggle('bd-rot', axon && !b.placing);
  }
}

/** Legacy syncMsg: the hint line for a placement or the ruler. */
export function hintText(placing: BoardPlacing | null, rulerOn: boolean, camKind: string): string {
  const p = placing;
  if (p && p.kind !== 'formation') {
    if (p.kind !== 'event' && camKind !== 'plan') return 'Press P to add in Plan.';
    if (p.kind === 'aircraft')
      return (
        (p.pts && p.pts.length
          ? 'Pick a point to add a waypoint. Double-click or press Enter to end the flight path.'
          : 'Pick a point to place the start waypoint.') + ' Press Escape to cancel.'
      );
    if (p.kind === 'volume')
      return 'Pick a point to place a vertex. Double-click or press Enter to close the area. Or drag a rectangle. Press Escape to cancel.';
    if (p.kind === 'system') return 'Pick a point to place it. Press Escape to cancel.';
    if (p.kind === 'event')
      return 'Pick a point on a flight path to place the event. Press Escape to cancel.';
    return '';
  }
  if (rulerOn)
    return camKind !== 'plan'
      ? 'Press P to use the ruler.'
      : 'Drag, or click two points, to measure. Press M to close the ruler.';
  return '';
}
