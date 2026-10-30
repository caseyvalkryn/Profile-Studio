import { LABEL_DX, LABEL_DY, estimateLabelSize, placeLabels, type LabelBox } from './labels';

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

  it('places 40 threats stacked on 15 co-located sensors in under 2 ms', () => {
    const items: LabelBox[] = [];
    for (let i = 0; i < 15; i++) items.push(box(`S${i + 1}`, 400, 300));
    for (let i = 0; i < 40; i++) items.push(box(`T${i + 1}`, 420, 300));
    for (let i = 0; i < 5; i++) placeLabels(items);
    const ts: number[] = [];
    for (let i = 0; i < 21; i++) {
      const t0 = performance.now();
      placeLabels(items);
      ts.push(performance.now() - t0);
    }
    ts.sort((a, b) => a - b);
    expect(overlapping(items, placeLabels(items))).toEqual([]);
    expect(ts[10]!).toBeLessThan(2);
  });
});
