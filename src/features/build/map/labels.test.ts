import {
  LABEL_DX,
  LABEL_DY,
  estimateLabelSize,
  placeLabels,
  type LabelBox,
  type Obstacle,
} from './labels';

const box = (key: string, x: number, y: number, text = key): LabelBox => ({
  key,
  anchor: { x, y },
  ...estimateLabelSize(text),
});

function overlapping(items: LabelBox[], at: Map<string, { x: number; y: number }>): string[] {
  const out: string[] = [];
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]!;
      const b = items[j]!;
      const p = at.get(a.key)!;
      const q = at.get(b.key)!;
      if (p.x < q.x + b.w && q.x < p.x + a.w && p.y < q.y + b.h && q.y < p.y + a.h)
        out.push(`${a.key}/${b.key}`);
    }
  return out;
}

describe('label placement (3c)', () => {
  it('leaves a lone label right of its anchor', () => {
    const at = placeLabels([box('RDR-1', 100, 50)]);
    expect(at.get('RDR-1')).toEqual({ x: 100 + LABEL_DX, y: 50 + LABEL_DY });
  });

  it('moves later stacked labels to the next free slot: right, left, below, above', () => {
    const items = ['RDR-1', 'EW-1', 'KIN-1', 'RF-1'].map((k) => box(k, 200, 200));
    const at = placeLabels(items);
    const [r, l, b, a] = items.map((i) => at.get(i.key)!);
    expect(r).toEqual({ x: 208, y: 204 });
    expect(l!.x + items[1]!.w).toBeLessThanOrEqual(200 - LABEL_DX); // left of the anchor
    expect(b!.y).toBeGreaterThan(r!.y + items[0]!.h); // below the first line
    expect(a!.y + items[3]!.h).toBeLessThan(200); // above the anchor
    expect(overlapping(items, at)).toEqual([]);
  });

  it('never overlaps, at any spacing, and stays near the anchor', () => {
    // a stack at one point, a near-stack 5 px apart, and labels on a 20 px grid
    for (const step of [0, 5, 20]) {
      const items: LabelBox[] = [];
      for (let i = 0; i < 24; i++) items.push(box(`T${i + 1}`, 300 + (i % 6) * step, 300));
      const at = placeLabels(items);
      expect(overlapping(items, at)).toEqual([]);
      for (const it of items) {
        const p = at.get(it.key)!;
        expect(Math.abs(p.y - it.anchor.y)).toBeLessThan(24 * 18);
        expect(Math.abs(p.x - it.anchor.x)).toBeLessThan(it.w + LABEL_DX + 6 * step + 1);
      }
    }
  });

  it('is deterministic and keeps earlier labels in place', () => {
    const items = ['A1', 'A2', 'A3', 'B1'].map((k) => box(k, 10, 10));
    expect([...placeLabels(items)]).toEqual([...placeLabels(items)]);
    const fewer = placeLabels(items.slice(0, 2));
    expect(fewer.get('A1')).toEqual(placeLabels(items).get('A1'));
    expect(fewer.get('A2')).toEqual(placeLabels(items).get('A2'));
  });

  it('places 40 threats stacked on 15 co-located sensors with no overlap (7.R F-14)', () => {
    // No wall-clock check: the gate must be deterministic. map.perf.test.ts holds the budgets.
    const items: LabelBox[] = [];
    for (let i = 0; i < 15; i++) items.push(box(`S${i + 1}`, 400, 300));
    for (let i = 0; i < 40; i++) items.push(box(`T${i + 1}`, 420, 300));
    const at = placeLabels(items);
    expect(at.size).toBe(items.length);
    expect(overlapping(items, at)).toEqual([]);
    expect([...at]).toEqual([...placeLabels(items)]);
  });
});

describe('labels keep off markers and inside the map (review 7.R F-09)', () => {
  const covers = (p: { x: number; y: number }, l: LabelBox, o: Obstacle) =>
    p.x < o.x + o.w && o.x < p.x + l.w && p.y < o.y + o.h && o.y < p.y + l.h;

  it('a label moves off another object marker, but may sit next to its own', () => {
    const l = box('RDR-1', 100, 100);
    // the DA square right of the radar, where the first slot would be
    const da: Obstacle = { key: 'DA', x: 104, y: 100, w: 30, h: 30 };
    const own: Obstacle = { key: 'RDR-1', x: 93, y: 93, w: 14, h: 14 };
    const p = placeLabels([l], { obstacles: [da, own] }).get('RDR-1')!;
    expect(covers(p, l, da)).toBe(false);
    expect(covers(p, l, own)).toBe(false);
    expect(p).not.toEqual({ x: 100 + LABEL_DX, y: 100 + LABEL_DY });
    // its own box alone does not move it
    expect(placeLabels([l], { obstacles: [own] }).get('RDR-1')).toEqual({
      x: 100 + LABEL_DX,
      y: 100 + LABEL_DY,
    });
  });

  it('stays inside the bounds: a label at the right edge goes left', () => {
    const l = box('EO-1', 395, 100);
    const p = placeLabels([l], { bounds: { w: 400, h: 300 } }).get('EO-1')!;
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x + l.w).toBeLessThanOrEqual(400);
    expect(p.x + l.w).toBeLessThanOrEqual(395 - LABEL_DX);
  });

  it('hides a label with no free slot rather than overlap', () => {
    // a 30 x 24 map: one label fits right of the anchor, a second there has nowhere to go
    const items = [box('A', 2, 2, 'AB'), box('B', 2, 2, 'AB')];
    const at = placeLabels(items, { bounds: { w: 30, h: 24 } });
    expect(at.has('A')).toBe(true);
    expect(at.has('B')).toBe(false);
  });
});
