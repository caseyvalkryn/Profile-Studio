import type { RunRow } from '../../domain/types';
import { run } from '../../engine/run';
import { testVignette } from '../../engine/testVignette';
import { importJson } from '../../state/persist';
import { csvField, fileName, RUN_ROW_FIELDS, rowsToCsv, vignetteJson } from './export';

const rows = run(testVignette(), 10, 7).rows;

describe('rowsToCsv', () => {
  it('heads the file with the RunRow keys in order', () => {
    const header = rowsToCsv(rows).split('\r\n')[0];
    expect(header).toBe(Object.keys(rows[0]!).join(','));
    expect(header).toBe(RUN_ROW_FIELDS.join(','));
  });

  it('writes null as an empty field, never 0', () => {
    const row: RunRow = {
      run: 1,
      threat: 'T-01',
      stage_reached: 'none',
      detect_range_m: null,
      detect_alt_m: null,
      track_continuity_pct: null,
      track_error_m: null,
      id_range_m: null,
      id_time_s: null,
      identified_ok: null,
      engagement_range_m: null,
      time_to_intercept_s: null,
      outcome: 'No Attempt',
    };
    expect(rowsToCsv([row]).split('\r\n')[1]).toBe('1,T-01,none,,,,,,,,,,No Attempt');
  });

  it('writes one line per row', () => {
    expect(rowsToCsv(rows).trimEnd().split('\r\n')).toHaveLength(rows.length + 1);
  });

  it('quotes fields per RFC 4180', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('a\nb')).toBe('"a\nb"');
    expect(csvField(0)).toBe('0');
    expect(csvField(false)).toBe('false');
  });
});

describe('vignetteJson', () => {
  it('round-trips through the importer with the given runs', () => {
    const v = testVignette();
    const runs = [{ key: 'r1', id: 'R-1', createdAt: v.updated, n: 10, seed: 7, rows }];
    const [back] = importJson(vignetteJson(v, runs));
    expect(back?.runs).toHaveLength(1);
    expect(back?.runs[0]?.rows).toHaveLength(rows.length);
  });

  it('makes a safe file name', () => {
    expect(fileName('Point defence / quad', 'csv')).toBe('Point-defence-quad.csv');
  });
});
