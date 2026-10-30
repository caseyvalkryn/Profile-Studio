import { testVignette } from '../engine/testVignette';
import { useDocument } from '../state/document';
import { useRuns } from '../state/runs';
import { UI_DEFAULTS, useUi } from '../state/ui';
import { MENU_TARGETS } from './commands';
import { all, byShortcut, currentContext, execute, forTarget, shortcutLabel } from './registry';

/** Spec section 8, Keys, in canonical form. */
const SPEC_KEYS = [
  'Mod+K',
  'Mod+Z',
  'Shift+Mod+Z',
  'Delete',
  'Escape',
  'Space',
  'ArrowLeft',
  'ArrowRight',
  'Shift+ArrowLeft',
  'Shift+ArrowRight',
  'Mod+D',
  'Mod+C',
  'Mod+V',
  'Mod+Enter',
  'F',
  'M',
  'U',
  '1',
  '2',
  '?',
];

/** Spec section 8, Right-click menus: every item label by target. */
const SPEC_MENUS: Record<string, string[]> = {
  map: ['Paste here', 'Measure from here', 'Set time here', 'Fit view'],
  threat: [
    'Add waypoint here',
    'Change threat type',
    'Set speed',
    'Set altitude for all',
    'Reverse',
    'Duplicate',
    'Delete',
  ],
  waypoint: ['Hold +30 s', 'Insert after', 'Set altitude', 'Delete'],
  sensor: ['Make sector', 'Make omni', 'Set range', 'Duplicate', 'Delete'],
  effector: ['Make sector', 'Make omni', 'Set range', 'Duplicate', 'Delete'],
  area: ['Set top', 'Add vertex here', 'Duplicate', 'Delete'],
  timeline: ['Set time here', 'Loop from here'],
};

beforeEach(() => {
  useDocument.getState().close();
  useUi.setState(UI_DEFAULTS);
  useRuns.setState({ results: {}, order: [], activeKey: null, compareKeys: [], sweep: null });
});

describe('command registry', () => {
  it('every command has an id, a label and a group', () => {
    expect(all().length).toBeGreaterThan(40);
    for (const c of all()) {
      expect(c.id).toBeTruthy();
      expect(c.label).toBeTruthy();
      expect(['file', 'edit', 'view', 'time', 'map', 'run', 'help']).toContain(c.group);
    }
  });

  it('every when returns true or a non-empty reason for an empty context', () => {
    const ctx = currentContext(null);
    for (const c of all()) {
      const r = c.when(ctx);
      if (r !== true) expect(typeof r === 'string' && r.length > 0, c.id).toBe(true);
    }
    expect(execute('edit.undo', ctx)).toBe('Nothing to undo');
    expect(execute('edit.delete', ctx)).toBe('Open a vignette first');
  });

  it('no two commands share a shortcut', () => {
    const s = all()
      .map((c) => c.shortcut)
      .filter(Boolean);
    expect(new Set(s).size).toBe(s.length);
  });

  it('registers every shortcut in the spec keys table', () => {
    for (const k of SPEC_KEYS) expect(byShortcut(k), k).toBeDefined();
  });

  it('registers every right-click item in the spec menus table', () => {
    for (const [kind, labels] of Object.entries(SPEC_MENUS)) {
      const have = forTarget(kind as never).map((c) => c.label);
      for (const l of labels) expect(have, `${kind}: ${l}`).toContain(l);
    }
    const addHere = forTarget('map').filter((c) => c.submenu?.startsWith('Add here'));
    expect(new Set(addHere.map((c) => c.submenu))).toEqual(
      new Set([
        'Add here > Threats',
        'Add here > Sensors',
        'Add here > Effectors',
        'Add here > C2 and TSPI',
        'Add here > Areas',
      ]),
    );
  });

  it('forTarget returns only commands whose kinds include the kind', () => {
    for (const k of MENU_TARGETS) for (const c of forTarget(k)) expect(c.kinds).toContain(k);
  });

  it('labels shortcuts per platform', () => {
    const redo = byShortcut('Shift+Mod+Z')!;
    expect(shortcutLabel(redo, true)).toBe('Shift+Cmd+Z');
    expect(shortcutLabel(redo, false)).toBe('Shift+Ctrl+Z');
    expect(shortcutLabel(byShortcut('ArrowLeft')!, true)).toBe('Left');
  });
});

describe('commands edit the document', () => {
  beforeEach(() => useDocument.getState().open(testVignette()));

  it('Add radar here places a radar at the pointer, and one undo removes it', () => {
    const n = useDocument.getState().doc!.sensors.length;
    expect(execute('map.add.radar', currentContext({ x: 120, y: -40 }))).toBe(true);
    const s = useDocument.getState().doc!.sensors.at(-1)!;
    expect(s).toMatchObject({ kind: 'radar', x: 120, y: -40 });
    expect(useUi.getState().selectedKeys).toEqual([s.key]);
    useDocument.getState().undo();
    expect(useDocument.getState().doc!.sensors).toHaveLength(n);
  });

  it('set range without arg does nothing; with arg edits the selection', () => {
    const key = useDocument.getState().doc!.sensors[0]!.key;
    useUi.getState().setSelection([key]);
    execute('system.setRange', currentContext());
    expect(useDocument.getState().canUndo).toBe(false);
    execute('system.setRange', currentContext(), 1234);
    expect(useDocument.getState().doc!.sensors[0]!.rangeM).toBe(1234);
  });

  it('delete removes the selection and duplicate copies it', () => {
    const t = useDocument.getState().doc!.threats[0]!;
    useUi.getState().setSelection([t.key]);
    execute('edit.duplicate', currentContext());
    expect(useDocument.getState().doc!.threats).toHaveLength(3);
    const copy = useDocument.getState().doc!.threats[2]!;
    expect(copy.key).not.toBe(t.key);
    expect(copy.path[0]!.key).not.toBe(t.path[0]!.key);
    useUi.getState().setSelection([t.key]);
    execute('edit.delete', currentContext());
    expect(useDocument.getState().doc!.threats.map((x) => x.key)).not.toContain(t.key);
  });
});
