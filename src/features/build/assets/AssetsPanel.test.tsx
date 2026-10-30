import '../../../ui/test-utils';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { registerCommands } from '../../../commands/commands';
import { bindKeys } from '../../../commands/keys';
import { UI_DEFAULTS, useUi } from '../../../state/ui';
import AssetsPanel from './AssetsPanel';
import { ASSET_MIME, readAssetDrag } from './dnd';
import { LIBRARY, itemSummary, itemTip, sourceName } from './library';
import { compactAltitude as formatAltitude, compactSpeed as formatSpeed } from '../../shared/units';

const rows = (el: HTMLElement) => el.querySelectorAll('[draggable="true"]');
const row = (key: string) => document.querySelector(`[data-asset="${key}"]`) as HTMLElement;

describe('AssetsPanel', () => {
  beforeEach(() => act(() => useUi.setState({ ...UI_DEFAULTS })));

  it('renders the five groups in spec order with their counts', () => {
    render(<AssetsPanel />);
    const sections = screen.getAllByRole('region');
    expect(sections.map((s) => s.getAttribute('aria-label'))).toEqual([
      'Threats',
      'Sensors',
      'Effectors',
      'C2 and TSPI',
      'Areas',
    ]);
    expect(sections.map((s) => rows(s).length)).toEqual([13, 4, 3, 2, 4]);
    const threats = sections[0]!;
    expect(
      within(threats)
        .getAllByRole('group')
        .map((g) => g.getAttribute('aria-label')),
    ).toEqual(['Group 1', 'Group 2', 'Group 3']);
  });

  it('marks the three RF-silent archetypes', () => {
    render(<AssetsPanel />);
    expect(screen.getAllByRole('img', { name: 'RF silent' })).toHaveLength(3);
    expect(within(row('threat:g1-fpv-fiber')).getByRole('img', { name: 'RF silent' })).toBeTruthy();
  });

  it('dragstart sets the MIME payload, copy effect and a ghost', () => {
    render(<AssetsPanel />);
    const store: Record<string, string> = {};
    const dataTransfer = {
      effectAllowed: 'all',
      setData: (t: string, v: string) => (store[t] = v),
      getData: (t: string) => store[t] ?? '',
      setDragImage: vi.fn(),
    };
    fireEvent.dragStart(row('sensor:radar'), { dataTransfer });
    expect(JSON.parse(store[ASSET_MIME]!)).toEqual({ kind: 'sensor', type: 'radar' });
    expect(dataTransfer.effectAllowed).toBe('copy');
    expect(dataTransfer.setDragImage.mock.calls[0]![0].textContent).toBe('RDR');
    fireEvent.dragStart(row('threat:g2-lm-xwing'), { dataTransfer });
    expect(readAssetDrag(dataTransfer as unknown as DataTransfer)).toEqual({
      kind: 'threat',
      type: 'g2-lm-xwing',
    });
  });

  it('click arms with the place tool, a threat with the path tool, and shows the hint', () => {
    render(<AssetsPanel />);
    fireEvent.click(row('effector:kinetic'));
    expect(useUi.getState().armed).toEqual({ group: 'effector', kind: 'kinetic' });
    expect(useUi.getState().tool).toBe('place');
    expect(row('effector:kinetic').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Click the map to place Kinetic effector. Esc cancels.',
    );
    fireEvent.click(row('threat:g1-quad-isr'));
    expect(useUi.getState().armed).toEqual({ group: 'threat', type: 'g1-quad-isr' });
    expect(useUi.getState().tool).toBe('path');
    fireEvent.click(row('threat:g1-quad-isr'));
    expect(useUi.getState().armed).toBeNull();
    expect(useUi.getState().tool).toBe('select');
  });

  it('Escape disarms', () => {
    // Escape reaches the panel's armed item through the one dispatcher (edit.escape).
    registerCommands();
    const unbind = bindKeys(window);
    render(<AssetsPanel />);
    fireEvent.click(row('area:nfz'));
    expect(useUi.getState().armed).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    unbind();
    expect(useUi.getState().armed).toBeNull();
    expect(useUi.getState().tool).toBe('select');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('filter narrows by label, role and group', () => {
    render(<AssetsPanel />);
    const box = screen.getByRole('searchbox', { name: 'Filter assets' });
    fireEvent.change(box, { target: { value: 'radar' } });
    expect(rows(document.body)).toHaveLength(1);
    fireEvent.change(box, { target: { value: 'decoy' } });
    expect(row('threat:g3-foam-decoy')).toBeTruthy();
    expect(rows(document.body)).toHaveLength(1);
    fireEvent.change(box, { target: { value: 'group 1' } });
    expect(rows(document.body)).toHaveLength(4);
  });

  it('collapsed shows five group icons and opens a flyout', () => {
    render(<AssetsPanel collapsed />);
    const icons = document.querySelectorAll('[data-group-icon]');
    expect(icons).toHaveLength(5);
    expect(rows(document.body)).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Sensors' }));
    expect(rows(screen.getByRole('region', { name: 'Sensors' }))).toHaveLength(4);
  });

  it('row speed and altitude follow the units setting', () => {
    render(<AssetsPanel />);
    expect(row('threat:g1-quad-isr')).toHaveTextContent('23 kt · 98 ft to 1,312 ft');
    act(() => useUi.getState().setUnits('si'));
    expect(row('threat:g1-quad-isr')).toHaveTextContent('12 m/s · 30 m to 400 m');
  });
});

describe('format', () => {
  it('converts speed and altitude', () => {
    expect(formatSpeed(10, 'nav')).toBe('19 kt');
    expect(formatSpeed(10, 'si')).toBe('10 m/s');
    expect(formatAltitude(1000, 'nav')).toBe('3,281 ft');
    expect(formatAltitude(1000, 'si')).toBe('1,000 m');
  });
});

describe('library values and tooltips', () => {
  const items = (g: string) => LIBRARY.find((x) => x.id === g)!.items;

  it('shows range and FOV under sensors and effectors in the display unit (F-13)', () => {
    for (const g of ['sensors', 'effectors']) {
      for (const i of items(g)) {
        expect(itemSummary(i, 'nav')).toMatch(/^\d+(\.\d)? nm · \d+°$/);
        expect(itemSummary(i, 'si')).toMatch(/ km · /);
      }
    }
  });

  it('names a threat source by its site, never its full URL (F-11)', () => {
    expect(sourceName('https://www.janes.com/')).toBe('janes.com');
    for (const i of items('threats')) expect(itemTip(i, 'nav')).not.toMatch(/https?:\/\//);
  });
});
