import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sweep } from '../../engine/sweep';
import { testVignette } from '../../engine/testVignette';
import { useDocument } from '../../state/document';
import { useRuns } from '../../state/runs';
import { useUi } from '../../state/ui';
import { chartSvg } from './ChartFrame';
import { serializeSvg } from './export';
import { MeasureChart } from './MeasureChart';
import ResultsWorkspace from './ResultsWorkspace';
import { SweepChart } from './SweepChart';
import { entry, resultsVignette } from './testData';

beforeAll(() => {
  // recharts reads ResizeObserver; jsdom has none.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const v = resultsVignette();
const a = entry('k-a', v, 7);
const b = entry('k-b', v, 11);

function seed(compareKeys: string[] = []) {
  act(() => {
    useDocument.setState({ doc: v });
    useRuns.setState({
      results: { 'k-a': a, 'k-b': b },
      order: ['k-a', 'k-b'],
      activeKey: 'k-a',
      compareKeys,
      sweep: null,
    });
    useUi.setState({ units: 'nav' });
  });
}

beforeEach(() => seed());
afterEach(() => {
  useRuns.setState({ results: {}, order: [], activeKey: null, compareKeys: [], sweep: null });
  useDocument.setState({ doc: null });
});

const row = (id: string) => document.querySelector<HTMLElement>(`tr[data-measure="${id}"]`)!;
const before = (x: Node, y: Node) =>
  (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe('ResultsWorkspace', () => {
  it('groups scorecard rows by F2T2EA step in order and shows every column', () => {
    render(<ResultsWorkspace />);
    const steps = [...document.querySelectorAll('tr[data-step]')].map((r) =>
      r.getAttribute('data-step'),
    );
    expect(steps).toEqual(['find', 'fix', 'track', 'target', 'engage', 'assess', 'system']);
    const head = (s: string) => document.querySelector(`tr[data-step="${s}"]`)!;
    expect(before(head('find'), row('1.1.2')) && before(row('1.1.2'), head('fix'))).toBe(true);
    expect(before(head('fix'), row('1.2.1')) && before(row('1.2.1'), head('track'))).toBe(true);
    expect(before(head('assess'), row('3.1.2')) && before(row('3.1.2'), head('system'))).toBe(true);
    expect(before(head('system'), row('4.2.1'))).toBe(true);

    const r = within(row('1.1.2'));
    r.getByText('1.1.2');
    r.getByText('Detection Range (ground)');
    r.getByText(/^\d+\.\d{2,4} nm$/); // value, nav units
    r.getByText(/^\[\d+\.\d{2,4}, \d+\.\d{2,4}\]$/); // interval
    r.getByText('≥ 1.62 nm'); // 3000 m threshold
    r.getByText('Meets');
    r.getByText('Simulated');
    // Target shows the decision inputs, no measure.
    screen.getByText(/decision 5 s/);
    // A measure outside the settings is listed as unscored, behind a closed toggle.
    expect(row('1.1.3')).toBeNull();
    const more = within(document.querySelector<HTMLElement>('tr[data-unscored-toggle="find"]')!);
    fireEvent.click(more.getByRole('button', { name: /^\d+ more measures?$/ }));
    expect(row('1.1.3').hasAttribute('data-unscored')).toBe(true);
  });

  it('a null score shows plain text, not the engine note, and a not simulated row shows its class', () => {
    render(<ResultsWorkspace />);
    within(row('2.1.4')).getByText(
      'Not simulated. The model does not produce a wrong identification.',
    );
    expect(document.body.textContent).not.toMatch(/identified_ok|stage_reached|rangeboard/);
    within(row('4.2.1')).getByText('Not simulated');
    within(row('4.2.1')).getByText('Inconclusive');
  });

  it('shows only the runs and sweep of the open vignette (review 6 F-01)', () => {
    act(() =>
      useRuns.setState({
        sweep: { key: 's', docId: v.id, factors: [], status: 'running', result: null, error: null },
      }),
    );
    act(() => useDocument.setState({ doc: { ...v, id: 'V-other', runs: [] } }));
    render(<ResultsWorkspace />);
    expect(screen.getByText('No run yet. Run the profile from Build.')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Scorecard' })).toBeNull();
    expect(screen.queryByText('Sweep running.')).toBeNull();
  });

  it('clicking a row shows its chart with title and subtitle', () => {
    render(<ResultsWorkspace />);
    fireEvent.click(row('1.1.2'));
    expect(screen.getByTestId('chart-title').textContent).toBe('1.1.2 Detection Range (ground)');
    expect(screen.getByTestId('chart-subtitle').textContent).toMatch(
      /^Meets: \d+\.\d{2,4} nm \[[\d., ]+\] against ≥ 1\.62 nm$/,
    );
    fireEvent.click(row('1.1.1'));
    expect(screen.getByTestId('chart-title').textContent).toBe(
      'H-01: 1.1.1 Probability of Detection ≥ 10 %',
    );
  });

  it('the hypotheses block shows Meets for a locked hypothesis whose score meets', () => {
    render(<ResultsWorkspace />);
    const h = document.querySelector<HTMLElement>('[data-hypothesis="H-01"]')!;
    within(h).getByText('Meets');
    within(h).getByText(/^Locked /);
    within(h).getByText('[50, 100]');
  });

  it('compare shows two runs and a difference column', () => {
    seed(['k-a', 'k-b']);
    render(<ResultsWorkspace />);
    const t = screen.getByRole('table', { name: 'Run compare' });
    expect(
      within(t)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual(['Measure', 'Run 1', 'Run 2', 'Difference against Run 1']);
    const diff = within(t).getAllByTestId('difference');
    expect(diff.length).toBeGreaterThan(0);
    expect(diff[0]!.textContent).toMatch(/%, intervals (do not )?overlap$/);
  });
});

describe('charts', () => {
  it('a one-factor sweep with 3 levels renders 3 points', () => {
    const s = sweep(testVignette(), [{ kind: 'threat-altitude', levels: [50, 150, 300] }], 5, 1);
    const { container } = render(<SweepChart sweep={s} units="si" width={640} height={260} />);
    expect(container.querySelectorAll('.recharts-line-dots circle')).toHaveLength(3);
    expect(screen.getByTestId('chart-title').textContent).toBe(
      '1.1.1 Probability of Detection against threat altitude',
    );
    // The y axis carries the measure's display unit (first-use FR-08), inside the chart.
    const yTitle = container.querySelector('.recharts-yAxis .recharts-label');
    expect(yTitle?.textContent).toBe('1.1.1, %');
    expect(Number(yTitle?.getAttribute('x'))).toBeGreaterThanOrEqual(8);
    expect(yTitle?.getAttribute('transform')).toMatch(/rotate\(-90/);
  });

  it('the caption names the band only when the band can be seen (review 7.R F-20)', () => {
    const base = sweep(testVignette(), [{ kind: 'threat-altitude', levels: [50, 150, 300] }], 5, 1);
    const withBand = (half: number) => ({
      ...base,
      cells: base.cells.map((c) => ({
        ...c,
        scores: c.scores.map((sc, i) =>
          i === 0 ? { ...sc, value: 50, interval: { low: 50 - half, high: 50 + half } } : sc,
        ),
      })),
    });
    const { unmount } = render(<SweepChart sweep={withBand(0.05)} units="si" />);
    expect(screen.queryByText(/Band: 95 % interval\./)).toBeNull();
    screen.getByText(/95 % interval: too narrow to see at this scale/);
    unmount();
    render(<SweepChart sweep={withBand(20)} units="si" />);
    screen.getByText(/Band: 95 % interval\./);
  });

  it('a two-factor sweep draws a heat map cell per level pair', () => {
    const s = sweep(
      testVignette(),
      [
        { kind: 'threat-speed', levels: [10, 20] },
        { kind: 'sensor-range', levels: [3000, 5000], target: 'S-01' },
      ],
      2,
      1,
    );
    const { container } = render(<SweepChart sweep={s} units="si" width={400} />);
    expect(container.querySelectorAll('[data-cell]')).toHaveLength(4);
  });

  it('SVG export contains the title text', () => {
    const sc = a.result!.scores.find((s) => s.id === '1.1.2')!;
    const { container } = render(<MeasureChart score={sc} rows={a.result!.rows} units="nav" />);
    const svg = chartSvg(container)!;
    const text = serializeSvg(svg, {
      title: '1.1.2 Detection Range (ground)',
      subtitle: 'Meets',
    });
    expect(text.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(text).toContain('1.1.2 Detection Range (ground)');
    expect(text).toContain('<rect');
    expect(
      new DOMParser().parseFromString(text, 'image/svg+xml').querySelector('parsererror'),
    ).toBeNull();
  });
  // PNG export draws on a canvas; jsdom has none, so svgToPng is checked in the browser only.
});
