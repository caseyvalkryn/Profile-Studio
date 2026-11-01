// Lane 9.2.6: the rail, quick-add, right-click and board commands are registered in Build, the
// stubs they replace are gone, and each keyed one has its key in the Build shortcut sheet.
import { boardCommands } from '../features/build/board/commands';
import { menuCommands } from '../features/build/menu/commands';
import { paletteCommands } from '../features/build/palette/commands';
import { railCommands } from '../features/build/rail/commands';
import { sheetRows } from '../features/commands/sheet';
import { registerCommands } from './commands';
import { activeIn, all, get, shortcutLabel } from './registry';

registerCommands();

const FEATURE = [...railCommands, ...paletteCommands, ...menuCommands, ...boardCommands];

describe('feature command registration', () => {
  it('registers every exported command of the four folders, active in Build', () => {
    for (const c of FEATURE) {
      expect(get(c.id), c.id).toBe(c);
      expect(activeIn(c, 'build'), c.id).toBe(true);
    }
  });

  it('keeps one command per id', () => {
    const ids = all().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('lists each keyed feature command with its key in the Build sheet', () => {
    const rows = sheetRows('build');
    const keyed = FEATURE.filter((c) => c.shortcut);
    expect(keyed.map((c) => c.id).sort()).toEqual(
      [
        'build.addArea',
        'build.addEvent',
        'build.addSensor',
        'build.formation',
        'build.quickAdd',
        'map.gridSnap',
        'view.zoomIn',
        'view.zoomOut',
      ].sort(),
    );
    for (const c of keyed) {
      const row = rows.find((r) => r.ids.includes(c.id));
      expect(row, c.id).toBeDefined();
      expect(row!.keys, c.id).toContain(shortcutLabel(c));
    }
  });

  it('enables 3D and gives K to the readout panel in Build', () => {
    expect(get('view.3d')!.shortcut).toBe('3');
    expect(get('panel.readout')!.shortcut).toBe('K');
    expect(sheetRows('build').some((r) => r.ids.includes('panel.readout'))).toBe(true);
    expect(activeIn(get('panel.readout')!, 'brief')).toBe(false);
  });
});
