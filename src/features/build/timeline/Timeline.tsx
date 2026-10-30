// Bottom timeline (spec section 7, Build): one row per threat, one lane per F2T2EA step. The
// gutter names each lane. Preview step times are marks in their step's lane with a quiet bar to
// the next step. An active run's trace adds the Monte Carlo mean as a thinner mark in the same
// lane. The accent line is the current time.
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import '../../../commands/commands';
import { execute, get, shortcutLabel } from '../../../commands/registry';
import { RATES } from '../../../domain/catalog';
import { usePreview, useDocument } from '../../../state/document';
import { useActiveRun } from '../../../state/runs';
import { useUi } from '../../../state/ui';
import { Button, ContextMenu, Menu, Tooltip, type MenuItem } from '../../../ui';
import { fmtTime, timeTicks } from '../../shared/units';
import { AXIS_H, GUTTER_W, LANE_H, ROW_H, domainS, laneY, timeOfX, xOfTime } from './layout';
import { STEPS, runStepMeans } from './steps';
import { usePlayback } from './usePlayback';
import { useSize } from '../../shared/useSize';
import { menuItemsFor } from '../../commands/adapter';

/** Right edge of the step names in the gutter. */
const LABEL_X = GUTTER_W - 6;

export type TimelineProps = {
  /** Fixed width in pixels. Omit to fill the container. */
  width?: number;
};

function shortcutOf(id: string): string | undefined {
  const c = get(id);
  return c ? shortcutLabel(c) || undefined : undefined;
}

function TimeButton({ id, label }: { id: string; label: string }) {
  const c = get(id);
  return (
    <Button
      size="sm"
      tooltip={c?.label ?? label}
      shortcut={shortcutOf(id)}
      aria-label={c?.label ?? label}
      onClick={() => execute(id)}
    >
      <span className="font-mono">{label}</span>
    </Button>
  );
}

