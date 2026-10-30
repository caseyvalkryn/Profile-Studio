import { useRef, type ReactNode } from 'react';
import { Button, Menu } from '../../ui';
import { downloadBlob, fileNameFor, serializeSvg, svgToPng, type ExportMeta } from './export';

export type ChartFrameProps = {
  /** States the hypothesis, or the measure when there is none (principle 6.1). */
  title: string;
  /** States the result in one sentence. */
  subtitle: string;
  /** Units and interval method. */
  note?: string;
  children: ReactNode;
};

/** The chart's own SVG: the one marked `data-chart`, else recharts' surface, else the first. */
export function chartSvg(root: HTMLElement | null): SVGSVGElement | null {
  if (!root) return null;
  return (
    root.querySelector<SVGSVGElement>('svg[data-chart]') ??
    root.querySelector<SVGSVGElement>('svg.recharts-surface') ??
    root.querySelector<SVGSVGElement>('svg')
  );
}

/** Resolved colours and font of the frame, so the file matches the screen. */
export function frameMeta(
  root: HTMLElement,
  base: Pick<ExportMeta, 'title' | 'subtitle' | 'note'>,
): ExportMeta {
  const cs = getComputedStyle(root);
  const v = (name: string) => cs.getPropertyValue(name).trim() || undefined;
  return {
    ...base,
    background: v('--surface-1'),
    ink: v('--text'),
    muted: v('--text-muted'),
    fontFamily: cs.fontFamily || undefined,
  };
}

export function ChartFrame({ title, subtitle, note, children }: ChartFrameProps) {
  const ref = useRef<HTMLElement>(null);

  const svgText = (): string | null => {
    const svg = chartSvg(ref.current);
    if (!svg || !ref.current) return null;
    return serializeSvg(svg, frameMeta(ref.current, { title, subtitle, note }));
  };

  const exportSvg = () => {
    const text = svgText();
    if (text) downloadBlob(new Blob([text], { type: 'image/svg+xml' }), fileNameFor(title, 'svg'));
  };
  const exportPng = () => {
    const text = svgText();
    if (!text) return;
    svgToPng(text, 2)
      .then((b) => downloadBlob(b, fileNameFor(title, 'png')))
      .catch((err: unknown) => console.error('PNG export failed', err));
  };

  return (
    <figure ref={ref} className="m-0 rounded-md border border-surface-3 bg-surface-1 p-3">
      <figcaption className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-text" data-testid="chart-title">
            {title}
          </div>
          <div className="text-xs text-muted" data-testid="chart-subtitle">
            {subtitle}
          </div>
        </div>
        <span className="results-no-print">
          <Menu
            align="end"
            items={[
              { id: 'export-png', label: 'Export PNG', onSelect: exportPng },
              { id: 'export-svg', label: 'Export SVG', onSelect: exportSvg },
            ]}
            trigger={
              <Button size="sm" variant="quiet" aria-label="Export chart">
                Export
              </Button>
            }
          />
        </span>
      </figcaption>
      {children}
      {note ? <div className="mt-1 text-xs text-muted">{note}</div> : null}
    </figure>
  );
}
