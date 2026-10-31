// @vitest-environment node
import { derived } from './derived';
import { preview } from './preview';
import { nextStop, prevStop, stops } from './stops';
import { testVignette } from './testVignette';

const v = testVignette({
  events: [
    {
      key: 'e1',
      id: 'e1',
      tS: 40,
      type: 'detect',
      label: '',
      threatKey: 'k-T-01',
      sensorKey: null,
    },
    {
      key: 'e2',
      id: 'e2',
      tS: 9999,
      type: 'engage',
      label: '',
      threatKey: 'k-T-01',
      sensorKey: null,
    },
  ],
});
const d = derived(v, preview(v));
const list = stops(v, d);

describe('stops', () => {
  it('starts at 0, ends at tmax, is sorted and deduped, and drops times past tmax', () => {
    expect(list[0]).toBe(0);
    expect(list[list.length - 1]).toBe(d.tmax);
    for (let i = 1; i < list.length; i++) expect(list[i]! - list[i - 1]!).toBeGreaterThan(1e-9);
    expect(list).not.toContain(9999);
  });

  it('holds the authored events, stage times and first sees', () => {
    expect(list).toContain(40);
    const st = d.stages['T-01']!;
    expect(list).toContain(st.find!.tGeo);
    expect(list).toContain(st.target!.t);
    expect(list).toContain(d.first['T-02']!['S-02']!.t);
  });

  it('nextStop and prevStop step through the list with the 0.05 s guard', () => {
    expect(nextStop(list, 0, d.tmax)).toBe(list[1]);
    expect(nextStop(list, list[1]! + 0.01, d.tmax)).toBe(list[2]);
    expect(nextStop(list, d.tmax, d.tmax)).toBe(d.tmax);
    expect(prevStop(list, list[2]!)).toBe(list[1]);
    expect(prevStop(list, 0)).toBe(0);
  });
});
