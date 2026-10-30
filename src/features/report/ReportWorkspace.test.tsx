import '../../ui/test-utils';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { Vignette } from '../../domain/types';
import { run } from '../../engine/run';
import { testVignette } from '../../engine/testVignette';
import { useDocument } from '../../state/document';
import { useRuns } from '../../state/runs';
import { UI_DEFAULTS, useUi } from '../../state/ui';
import { SECTIONS } from './draft';
import ReportWorkspace, { NO_RUN, SCOPE_LEAD } from './ReportWorkspace';

const LOCKED = '2026-10-30T14:05:00.000Z';
const doc = () => useDocument.getState().doc!;

function withHypothesis(over: Partial<Vignette> = {}): Vignette {
  return testVignette({
    questions: [{ key: 'q1', id: 'Q-01', text: 'Does the radar find the quadrotor?', note: '' }],
    hypotheses: [
      {
        key: 'h1',
        id: 'H-01',
        question: 'q1',
        measure: '1.1.1',
        op: '>=',
        value: 90,
        prediction: { low: 80, high: 100 },
        lockedAt: null,
      },
    ],
    ...over,
  });
}

function withRun(): Vignette {
  const base = withHypothesis();
  const rows = run(base, 10, 7).rows;
  return {
    ...base,
    hypotheses: base.hypotheses.map((h) => ({ ...h, lockedAt: LOCKED })),
    runs: [
      {
        key: 'run-1',
        id: 'R-1',
        createdAt: LOCKED,
        n: 10,
        seed: 7,
        rows,
        predictions: [{ hypothesis: 'h1', low: 80, high: 100 }],
      },
    ],
  };
}

beforeEach(() => {
  useUi.setState({ ...UI_DEFAULTS });
  useRuns.setState({ results: {}, order: [], activeKey: null, compareKeys: [] });
});

describe('ReportWorkspace', () => {
  it('renders the seven sections in order with their titles', () => {
    useDocument.getState().open(withRun());
    render(<ReportWorkspace />);
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titles).toEqual([
      '1. Question',
      '2. Hypothesis and prediction',
      '3. Setup',
      '4. Results',
      '5. Evaluation',
      '6. Scope of inference',
      '7. Next test',
    ]);
    expect(SECTIONS).toHaveLength(7);
    expect(screen.getByText(/After action report \(AAR\)/)).toBeInTheDocument();
  });

  it('lists each asset in the factor table', () => {
    const v = withRun();
    useDocument.getState().open(v);
    render(<ReportWorkspace />);
    const setup = screen.getByRole('region', { name: '3. Setup' });
    for (const a of [...v.threats, ...v.sensors, ...v.effectors])
      expect(within(setup).getByText(a.id)).toBeInTheDocument();
    expect(within(setup).getByText('Map snapshot')).toBeInTheDocument();
    expect(within(setup).getByText('n 10, seed 7')).toBeInTheDocument();
  });

  it('commits a note on blur as one undo step', () => {
    useDocument.getState().open(withRun());
    render(<ReportWorkspace />);
    const box = screen.getByLabelText('Note: Next test');
    fireEvent.change(box, { target: { value: 'Add a second radar.' } });
    fireEvent.blur(box);
    expect(useDocument.getState().history).toEqual(['Edit report note']);
    expect(doc().report.sections?.next).toBe('Add a second radar.');
    act(() => useDocument.getState().undo());
    expect(doc().report.sections?.next ?? '').toBe('');
  });

  it('reads legacy aar: notes and charts once and moves them on the next write', () => {
    const v = withRun();
    v.report.slides = [
      { key: 'brief-1', name: 'Brief', caption: '', notes: '' },
      { key: 'aar:scope', name: 'aar:scope', caption: '', notes: 'Day only.' },
      { key: 'aar:charts', name: 'aar:charts', caption: '1.1.2', notes: '' },
    ];
    useDocument.getState().open(v);
    render(<ReportWorkspace />);
    expect(screen.getByLabelText('Note: Scope of inference')).toHaveValue('Day only.');
    expect(screen.getByRole('checkbox', { name: /1\.1\.2/ })).toBeChecked();
    const box = screen.getByLabelText('Note: Next test');
    fireEvent.change(box, { target: { value: 'Night.' } });
    fireEvent.blur(box);
    expect(doc().report.sections).toEqual({ scope: 'Day only.', next: 'Night.' });
    expect(doc().report.charts).toEqual(['1.1.2']);
    expect(doc().report.slides.map((s) => s.key)).toEqual(['brief-1']);
  });

  it('states the prediction stored with the run, not the live hypothesis', () => {
    const v = withRun();
    v.hypotheses = v.hypotheses.map((h) => ({ ...h, prediction: { low: 10, high: 20 } }));
    useDocument.getState().open(v);
    render(<ReportWorkspace />);
    const evaluation = screen.getByRole('region', { name: '5. Evaluation' });
    expect(within(evaluation).getByText('80.0 to 100.0 %')).toBeInTheDocument();
  });

  it('toggles a picked chart and renders it through renderChart', () => {
    useDocument.getState().open(withRun());
    const renderChart = vi.fn((id: string, key: string) => <p>chart {`${id} ${key}`}</p>);
    render(<ReportWorkspace renderChart={renderChart} />);
    const box = screen.getByRole('checkbox', { name: /1\.1\.2/ });
    fireEvent.click(box);
    expect(box).toBeChecked();
    expect(doc().report.charts).toEqual(['1.1.2']);
    expect(renderChart).toHaveBeenCalledWith('1.1.2', 'run-1');
    expect(screen.getByText('chart 1.1.2 run-1')).toBeInTheDocument();
    renderChart.mockClear();
    fireEvent.click(box);
    expect(box).not.toBeChecked();
    expect(renderChart).not.toHaveBeenCalled();
  });

  it('lists the factors in the scope-of-inference text', () => {
    const v = withRun();
    useDocument.getState().open(v);
    render(<ReportWorkspace />);
    const scope = screen.getByRole('region', { name: '6. Scope of inference' });
    expect(within(scope).getByText(SCOPE_LEAD)).toBeInTheDocument();
    const items = within(scope)
      .getAllByRole('listitem')
      .map((li) => li.textContent ?? '');
    for (const a of [...v.threats, ...v.sensors, ...v.effectors])
      expect(items.some((t) => t.includes(a.id))).toBe(true);
    expect(items.some((t) => t.includes('decision 5 s, assignment 3 s'))).toBe(true);
    expect(items.some((t) => t.includes('n 10, seed 7'))).toBe(true);
  });

  it('shows the lock time when a run exists', () => {
    useDocument.getState().open(withRun());
    render(<ReportWorkspace />);
    expect(screen.getByTestId('lock-H-01')).toHaveTextContent(
      'Prediction locked 2026-10-30 14:05 UTC.',
    );
    expect(screen.queryByText(NO_RUN)).toBeNull();
    const evaluation = screen.getByRole('region', { name: '5. Evaluation' });
    expect(within(evaluation).getByText('H-01')).toBeInTheDocument();
  });

  it('says the prediction locks at the first run when there is no run', () => {
    useDocument.getState().open(withHypothesis());
    render(<ReportWorkspace />);
    expect(screen.getByText(NO_RUN)).toBeInTheDocument();
    expect(screen.queryByTestId('lock-H-01')).toBeNull();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
  });

  it('calls window.print from Export PDF', () => {
    useDocument.getState().open(withRun());
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<ReportWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
    expect(print).toHaveBeenCalledOnce();
    print.mockRestore();
  });
});
