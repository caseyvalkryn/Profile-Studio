import { readFileSync } from 'node:fs';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import '../../../ui/test-utils';
import { testVignette } from '../../../engine/testVignette';
import { useDocument } from '../../../state/document';
import { UI_DEFAULTS, useUi } from '../../../state/ui';
import MapView from './MapView';
import { instances, workerUrl, type FakeSource } from './__mocks__/maplibre-gl';

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
});
