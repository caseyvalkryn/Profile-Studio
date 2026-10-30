import { vi } from 'vitest';
import { testVignette } from '../../../engine/testVignette';
import { useDocument } from '../../../state/document';
import { UI_DEFAULTS, useUi } from '../../../state/ui';
import { MapController } from './controller';
import { drawStep, type PathDraft } from './pathDraw';

vi.mock('maplibre-gl', () => import('./__mocks__/maplibre-gl'));

describe('path drawing state machine', () => {
  it('start, click, click, finish commits three points', () => {
    let d: PathDraft | null = drawStep(null, { t: 'start', type: 'x', p: { x: 0, y: 0 } }).draft;
    d = drawStep(d, { t: 'click', p: { x: 100, y: 0 }, tolM: 5 }).draft;
    d = drawStep(d, { t: 'click', p: { x: 100, y: 0.5 }, tolM: 5 }).draft; // double-click repeat
    d = drawStep(d, { t: 'click', p: { x: 100, y: 100 }, tolM: 5 }).draft;
    const r = drawStep(d, { t: 'finish' });
    expect(r.draft).toBeNull();
    expect(r.commit!.points).toHaveLength(3);
  });

  it('cancel commits nothing', () => {
    const d = drawStep(null, { t: 'start', type: 'x', p: { x: 0, y: 0 } }).draft;
    expect(drawStep(d, { t: 'cancel' })).toEqual({ draft: null, commit: null });
  });
});

describe('path drawing on the map', () => {
  let el: HTMLDivElement;
  let ctl: MapController;

  beforeEach(async () => {
    useDocument.getState().open(testVignette());
    useUi.setState({ ...UI_DEFAULTS });
    el = document.createElement('div');
    document.body.appendChild(el);
    ctl = new MapController(el, document.createElement('div'), document.createElement('div'));
    const { instances } = await import('./__mocks__/maplibre-gl');
    instances.at(-1)!.fire('load');
  });

  afterEach(() => {
    ctl.destroy();
    el.remove();
  });

  const key = (k: string) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

  it('threat drop, click, click, Enter: one new threat with 3 waypoints, one undo step', () => {
    ctl.place({ group: 'threat', type: 'g1-quad-isr' }, { x: 0, y: 3000 });
    expect(useUi.getState().tool).toBe('path');
    ctl.click({ x: 1000, y: 3000 }, null, false);
    ctl.click({ x: 1000, y: 1000 }, null, false);
    key('Enter');
    const doc = useDocument.getState().doc!;
    expect(doc.threats).toHaveLength(3);
    const t = doc.threats[2]!;
    expect(t.path.map((w) => [w.x, w.y])).toEqual([
      [0, 3000],
      [1000, 3000],
      [1000, 1000],
    ]);
    expect(t.id).toBe('T1');
    expect(useDocument.getState().history).toEqual(['Add threat']);
    expect(useUi.getState()).toMatchObject({ tool: 'select', selectedKeys: [t.key] });
  });

  it('Escape cancels with no document change', () => {
    const before = useDocument.getState().doc;
    ctl.place({ group: 'threat', type: 'g1-quad-isr' }, { x: 0, y: 3000 });
    ctl.click({ x: 1000, y: 3000 }, null, false);
    key('Escape');
    expect(useDocument.getState().doc).toBe(before);
    expect(useDocument.getState().history).toEqual([]);
    expect(ctl.drawing).toBeNull();
    expect(useUi.getState().tool).toBe('select');
  });

  it('armed click places the armed item and returns to select', () => {
    useUi.getState().setArmed({ group: 'effector', kind: 'ew' });
    useUi.getState().setTool('place');
    ctl.click({ x: 250, y: 250 }, null, false);
    expect(useDocument.getState().doc!.effectors.at(-1)).toMatchObject({ kind: 'ew', x: 250 });
    expect(useUi.getState()).toMatchObject({ tool: 'select', armed: null });
  });

  it('click on empty map clears the selection; Shift adds', () => {
    useUi.getState().setSelection(['k-S-01']);
    ctl.click({ x: 0, y: 0 }, { target: 'sensor', key: 'k-S-02', handle: 'move' }, true);
    expect(useUi.getState().selectedKeys).toEqual(['k-S-01', 'k-S-02']);
    ctl.click({ x: 9000, y: 9000 }, null, false);
    expect(useUi.getState().selectedKeys).toEqual([]);
  });
});
