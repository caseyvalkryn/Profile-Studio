import { produce } from 'immer';
import fixture from '../../../../fixtures/legacy-derive/CUAS-001.json';
import { importLegacyV4 } from '../../../domain/migrate';
import { readFormation } from './FormationPopover';
import { applyFormation, formationPoints, groupLetter } from './formation';

const seed = () => importLegacyV4(JSON.parse(JSON.stringify(fixture.input)));
const leg = [
  { x: 0, y: 0, z: 100, holdS: 0 },
  { x: 1000, y: 0, z: 100, holdS: 5 },
];

describe('formation', () => {
  it('places members on alternate sides of the first leg with a 5 m height step', () => {
    const m = formationPoints(leg, 4, 120);
    expect(m).toHaveLength(3);
    // The first leg runs east, so abreast is north (+y) then south (-y), widening every two.
    expect(m.map((p) => [p[0]!.x, p[0]!.y, p[0]!.z])).toEqual([
      [0, 120, 100],
      [0, -120, 105],
      [0, 240, 95],
    ]);
    expect(m[0]![1]).toEqual({ x: 1000, y: 120, z: 100, holdS: 5 });
    expect(formationPoints(leg.slice(0, 1), 4, 120)).toEqual([]);
    expect(formationPoints(leg, 1, 120)).toEqual([]);
  });

  it('writes the members with legacy ids, the group on the source, and clamps the count', () => {
    const v = seed();
    const t1 = v.threats[0]!;
    let ids: string[] = [];
    const out = produce(v, (d) => {
      ids = applyFormation(d, t1.key, 3, 120, 'b');
    });
    expect(ids).toEqual(['B1', 'B2']);
    expect(out.threats.map((t) => [t.id, t.group, t.type])).toEqual([
      ['T1', 'B', t1.type],
      ['B1', 'B', t1.type],
      ['B2', 'B', t1.type],
    ]);
    let many: string[] = [];
    produce(v, (d) => {
      many = applyFormation(d, t1.key, 40, 120, 'A');
    });
    expect(many).toHaveLength(11);
    expect(groupLetter(' 7c ')).toBe('C');
    expect(groupLetter('')).toBe('A');
  });

  it('checks the form with the legacy messages and converts the spacing to metres', () => {
    const ok = readFormation({ count: '3', spacing: '0.065', group: 'a' }, 'nav');
    expect(ok).toEqual({ n: 3, spacingM: expect.closeTo(120.38, 2), group: 'A' });
    expect(readFormation({ count: '3', spacing: '0.2', group: 'A' }, 'si')).toEqual({
      n: 3,
      spacingM: 200,
      group: 'A',
    });
    expect(readFormation({ count: '13', spacing: '0.1', group: 'A' }, 'nav')).toEqual({
      error: 'Count is 2 to 12.',
    });
    expect(readFormation({ count: '3', spacing: '0', group: 'A' }, 'nav')).toEqual({
      error: 'Type a spacing above 0, for example 0.065.',
    });
    expect(readFormation({ count: '3', spacing: '0.1', group: 'AB' }, 'nav')).toEqual({
      error: 'Type one letter for the group.',
    });
  });
});
