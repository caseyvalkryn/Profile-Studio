import { testVignette } from '../engine/testVignette';
import { useDocument } from '../state/document';
import { useRuns } from '../state/runs';
import { UI_DEFAULTS, useUi } from '../state/ui';
import { DEFAULT_RUN_N, DEFAULT_THREAT_TYPE, MENU_TARGETS } from './commands';
import {
  all,
  byShortcut,
  currentContext,
  execute,
  forTarget,
  get,
  inWorkspace,
  menuShortcutLabel,
  shortcutLabel,
} from './registry';

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
  // Clear loop is not a spec row; lane 4.5 adds it so the loop range can be removed.
  timeline: ['Set time here', 'Loop from here', 'Clear loop'],
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
    expect(execute('edit.delete', ctx)).toBe('Open a profile first');
  });

  it('no two commands active in one workspace share a shortcut', () => {
    for (const w of ['library', 'build', 'results', 'report', 'brief'] as const) {
      const s = inWorkspace(w)
        .map((c) => c.shortcut)
        .filter(Boolean);
      expect(new Set(s).size, w).toBe(s.length);
    }
  });

  it('every shortcutFrom names a keyed command and binds no key of its own', () => {
    const hinted = all().filter((c) => c.shortcutFrom);
    expect(hinted.map((c) => c.id)).toContain('map.measureFrom');
    for (const c of hinted) {
      expect(c.shortcut, c.id).toBeUndefined();
      expect(get(c.shortcutFrom!)?.shortcut, c.id).toBeTruthy();
    }
  });

  it('Measure from here shows M in the context menu only; M runs the Measure tool (7 1a, 7.R F-07)', () => {
    expect(menuShortcutLabel(get('map.measureFrom')!)).toBe('M');
    expect(menuShortcutLabel({ id: 'map.measureFrom' })).toBe('M');
    expect(shortcutLabel(get('map.measureFrom')!)).toBe('');
    expect(shortcutLabel(get('map.measure')!)).toBe('M');
    expect(byShortcut('M')?.id).toBe('map.measure');
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

  it('orders each menu by the spec table', () => {
    const map = forTarget('map').map((c) => c.label);
    const addHere = forTarget('map').filter((c) => c.submenu?.startsWith('Add here')).length;
    expect(map.slice(0, addHere).every((l) => l.startsWith('Add '))).toBe(true);
    // Add height plane is the legacy row after Add (menuCommands, lane 9.2.6); not a spec row.
    expect(map.slice(addHere)).toEqual(['Add height plane', ...SPEC_MENUS.map!]);
    // Lane 9.2.6 registers the legacy rows (menuCommands); the spec rows keep their order.
    for (const kind of ['threat', 'waypoint', 'sensor', 'area', 'timeline']) {
      const spec = SPEC_MENUS[kind]!;
      const have = forTarget(kind as never).map((c) => c.label);
      expect(have.filter((l) => spec.includes(l))).toEqual(spec);
    }
  });

  it('Add threat here lists the 13 archetypes by UAS group', () => {
    const cmd = forTarget('map').find((c) => c.id === 'map.add.threat')!;
    expect(cmd.options).toHaveLength(13);
    expect(new Set(cmd.options!.map((o) => o.group))).toEqual(
      new Set(['Group 1', 'Group 2', 'Group 3']),
    );
    expect(cmd.options![0]!.value).toBe(DEFAULT_THREAT_TYPE);
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

  it('Add threat here uses the archetype arg, else the default', () => {
    execute('map.add.threat', currentContext({ x: 0, y: 0 }), 'g3-jet-owa');
    expect(useDocument.getState().doc!.threats.at(-1)!.type).toBe('g3-jet-owa');
    execute('map.add.threat', currentContext({ x: 0, y: 0 }));
    expect(useDocument.getState().doc!.threats.at(-1)!.type).toBe(DEFAULT_THREAT_TYPE);
  });

  it('delete refuses to leave a path under two waypoints', () => {
    const t = useDocument.getState().doc!.threats[0]!;
    useDocument.getState().edit('trim', (d) => {
      d.threats[0]!.path = d.threats[0]!.path.slice(0, 2);
    });
    const [a, b] = useDocument.getState().doc!.threats[0]!.path;
    useUi.getState().setSelection([a!.key]);
    expect(execute('edit.delete', currentContext())).toBe('A flight path needs two waypoints');
    useUi.getState().setSelection([a!.key, b!.key, t.key]);
    expect(execute('edit.delete', currentContext())).toBe(true);
  });

  it('delete removes a TSPI node from the truth station keys', () => {
    const node = {
      key: 'n1',
      id: 'TSPI-1',
      kind: 'tspi' as const,
      x: 0,
      y: 0,
      z: 0,
      rangeM: 0,
      fovDeg: 0,
      bearingDeg: 0,
    };
    useDocument.getState().edit('add', (d) => {
      d.nodes.push(node);
      d.report.truth.stationKeys = ['n1', 'other'];
    });
    useUi.getState().setSelection(['n1']);
    expect(execute('edit.delete', currentContext())).toBe(true);
    expect(useDocument.getState().doc!.report.truth.stationKeys).toEqual(['other']);
  });

  it('only one of Make sector and Make omni is active for one system', () => {
    const s = useDocument.getState().doc!.sensors[0]!;
    useDocument.getState().edit('sector', (d) => {
      d.sensors[0]!.fovDeg = 90;
    });
    useUi.getState().setSelection([s.key]);
    expect(execute('system.makeSector', currentContext())).toBe('Already a sector');
    expect(execute('system.makeOmni', currentContext())).toBe(true);
    expect(execute('system.makeOmni', currentContext())).toBe('Already omni');
    expect(execute('system.makeSector', currentContext())).toBe(true);
    expect(execute('system.makeSector', currentContext())).toBe('Already a sector');
  });

  it('a locked prediction cannot be edited', () => {
    useDocument.getState().edit('add', (d) => {
      d.hypotheses.push({
        key: 'h1',
        id: 'H-01',
        question: '',
        measure: '1.1.2',
        op: '>=',
        value: 0.9,
        prediction: null,
        lockedAt: null,
      });
    });
    useUi.getState().setSelection(['h1']);
    expect(execute('hypothesis.setPrediction', currentContext(), { low: 0.7, high: 0.9 })).toBe(
      true,
    );
    expect(useDocument.getState().doc!.hypotheses[0]!.prediction).toEqual({ low: 0.7, high: 0.9 });
    useDocument.getState().apply('Lock', (d) => {
      d.hypotheses[0]!.lockedAt = '2026-10-30T00:00:00Z';
    });
    expect(execute('hypothesis.setPrediction', currentContext(), { low: 0, high: 1 })).toBe(
      'Prediction locked at first run',
    );
  });

  it('Run sweep says why without a sweep factor, then starts the stored sweep (review 6 F-02)', () => {
    expect(execute('run.sweep', currentContext())).toBe('This profile has no sweep factor');
    const calls: unknown[] = [];
    const original = useRuns.getState().startSweep;
    useRuns.setState({
      startSweep: (factors, n, seed) => {
        calls.push({ factors, n, seed });
        return Promise.resolve('k');
      },
    });
    try {
      useDocument.getState().edit('Sweep', (d) => {
        d.sweep = { factors: [{ kind: 'threat-altitude', levels: [30, 400] }] };
      });
      expect(execute('run.sweep', currentContext())).toBe(true);
      expect(calls).toEqual([
        { factors: [{ kind: 'threat-altitude', levels: [30, 400] }], n: DEFAULT_RUN_N, seed: 1 },
      ]);
      expect(all().find((c) => c.id === 'run.sweep')?.group).toBe('run');
    } finally {
      useRuns.setState({ startSweep: original });
    }
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
