import { newKey, nextId } from './ids';

describe('nextId', () => {
  it('mints the first id of every kind', () => {
    const kinds = [
      'radar',
      'rf',
      'eoir',
      'acoustic',
      'ew',
      'kinetic',
      'de',
      'c2',
      'tspi',
      'threat',
      'asset',
      'question',
      'hypothesis',
    ] as const;
    expect(kinds.map((k) => nextId(k, []))).toEqual([
      'RDR-1',
      'RF-1',
      'EO-1',
      'AC-1',
      'EW-1',
      'KIN-1',
      'DE-1',
      'C2-1',
      'TM-1',
      'T1',
      'DA',
      'Q-01',
      'H-01',
    ]);
  });

  it('sequences and fills the lowest gap', () => {
    expect(nextId('radar', ['RDR-1', 'RDR-2'])).toBe('RDR-3');
    expect(nextId('radar', ['RDR-1', 'RDR-3'])).toBe('RDR-2');
    expect(nextId('threat', ['T1', 'T2', 'RDR-3'])).toBe('T3');
    expect(nextId('asset', ['DA'])).toBe('DA-2');
  });

  it('zero-pads questions and hypotheses to two digits', () => {
    const q: string[] = [];
    for (let i = 0; i < 10; i++) q.push(nextId('question', q));
    expect(q.slice(-2)).toEqual(['Q-09', 'Q-10']);
    expect(nextId('hypothesis', ['H-01', 'H-02'])).toBe('H-03');
  });
});

describe('newKey', () => {
  it('returns distinct UUIDs', () => {
    const a = newKey();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newKey()).not.toBe(a);
  });
});
