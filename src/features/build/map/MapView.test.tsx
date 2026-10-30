import { readFileSync } from 'node:fs';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import '../../../ui/test-utils';
import { testVignette } from '../../../engine/testVignette';
import { useDocument } from '../../../state/document';
import { UI_DEFAULTS, useUi } from '../../../state/ui';
import MapView from './MapView';
import { instances, workerUrl, type FakeSource } from './__mocks__/maplibre-gl';
import { makeFrame } from './frame';
import { estimateLabelSize } from './labels';

vi.mock('maplibre-gl', () => import('./__mocks__/maplibre-gl'));

const flush = () => new Promise((r) => requestAnimationFrame(() => r(null)));

describe('MapView', () => {
  beforeEach(() => {
    useDocument.getState().open(testVignette());
    useUi.setState({ ...UI_DEFAULTS });
  });

  it('creates the map once, fills the sources, and updates only what changed', async () => {
    const { unmount } = render(<MapView />);
    const map = instances.at(-1)!;
    act(() => map.fire('load'));
    const src = (n: string) => map.getSource(n) as FakeSource;
    const data = (n: string) => (src(n).data as { features: unknown[] }).features;
    expect(data('sensors')).toHaveLength(2);
    expect(data('areas')).toHaveLength(1);
    expect(data('grid').length).toBeGreaterThan(0);
    await act(flush);
    expect(data('threats')).toHaveLength(2);

    const pathsCalls = src('paths').calls;
    const sensorCalls = src('sensors').calls;
    act(() =>
      useDocument.getState().edit('Set range', (d) => {
        d.sensors[0]!.rangeM = 1000;
      }),
    );
    expect(src('sensors').calls).toBe(sensorCalls + 1);
    expect(src('paths').calls).toBe(pathsCalls);
    expect(instances.at(-1)).toBe(map);

    act(() => useUi.getState().setSelection(['k-S-01']));
    expect(data('highlight').length).toBeGreaterThan(0);

    unmount();
    expect(map.removed).toBe(true);
  });

  it('labels assets by display id', async () => {
    const { container } = render(<MapView />);
    act(() => instances.at(-1)!.fire('load'));
    await act(flush);
    const labels = [...container.querySelectorAll('[data-label="asset"]')].map(
      (e) => e.textContent,
    );
    expect(labels).toEqual(expect.arrayContaining(['S-01', 'S-02', 'E-01', 'N-01']));
  });

  it('fills its box: the map div is absolutely sized and MapLibre CSS sits below utilities (F-01)', () => {
    render(<MapView />);
    expect(screen.getByTestId('map-canvas').className).toMatch(/\babsolute\b.*\binset-0\b/);
    const css = readFileSync('src/styles/base.css', 'utf8');
    expect(css).toMatch(/@import 'maplibre-gl\/dist\/maplibre-gl\.css' layer\(base\);/);
    const view = readFileSync('src/features/build/map/MapView.tsx', 'utf8');
    expect(view).not.toMatch(/import 'maplibre-gl\/dist\/maplibre-gl\.css'/);
  });

  it('points MapLibre at the bundled worker before it creates the map (F-02)', () => {
    render(<MapView />);
    expect(workerUrl).toMatch(/maplibre-gl-worker\.mjs/);
  });

  it('opens the map menu on right-click even when MapLibre prevents the event (F-03)', async () => {
    render(<MapView />);
    const map = instances.at(-1)!;
    act(() => map.fire('load'));
    await act(flush);
    // MapLibre's rotate handler calls preventDefault on contextmenu in the bubble phase.
    map.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    fireEvent.contextMenu(map.canvas, { clientX: 790, clientY: 10 });
    const menu = await screen.findByRole('menu');
    expect(menu.textContent).toContain('Add here');
  });

  it('stacks the labels of co-located assets instead of overprinting them (F-12)', async () => {
    act(() =>
      useDocument.getState().edit('Co-locate', (d) => {
        for (const a of [...d.sensors, ...d.effectors, ...d.nodes]) {
          a.x = 0;
          a.y = 0;
        }
      }),
    );
    const { container } = render(<MapView />);
    act(() => instances.at(-1)!.fire('load'));
    await act(flush);
    const ys = [...container.querySelectorAll<HTMLElement>('[data-label="asset"]')].map(
      (e) => e.style.transform,
    );
    expect(ys.length).toBeGreaterThan(2);
    expect(new Set(ys).size).toBe(ys.length);
  });

  it('places stacked labels so no two overlap (3c)', async () => {
    act(() =>
      useDocument.getState().edit('Co-locate', (d) => {
        for (const a of [...d.sensors, ...d.effectors, ...d.nodes]) {
          a.x = 0;
          a.y = 0;
        }
      }),
    );
    const { container } = render(<MapView />);
    act(() => instances.at(-1)!.fire('load'));
    await act(flush);
    const boxes = [...container.querySelectorAll<HTMLElement>('[data-label]')]
      .filter((e) => e.dataset.label !== 'grid')
      .map((e) => {
        const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(e.style.transform)!;
        return { x: Number(m[1]), y: Number(m[2]), ...estimateLabelSize(e.textContent ?? '') };
      });
    expect(boxes.length).toBeGreaterThan(4);
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i]!, boxes[j]!];
        const hit = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(hit, `labels ${i} and ${j} overlap`).toBe(false);
      }
  });

  it('a repeat click on stacked assets cycles the selection; a drag moves the selected one (FR-01)', async () => {
    useDocument.getState().open(testVignette({ threats: [] }));
    render(<MapView />);
    const map = instances.at(-1)!;
    act(() => map.fire('load'));
    await act(flush);
    const doc = useDocument.getState().doc!;
    const o = map.project(makeFrame(doc.site).toLngLat(0, 0));
    const at = { clientX: o.x, clientY: o.y, button: 0 };
    const click = () => {
      fireEvent.mouseDown(map.canvas, at);
      fireEvent.mouseUp(window, at);
      return useUi.getState().selectedKeys;
    };
    // At the fake map's scale (about 9 m a pixel) S-01, S-02, E-01 and N-01 all lie within the
    // 8 px tolerance of the origin, inside the defended asset A-01.
    const order = ['k-S-01', 'k-S-02', 'k-E-01', 'k-N-01', 'k-A-01', 'k-S-01', 'k-S-02', 'k-E-01'];
    expect(order.map(() => click()[0])).toEqual(order);

    // a drag from the stack moves the selected effector, not the radar on top
    fireEvent.mouseDown(map.canvas, at);
    fireEvent.mouseMove(window, { clientX: o.x + 40, clientY: o.y });
    fireEvent.mouseUp(window, { clientX: o.x + 40, clientY: o.y });
    const after = useDocument.getState().doc!;
    expect(after.effectors[0]!.x).not.toBe(0);
    expect(after.sensors[0]).toMatchObject({ x: 0, y: 0 });
    // the drag does not count as a click: the next click on the stack keeps the effector
    expect(useUi.getState().selectedKeys).toEqual(['k-E-01']);
  });
});
