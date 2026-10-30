// Per-section notes and picked charts. `ReportDraft` has no per-section fields, and
// `report.notes` holds legacy import text, so these live in `report.slides` under reserved keys:
// `aar:<section>` (note in `notes`) and `aar:charts` (measure ids in `caption`, space separated).
// They persist, export and undo with the vignette. Proposal: `ReportDraft.sections:
// Partial<Record<SectionId, string>>` and `ReportDraft.charts: string[]`.
import type { Draft } from 'immer';
import type { ReportDraft, ReportSlide, Vignette } from '../../domain/types';

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

/** Slides that are brief views, without the reserved report entries. */
export function briefSlides(r: ReportDraft): ReportSlide[] {
  return r.slides.filter((s) => !s.key.startsWith(PREFIX));
}

export function sectionNote(r: ReportDraft, id: SectionId): string {
  return r.slides.find((s) => s.key === PREFIX + id)?.notes ?? '';
}

export function pickedCharts(r: ReportDraft): string[] {
  const c = r.slides.find((s) => s.key === CHARTS)?.caption ?? '';
  return c.split(/\s+/).filter(Boolean);
}

function upsert(d: Draft<Vignette>, key: string, patch: Partial<ReportSlide>) {
  const s = d.report.slides.find((x) => x.key === key);
  if (s) Object.assign(s, patch);
  else d.report.slides.push({ key, name: key, caption: '', notes: '', ...patch });
}

export function setSectionNote(d: Draft<Vignette>, id: SectionId, note: string): void {
  upsert(d, PREFIX + id, { notes: note });
}

export function setPickedCharts(d: Draft<Vignette>, ids: string[]): void {
  upsert(d, CHARTS, { caption: ids.join(' ') });
}
