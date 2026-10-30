import { describe, expect, it } from 'vitest';
import { formatInterval, formatValue, noValueText, resultSentence } from './units';

describe('display precision (review 6 F-07)', () => {
  it('a narrow interval never prints as a point', () => {
    const i = { low: 3979.55, high: 3985.37 };
    const text = formatInterval('nav', '1.1.2', i, 3982.73);
    const [lo, hi] = text.slice(1, -1).split(', ');
    expect(lo).not.toBe(hi);
    expect(formatValue('nav', '1.1.2', 3982.73, i)).toBe('2.151 nm');
  });

  it('a percentage below 100 does not print as 100', () => {
    expect(formatValue('nav', '1.2.2', 99.4, { low: 98.6, high: 99.8 })).toBe('99.4 %');
  });

  it('keeps the scale decimals when the interval is wide or a point', () => {
    expect(formatInterval('nav', '1.1.1', { low: 84, high: 99 })).toBe('[84, 99]');
    expect(formatInterval('nav', '1.1.1', { low: 100, high: 100 }, 100)).toBe('[100, 100]');
  });
});

describe('value and limits print apart (first-use FR-06)', () => {
  it('Hover 1.2.2: the value no longer prints equal to its high limit', () => {
    const i = { low: 99.81, high: 99.93 };
    expect(formatValue('nav', '1.2.2', 99.87, i)).toBe('99.87 %');
    expect(formatInterval('nav', '1.2.2', i, 99.87)).toBe('[99.81, 99.93]');
  });

  it('Point defence 1.1.2 in km: the value no longer prints equal to its low limit', () => {
    const i = { low: 3979.55, high: 3985.37 };
    expect(formatValue('si', '1.1.2', 3982.73, i)).toBe('3.983 km');
    expect(formatInterval('si', '1.1.2', i, 3982.73)).toBe('[3.980, 3.985]');
    expect(formatValue('nav', '1.1.2', 3982.73, i)).toBe('2.151 nm');
    expect(formatInterval('nav', '1.1.2', i, 3982.73)).toBe('[2.149, 2.152]');
  });

  it('stops at 4 decimals, and numbers equal in the data may print the same', () => {
    expect(formatInterval('nav', '1.2.2', { low: 99.87, high: 99.87001 }, 99.87)).toBe(
      '[99.8700, 99.8700]',
    );
    expect(formatInterval('nav', '1.2.2', { low: 90, high: 99.5 }, 99.5)).toBe('[90.0, 99.5]');
  });
});

describe('null score text (review 6 F-06)', () => {
  it('names no internal field', () => {
    const texts = ['2.1.1', '2.1.4', '5.3', '5.8', '2.3', '4.2.1', '1.1.2'].map((id) =>
      noValueText({
        id,
        value: null,
        sourceClass: id === '2.3' ? 'entered' : id === '4.2.1' ? 'not-simulated' : 'simulated',
      }),
    );
    expect(texts[4]).toBe('Not simulated. Enter a value on the sensor.');
    for (const t of texts) expect(t).not.toMatch(/rangeboard|stage_reached|identified_ok|formula/);
  });

  it('a chart subtitle with no value uses the plain text', () => {
    const s = resultSentence('nav', {
      id: '2.1.4',
      n: 0,
      value: null,
      interval: null,
      threshold: 5,
      op: '<=',
      unit: '%',
      evaluation: 'inconclusive',
      sourceClass: 'simulated',
      note: 'rangeboard does not surface a wrong declaration, so identified_ok is never false',
    });
    expect(s).toBe(
      'Inconclusive: no value. Not simulated. The model does not produce a wrong identification.',
    );
  });
});
