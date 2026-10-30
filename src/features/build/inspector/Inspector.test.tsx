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
    expect(screen.getByLabelText('Range')).toHaveValue(
      String(Math.round((5000 / M_PER_NM) * 1000) / 1000),
    );
    expect(screen.getAllByText('nm').length).toBeGreaterThan(0);
    act(() => useUi.getState().setUnits('si'));
    expect(screen.getByLabelText('Range')).toHaveValue('5');
    expect(screen.getAllByText('km').length).toBeGreaterThan(0);
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
