// Run rows as CSV and the vignette as JSON (spec section 10). Pure functions plus two download
// helpers that need a DOM.
import type { RunRow, RunSummary, Vignette } from '../../domain/types';
import { exportJson } from '../../state/persist';

/** The DroneScore field names, in `RunRow` key order. These are the CSV columns. */
export const RUN_ROW_FIELDS = [
  'run',
  'threat',
  'stage_reached',
  'detect_range_m',
  'detect_alt_m',
  'track_continuity_pct',
  'track_error_m',
  'id_range_m',
  'id_time_s',
  'identified_ok',
  'engagement_range_m',
  'time_to_intercept_s',
  'outcome',
] as const satisfies readonly (keyof RunRow)[];

// Compile-time check that every RunRow key is a column.
type Missing = Exclude<keyof RunRow, (typeof RUN_ROW_FIELDS)[number]>;
const allColumns: Missing extends never ? true : never = true;
void allColumns;

/** RFC 4180: quote a field that holds a comma, a quote, CR or LF; double inner quotes. */
export function csvField(v: string | number | boolean | null): string {
  if (v === null) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Header line plus one line per row, CRLF line ends. A null value is an empty field, never 0. */
export function rowsToCsv(rows: readonly RunRow[]): string {
  const lines = [RUN_ROW_FIELDS.join(',')];
  for (const r of rows) lines.push(RUN_ROW_FIELDS.map((f) => csvField(r[f])).join(','));
  return lines.join('\r\n') + '\r\n';
}

/** The vignette with the given stored runs, in the v5 JSON the importer reads. */
export function vignetteJson(v: Vignette, runs: readonly RunSummary[]): string {
  return exportJson({ ...v, runs: [...runs] });
}

/** A file name safe on every desktop OS. */
export function fileName(base: string, ext: string): string {
  const safe = base.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'vignette';
  return `${safe}.${ext}`;
}

export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadText(name: string, text: string, type: string): void {
  downloadBlob(name, new Blob([text], { type }));
}
