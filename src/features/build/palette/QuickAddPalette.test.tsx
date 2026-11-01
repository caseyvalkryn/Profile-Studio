import '../../../ui/test-utils';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import fixture from '../../../../fixtures/legacy-derive/CUAS-001.json';
import { currentContext } from '../../../commands/registry';
import { importLegacyV4 } from '../../../domain/migrate';
import { useDocument } from '../../../state/document';
import { UI_DEFAULTS, useUi } from '../../../state/ui';
import { paletteCommands } from './commands';
import { QuickAddPalette } from './QuickAddPalette';
import { useQuickAdd } from './store';

const seed = () => importLegacyV4(JSON.parse(JSON.stringify(fixture.input)));
const run = (id: string) => {
  const cmd = paletteCommands.find((c) => c.id === id)!;
  const ctx = currentContext();
  expect(cmd.when(ctx)).toBe(true);
  act(() => cmd.run(ctx));
};
const headings = () =>
  [...document.querySelectorAll('[cmdk-group-heading]')].map((h) => h.textContent);
const hostItems = [{ id: 'view.fit', label: 'Fit view', group: 'View', onSelect: vi.fn() }];

describe('QuickAddPalette', () => {
  beforeEach(() => {
    act(() => {
      useUi.setState({ ...UI_DEFAULTS });
      useDocument.getState().open(seed());
      useQuickAdd.setState({ scope: null, boardArmed: null, formationOpen: false });
    });
  });

  it('opens on Sensors for S, Areas for V and Events for E, with values and hints', () => {
    render(<QuickAddPalette items={hostItems} />);
    run('build.addSensor');
    expect(screen.getByRole('dialog', { name: 'Quick add' })).toBeInTheDocument();
    expect(headings()).toEqual(['Sensors']);
    const radar = screen.getByRole('option', { name: /3D radar/ });
    expect(radar).toHaveTextContent('2.16 nm');
    expect(radar).toHaveTextContent('S');
    expect(screen.getByRole('option', { name: /EO\/IR/ })).toHaveTextContent('30°');
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(headings()).toEqual([
      'Threats',
      'Sensors',
      'Effectors',
      'C2 and TSPI',
      'Areas',
      'Height planes',
      'EventsE',
    ]);
    act(() => useUi.getState().setPaletteOpen(false));
    run('build.addArea');
    expect(headings()).toEqual(['Areas']);
    expect(screen.getByRole('option', { name: /Defended asset/ })).toHaveTextContent('V');
    act(() => useUi.getState().setPaletteOpen(false));
    run('build.addEvent');
    expect(headings()).toEqual(['EventsE']);
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toContain('Track init');
  });

  it('A opens every Add group; Cmd+K adds them to the commands; search filters', () => {
    render(<QuickAddPalette items={hostItems} />);
    run('build.quickAdd');
    expect(screen.queryByRole('option', { name: /Fit view/ })).toBeNull();
    expect(screen.getByText('Group 1')).toBeInTheDocument();
    const quad = screen.getByRole('option', { name: /Quadrotor ISR/ });
    expect(quad).toHaveTextContent('23 kt 705 ft');
    act(() => useUi.getState().setPaletteOpen(false));
    expect(useQuickAdd.getState().scope).toBeNull();
    act(() => useUi.getState().setPaletteOpen(true));
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Fit view/ })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'radar' } });
    // The shared cmdk filter is fuzzy and keeps group order: radar stays, Fit view drops out.
    const values = screen.getAllByRole('option').map((o) => o.getAttribute('data-value'));
    expect(values).toContain('add:sensor:radar');
    expect(values).not.toContain('view.fit');
  });

  it('arms placement on pick and closes', () => {
    render(<QuickAddPalette items={hostItems} />);
    run('build.addSensor');
    fireEvent.click(screen.getByRole('option', { name: /3D radar/ }));
    expect(useUi.getState().armed).toEqual({ group: 'sensor', kind: 'radar' });
    expect(useUi.getState().tool).toBe('place');
    expect(useUi.getState().paletteOpen).toBe(false);
  });

  it('adds a height plane at once and an event on the selected threat at the time cursor', () => {
    render(<QuickAddPalette items={hostItems} />);
    run('build.quickAdd');
    fireEvent.click(screen.getByRole('option', { name: /Height plane/ }));
    const doc = useDocument.getState().doc!;
    expect(doc.planes.map((p) => [p.id, p.zM, p.label])).toEqual([
      ['P1', 120, '120 m ceiling'],
      ['P2', 120, '120 m ceiling'],
    ]);
    act(() => {
      useUi.getState().setSelection([doc.threats[0]!.key]);
      useUi.getState().setTime(61.26);
    });
    run('build.addEvent');
    fireEvent.click(screen.getByRole('option', { name: /Identify/ }));
    const ev = useDocument.getState().doc!.events.at(-1)!;
    expect([ev.id, ev.type, ev.tS, ev.label]).toEqual(['e7', 'identify', 61.3, 'Identify']);
    expect(useUi.getState().selectedKeys).toEqual([ev.key]);
  });

  it('hands the board an event arming shape when no threat is selected', () => {
    render(<QuickAddPalette items={hostItems} />);
    run('build.addEvent');
    fireEvent.click(screen.getByRole('option', { name: /Engage/ }));
    expect(useQuickAdd.getState().boardArmed).toEqual({ group: 'event', type: 'engage' });
  });

  it('disables events with a reason when there is no threat', () => {
    act(() => useDocument.getState().edit('clear', (d) => void (d.threats = [])));
    const cmd = paletteCommands.find((c) => c.id === 'build.addEvent')!;
    expect(cmd.when(currentContext())).toBe('Add a threat first');
    render(<QuickAddPalette items={hostItems} />);
    run('build.quickAdd');
    const group = screen.getByText('Needs a threat');
    expect(group).toBeInTheDocument();
    const detect = screen.getByRole('option', { name: /Detect/ });
    expect(detect).toHaveAttribute('aria-disabled', 'true');
    expect(within(detect).getByText('Add a threat first')).toBeInTheDocument();
  });
});
