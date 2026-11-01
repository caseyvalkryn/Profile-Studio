import { testVignette } from '../../engine/testVignette';
import { useDocument } from '../../state/document';
import { UI_DEFAULTS, useUi } from '../../state/ui';
import type { MenuItem } from '../../ui/types';
import { menuItemsFor, paletteItems, type ArgRequest } from './adapter';

const byLabel = (items: MenuItem[], label: string) => items.find((i) => i.label === label);

describe('right-click menus from the registry', () => {
  beforeEach(() => {
    useDocument.getState().open(testVignette());
    useUi.setState({ ...UI_DEFAULTS });
  });

  it('empty map: Add here groups into submenus, Fit view shows its shortcut', () => {
    const items = menuItemsFor('map', { pointer: { x: 10, y: 20 }, onArg: () => {}, mac: true });
    const add = byLabel(items, 'Add here')!;
    expect(add.children!.map((c) => c.label)).toEqual([
      'Threats',
      'Sensors',
      'Effectors',
      'C2 and TSPI',
      'Areas',
    ]);
    const sensors = byLabel(add.children!, 'Sensors')!;
    expect(sensors.children!.map((c) => c.label)).toContain('3D radar');
    expect(byLabel(items, 'Fit view')!.shortcut).toBe('F');
  });

  it('M shows on Measure from here in the menu, not on its palette row (review 7.R F-07)', () => {
    const items = menuItemsFor('map', { pointer: { x: 10, y: 20 }, onArg: () => {}, mac: true });
    expect(byLabel(items, 'Measure from here')!.shortcut).toBe('M');
    const palette = paletteItems({ pointer: null, onArg: () => {}, mac: true });
    expect(palette.find((p) => p.id === 'map.measureFrom')?.shortcut).toBeUndefined();
    expect(palette.find((p) => p.id === 'map.measure')?.shortcut).toBe('M');
  });

  it('Add here > Sensors > 3D radar places a radar at the click point', () => {
    const items = menuItemsFor('map', { pointer: { x: 400, y: -250 }, onArg: () => {} });
    const radar = byLabel(
      byLabel(byLabel(items, 'Add here')!.children!, 'Sensors')!.children!,
      '3D radar',
    )!;
    radar.onSelect!();
    const s = useDocument.getState().doc!.sensors.at(-1)!;
    expect(s).toMatchObject({ kind: 'radar', x: 400, y: -250 });
  });

  it('gives a disabled reason when the command cannot run', () => {
    const items = menuItemsFor('map', { pointer: null, onArg: () => {} });
    const paste = byLabel(items, 'Paste here')!;
    expect(paste.disabledReason).toBeTruthy();
    expect(paste.onSelect).toBeUndefined();
    useDocument.getState().close();
    const none = menuItemsFor('threat', { pointer: { x: 0, y: 0 }, onArg: () => {} });
    expect(none.every((i) => i.disabledReason === 'Open a profile first')).toBe(true);
  });

  it('threat menu: shortcuts on Duplicate and Delete, threat types as a submenu', () => {
    useUi.getState().setSelection(['k-T-01']);
    const items = menuItemsFor('threat', { pointer: { x: 0, y: 0 }, onArg: () => {}, mac: true });
    const labels = items.map((i) => i.label);
    expect(labels).toEqual(expect.arrayContaining(['Add waypoint here', 'Set speed', 'Reverse']));
    expect(byLabel(items, 'Change threat type')!.children!.length).toBeGreaterThan(3);
    expect(byLabel(items, 'Duplicate')?.shortcut).toBe('Cmd+D');
    expect(byLabel(items, 'Delete')?.shortcut).toBe('Delete');
  });

  it('a command that needs a value asks for it in display units and runs with SI', () => {
    useUi.getState().setSelection(['k-S-01']);
    let req: ArgRequest | null = null;
    const items = menuItemsFor('sensor', { pointer: null, onArg: (r) => (req = r) });
    byLabel(items, 'Set range')!.onSelect!();
    expect(req).not.toBeNull();
    const r = req as unknown as ArgRequest;
    expect(r.unit).toBe('nm');
    expect(r.value).toBeCloseTo(2.7, 1);
    expect(r.submit(1)).toBe(true);
    expect(useDocument.getState().doc!.sensors[0]!.rangeM).toBeCloseTo(1852, 6);
  });
});
