// Per-section notes and picked charts, in `ReportDraft.sections` and `ReportDraft.charts`. They
// persist, export and undo with the vignette. Before these fields existed the notes and charts
// lived in `report.slides` under reserved keys: `aar:<section>` (note in `notes`) and
// `aar:charts` (measure ids in `caption`, space separated). Reads fall back to those entries, and
// the first write moves them into the new fields and removes them, so nothing is lost.
import type { Draft } from 'immer';
import type { ReportDraft, Vignette } from '../../domain/types';

export const SECTIONS = [
  { id: 'question', title: 'Question' },
  { id: 'hypothesis', title: 'Hypothesis and prediction' },
  { id: 'setup', title: 'Setup' },
  { id: 'results', title: 'Results' },
  { id: 'evaluation', title: 'Evaluation' },
  { id: 'scope', title: 'Scope of inference' },
  { id: 'next', title: 'Next test' },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];

const PREFIX = 'aar:';
const CHARTS = `${PREFIX}charts`;

function legacyNote(r: ReportDraft, id: string): string | undefined {
  return r.slides.find((s) => s.key === PREFIX + id)?.notes;
}

function legacyCharts(r: ReportDraft): string[] | undefined {
  const c = r.slides.find((s) => s.key === CHARTS)?.caption;
  return c == null ? undefined : c.split(/\s+/).filter(Boolean);
}

export function sectionNote(r: ReportDraft, id: SectionId): string {
  return r.sections?.[id] ?? legacyNote(r, id) ?? '';
}

export function pickedCharts(r: ReportDraft): string[] {
  return r.charts ?? legacyCharts(r) ?? [];
}

/** Moves the legacy `aar:` entries into `sections` and `charts`, then drops them. */
function adoptLegacy(d: Draft<Vignette>): void {
  const r = d.report;
  if (!r.slides.some((s) => s.key.startsWith(PREFIX))) return;
  const sections = { ...r.sections };
  for (const { id } of SECTIONS) {
    const note = legacyNote(r, id);
    if (sections[id] == null && note) sections[id] = note;
  }
  r.sections = sections;
  r.charts ??= legacyCharts(r) ?? [];
  r.slides = r.slides.filter((s) => !s.key.startsWith(PREFIX));
}

export function setSectionNote(d: Draft<Vignette>, id: SectionId, note: string): void {
  adoptLegacy(d);
  d.report.sections = { ...d.report.sections, [id]: note };
}

export function setPickedCharts(d: Draft<Vignette>, ids: string[]): void {
  adoptLegacy(d);
  d.report.charts = [...ids];
}
