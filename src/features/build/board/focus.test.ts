import { testVignette } from '../../../engine/testVignette';
import type { AuthoredEvent } from '../../../domain/types';
import {
  displaysOfLevel,
  expandFocus,
  focusClass,
  focusIds,
  focusLabel,
  levelOfCard,
  nextFocusLevel,
  sameKeys,
} from './focus';

const ev = (key: string, id: string, threatKey: string, sensorKey: string | null): AuthoredEvent => ({
  key,
  id,
  tS: 10,
  type: 'detect',
  label: '',
  threatKey,
  sensorKey,
});

function vignette() {
  const v = testVignette();
  const [t0, t1] = v.threats;
  const s0 = v.sensors[0]!;
  v.events = [ev('ek1', 'e1', t0!.key, s0.key), ev('ek2', 'e2', t1!.key, s0.key), ev('ek3', 'e3', t1!.key, null)];
  return v;
}

describe('the Build focus (2026-11-02)', () => {
  it('a threat keeps its events, a sensor its events and their threats, an event its threat', () => {
    const v = vignette();
    const [t0, t1] = v.threats;
    expect(expandFocus(v, [t1!.key])).toEqual([t1!.key, 'ek2', 'ek3']);
    expect(expandFocus(v, [v.sensors[0]!.key])).toEqual([v.sensors[0]!.key, 'ek1', t0!.key, 'ek2', t1!.key]);
    expect(expandFocus(v, ['ek1'])).toEqual(['ek1', t0!.key]);
    // a waypoint key or an unknown key is dropped; a key is listed once
    expect(expandFocus(v, [t0!.path[0]!.key, 'nope', t0!.key, 'ek1'])).toEqual([t0!.key, 'ek1']);
    expect(focusIds(v, [t1!.key])).toEqual([t1!.id, 'e2', 'e3']);
  });

  it('levels cycle faint, hidden, dim and map to the card displays and the host class', () => {
    expect(nextFocusLevel('faint')).toBe('hidden');
    expect(nextFocusLevel('hidden')).toBe('dim');
    expect(nextFocusLevel('dim')).toBe('faint');
    expect(displaysOfLevel('hidden')).toEqual({ emphasis: true, hidden: true });
    expect(displaysOfLevel('dim')).toEqual({ emphasis: false, hidden: false });
    const d = { timeline: true, chart: false, readout: false, emphasis: true, hidden: false };
    expect(levelOfCard(d)).toBe('faint');
    expect(levelOfCard({ ...d, hidden: true })).toBe('hidden');
    expect(focusClass('faint', true)).toBe('focus-faint');
    expect(focusClass('hidden', true)).toBe('focus-hidden');
    expect(focusClass('dim', true)).toBe('');
    expect(focusClass('hidden', false)).toBe('');
  });

  it('the chip names three ids then the count; sameKeys ignores order', () => {
    const v = vignette();
    const keys = [...v.threats.map((t) => t.key), ...v.sensors.map((s) => s.key)];
    expect(focusLabel(v, keys.slice(0, 2))).toBe(`${v.threats[0]!.id}, ${v.threats[1]!.id}`);
    expect(focusLabel(v, keys)).toMatch(/ and \d+ more$/);
    expect(sameKeys(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameKeys(['a'], ['a', 'b'])).toBe(false);
  });
});
