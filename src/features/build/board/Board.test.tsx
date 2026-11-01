import { act, fireEvent, render } from '@testing-library/react';
import '../../../ui/test-utils';
import { cameras } from '../../../board';
import { makeUnits } from '../../../board/format';
import { bounds as geoBounds } from '../../../board/geo';
import { testSensor, testVignette } from '../../../engine/testVignette';
import { useDocument } from '../../../state/document';
import { UI_DEFAULTS, useUi } from '../../../state/ui';
import { useQuickAdd } from '../palette/store';
import Board, { cancel, mounted } from './Board';
import { boardCommands } from './commands';
import { boardFlush } from './renderer';
import { BOARD_DEFAULTS, useBoard } from './store';
import { fit } from './tools';

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
      (role === undefined
        ? kind === 'system'
          ? x.role === 'centre'
          : !x.handle
        : x.role === role) &&
      (i === undefined ? true : x.i === i),
  );
  if (!hit) throw new Error(`no hit ${kind} ${id} ${role ?? ''}`);
  return hit;
}

function down(stage: HTMLElement, x: number, y: number, init: Record<string, unknown> = {}) {
  fireEvent.pointerDown(stage, {
    clientX: x,
    clientY: y,
    button: 0,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    ...init,
  });
}
function move(stage: HTMLElement, x: number, y: number, init: Record<string, unknown> = {}) {
  fireEvent.pointerMove(stage, {
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    ...init,
  });
  act(() => [...mounted][0]!.gestures.flushMove());
  act(() => boardFlush());
}
function up(stage: HTMLElement, x: number, y: number, init: Record<string, unknown> = {}) {
  fireEvent.pointerUp(stage, {
    clientX: x,
    clientY: y,
    button: 0,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    ...init,
  });
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
    useUi.setState({ timeOn: true });
    const { h, container } = mount();
    const groups = [...container.querySelectorAll('svg.board > g[data-layer]')].map((g) =>
      g.getAttribute('data-layer'),
    );
    expect(groups).toContain('systems');
    expect(groups).toContain('handles');
    expect(groups).toContain('grid');
    expect(h.renders.full).toBe(1);
    const before = { ...h.writes };

    act(() =>
      useDocument.getState().edit('Set sector', (d) => {
        d.sensors[0]!.fovDeg = 90;
      }),
    );
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

  it('drags a range handle as one undo step with the pre-drag ghost', () => {
    const { stage } = mount();
    act(() => useUi.getState().setSelection(['k-S-02']));
    act(() => boardFlush());
    const rh = hitOf('system', 'S-02', 'range');
    const past = useDocument.getState().past.length;
    const bounds0 = useBoard.getState().bounds;
    expect(bounds0).not.toBeNull();
    down(stage, rh.sx, rh.sy);
    move(stage, rh.sx + 30, rh.sy);
    expect(useBoard.getState().ghost).not.toBeNull();
    expect(useBoard.getState().ghost!.rec.scene.systems.find((s) => s.id === 'S-02')!.range).toBe(
      2500,
    );
    expect(useBoard.getState().bounds).toBe(bounds0);
    const label = useBoard.getState().dragLabel!;
    expect(label.text).toMatch(/^S-02 /);
    move(stage, rh.sx + 60, rh.sy);
    const r1 = useDocument.getState().doc!.sensors[1]!.rangeM;
    expect(r1).toBeGreaterThan(2500);
    up(stage, rh.sx + 60, rh.sy);
    expect(useDocument.getState().past.length).toBe(past + 1);
    expect(useDocument.getState().doc!.sensors[1]!.rangeM).toBe(r1);
    expect(useBoard.getState().ghost).toBeNull();
    // the camera bounds stick past the drag end
    expect(useBoard.getState().bounds).toBe(bounds0);
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
    act(() => {
      fireEvent.keyDown(stage, { key: 'Escape' });
    });
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
    expect(getByTestId('board-msg').textContent).toBe(
      'Pick a point to place it. Press Escape to cancel.',
    );
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
    act(() => {
      fireEvent.keyDown(stage, { key: 'Enter' });
    });
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
    expect(getByTestId('board-msg').textContent).toBe(
      'Drag, or click two points, to measure. Press M to close the ruler.',
    );
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
    act(() => {
      fireEvent.keyDown(stage, { key: 'Escape' });
    });
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

  it('a 3D drag that starts on a sensor orbits, edits nothing and shows the edit prompt', () => {
    const { stage } = mount();
    act(() => useUi.getState().setView('3d'));
    act(() => boardFlush());
    const s = hitOf('system', 'S-02');
    const doc0 = useDocument.getState().doc;
    const past = useDocument.getState().past.length;
    const yaw0 = useBoard.getState().yaw;
    down(stage, s.sx, s.sy);
    move(stage, s.sx + 60, s.sy + 10);
    up(stage, s.sx + 60, s.sy + 10);
    expect(useBoard.getState().yaw).not.toBe(yaw0);
    expect(useDocument.getState().doc).toBe(doc0);
    expect(useDocument.getState().past.length).toBe(past);
    expect(useBoard.getState().readout!.text).toBe('Edit in Plan (1) or Elevation (2).');
    // a drag on empty ground orbits with no prompt
    act(() => useBoard.getState().set({ readout: null }));
    down(stage, 2, 2);
    move(stage, 40, 2);
    up(stage, 40, 2);
    expect(useBoard.getState().readout).toBeNull();
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
    act(() => {
      fireEvent.keyDown(stage, { key: 'ArrowRight' });
    });
    const x1 = useDocument.getState().doc!.sensors[1]!.x;
    expect(x1).toBeGreaterThan(x0);
    act(() => {
      fireEvent.keyDown(stage, { key: 'ArrowRight', shiftKey: true });
    });
    const x2 = useDocument.getState().doc!.sensors[1]!.x;
    expect(x2 - x1).toBeCloseTo((x1 - x0) * 5, 6);
    act(() => {
      fireEvent.keyDown(stage, { key: 'ArrowUp' });
    });
    expect(useDocument.getState().doc!.sensors[1]!.y).toBeGreaterThan(0);
    expect(useDocument.getState().history.at(-1)).toBe('move S-02');
  });

  it('opens the target menu on right-click with the hit kind, and the map menu on empty', () => {
    const { stage, queryByTestId } = mount();
    const t1 = hitOf('path', 'T-01');
    fireEvent.contextMenu(stage, { clientX: t1.sx, clientY: t1.sy });
    expect(queryByTestId('board-menu-anchor')).not.toBeNull();
    expect(useUi.getState().selectedKeys).toEqual(['k-T-01']);
    act(() => {
      fireEvent.keyDown(document.body, { key: 'Escape' });
    });
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
    expect(useBoard.getState().readout!.text).toBe(
      'T-01 keeps its last waypoint. Delete T-01 to remove it.',
    );
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
  describe('sticky camera bounds', () => {
    const camOf = () => {
      const cam = [...mounted][0]!.renderer.last!.cam;
      return { scale: cam.scale, origin: cam.project(0, 0) };
    };
    const addFar = () =>
      act(() =>
        useDocument.getState().edit('add S-09', (d) => {
          d.sensors.push(testSensor('S-09', 'radar', 4000, { x: 6000, y: 0 }));
        }),
      );

    it('adding a sensor 6 km out with a 4 km ring keeps the plan camera', () => {
      mount();
      const before = camOf();
      const b0 = useBoard.getState().bounds!;
      addFar();
      act(() => boardFlush());
      // the scene grew: a refit would change the camera
      expect(geoBounds([...mounted][0]!.renderer.last!.rec.scene)).not.toEqual(b0);
      expect(useBoard.getState().bounds).toBe(b0);
      const after = camOf();
      expect(after.scale).toBe(before.scale);
      expect(after.origin).toEqual(before.origin);
    });

    it('fit() recomputes the bounds from the scene', () => {
      mount();
      const before = camOf();
      addFar();
      act(() => boardFlush());
      act(() => fit());
      act(() => boardFlush());
      const rec = [...mounted][0]!.renderer.last!.rec;
      expect(useBoard.getState().bounds).toEqual(geoBounds(rec.scene));
      expect(camOf().scale).toBeLessThan(before.scale);
    });

    it('opening a second profile recomputes the bounds', () => {
      mount();
      const b0 = useBoard.getState().bounds!;
      act(() =>
        useDocument.getState().open(
          testVignette({
            id: 'V-two',
            sensors: [testSensor('S-01', 'radar', 12000, { x: 3000, y: 0 })],
          }),
        ),
      );
      act(() => boardFlush());
      const rec = [...mounted][0]!.renderer.last!.rec;
      expect(rec.id).toBe('V-two');
      expect(useBoard.getState().bounds).toEqual(geoBounds(rec.scene));
      expect(useBoard.getState().bounds).not.toEqual(b0);
    });
  });

  it('a press on the ring of an unselected system drags its range, not its centre (lane 11.1)', () => {
    const { stage, container } = mount();
    expect(useUi.getState().selectedKeys).toEqual([]);
    const ring = container.querySelector(
      'g[data-layer="reach"] [data-role="range"][data-id="S-02"]',
    )!;
    expect(ring).toBeTruthy();
    const s0 = useDocument.getState().doc!.sensors[1]!;
    const [rx, ry] = project(s0.x + s0.rangeM, s0.y);
    const past = useDocument.getState().past.length;
    fireEvent.pointerDown(ring, {
      clientX: rx,
      clientY: ry,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
    });
    move(stage, rx + 20, ry);
    move(stage, rx + 40, ry);
    up(stage, rx + 40, ry);
    const s1 = useDocument.getState().doc!.sensors[1]!;
    expect(useUi.getState().selectedKeys).toEqual([s1.key]);
    expect([s1.x, s1.y]).toEqual([s0.x, s0.y]);
    expect(s1.rangeM).toBeGreaterThan(s0.rangeM);
    expect(useDocument.getState().past.length).toBe(past + 1);
    expect(useDocument.getState().history.at(-1)).toMatch(/set S-02 range/);
  });

  it('a press on a sector edge or the min range ring selects the system and starts nothing (11.F)', () => {
    act(() =>
      useDocument.getState().edit('Set sector', (d) => {
        d.sensors[1]!.fovDeg = 60;
        d.sensors[1]!.bearingDeg = 90;
        d.sensors[1]!.minRangeM = 1800;
      }),
    );
    const { stage, container } = mount();
    const s0 = useDocument.getState().doc!.sensors[1]!;
    const reach = (sel: string) =>
      container.querySelector(`g[data-layer="reach"] ${sel}[data-id="S-02"]`)!;
    // the reach layer redraws on a selection change: query its elements before each press
    const sector = () => reach('path[data-role="range"]');
    const rmin = () => reach('circle.rmin');
    expect(sector()).toBeTruthy();
    expect(rmin().getAttribute('data-role')).toBeNull();
    const past = useDocument.getState().past.length;
    const press = (el: Element, x: number, y: number) => {
      fireEvent.pointerDown(el, {
        clientX: x,
        clientY: y,
        button: 0,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
      });
      move(stage, x + 3, y);
      move(stage, x + 30, y + 10);
      up(stage, x + 30, y + 10);
    };
    // 40 % along the north edge of the sector (bearing 90, half width 30 degrees)
    const a = (30 * Math.PI) / 180;
    const [ex, ey] = project(s0.x + 1000 * Math.cos(a), s0.y + 1000 * Math.sin(a));
    press(sector(), ex, ey);
    let s1 = useDocument.getState().doc!.sensors[1]!;
    expect(useUi.getState().selectedKeys).toEqual([s1.key]);
    expect([s1.x, s1.y, s1.rangeM, s1.minRangeM]).toEqual([s0.x, s0.y, 2500, 1800]);
    expect(useDocument.getState().past.length).toBe(past);
    act(() => useUi.getState().setSelection([]));
    const [mx, my] = project(s0.x + 1800, s0.y);
    press(rmin(), mx, my);
    s1 = useDocument.getState().doc!.sensors[1]!;
    expect(useUi.getState().selectedKeys).toEqual([s1.key]);
    expect([s1.x, s1.y, s1.rangeM, s1.minRangeM]).toEqual([s0.x, s0.y, 2500, 1800]);
    expect(useDocument.getState().past.length).toBe(past);
    // the sector's arc is the ring: a press there drags the range
    const [rx, ry] = project(s0.x + 2500, s0.y);
    press(sector(), rx, ry);
    s1 = useDocument.getState().doc!.sensors[1]!;
    expect(s1.rangeM).toBeGreaterThan(2500);
    expect([s1.x, s1.y]).toEqual([s0.x, s0.y]);
    expect(useDocument.getState().past.length).toBe(past + 1);
  });

  it('a placement with a pathId appends waypoints to that threat (lane 11.1)', () => {
    const { stage } = mount();
    const t0 = useDocument.getState().doc!.threats[0]!;
    const n0 = t0.path.length;
    const lastZ = t0.path[n0 - 1]!.z;
    const threats0 = useDocument.getState().doc!.threats.length;
    act(() =>
      useBoard
        .getState()
        .set({ placing: { kind: 'aircraft', arch: t0.type, pts: [], pathId: t0.id } }),
    );
    const [ax, ay] = project(1200, 800);
    click(stage, ax, ay);
    const [bx, by] = project(1500, 400);
    click(stage, bx, by);
    let t1 = useDocument.getState().doc!.threats[0]!;
    expect(t1.path.length).toBe(n0 + 2);
    expect(t1.path[n0]!.z).toBe(lastZ);
    expect(useBoard.getState().placing?.pathId).toBe(t0.id);
    expect(useUi.getState().selectedKeys).toEqual([t0.key]);
    // one undo step per waypoint
    act(() => useDocument.getState().undo());
    t1 = useDocument.getState().doc!.threats[0]!;
    expect(t1.path.length).toBe(n0 + 1);
    // Enter (finish) ends the placement and adds no threat
    act(() => useUi.getState().signalPath('finish'));
    expect(useBoard.getState().placing).toBeNull();
    expect(useDocument.getState().doc!.threats.length).toBe(threats0);
    expect(useDocument.getState().doc!.threats[0]!.path.length).toBe(n0 + 1);
  });

  it('an append names its path in the hint, shows the leg readout and Escape clears it (11.F)', () => {
    const { stage, getByTestId } = mount();
    const t0 = useDocument.getState().doc!.threats[0]!;
    act(() => useBoard.getState().set({ readout: { text: 'stale', level: 'info' } }));
    act(() =>
      useBoard
        .getState()
        .set({ placing: { kind: 'aircraft', arch: t0.type, pts: [], pathId: t0.id } }),
    );
    expect(getByTestId('board-msg').textContent).toBe(
      `Pick a point to add a waypoint to ${t0.id}. Double-click or press Enter or Escape to end.`,
    );
    const [ax, ay] = project(1200, 800);
    click(stage, ax, ay);
    const leg = useBoard.getState().readout!.text;
    expect(leg).toMatch(/ s$/);
    expect(getByTestId('board-msg').textContent).toBe(leg);
    act(() => {
      cancel();
    });
    expect(useBoard.getState().placing).toBeNull();
    expect(useBoard.getState().readout).toBeNull();
    expect(getByTestId('board-msg').textContent).toBe('');
    expect(useDocument.getState().doc!.threats[0]!.path.length).toBe(t0.path.length + 1);
  });

  it('a placement without a pathId still draws a new threat', () => {
    const { stage } = mount();
    const threats0 = useDocument.getState().doc!.threats.length;
    act(() =>
      useBoard.getState().set({ placing: { kind: 'aircraft', arch: 'g1-quad-isr', pts: [] } }),
    );
    const [ax, ay] = project(1200, 800);
    click(stage, ax, ay);
    const [bx, by] = project(1500, 400);
    click(stage, bx, by);
    act(() => useUi.getState().signalPath('finish'));
    expect(useDocument.getState().doc!.threats.length).toBe(threats0 + 1);
    expect(useDocument.getState().doc!.threats.at(-1)!.path.length).toBe(2);
  });

  it('time off renders the board with t null; T turns it on', () => {
    const { h } = mount();
    expect(useUi.getState().timeOn).toBe(false);
    const rec = h.last!.rec;
    expect(h.view(rec, { W, H }).view.t).toBeNull();
    act(() => useUi.getState().setTime(30));
    expect(h.view(rec, { W, H }).view.t).toBeNull();
    act(() => useUi.getState().setTimeOn(true));
    expect(h.view(rec, { W, H }).view.t).toBe(30);
  });
});
