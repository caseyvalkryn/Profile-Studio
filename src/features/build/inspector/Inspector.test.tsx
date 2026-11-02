import '../../../ui/test-utils';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import fixture from '../../../../fixtures/legacy-derive/CUAS-001.json';
import { importLegacyV4 } from '../../../domain/migrate';
import { MEASURES } from '../../../domain/measures';
import { previewOf, useDocument } from '../../../state/document';
import { useUi, UI_DEFAULTS } from '../../../state/ui';
import { M_PER_NM } from '../../shared/units';
import Inspector from './Inspector';

const seed = () => importLegacyV4(JSON.parse(JSON.stringify(fixture.input)));
const doc = () => useDocument.getState().doc!;
const history = () => useDocument.getState().history;
const keyOf = (id: string) =>
  [...doc().threats, ...doc().sensors, ...doc().effectors, ...doc().areas, ...doc().events].find(
    (r) => r.id === id,
  )!.key;
const region = (name: string) => screen.getByRole('region', { name });

/** Type a value into a field as one focus: focus, input, blur. */
function type(name: string, ...values: string[]) {
  const input = screen.getByLabelText(name);
  fireEvent.focus(input);
  for (const value of values) fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

beforeEach(() => {
  act(() => useDocument.getState().open(seed()));
  useUi.setState({ ...UI_DEFAULTS });
});

describe('Inspector', () => {
  it('renders every section from CUAS-001 in mockup order', () => {
    render(<Inspector />);
    const names = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
    expect(names).toEqual([
      'Purpose',
      'Aircraft',
      'Paths',
      'Systems',
      'Volumes',
      'Reference planes',
      'Events',
      'Telemetry',
      'Data products',
      'Measures of performance',
      'Site',
    ]);
    expect(screen.getByLabelText('Question')).toHaveValue(doc().questions[0]!.text);
    expect(screen.getByLabelText('Collection')).toHaveValue('Toughstump');
    expect(screen.getByLabelText('Quadrotor ISR aircraft')).toHaveDisplayValue(
      'G1 · Quadrotor ISR',
    );
    expect(within(region('Aircraft')).getByRole('link', { name: 'source' })).toBeInTheDocument();
    expect(
      within(region('Paths')).getByText(
        `Quadrotor ISR · 4 wp · ${Math.round(previewOf(doc()).threats[keyOf('T1')]!.endS)} s`,
      ),
    ).toBeInTheDocument();
    const systems = region('Systems');
    for (const id of ['RDR-1', 'RF-1', 'EO-1', 'EW-1'])
      expect(within(systems).getByRole('button', { name: `Select ${id}` })).toBeInTheDocument();
    expect(within(systems).getByText(/1\.35 nm · 30° at 45°$/)).toBeInTheDocument();
    expect(within(region('Volumes')).getByText('Defended asset · 4 vertices')).toBeInTheDocument();
    expect(screen.getByLabelText('P1 label')).toHaveValue('120 m ceiling');
    const events = within(region('Events'))
      .getAllByRole('button', { name: /^Select e\d$/ })
      .map((b) => b.getAttribute('aria-label'));
    expect(events).toEqual([
      'Select e1',
      'Select e2',
      'Select e3',
      'Select e4',
      'Select e5',
      'Select e6',
    ]);
    expect(screen.getByLabelText('Truth source')).toHaveValue('Platform GPS, 10 Hz');
    expect(screen.getByLabelText('Sample interval')).toHaveValue('20');
    expect(screen.getByLabelText('Stations')).toHaveValue(doc().sensors[0]!.id);
    expect(within(region('Data products')).getAllByRole('textbox')).toHaveLength(4);
    expect(screen.getByLabelText('1.1.2 threshold')).toHaveValue('3000');
    expect(screen.getByLabelText('Units')).toHaveValue('nav');
  });

  it('a row click selects its object, a second click clears it, and only that row expands', () => {
    render(<Inspector />);
    const select = screen.getByRole('button', { name: 'Select RDR-1' });
    fireEvent.click(select);
    expect(useUi.getState().selectedKeys).toEqual([keyOf('RDR-1')]);
    expect(select.parentElement).toHaveAttribute('aria-current', 'true');
    expect(screen.getByLabelText('Range')).toHaveValue((4000 / M_PER_NM).toFixed(2));
    expect(screen.getByLabelText('East (x)')).toBeInTheDocument();
    expect(screen.queryByLabelText('T1 waypoint 1 x')).toBeNull();
    fireEvent.click(select);
    expect(useUi.getState().selectedKeys).toEqual([]);
    expect(select.parentElement).not.toHaveAttribute('aria-current');
    expect(screen.queryByLabelText('Range')).toBeNull();
  });

  it('several selected objects expand no row and show the count (2026-11-02)', () => {
    render(<Inspector />);
    act(() => useUi.getState().setSelection([keyOf('RDR-1'), keyOf('T1')]));
    expect(screen.getByTestId('inspector-many')).toHaveTextContent('2 selected');
    expect(screen.queryByLabelText('Range')).toBeNull();
    act(() => useUi.getState().setSelection([keyOf('RDR-1')]));
    expect(screen.queryByTestId('inspector-many')).toBeNull();
    expect(screen.getByLabelText('Range')).toBeInTheDocument();
  });

  it('a waypoint edit typed key by key is one undo step', () => {
    useUi.setState({ selectedKeys: [keyOf('T1')] });
    render(<Inspector />);
    const before = history().length;
    type('T1 waypoint 1 x', '1', '1.', '1.5');
    expect(history().slice(before)).toEqual(['move T1 waypoint 1']);
    expect(doc().threats[0]!.path[0]!.x).toBeCloseTo(1.5 * M_PER_NM, 0);
    act(() => useDocument.getState().undo());
    expect(doc().threats[0]!.path[0]!.x).toBe(3100);
  });

  it('Enter commits the field, leaves the input, and the next undo is the app undo', () => {
    useUi.setState({ selectedKeys: [keyOf('RDR-1')] });
    render(<Inspector />);
    const before = history().length;
    const range = screen.getByLabelText('Range');
    act(() => range.focus());
    fireEvent.change(range, { target: { value: '2.5' } });
    fireEvent.keyDown(range, { key: 'Enter' });
    expect(document.activeElement).not.toBe(range);
    expect(history().slice(before)).toEqual(['set RDR-1 range']);
    expect(doc().sensors[0]!.rangeM).toBeCloseTo(2.5 * M_PER_NM, 0);
    act(() => useDocument.getState().undo());
    expect(doc().sensors[0]!.rangeM).toBe(4000);
    expect(history()).toHaveLength(before);
  });

  it('Escape reverts the field and adds no step', () => {
    useUi.setState({ selectedKeys: [keyOf('RDR-1')] });
    render(<Inspector />);
    const before = history().length;
    const range = screen.getByLabelText('Range');
    fireEvent.focus(range);
    fireEvent.change(range, { target: { value: '1' } });
    expect(doc().sensors[0]!.rangeM).toBeCloseTo(M_PER_NM, 0);
    fireEvent.keyDown(range, { key: 'Escape' });
    fireEvent.blur(range);
    expect(doc().sensors[0]!.rangeM).toBe(4000);
    expect(history()).toHaveLength(before);
  });

  it('clamps the field of view to 1 to 360 and names the step after the system', () => {
    useUi.setState({ selectedKeys: [keyOf('EO-1')] });
    render(<Inspector />);
    type('EO-1 field of view', '400');
    expect(doc().sensors[2]!.fovDeg).toBe(360);
    type('EO-1 field of view', '0');
    expect(doc().sensors[2]!.fovDeg).toBe(1);
    expect(history().slice(-2)).toEqual(['set EO-1 field of view', 'set EO-1 field of view']);
  });

  it('the measure picker lists all 67 DroneScore measures by step and adds one', () => {
    render(<Inspector />);
    fireEvent.click(screen.getByRole('button', { name: 'Add measure' }));
    const picker = screen.getByRole('group', { name: 'Measure picker' });
    const rows = within(picker).getAllByRole('button', { name: /^Add / });
    expect(MEASURES).toHaveLength(67);
    expect(rows).toHaveLength(67);
    expect(
      within(picker).getByRole('button', { name: 'Add 1.1.1 Probability of Detection' }),
    ).toBeDisabled();
    fireEvent.change(within(picker).getByLabelText('Search measures'), {
      target: { value: 'identification time' },
    });
    fireEvent.click(within(picker).getByRole('button', { name: 'Add 2.1.3t Identification Time' }));
    expect(doc().measures.at(-1)).toEqual({ id: '2.1.3t', op: '<=', threshold: 0, unit: 's' });
    expect(history().at(-1)).toBe('add 2.1.3t');
  });

  it('removing a path removes its events', () => {
    render(<Inspector />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove T1' }));
    expect(doc().threats).toHaveLength(0);
    expect(doc().events).toHaveLength(0);
    expect(history().at(-1)).toBe('remove T1');
  });

  it('retyping an aircraft retypes every path of it', () => {
    render(<Inspector />);
    fireEvent.change(screen.getByLabelText('Quadrotor ISR aircraft'), {
      target: { value: 'g1-fpv-fiber' },
    });
    expect(doc().threats.every((t) => t.type === 'g1-fpv-fiber')).toBe(true);
  });

  it('the event time slider is one undo step per drag', () => {
    useUi.setState({ selectedKeys: [keyOf('e3')] });
    render(<Inspector />);
    const before = history().length;
    const slider = screen.getByLabelText('e3 time slider');
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: '160' } });
    fireEvent.change(slider, { target: { value: '170' } });
    fireEvent.pointerUp(slider);
    expect(doc().events.find((e) => e.id === 'e3')!.tS).toBe(170);
    expect(history().slice(before)).toEqual(['set e3 time']);
  });

  it('the question creates Q-01 when the profile has none', () => {
    act(() => useDocument.getState().edit('clear', (d) => void (d.questions = [])));
    render(<Inspector />);
    type('Question', 'Does the track hold?');
    expect(doc().questions).toEqual([
      expect.objectContaining({ id: 'Q-01', text: 'Does the track hold?' }),
    ]);
  });

  it('shows the stack position "n of m" only while the selected target is in a cycled stack', () => {
    useUi.setState({ selectedKeys: [keyOf('RDR-1')] });
    render(<Inspector />);
    expect(screen.queryByText(/^\d+ of \d+$/)).toBeNull();
    act(() => useUi.getState().setStack({ key: keyOf('RDR-1'), n: 2, m: 4 }));
    expect(screen.getByText('2 of 4')).toBeInTheDocument();
    act(() => useUi.getState().setSelection([keyOf('EW-1')]));
    expect(screen.queryByText('2 of 4')).toBeNull();
  });
});
