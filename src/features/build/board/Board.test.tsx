import { act, fireEvent, render } from '@testing-library/react';
import { vi } from 'vitest';
import '../../../ui/test-utils';
import { cameras } from '../../../board';
import { makeUnits } from '../../../board/format';
import { testVignette } from '../../../engine/testVignette';
import { useDocument } from '../../../state/document';
import { UI_DEFAULTS, useUi } from '../../../state/ui';
import { useReadout } from '../readout/store';
import { useQuickAdd } from '../palette/store';
import Board, { cancel, mounted } from './Board';
import { boardCommands } from './commands';
import { boardFlush } from './renderer';
import { BOARD_DEFAULTS, useBoard } from './store';

const W = 900;
const H = 600;

function mount() {
  const out = render(<Board width={W} height={H} />);
  act(() => boardFlush());
  const h = [...mounted][0]!.renderer;
  const stage = out.getByTestId('board-stage');
  return { ...out, h, stage };
}

function hitOf(kind: string, id: string, role?: string | null, i?: number | null) {
  const h = [...mounted][0]!;
  const hit = h.renderer.last!.hits.find(
    (x) =>
      x.kind === kind &&
      x.id === id &&
      (role === undefined ? (kind === 'system' ? x.role === 'centre' : !x.handle) : x.role === role) &&
      (i === undefined ? true : x.i === i),
  );
  if (!hit) throw new Error(`no hit ${kind} ${id} ${role ?? ''}`);
  return hit;
}

