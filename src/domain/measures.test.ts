import {
  MEASURES,
  measureById,
  measuresBySourceClass,
  measuresByStep,
  type SourceClass,
} from './measures';

const INT = Array.from({ length: 14 }, (_, i) => `INT-${i + 1}`);

// Spec section 4, the four class lists as printed.
const SPEC: Record<SourceClass, string[]> = {
  simulated:
    '1.1.1 1.1.2 1.1.3 1.1 1.2 1.5 1.2.1 1.2.2 1.2.3 2.1.1 2.1.2 2.1.3 2.1.3t 2.1.4 3a.2 3b.1 3.1.1 3.1.2 3.1.3 3.1.4 5.1 5.4 5.4e'.split(
      ' ',
    ),
  entered: [
    ...'1.3 1.4 1.6 1.7 1.8 2.1 2.2 2.3 2.4 2.5 3a.1 3a.3 3b.2 5.2 5.2e 5.5 5.5b 5.6'.split(' '),
    ...INT,
  ],
  derived: ['5.3', '5.8'],
  'not-simulated': '1.1.4 4.1.1 4.1.2 4.2.1 4.2.2 5.1.1 5.2.1 5.3.1 5.3.2 5.7'.split(' '),
};

describe('DroneScore measure table', () => {
  it('has the 67 DroneScore rows with unique ids', () => {
    expect(MEASURES).toHaveLength(67);
    expect(new Set(MEASURES.map((m) => m.id)).size).toBe(67);
    expect(MEASURES.filter((m) => m.area === 1)).toHaveLength(20);
    expect(MEASURES.filter((m) => m.area === 2)).toHaveLength(10);
    expect(MEASURES.filter((m) => m.area === 3)).toHaveLength(29);
    expect(MEASURES.filter((m) => m.area === 4)).toHaveLength(4);
    expect(MEASURES.filter((m) => m.area === 5)).toHaveLength(4);
  });

  it('every id in the spec class lists exists, with that class', () => {
    for (const [cls, ids] of Object.entries(SPEC)) {
      for (const id of ids) expect(measureById(id)?.sourceClass, id).toBe(cls);
    }
  });

  it('every row has exactly one class and appears in exactly one spec list', () => {
    const all = Object.values(SPEC).flat();
    expect(all).toHaveLength(67);
    for (const m of MEASURES)
      expect(
        all.filter((id) => id === m.id),
        m.id,
      ).toHaveLength(1);
    const counts = (['simulated', 'entered', 'derived', 'not-simulated'] as const).map(
      (c) => measuresBySourceClass(c).length,
    );
    expect(counts).toEqual([23, 32, 2, 10]);
  });

  it('places measures under F2T2EA steps, with Target empty and areas 4 and 5 as system', () => {
    expect(measuresByStep('target')).toEqual([]);
    expect(
      measuresByStep('system')
        .map((m) => m.area)
        .every((a) => a === 4 || a === 5),
    ).toBe(true);
    expect(MEASURES.filter((m) => m.area >= 4).every((m) => m.step === 'system')).toBe(true);
    expect(measureById('2.1.3t')?.name).toBe('Identification Time');
    expect(measureById('5.5b')?.name).toBe('Cyclic Rate');
  });
});
