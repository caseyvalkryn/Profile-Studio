import { act } from '@testing-library/react';
import fixture from '../../../../fixtures/legacy-derive/CUAS-001.json';
import { currentContext } from '../../../commands/registry';
import { importLegacyV4 } from '../../../domain/migrate';
import { useDocument } from '../../../state/document';
import { UI_DEFAULTS, useUi } from '../../../state/ui';
import { applyFormation } from '../palette/formation';
import { actionsFor, runAction, targetContext, toMenuItems } from './actions';
import { CARDS_LATER, setEventWarnings, type MenuContext } from './commands';

const seed = () => importLegacyV4(JSON.parse(JSON.stringify(fixture.input)));
const doc = () => useDocument.getState().doc!;
const keyOf = (id: string) =>
  [...doc().threats, ...doc().sensors, ...doc().areas, ...doc().planes, ...doc().events].find(
    (r) => r.id === id,
  )!.key;
const labels = (kind: Parameters<typeof actionsFor>[0], id?: string) =>
  actionsFor(kind, id ? { key: keyOf(id) } : {}, currentContext()).map((a) => a.label);
const reason = (list: ReturnType<typeof actionsFor>, label: string) =>
  list.find((a) => a.label === label)?.disabledReason;

describe('actionsFor', () => {
  beforeEach(() => {
    act(() => {
      useUi.setState({ ...UI_DEFAULTS });
      useDocument.getState().open(seed());
    });
    setEventWarnings(() => []);
  });

  it('lists the spec items per kind in order, with Copy and Paste after a separator', () => {
    expect(labels('threat', 'T1')).toEqual([
      'Add event here',
      'Formation',
      'Split here',
      'Merge',
      'Add waypoint here',
      'Change type',
      'Set speed',
      'Set altitude for all',
      'Reverse',
      'Duplicate',
      'Delete',
      'Copy',
      'Paste',
    ]);
    // Make sector and Make omni are either-or: RDR-1 is omni, EO-1 is a 30 degree sector.
    expect(labels('sensor', 'RDR-1').slice(0, 2)).toEqual(['Make sector', 'Set range']);
    expect(labels('sensor', 'EO-1').slice(0, 2)).toEqual(['Make omni', 'Set range']);
    expect(labels('area', 'DA')).toEqual([
      'Set top',
      'Set bottom',
      'Add vertex here',
      'Duplicate',
      'Delete',
      'Copy',
      'Paste',
    ]);
    // No Copy or Paste on planes and events: edit.copy copies assets only (lane 9.2.6).
    expect(labels('plane', 'P1')).toEqual(['Set height', 'Delete']);
    expect(labels('event', 'e1')).toEqual(['Change type', 'Delete']);
    expect(labels('timeline')).toEqual([
      'Set time here',
      'Loop from here',
      'Clear loop',
      'Add event here',
    ]);
    const map = labels('map');
    expect(map.slice(-7)).toEqual([
      'Add',
      'Add height plane',
      'Paste here',
      'Measure from here',
      'Set time here',
      'Fit view',
      'Save card',
    ]);
    expect(map[0]).toBe('Add threat here');
    const threat = actionsFor('threat', { key: keyOf('T1') }, currentContext());
    expect(threat.find((a) => a.label === 'Copy')?.separatorBefore).toBe(true);
  });

  it('gives each disabled item its reason; Split needs a group and a time cursor', () => {
    const t1 = actionsFor('threat', { key: keyOf('T1') }, currentContext());
    expect(reason(t1, 'Split here')).toBe('Select a threat in a group');
    expect(reason(t1, 'Merge')).toBe('Merge needs two or more groups');
    act(() =>
      useDocument.getState().edit('formation', (d) => {
        applyFormation(d, keyOf('T1'), 3, 120, 'A');
      }),
    );
    const noCursor: MenuContext = { ...currentContext(), tCursor: null };
    const split = actionsFor('group', { letter: 'A' }, noCursor);
    expect(split.map((a) => a.label)).toEqual([
      'Split here',
      'Merge',
      'Delete group',
      'Copy',
      'Paste',
    ]);
    expect(reason(split, 'Split here')).toBe('Set the time cursor to split the group.');
    // Three threats 120 m apart sit inside the data link: one cluster, so no split.
    const atSixty: MenuContext = { ...currentContext(), tCursor: 60 };
    const at = actionsFor('group', { letter: 'A' }, atSixty);
    expect(reason(at, 'Split here')).toMatch(/^Group A is one cluster at /);
    for (const a of actionsFor('card', {}, currentContext()).slice(0, 6))
      expect(a.disabledReason).toBe(CARDS_LATER);
    expect(reason(actionsFor('map', {}, currentContext()), 'Save card')).toBe(CARDS_LATER);
  });

  it('shows Move to geometry only when the event has a warning', () => {
    const e1 = keyOf('e1');
    setEventWarnings(() => [{ eventKey: e1, tGeoS: 31.5, text: 'e1 is before first see' }]);
    expect(labels('event', 'e1')).toEqual(['Change type', 'Move to geometry', 'Delete']);
    act(
      () =>
        void runAction(
          'event.moveToGeometry',
          targetContext('event', { key: e1 }, currentContext()),
        ),
    );
    expect(doc().events.find((e) => e.key === e1)!.tS).toBe(31.5);
  });

  it('runs items: Add height plane, Set height through the number prompt, Change type', () => {
    act(() => void runAction('map.addHeightPlane', currentContext()));
    expect(doc().planes.map((p) => p.id)).toEqual(['P1', 'P2']);
    const p1 = keyOf('P1');
    const onArg = vi.fn();
    const items = toMenuItems(actionsFor('plane', { key: p1 }, currentContext()), {
      context: () => ({ ...currentContext(), ui: { ...useUi.getState(), selectedKeys: [p1] } }),
      onArg,
    });
    expect(items.map((i) => i.label)).toEqual(['Set height', 'Delete']);
    act(() => items[0]!.onSelect!());
    const req = onArg.mock.calls[0]![0];
    expect([req.title, req.label, req.unit, req.value]).toEqual([
      'Set height',
      'Height',
      'ft AGL',
      393.7,
    ]);
    act(() => void req.submit(500));
    expect(doc().planes[0]!.zM).toBeCloseTo(152.4, 1);
    const ev = toMenuItems(actionsFor('event', { key: keyOf('e1') }, currentContext()), {
      context: () => ({
        ...currentContext(),
        ui: { ...useUi.getState(), selectedKeys: [keyOf('e1')] },
      }),
      onArg,
    });
    const engage = ev[0]!.children!.find((c) => c.label === 'Engage')!;
    act(() => engage.onSelect!());
    expect(doc().events.find((e) => e.id === 'e1')!.type).toBe('engage');
  });
});