export default function Timeline({ width: fixedWidth }: TimelineProps) {
  usePlayback();
  const doc = useDocument((s) => s.doc);
  const preview = usePreview();
  const run = useActiveRun();
  const tS = useUi((s) => s.tS);
  const playing = useUi((s) => s.playing);
  const rate = useUi((s) => s.rate);
  const loop = useUi((s) => s.loop);
  const selectedKeys = useUi((s) => s.selectedKeys);
  const setTime = useUi((s) => s.setTime);
  const setRate = useUi((s) => s.setRate);
  const [ref, size] = useSize<HTMLDivElement>({ width: fixedWidth });
  const [menuT, setMenuT] = useState<number | null>(null);
  const dragging = useRef(false);

  const width = size.width;
  const tmaxS = preview?.tmaxS ?? 0;
  const threats = useMemo(
    () => (doc && preview ? doc.threats.map((t) => preview.threats[t.key]).filter((t) => !!t) : []),
    [doc, preview],
  );
  const idOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of doc?.sensors ?? []) m.set(s.key, s.id);
    for (const e of doc?.effectors ?? []) m.set(e.key, e.id);
    return m;
  }, [doc]);
  const trace = run?.result?.trace ?? null;
  const height = AXIS_H + threats.length * ROW_H;
  const x = (t: number) => xOfTime(t, width, tmaxS);

  const timeAt = (clientX: number, el: Element) =>
    timeOfX(clientX - el.getBoundingClientRect().left, width, tmaxS);

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setTime(timeAt(e.clientX, e.currentTarget));
  };
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (dragging.current) setTime(timeAt(e.clientX, e.currentTarget));
  };
  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    dragging.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const menuItems: MenuItem[] = useMemo(() => {
    // Timeline commands take no number, so the prompt callback is never called.
    return menuItemsFor('timeline', { pointer: { x: 0, y: 0, tS: menuT ?? 0 }, onArg: () => {} });
    // Rebuilt for each right-click; the stores are read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuT, doc]);

  const rateItems: MenuItem[] = RATES.map((r) => ({
    id: `rate-${r}`,
    label: `${r}×`,
    onSelect: () => setRate(r),
  }));

  const ticks = timeTicks(domainS(tmaxS), Math.max(2, Math.floor((width - GUTTER_W) / 90)));

  // The time axis, drawn in the rows SVG and again in a sticky strip that stays in view while
  // the rows scroll (review 7.R F-08).
  const axisMarks = (
    <>
      <rect x={0} y={0} width={width} height={AXIS_H} fill="transparent" />
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={AXIS_H - 4} y2={AXIS_H} className="stroke-surface-3" />
          <text
            x={x(t)}
            y={AXIS_H - 7}
            textAnchor="middle"
            className="fill-muted font-mono"
            fontSize={10}
          >
            {fmtTime(t)}
          </text>
        </g>
      ))}
      <line x1={0} x2={width} y1={AXIS_H} y2={AXIS_H} className="stroke-surface-3" />
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-1 text-text">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-surface-3 px-2">
        <TimeButton id="time.back10" label="-10" />
        <TimeButton id="time.back1" label="-1" />
        <Button
          size="sm"
          tooltip={playing ? 'Pause' : 'Play'}
          shortcut={shortcutOf('time.playPause')}
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={() => execute('time.playPause')}
        >
          {playing ? '❚❚' : '▶'}
        </Button>
        <TimeButton id="time.forward1" label="+1" />
        <TimeButton id="time.forward10" label="+10" />
        <span className="ml-2 font-mono text-xs" data-testid="timeline-clock">
          {fmtTime(tS)}
        </span>
        <span className="font-mono text-xs text-muted">/ {fmtTime(tmaxS)}</span>
        {loop ? (
          <span className="ml-2 font-mono text-xs text-muted">
            loop {fmtTime(loop.startS)} to {fmtTime(loop.endS)}
          </span>
        ) : null}
        <span className="flex-1" />
        <Menu
          items={rateItems}
          align="end"
          trigger={
            <Button size="sm" tooltip="Playback rate" aria-label="Playback rate">
              <span className="font-mono">{rate}×</span>
            </Button>
          }
        />
      </div>
      <ContextMenu items={menuItems}>
        <div
          ref={ref}
          className="min-h-0 flex-1 overflow-y-auto"
          onContextMenu={(e) => setMenuT(timeAt(e.clientX, e.currentTarget))}
        >
          {threats.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted">Add a threat to see its timeline</p>
          ) : width > 0 ? (
            <>
              <svg
                width={width}
                height={AXIS_H}
                aria-hidden="true"
                data-testid="timeline-axis-sticky"
                className="sticky top-0 z-10 block cursor-col-resize bg-surface-1 select-none"
                style={{ marginBottom: -AXIS_H }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              >
                {loop ? (
                  <rect
                    x={x(loop.startS)}
                    y={0}
                    width={Math.max(1, x(loop.endS) - x(loop.startS))}
                    height={AXIS_H}
                    className="fill-surface-2"
                  />
                ) : null}
                {axisMarks}
                <g pointerEvents="none">
                  <line x1={x(tS)} x2={x(tS)} y1={0} y2={AXIS_H} className="stroke-accent" />
                  <path
                    d={`M ${x(tS) - 4} 0 L ${x(tS) + 4} 0 L ${x(tS)} 6 Z`}
                    className="fill-accent"
                  />
                </g>
              </svg>
              <svg
                width={width}
                height={height}
                role="img"
                aria-label="Timeline"
                data-testid="timeline-svg"
                className="block cursor-col-resize select-none"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              >
                {loop ? (
                  <rect
                    data-testid="timeline-loop"
                    x={x(loop.startS)}
                    y={0}
                    width={Math.max(1, x(loop.endS) - x(loop.startS))}
                    height={height}
                    className="fill-surface-2"
                  />
                ) : null}
                <g data-testid="timeline-axis">{axisMarks}</g>
                {threats.map((th, row) => {
                  const top = AXIS_H + row * ROW_H;
                  const selected = selectedKeys.includes(th.key);
                  const means = trace ? runStepMeans(trace, th.id) : {};
                  return (
                    <g key={th.key} data-testid="timeline-row" data-threat={th.id}>
                      <line
                        x1={0}
                        x2={width}
                        y1={top + ROW_H}
                        y2={top + ROW_H}
                        className="stroke-surface-3"
                      />
                      <text
                        x={8}
                        y={top + ROW_H / 2 + 4}
                        fontSize={11}
                        className={`font-mono ${selected ? 'fill-accent' : 'fill-text'}`}
                      >
                        {th.id}
                      </text>
                      {STEPS.map((step, i) => {
                        const st = th.stages[step.key];
                        const next = STEPS.slice(i + 1)
                          .map((s) => th.stages[s.key])
                          .find((s) => s != null);
                        const y = laneY(row, i);
                        const mean = means[step.key];
                        return (
                          <g key={step.key} data-testid="timeline-lane" data-step={step.key}>
                            <text
                              data-testid="timeline-lane-label"
                              x={LABEL_X}
                              y={y + LANE_H - 2}
                              textAnchor="end"
                              fontSize={9}
                              className="fill-muted"
                            >
                              {step.label}
                            </text>
                            <line
                              x1={GUTTER_W}
                              x2={width}
                              y1={y + LANE_H - 0.5}
                              y2={y + LANE_H - 0.5}
                              className="stroke-surface-2"
                            />
                            {st && next && next.t > st.t ? (
                              <rect
                                data-testid="timeline-window"
                                data-step={step.key}
                                x={x(st.t)}
                                y={y + 3}
                                width={x(next.t) - x(st.t)}
                                height={LANE_H - 6}
                                className="fill-surface-3"
                              />
                            ) : null}
                            {st ? (
                              <Tooltip
                                content={`${step.label}, ${fmtTime(st.t)}, ${idOf.get(st.system) ?? st.system}`}
                              >
                                <rect
                                  data-testid="timeline-mark"
                                  data-kind="preview"
                                  data-step={step.key}
                                  aria-label={`${step.label} ${fmtTime(st.t)}`}
                                  x={x(st.t) - 1}
                                  y={y + 1}
                                  width={2}
                                  height={LANE_H - 2}
                                  className="fill-text"
                                />
                              </Tooltip>
                            ) : null}
                            {mean ? (
                              <Tooltip
                                content={`${step.label}, run mean ${fmtTime(mean.meanS)}, n = ${mean.n}`}
                              >
                                <rect
                                  data-testid="timeline-mark"
                                  data-kind="run"
                                  data-step={step.key}
                                  aria-label={`${step.label} run mean ${fmtTime(mean.meanS)}`}
                                  x={x(mean.meanS) - 0.5}
                                  y={y}
                                  width={1}
                                  height={LANE_H}
                                  className="fill-muted"
                                />
                              </Tooltip>
                            ) : null}
                          </g>
                        );
                      })}
                      {th.assetEntryS != null ? (
                        <g data-testid="timeline-da">
                          <line
                            x1={x(th.assetEntryS)}
                            x2={x(th.assetEntryS)}
                            y1={top + 1}
                            y2={top + ROW_H - 1}
                            strokeDasharray="2 2"
                            className="stroke-muted"
                          />
                          <text
                            x={x(th.assetEntryS) + 3}
                            y={top + 9}
                            fontSize={9}
                            className="fill-muted font-mono"
                          >
                            DA
                          </text>
                        </g>
                      ) : null}
                    </g>
                  );
                })}
                <g data-testid="timeline-playhead" pointerEvents="none">
                  <line x1={x(tS)} x2={x(tS)} y1={0} y2={height} className="stroke-accent" />
                  <path
                    d={`M ${x(tS) - 4} 0 L ${x(tS) + 4} 0 L ${x(tS)} 6 Z`}
                    className="fill-accent"
                  />
                </g>
              </svg>
            </>
          ) : null}
        </div>
      </ContextMenu>
    </div>
  );
}