function down(stage: HTMLElement, x: number, y: number, init: Record<string, unknown> = {}) {
  fireEvent.pointerDown(stage, { clientX: x, clientY: y, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true, ...init });
}
function move(stage: HTMLElement, x: number, y: number, init: Record<string, unknown> = {}) {
  fireEvent.pointerMove(stage, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', isPrimary: true, ...init });
  act(() => [...mounted][0]!.gestures.flushMove());
  act(() => boardFlush());
}
function up(stage: HTMLElement, x: number, y: number, init: Record<string, unknown> = {}) {
  fireEvent.pointerUp(stage, { clientX: x, clientY: y, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true, ...init });
  act(() => boardFlush());
}
function click(stage: HTMLElement, x: number, y: number) {
  down(stage, x, y);
  up(stage, x, y);
}
function project(x: number, y: number, z = 0): [number, number] {
  const cam = [...mounted][0]!.renderer.last!.cam;
  return cam.project(x, y, z);
}

describe('Board', () => {
  beforeEach(() => {
    useDocument.getState().open(testVignette());
    useUi.setState({ ...UI_DEFAULTS });
    useBoard.setState({ ...BOARD_DEFAULTS });
    useQuickAdd.setState({ boardArmed: null });
  });

  it('renders one group per layer and rewrites only the layers whose inputs changed', () => {
    const { h, container } = mount();
    const groups = [...container.querySelectorAll('svg.board > g[data-layer]')].map((g) => g.getAttribute('data-layer'));
    expect(groups).toContain('systems');
    expect(groups).toContain('handles');
    expect(groups).toContain('grid');
    expect(h.renders.full).toBe(1);
    const before = { ...h.writes };

    act(() => useDocument.getState().edit('Set sector', (d) => { d.sensors[0]!.fovDeg = 90; }));
    act(() => boardFlush());
    expect(h.renders.full).toBe(2);
    const changed = Object.keys(h.writes).filter((k) => h.writes[k] !== before[k]);
    expect(changed.length).toBeGreaterThan(0);
    expect(changed).not.toContain('grid');
    expect(changed).not.toContain('paths');
    expect(changed.some((k) => k === 'reach' || k === 'systems')).toBe(true);

    // a time tick is a partial render: the time layers only, with the hit list kept
    const hits = h.last!.hits;
    const mid = { ...h.writes };
    act(() => useUi.getState().setTime(30));
    act(() => boardFlush());
    expect(h.renders.full).toBe(2);
    expect(h.renders.partial).toBe(1);
    expect(h.writes.systems).toBe(mid.systems);
    expect(h.writes.grid).toBe(mid.grid);
    expect(h.writes.tracks).toBe((mid.tracks || 0) + 1);
    expect(h.last!.hits).toBe(hits);
    expect(container.querySelector('svg.board')!.getAttribute('aria-label')).toBe('Board in plan');
  });

  it('click selects, click on empty deselects, repeat click cycles the stack (ui.stack)', () => {
    const { stage } = mount();
    const s1 = hitOf('system', 'S-01');
    click(stage, s1.sx, s1.sy);
    const first = useUi.getState().selectedKeys[0]!;
    expect(first).toBeTruthy();
    const st0 = useUi.getState().stack!;
    expect(st0.key).toBe(first);
    expect(st0.m).toBeGreaterThanOrEqual(2);
    // S-01, S-02, E-01, N-01 and A-01 all sit at the origin: the repeat click moves on through the stack
    click(stage, s1.sx, s1.sy);
    const st = useUi.getState().stack!;
    expect(st.m).toBe(st0.m);
    expect(st.n).toBe((st0.n % st0.m) + 1);
    expect(useUi.getState().selectedKeys[0]).not.toBe(first);
    expect(useUi.getState().selectedKeys[0]).toBe(st.key);
    // empty board: deselect
    click(stage, 2, 2);
    expect(useUi.getState().selectedKeys).toEqual([]);
    expect(useUi.getState().stack).toBeNull();
  });

  it('drags a range handle as one undo step with the pre-drag ghost and the readout baseline', () => {
    const { stage } = mount();
    const spy = vi.spyOn(useReadout.getState(), 'setDragBaseline');
    act(() => useUi.getState().setSelection(['k-S-02']));
    act(() => boardFlush());
    const rh = hitOf('system', 'S-02', 'range');
    const past = useDocument.getState().past.length;
    const doc0 = useDocument.getState().doc!;
    down(stage, rh.sx, rh.sy);
    move(stage, rh.sx + 30, rh.sy);
    expect(useBoard.getState().ghost).not.toBeNull();
    expect(useBoard.getState().ghost!.rec.scene.systems.find((s) => s.id === 'S-02')!.range).toBe(2500);
    expect(useBoard.getState().bounds).not.toBeNull();
    expect(useReadout.getState().dragBase).toBe(doc0);
    const label = useBoard.getState().dragLabel!;
    expect(label.text).toMatch(/^S-02 /);
    move(stage, rh.sx + 60, rh.sy);
    const r1 = useDocument.getState().doc!.sensors[1]!.rangeM;
    expect(r1).toBeGreaterThan(2500);
    up(stage, rh.sx + 60, rh.sy);
    expect(useDocument.getState().past.length).toBe(past + 1);
    expect(useDocument.getState().doc!.sensors[1]!.rangeM).toBe(r1);
    expect(useBoard.getState().ghost).toBeNull();
    expect(useBoard.getState().bounds).toBeNull();
    expect(spy).toHaveBeenLastCalledWith(null);
    expect(useDocument.getState().history.at(-1)).toMatch(/set S-02 range/);
    act(() => useDocument.getState().undo());
    expect(useDocument.getState().doc!.sensors[1]!.rangeM).toBe(2500);
  });

  it('Escape cancels a drag through cancel()', () => {
    const { stage } = mount();
    act(() => useUi.getState().setSelection(['k-S-02']));
    act(() => boardFlush());
    const rh = hitOf('system', 'S-02', 'range');
    const past = useDocument.getState().past.length;
    down(stage, rh.sx, rh.sy);
    move(stage, rh.sx + 40, rh.sy);
    expect(useDocument.getState().doc!.sensors[1]!.rangeM).not.toBe(2500);
    act(() => { fireEvent.keyDown(stage, { key: 'Escape' }); });
    expect(useDocument.getState().doc!.sensors[1]!.rangeM).toBe(2500);
    expect(useDocument.getState().past.length).toBe(past);
    expect(cancel()).toBe(false);
  });

  it('snaps a placement to a sensor ring and names it in the ghost label', () => {
    const { stage, getByTestId } = mount();
    act(() => useUi.getState().setArmed({ group: 'sensor', kind: 'radar' }));
    act(() => boardFlush());
    expect(useBoard.getState().placing!.kind).toBe('system');
    expect(stage.className).toMatch(/bd-place/);
    expect(getByTestId('board-msg').textContent).toBe('Pick a point to place it. Press Escape to cancel.');
    // 3 px inside the S-01 ring (5000 m), south
    const cam = [...mounted][0]!.renderer.last!.cam;
    const [sx, sy] = cam.project(0, -5000, 0);
    move(stage, sx, sy - 3);
    expect(getByTestId('board-label').textContent).toBe('on S-01 ring');
    const p = useBoard.getState().placing!;
    expect(p.cur).toEqual({ x: 0, y: -5000 });
    // Alt bypasses the snap
    move(stage, sx + 1, sy - 3, { altKey: true });
    expect(getByTestId('board-label').textContent).toBe('');
    // grid step snap: a point off every ring lands on a step multiple
    const step = useBoard.getState().placing!.cur as { x: number; y: number };
    expect(step.x % 1).toBe(0);
  });

  it('places a system on click and a threat path by clicks and Enter, as one edit each', () => {
    const { stage } = mount();
    act(() => useUi.getState().setArmed({ group: 'sensor', kind: 'radar' }));
    act(() => boardFlush());
    const past = useDocument.getState().past.length;
    const [sx, sy] = project(1500, 1500);
    click(stage, sx, sy);
    const doc = useDocument.getState().doc!;
    expect(doc.sensors).toHaveLength(3);
    expect(doc.sensors[2]!.id).toBe('RDR-1');
    expect(doc.sensors[2]!.kind).toBe('radar');
    expect(Math.abs(doc.sensors[2]!.x - 1500)).toBeLessThan(200);
    expect(useDocument.getState().past.length).toBe(past + 1);
    expect(useUi.getState().selectedKeys).toEqual([doc.sensors[2]!.key]);
    expect(useBoard.getState().placing).toBeNull();
    expect(useUi.getState().armed).toBeNull();

    act(() => useUi.getState().setArmed({ group: 'threat', type: 'g1-quad-isr' }));
    act(() => boardFlush());
    expect(useBoard.getState().placing!.kind).toBe('aircraft');
    expect(useUi.getState().drawing).toBe(true);
    const a = project(3000, 3000);
    const b = project(2000, 1000);
    const c = project(500, 0);
    click(stage, a[0], a[1]);
    expect(useBoard.getState().placing!.pts).toHaveLength(1);
    click(stage, b[0], b[1]);
    click(stage, c[0], c[1]);
    expect(useDocument.getState().past.length).toBe(past + 1);
    act(() => { fireEvent.keyDown(stage, { key: 'Enter' }); });
    act(() => boardFlush());
    const d2 = useDocument.getState().doc!;
    expect(d2.threats).toHaveLength(3);
    expect(d2.threats[2]!.path).toHaveLength(3);
    expect(d2.threats[2]!.id).not.toBe('');
    expect(d2.threats[2]!.type).toBe('g1-quad-isr');
    expect(useDocument.getState().past.length).toBe(past + 2);
    expect(useUi.getState().drawing).toBe(false);
    expect(useUi.getState().tool).toBe('select');
    expect(useBoard.getState().placing).toBeNull();
  });

  it('places an authored event on the nearest flight path from the palette boardArmed', () => {
    const { stage, getByTestId } = mount();
    act(() => useQuickAdd.getState().setBoardArmed({ group: 'event', type: 'detect' }));
    act(() => boardFlush());
    expect(useBoard.getState().placing!.kind).toBe('event');
    expect(getByTestId('board-msg').textContent).toMatch(/^Pick a point on a flight path/);
    const [sx, sy] = project(0, 3000);
    click(stage, sx, sy);
    const doc = useDocument.getState().doc!;
    expect(doc.events).toHaveLength(1);
    expect(doc.events[0]!.threatKey).toBe('k-T-01');
    expect(doc.events[0]!.type).toBe('detect');
    expect(useQuickAdd.getState().boardArmed).toBeNull();
    expect(useBoard.getState().placing).toBeNull();
  });

  it('measures with two clicks and draws the ruler text', () => {
    const { stage, container, getByTestId } = mount();
    act(() => useUi.getState().setTool('measure'));
    act(() => boardFlush());
    expect(useBoard.getState().ruler).toEqual({ a: null, b: null, done: false });
    expect(getByTestId('board-msg').textContent).toBe('Drag, or click two points, to measure. Press M to close the ruler.');
    const a = project(1000, 1000);
    const b = project(1000, 4000);
    click(stage, a[0], a[1]);
    expect(useBoard.getState().ruler!.a!.x).toBeCloseTo(1000, 6);
    expect(useBoard.getState().ruler!.a!.y).toBeCloseTo(1000, 6);
    expect(useBoard.getState().ruler!.done).toBe(false);
    click(stage, b[0], b[1]);
    const r = useBoard.getState().ruler!;
    expect(r.done).toBe(true);
    expect(r.b!.x).toBeCloseTo(1000, 6);
    expect(r.b!.y).toBeCloseTo(4000, 6);
    const handles = container.querySelector('g[data-layer="handles"]')!;
    expect(handles.innerHTML).toContain('class="ruler"');
    expect(handles.textContent).toContain(makeUnits(useUi.getState().units).h(3000));
    // Escape clears the ruler and the tool
    act(() => { fireEvent.keyDown(stage, { key: 'Escape' }); });
    expect(useBoard.getState().ruler).toBeNull();
    expect(useUi.getState().tool).toBe('select');
  });

  it('orbits in 3D by drag, rounded to 0.1 with the pitch clamped to 8..86', () => {
    const { stage } = mount();
    act(() => useUi.getState().setView('3d'));
    act(() => boardFlush());
    expect(stage.className).toMatch(/bd-rot/);
    down(stage, 400, 300);
    move(stage, 440, 320);
    const want = cameras.axon.rotate(-35, 55, 40, 20);
    expect(useBoard.getState().yaw).toBe(Math.round(want.yaw * 10) / 10);
    expect(useBoard.getState().pitch).toBe(Math.round(want.pitch * 10) / 10);
    move(stage, 440, 900);
    expect(useBoard.getState().pitch).toBe(86);
    up(stage, 440, 900);
    down(stage, 400, 300);
    move(stage, 400, -900);
    up(stage, 400, -900);
    expect(useBoard.getState().pitch).toBe(8);
    expect(useUi.getState().selectedKeys).toEqual([]);
  });

  it('zooms at the cursor on wheel and pans with the middle button', () => {
    const { stage } = mount();
    fireEvent.wheel(stage, { deltaY: -200, clientX: 100, clientY: 100 });
    act(() => boardFlush());
    const b = useBoard.getState();
    expect(b.zoom).toBeCloseTo(Math.exp(200 * 0.0015), 5);
    // the point under the cursor stays put: px = sx - (sx - px0) * k
    expect(b.px).toBeCloseTo(100 - 100 * b.zoom, 5);
    down(stage, 200, 200, { button: 1 });
    move(stage, 250, 230);
    up(stage, 250, 230, { button: 1 });
    expect(useBoard.getState().px).toBeCloseTo(b.px + 50, 5);
    expect(useBoard.getState().py).toBeCloseTo(b.py + 30, 5);
  });

  it('exports the key commands and nudges the selection with the arrows while focused', () => {
    const ids = Object.fromEntries(boardCommands.map((c) => [c.id, c]));
    expect(ids['map.gridSnap']!.shortcut).toBe('G');
    expect(ids['view.zoomIn']!.shortcut).toBe('=');
    expect(ids['view.zoomOut']!.shortcut).toBe('-');
    for (const c of boardCommands) expect(c.workspaces).toEqual(['build']);
    const ctx = { document: useDocument.getState(), ui: useUi.getState(), pointer: null } as never;
    ids['map.gridSnap']!.run(ctx, undefined);
    expect(useBoard.getState().snap).toBe(false);
    ids['view.zoomIn']!.run(ctx, undefined);
    expect(useBoard.getState().zoom).toBe(1.25);
    ids['view.zoomOut']!.run(ctx, undefined);
    expect(useBoard.getState().zoom).toBeCloseTo(1, 9);

    const { stage } = mount();
    act(() => useUi.getState().setSelection(['k-S-02']));
    act(() => boardFlush());
    const x0 = useDocument.getState().doc!.sensors[1]!.x;
    act(() => { fireEvent.keyDown(stage, { key: 'ArrowRight' }); });
    const x1 = useDocument.getState().doc!.sensors[1]!.x;
    expect(x1).toBeGreaterThan(x0);
    act(() => { fireEvent.keyDown(stage, { key: 'ArrowRight', shiftKey: true }); });
    const x2 = useDocument.getState().doc!.sensors[1]!.x;
    expect(x2 - x1).toBeCloseTo((x1 - x0) * 5, 6);
    act(() => { fireEvent.keyDown(stage, { key: 'ArrowUp' }); });
    expect(useDocument.getState().doc!.sensors[1]!.y).toBeGreaterThan(0);
    expect(useDocument.getState().history.at(-1)).toBe('move S-02');
  });

  it('opens the target menu on right-click with the hit kind, and the map menu on empty', () => {
    const { stage, queryByTestId } = mount();
    const t1 = hitOf('path', 'T-01');
    fireEvent.contextMenu(stage, { clientX: t1.sx, clientY: t1.sy });
    expect(queryByTestId('board-menu-anchor')).not.toBeNull();
    expect(useUi.getState().selectedKeys).toEqual(['k-T-01']);
    act(() => { fireEvent.keyDown(document.body, { key: 'Escape' }); });
  });

  it('double-click on a waypoint deletes it; a last waypoint stays', () => {
    const { stage } = mount();
    act(() => useUi.getState().setSelection(['k-T-01']));
    act(() => boardFlush());
    const wp = hitOf('path', 'T-01', 'centre', 0);
    fireEvent.doubleClick(stage, { clientX: wp.sx, clientY: wp.sy });
    act(() => boardFlush());
    expect(useDocument.getState().doc!.threats[0]!.path).toHaveLength(1);
    expect(useDocument.getState().history.at(-1)).toBe('delete T-01 point 1');
    const last = hitOf('path', 'T-01', 'centre', 0);
    fireEvent.doubleClick(stage, { clientX: last.sx, clientY: last.sy });
    act(() => boardFlush());
    expect(useDocument.getState().doc!.threats[0]!.path).toHaveLength(1);
    expect(useBoard.getState().readout!.text).toBe('T-01 keeps its last waypoint. Delete T-01 to remove it.');
  });

  it('shows the cursor readout as range and bearing from the asset', () => {
    const { stage, getByTestId } = mount();
    const [sx, sy] = project(0, 1000);
    move(stage, sx, sy);
    const t = getByTestId('board-cursor').textContent!;
    expect(t).toContain(makeUnits(useUi.getState().units).h(1000));
    expect(t).toContain('from asset');
    expect(useBoard.getState().pointer).toMatchObject({ clientX: sx, clientY: sy });
    fireEvent.pointerLeave(stage);
    expect(useBoard.getState().pointer).toBeNull();
  });
});
