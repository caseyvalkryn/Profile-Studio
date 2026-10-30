import '../../../ui/test-utils';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { testVignette } from '../../../engine/testVignette';
import { useDocument } from '../../../state/document';
import { useUi, UI_DEFAULTS } from '../../../state/ui';
import { MEASURES } from '../../../domain/measures';
import Inspector from './Inspector';
import { enteredRows } from './enteredRows';
import { M_PER_FT, M_PER_NM } from '../../shared/units';

const doc = () => useDocument.getState().doc!;

function commit(label: string, value: string) {
  const input = screen.getByLabelText(label);
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

beforeEach(() => {
  useDocument.getState().open(testVignette());
  useUi.setState({ ...UI_DEFAULTS });
});

describe('Inspector', () => {
  it('shows the vignette header when nothing is selected', () => {
    render(<Inspector />);
    expect(screen.getByLabelText('Name')).toHaveValue('test vignette');
    expect(screen.getByLabelText('Site name')).toHaveValue('site');
    expect(screen.getByLabelText('Decision time')).toHaveValue('5');
    expect(screen.getByLabelText('Assignment time')).toHaveValue('3');
    expect(screen.getByText(/feed the Target step/)).toBeInTheDocument();
  });

  it('shows sensor range in nm under nav units and in km under SI', () => {
    useUi.setState({ selectedKeys: ['k-S-01'] });
    render(<Inspector />);
    // Unfocused fields show readout precision (F-09): 5000 m is 2.70 nm.
    expect(screen.getByLabelText('Range')).toHaveValue((5000 / M_PER_NM).toFixed(2));
    expect(screen.getAllByText('nm').length).toBeGreaterThan(0);
    act(() => useUi.getState().setUnits('si'));
    expect(screen.getByLabelText('Range')).toHaveValue('5.00');
    expect(screen.getAllByText('km').length).toBeGreaterThan(0);
  });

  it('shows ground elevation in ft MSL, not AGL (F-06)', () => {
    render(<Inspector />);
    const el = screen.getByLabelText('Ground elevation');
    expect(document.getElementById(el.getAttribute('aria-describedby')!)).toHaveTextContent(
      'ft MSL',
    );
  });

  it('shows Pfa in exponent notation (F-07)', () => {
    act(() =>
      useDocument.getState().edit('Set Pfa', (d) => {
        const pd = d.sensors[0]!.model.pd;
        if (pd.kind === 'swerling') pd.pfa = 1e-6;
      }),
    );
    useUi.setState({ selectedKeys: ['k-S-01'] });
    render(<Inspector />);
    expect(screen.getByLabelText('Pfa')).toHaveValue('1e-6');
  });

  it('lays waypoint fields two to a row so values fit (F-05)', () => {
    useUi.setState({ selectedKeys: [doc().threats[0]!.key] });
    render(<Inspector />);
    const grid = screen.getByLabelText('WP 1 x').closest('.grid');
    expect(grid).toHaveClass('grid-cols-2');
    expect(screen.getByLabelText('WP 1 x')).toHaveClass('min-w-[6ch]');
  });

  it('writes metres for a range commit as one labelled undo step', () => {
    useUi.setState({ selectedKeys: ['k-S-01'] });
    render(<Inspector />);
    const before = useDocument.getState().history.length;
    commit('Range', '3');
    expect(doc().sensors[0]!.rangeM).toBeCloseTo(3 * M_PER_NM, 6);
    expect(useDocument.getState().history).toHaveLength(before + 1);
    expect(useDocument.getState().history.at(-1)).toBe('Set range');
    act(() => useDocument.getState().undo());
    expect(doc().sensors[0]!.rangeM).toBe(5000);
  });

  it('stores an entered value and its source under the DroneScore id', () => {
    useUi.setState({ selectedKeys: ['k-S-01'] });
    render(<Inspector />);
    commit('1.8 Resolution', '12');
    expect(doc().sensors[0]!.entered['1.8']).toEqual({ value: 12, source: '' });
    expect(screen.getByText(/No source note/)).toBeInTheDocument();
    commit('Source, 1.8', 'Vendor sheet rev C, p. 4');
    expect(doc().sensors[0]!.entered['1.8']).toEqual({
      value: 12,
      source: 'Vendor sheet rev C, p. 4',
    });
    expect(screen.queryByText(/No source note/)).toBeNull();
  });

  it('writes a waypoint altitude edit as metres', () => {
    useUi.setState({ selectedKeys: ['k-T-01'] });
    render(<Inspector />);
    commit('WP 1 alt', '500');
    expect(doc().threats[0]!.path[0]!.z).toBeCloseTo(500 * M_PER_FT, 6);
    expect(useDocument.getState().history.at(-1)).toBe('Set waypoint altitude');
  });

  it('refuses a rename to an id in use and says why', () => {
    useUi.setState({ selectedKeys: ['k-T-01'] });
    render(<Inspector />);
    const before = useDocument.getState().history.length;
    commit('Id', 'T-02');
    expect(doc().threats[0]!.id).toBe('T-01');
    expect(useDocument.getState().history).toHaveLength(before);
    expect(screen.getByText('T-02 is already in use.')).toBeInTheDocument();
    commit('Id', 'T-09');
    expect(doc().threats[0]!.id).toBe('T-09');
    expect(useDocument.getState().history.at(-1)).toBe('Rename');
  });
});

describe('Inspector hypotheses (review 6 F-03, F-10)', () => {
  const h1 = {
    key: 'h1',
    id: 'H-01',
    question: '',
    measure: '1.1.2',
    op: '>=' as const,
    value: 3000,
    prediction: null,
    lockedAt: null,
  };

  it('lists each hypothesis in display units and sets its prediction through the fields', () => {
    act(() =>
      useDocument.getState().edit('Add hypothesis', (d) => {
        d.hypotheses.push({ ...h1 });
      }),
    );
    render(<Inspector />);
    const row = screen.getByRole('button', { name: /H-01 1\.1\.2 .* ≥ 1\.62 nm/ });
    fireEvent.click(row);
    expect(useUi.getState().selectedKeys).toEqual(['h1']);
    commit('Prediction low', '1.5');
    commit('Prediction high', '2');
    const p = doc().hypotheses[0]!.prediction!;
    expect(p.low).toBeCloseTo(1.5 * M_PER_NM, 6);
    expect(p.high).toBeCloseTo(2 * M_PER_NM, 6);
  });

  it('a locked hypothesis shows its fields read-only', () => {
    act(() =>
      useDocument.getState().edit('Add hypothesis', (d) => {
        d.hypotheses.push({
          ...h1,
          prediction: { low: 2800, high: 3600 },
          lockedAt: '2026-10-30T17:40:00Z',
        });
      }),
    );
    useUi.setState({ selectedKeys: ['h1'] });
    render(<Inspector />);
    expect(screen.getByLabelText('Prediction low')).toBeDisabled();
    expect(screen.getByLabelText('Threshold')).toBeDisabled();
    expect(screen.getByText(/Locked at the first run/)).toBeInTheDocument();
  });
});

describe('enteredRows', () => {
  it('offers every entered row on at least one asset group, and only entered rows', () => {
    const offered = new Set(
      [...enteredRows('sensor'), ...enteredRows('effector')].map((m) => m.id),
    );
    const entered = MEASURES.filter((m) => m.sourceClass === 'entered').map((m) => m.id);
    expect([...offered].sort()).toEqual([...entered].sort());
    expect(enteredRows('sensor').some((m) => m.id === 'INT-1')).toBe(true);
    expect(enteredRows('effector').some((m) => m.id === '1.3')).toBe(false);
  });
});
