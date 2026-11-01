import '../../../ui/test-utils';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { testVignette } from '../../../engine/testVignette';
import { useDocument } from '../../../state/document';
import { useUi, UI_DEFAULTS } from '../../../state/ui';
import Inspector from './Inspector';
import { M_PER_NM } from '../../shared/units';

const doc = () => useDocument.getState().doc!;
const history = () => useDocument.getState().history;

function commit(label: string, value: string) {
  const input = screen.getByLabelText(label);
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

/** Each field row of a section as "label suffix", in order. */
function rows(section: string): string[] {
  const sec = screen.getByRole('region', { name: section });
  return [...sec.querySelectorAll('label')].map((l) => {
    const suf = l.parentElement?.querySelector('span.font-mono');
    return [l.textContent, suf?.textContent].filter(Boolean).join(' ');
  });
}

function addPlaneAndEvent() {
  act(() =>
    useDocument.getState().edit('add', (d) => {
      d.planes.push({ key: 'k-P-01', id: 'P-01', label: 'floor', zM: 120 });
      d.events.push({
        key: 'k-EV-01',
        id: 'EV-01',
        tS: 30,
        type: 'detect',
        label: 'first detect',
        threatKey: 'k-T-01',
        sensorKey: 'k-S-01',
      });
    }),
  );
}

beforeEach(() => {
  useDocument.getState().open(testVignette());
  useUi.setState({ ...UI_DEFAULTS });
});

describe('Inspector', () => {
  it('shows the stack position "n of m" only while the selected target is in a cycled stack (7.R F-11)', () => {
    useUi.setState({ selectedKeys: ['k-S-01'] });
    render(<Inspector />);
    expect(screen.queryByText(/\d+ of \d+/)).toBeNull();
    act(() => useUi.getState().setStack({ key: 'k-S-01', n: 2, m: 4 }));
    expect(screen.getByText('2 of 4')).toBeInTheDocument();
    act(() => useUi.getState().setSelection(['k-E-01']));
    expect(screen.queryByText('2 of 4')).toBeNull();
  });

  it('renders each kind with its fields in legacy order and units', () => {
    useUi.setState({ selectedKeys: ['k-S-01'] });
    const { rerender } = render(<Inspector />);
    expect(rows('Sensor')).toEqual([
      'Id',
      'Kind',
      'x nm',
      'y nm',
      'Height ft AGL',
      'Range nm',
      'Minimum range nm',
      'Field of view deg',
      'Bearing deg',
      'Elevation min deg',
      'Elevation max deg',
    ]);
    act(() => useUi.getState().setSelection(['k-E-01']));
    rerender(<Inspector />);
    expect(rows('Effector')).toEqual([
      'Id',
      'Kind',
      'x nm',
      'y nm',
      'Height ft AGL',
      'Range nm',
      'Field of view deg',
      'Bearing deg',
      'Time to effect s',
      'Pk',
    ]);
    act(() => useUi.getState().setSelection(['k-N-01']));
    expect(rows('Node')).toEqual([
      'Id',
      'Kind',
      'x nm',
      'y nm',
      'Height ft AGL',
      'Range nm',
      'Field of view deg',
      'Bearing deg',
    ]);
    act(() => useUi.getState().setSelection(['k-T-01']));
    expect(rows('Threat')).toEqual(['Id', 'Type', 'Group', 'Speed kt']);
    expect(screen.getByRole('columnheader', { name: 'Height ft' })).toBeInTheDocument();
    act(() => useUi.getState().setSelection(['k-A-01']));
    expect(rows('Area')).toEqual(['Id', 'Kind', 'Label', 'Bottom ft', 'Top ft']);
    addPlaneAndEvent();
    act(() => useUi.getState().setSelection(['k-P-01']));
    expect(rows('Height plane')).toEqual(['Id', 'Label', 'Height ft AGL']);
    act(() => useUi.getState().setSelection(['k-EV-01']));
    expect(rows('Event')).toEqual(['Id', 'Type', 'Label', 'Path', 'Time s', 'System']);
  });

  it('shows sensor range in nm under nav units and in km under SI', () => {
    useUi.setState({ selectedKeys: ['k-S-01'] });
    render(<Inspector />);
    expect(screen.getByLabelText('Range')).toHaveValue('2.70');
    act(() => useUi.getState().setUnits('si'));
    expect(screen.getByLabelText('Range')).toHaveValue('5.00');
    expect(rows('Sensor')).toContain('Range km');
  });

  it('writes a field commit as one undo step with the legacy label', () => {
    useUi.setState({ selectedKeys: ['k-S-01'] });
    render(<Inspector />);
    const before = history().length;
    commit('Range', '3');
    expect(doc().sensors[0]!.rangeM).toBeCloseTo(3 * M_PER_NM, 6);
    expect(history()).toHaveLength(before + 1);
    expect(history().at(-1)).toBe('set S-01 range');
    act(() => useDocument.getState().undo());
    expect(doc().sensors[0]!.rangeM).toBe(5000);
  });

  it('sets a node field of view as one undo step (legacy 51-panel-inspector.js:211)', () => {
    useUi.setState({ selectedKeys: ['k-N-01'] });
    render(<Inspector />);
    const before = history().length;
    commit('Field of view', '360');
    expect(doc().nodes[0]!.fovDeg).toBe(360);
    expect(history()).toHaveLength(before + 1);
    expect(history().at(-1)).toBe('set N-01 field of view');
  });

  it('shows the legacy words for a value it cannot read and writes nothing', () => {
    useUi.setState({ selectedKeys: ['k-S-01'] });
    render(<Inspector />);
    const before = history().length;
    commit('Range', 'far');
    expect(screen.getByText('Type a number, for example 2km or 900ft.')).toBeInTheDocument();
    expect(history()).toHaveLength(before);
  });

  it('accepts unit suffixes in a field', () => {
    useUi.setState({ selectedKeys: ['k-S-01'] });
    render(<Inspector />);
    commit('Range', '4km');
    expect(doc().sensors[0]!.rangeM).toBe(4000);
  });

  it('adds, edits and deletes waypoints, warning under two', () => {
    useUi.setState({ selectedKeys: ['k-T-01'] });
    render(<Inspector />);
    commit('Waypoint 1 height', '500');
    expect(doc().threats[0]!.path[0]!.z).toBeCloseTo(152.4, 1);
    expect(history().at(-1)).toBe('set T-01 waypoint 1 height');
    expect(screen.getByLabelText('Insert after waypoint 2')).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Insert after waypoint 1'));
    expect(doc().threats[0]!.path).toHaveLength(3);
    expect(doc().threats[0]!.path[1]!.y).toBe(2900);
    expect(history().at(-1)).toBe('insert T-01 waypoint 2');
    fireEvent.click(screen.getByLabelText('Delete waypoint 3'));
    fireEvent.click(screen.getByLabelText('Delete waypoint 2'));
    expect(doc().threats[0]!.path).toHaveLength(1);
    expect(screen.getByText('T-01 needs two waypoints.')).toBeInTheDocument();
    expect(screen.getByLabelText('Delete waypoint 1')).toBeDisabled();
  });

  it('adds, edits and deletes vertices, keeping three', () => {
    useUi.setState({ selectedKeys: ['k-A-01'] });
    render(<Inspector />);
    commit('Vertex 1 x', '-0.1');
    expect(doc().areas[0]!.pts[0]![0]).toBeCloseTo(-0.1 * M_PER_NM, 1);
    expect(screen.getByLabelText('Delete vertex 1')).not.toBeDisabled();
    fireEvent.click(screen.getByLabelText('Delete vertex 4'));
    expect(doc().areas[0]!.pts).toHaveLength(3);
    expect(screen.getByLabelText('Delete vertex 1')).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Insert after vertex 3'));
    expect(doc().areas[0]!.pts).toHaveLength(4);
  });

  it('reads an event time as m:ss or seconds', () => {
    addPlaneAndEvent();
    useUi.setState({ selectedKeys: ['k-EV-01'] });
    render(<Inspector />);
    commit('Time', '2:55');
    expect(doc().events[0]!.tS).toBe(175);
    expect(history().at(-1)).toBe('set EV-01 time');
    commit('Time', '95');
    expect(doc().events[0]!.tS).toBe(95);
    commit('Time', 'soon');
    expect(screen.getByText('Type a time as 2:55 or 175.')).toBeInTheDocument();
    expect(doc().events[0]!.tS).toBe(95);
  });

  it('lists group members and selects one on click', () => {
    act(() =>
      useDocument.getState().edit('group', (d) => {
        d.threats[0]!.group = 'A';
        d.threats[1]!.group = 'A';
      }),
    );
    useUi.setState({ selectedKeys: ['group:A'] });
    render(<Inspector />);
    const members = screen.getByRole('region', { name: 'Members' });
    fireEvent.click(within(members).getByRole('button', { name: 'Select T-02' }));
    expect(useUi.getState().selectedKeys).toEqual(['k-T-02']);
  });

  it('refuses a rename to an id in use and says why', () => {
    useUi.setState({ selectedKeys: [doc().threats[0]!.key] });
    render(<Inspector />);
    commit('Id', 'T-02');
    expect(screen.getByText('T-02 is in use. Pick another id.')).toBeInTheDocument();
    expect(doc().threats[0]!.id).toBe('T-01');
    commit('Id', 'T-09');
    expect(doc().threats[0]!.id).toBe('T-09');
    expect(history().at(-1)).toBe('rename T-01');
  });

  it('shows the profile and telemetry when nothing is selected', () => {
    render(<Inspector />);
    expect(screen.getByLabelText('Name')).toHaveValue('test vignette');
    expect(screen.getByLabelText('Collection')).toHaveValue('site');
    commit('Name', 'range day');
    expect(doc().name).toBe('range day');
    expect(history().at(-1)).toBe('set profile name');
    commit('Stations', 'S-01, X-9');
    expect(screen.getByText('X-9 is not a system id.')).toBeInTheDocument();
  });
});
