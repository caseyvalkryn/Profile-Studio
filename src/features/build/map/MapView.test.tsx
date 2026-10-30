import { act, render } from '@testing-library/react';
import { vi } from 'vitest';
import '../../../ui/test-utils';
import { testVignette } from '../../../engine/testVignette';
import { useDocument } from '../../../state/document';
import { UI_DEFAULTS, useUi } from '../../../state/ui';
import MapView from './MapView';
import { instances, type FakeSource } from './__mocks__/maplibre-gl';

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
});
