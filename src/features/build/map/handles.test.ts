import { testVignette } from '../../../engine/testVignette';
import { useDocument } from '../../../state/document';
import {
  altitudeFromDrag,
  bearingFromDrag,
  dragStep,
  fovFromDrag,
  moveFromDrag,
  rangeFromDrag,
  startDrag,
} from './handles';
import { hitAll } from './hit';

const s = { x: 0, y: 0, bearingDeg: 90 };

describe('handle math', () => {
  it('ring drag sets range, snapped to 10 m; Alt disables snap', () => {
    expect(rangeFromDrag(s, { x: 1234, y: 0 }, false)).toBe(1230);
    expect(rangeFromDrag(s, { x: 1234, y: 0 }, true)).toBe(1234);
    expect(rangeFromDrag(s, { x: 1, y: 0 }, false)).toBe(10);
  });

  it('edge drag sets field of view, twice the angle off the bearing, snapped to 5 degrees', () => {
    // pointer at bearing 060 with the bearing at 090: 30 degrees off, so 60 degrees of view
    const p = { x: Math.sin(Math.PI / 3) * 1000, y: Math.cos(Math.PI / 3) * 1000 };
    expect(fovFromDrag(s, p, false)).toBe(60);
    const q = { x: Math.sin((62 * Math.PI) / 180), y: Math.cos((62 * Math.PI) / 180) };
    expect(fovFromDrag(s, q, false)).toBe(55);
    expect(fovFromDrag(s, q, true)).toBeCloseTo(56, 6);
  });

  it('bearing drag rotates to the pointer bearing, snapped to 1 degree', () => {
    expect(bearingFromDrag(s, { x: 0, y: -100 }, false)).toBe(180);
    const p = { x: Math.sin((45.4 * Math.PI) / 180), y: Math.cos((45.4 * Math.PI) / 180) };
    expect(bearingFromDrag(s, p, false)).toBe(45);
    expect(bearingFromDrag(s, p, true)).toBeCloseTo(45.4, 6);
    expect(bearingFromDrag(s, { x: -1, y: 1000 }, false)).toBe(0);
  });

  it('move snaps the moved position to the 10 m grid', () => {
    expect(moveFromDrag({ x: 100, y: 100 }, { x: 0, y: 0 }, { x: 13, y: -7 }, false)).toEqual({
      x: 110,
      y: 90,
    });
    expect(moveFromDrag({ x: 100, y: 100 }, { x: 0, y: 0 }, { x: 13, y: -7 }, true)).toEqual({
      x: 113,
      y: 93,
    });
  });

  it('Shift-drag altitude rises as the pointer goes up and stays above ground', () => {
    expect(altitudeFromDrag(100, -25, false)).toBe(150);
    expect(altitudeFromDrag(100, 500, false)).toBe(0);
  });
});

describe('hit test', () => {
  const v = testVignette();
  v.sensors[1]!.fovDeg = 60;
  v.sensors[1]!.bearingDeg = 90;
  v.sensors[1]!.x = 0;
  const none = new Map();

  it('finds rings, sector edges, bearing handles, bodies, waypoints, paths and areas', () => {
    expect(hitAll(v, { x: 0, y: -4995 }, 10, [], none)[0]).toMatchObject({
      key: 'k-S-01',
      handle: 'range',
    });
    // EO/IR sector edge at bearing 060, halfway out
    const e = { x: Math.sin(Math.PI / 3) * 1200, y: Math.cos(Math.PI / 3) * 1200 };
    expect(hitAll(v, e, 10, [], none)[0]).toMatchObject({ key: 'k-S-02', handle: 'fov' });
    expect(hitAll(v, { x: 1250, y: 0 }, 10, ['k-S-02'], none)[0]).toMatchObject({
      handle: 'bearing',
    });
    expect(hitAll(v, { x: 1250, y: 0 }, 10, [], none)).toEqual([]);
    expect(hitAll(v, { x: -31, y: -29 }, 10, [], none)[0]).toMatchObject({ target: 'node' });
    expect(hitAll(v, { x: 3, y: 6000 }, 10, [], none)[0]).toMatchObject({ target: 'waypoint' });
    expect(hitAll(v, { x: 2, y: 3000 }, 10, [], none)[0]).toMatchObject({ target: 'threat' });
    expect(hitAll(v, { x: 60, y: -60 }, 10, [], none)[0]).toMatchObject({ target: 'area' });
    const at = new Map([['k-T-02', { x: 500, y: 500 }]]);
    expect(hitAll(v, { x: 505, y: 500 }, 10, [], at)[0]).toMatchObject({
      key: 'k-T-02',
      target: 'threat',
    });
  });
});

describe('drag through the document store', () => {
  beforeEach(() => useDocument.getState().open(testVignette()));

  it('a ring drag is one undo step, with the value shown in display units', () => {
    const doc = useDocument.getState().doc!;
    const hit = { target: 'sensor' as const, key: 'k-S-01', handle: 'range' as const };
    const d = startDrag(doc, hit, { x: 0, y: 5000 }, { x: 0, y: 0 }, false)!;
    const st = useDocument.getState();
    st.beginDrag('Set range');
    let label = '';
    for (const y of [5100, 5300, 5555.5]) {
      const step = dragStep(d, { x: 0, y }, { x: 0, y: 0 }, false, 'si');
      useDocument.getState().updateDrag(step.recipe);
      label = step.label;
    }
    useDocument.getState().endDrag();
    expect(useDocument.getState().doc!.sensors[0]!.rangeM).toBe(5560);
    expect(label).toBe('5.56 km');
    expect(useDocument.getState().history).toEqual(['Set range']);
    useDocument.getState().undo();
    expect(useDocument.getState().doc!.sensors[0]!.rangeM).toBe(5000);
  });

  it('Escape cancels: cancelDrag restores the start', () => {
    const doc = useDocument.getState().doc!;
    const hit = { target: 'waypoint' as const, key: 'T-01-a', handle: 'move' as const };
    const d = startDrag(doc, hit, { x: 0, y: 6000 }, { x: 0, y: 0 }, true)!;
    expect(d.handle).toBe('altitude');
    useDocument.getState().beginDrag('Set altitude');
    const step = dragStep(d, { x: 0, y: 6000 }, { x: 0, y: -50 }, false, 'nav');
    useDocument.getState().updateDrag(step.recipe);
    expect(useDocument.getState().doc!.threats[0]!.path[0]!.z).toBe(200);
    expect(step.label).toBe('656 ft AGL');
    useDocument.getState().cancelDrag();
    expect(useDocument.getState().doc!.threats[0]!.path[0]!.z).toBe(100);
    expect(useDocument.getState().history).toEqual([]);
  });

  it('moves a whole area and a whole threat from the drag start', () => {
    const doc = useDocument.getState().doc!;
    const a = startDrag(
      doc,
      { target: 'area', key: 'k-A-01', handle: 'move' },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      false,
    )!;
    useDocument.getState().beginDrag('Move');
    useDocument
      .getState()
      .updateDrag(dragStep(a, { x: 52, y: 0 }, { x: 0, y: 0 }, false, 'nav').recipe);
    useDocument.getState().endDrag();
    expect(useDocument.getState().doc!.areas[0]!.pts[0]).toEqual([-50, -100]);
  });
});
