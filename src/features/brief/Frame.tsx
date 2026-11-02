// The Frame panel (plan phase 13, lane 13.2 item 2): the top section of the notes panel. "Frame
// at t+0:10" (or "Full run" with time off), then one block per threat in focus (every threat when
// the focus names none), the most pressing first (frameData.ts sortFrame), six at a time with a
// press for the rest. A block (2026-11-02, user request: hierarchy, boundaries, links to the
// scene; then the data display pass): four fixed rows, each value always at the same place, as
// a cockpit display. Row 1 is the identity: the id (a press selects it on the stage; the
// selected block carries the accent bar), the step reached with its glyph, and at the right the
// next step with its countdown (a press moves the time there). Row 2 is the readout, four slots
// (Range, Height, Speed, Closing), the number in the body size with its unit small. Row 3 the
// systems that hold it as the strip's pills (a press selects the system). Row 4 the status:
// Margin and DA. Each value sits in its own boxed cell (the sunken surface, a hairline border),
// the label caps in the micro size over it; an empty slot shows a dash, so the eye finds each
// value at its place in every block. A card with a slice adds "Inside the slice":
// every key point, authored event and window open or close between its start and end, each a
// press that moves the time.
import { useState, type ReactNode } from 'react';
import type { Card, Vignette } from '../../domain/types';
import { useDocument } from '../../state/document';
import { useUi } from '../../state/ui';
import { focusRing } from '../../ui/focus';
import { boardDerived, boardScene } from '../build/board/derived';
import { fmtTime, formatAltitude, formatRange, formatSpeed } from '../shared/units';
import { mmss } from '../../engine/tokens';
import { kindPill, stageGlyph, type GlyphStage } from '../timeline/glyphs';
import { barClass, marginSeconds } from '../timeline/layout';
import {
  FRAME_MAX,
  frameOf,
  sliceItems,
  type Frame as FrameData,
  type FrameThreat,
} from './frameData';
import { Section } from './Section';
import { idMaps, toCardRec } from './toCardRec';

/** A 12 px glyph of a key point, in the strip's inks (timeline.css). */
export function Glyph({ stage, className }: { stage: GlyphStage; className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      aria-hidden="true"
      className={`brief-glyph shrink-0${className ? ` ${className}` : ''}`}
    >
      {stageGlyph(stage, 6, 6)}
    </svg>
  );
}

/** A system as the strip draws its row: the 10 by 6 pill in its bar fill, then its id. */
export function Pill({ id, kind, onPress }: { id: string; kind: string; onPress?: () => void }) {
  const body = (
    <>
      <svg width="10" height="6" aria-hidden="true">
        {kindPill(barClass(kind), 0, 3)}
      </svg>
      {id}
    </>
  );
  if (!onPress)
    return <span className="inline-flex items-center gap-1 font-mono text-text">{body}</span>;
  return (
    <button
      type="button"
      aria-label={`Select ${id}`}
      onClick={onPress}
      className={`inline-flex items-center gap-1 rounded font-mono text-data text-text hover:text-accent ${focusRing}`}
    >
      {body}
    </button>
  );
}

const jump = (t: number) => {
  const u = useUi.getState();
  u.setTime(t);
  u.setTimeOn(true);
};

/** A formatted quantity split for the display: "2.49 nm" to the number and its unit. */
export function splitUnit(text: string): { num: string; unit: string } {
  const m = /^(\S+)\s+(.+)$/.exec(text);
  return m ? { num: m[1]!, unit: m[2]! } : { num: text, unit: '' };
}

/** A caps label of a slot, in the micro size with the caps tracking. */
function Label({ children, tight }: { children: string; tight?: boolean }) {
  return (
    <span className={`text-micro text-muted uppercase ${tight ? '' : 'tracking-caps'}`}>
      {children}
    </span>
  );
}

/** A value cell: a boxed slot on the sunken surface, the label over its value. */
function Cell({
  label,
  wide,
  testId,
  children,
}: {
  label: string;
  /** Two columns of the four. */
  wide?: boolean;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`flex min-w-0 flex-col gap-px rounded-[4px] border border-surface-3 bg-surface-2 px-1 py-0.5${wide ? ' col-span-2' : ''}`}
      data-testid={testId}
    >
      <Label tight>{label}</Label>
      {children}
    </span>
  );
}

/** The panel head: the FRAME label and the time as a value, or FULL RUN with time off. */
export function FrameHead({ t }: { t: number | null }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <Label>{t == null ? 'Full run' : 'Frame'}</Label>
      {t == null ? null : (
        <span className="font-mono text-body font-medium text-text">{fmtTime(t)}</span>
      )}
    </span>
  );
}

/** An empty slot. */
const DASH = <span className="font-mono text-subtle">—</span>;

/**
 * One slot of the readout row: the label over the number, the unit after the number in the
 * micro size. An empty slot shows the dash, so each value sits at the same place in every block.
 */
function Stat({ label, text }: { label: string; text: string | null }) {
  const v = text == null ? null : splitUnit(text);
  return (
    <Cell label={label}>
      {v ? (
        <span className="font-mono whitespace-nowrap text-data font-medium text-text">
          {v.num}
          {v.unit ? <span className="text-micro font-normal text-muted"> {v.unit}</span> : null}
        </span>
      ) : (
        DASH
      )}
    </Cell>
  );
}

/** The DA slot's text: "in 4:52", "at t+8:12" with time off, "entered t+1:02" after the entry. */
function daSlot(daT: number, t: number | null): string {
  if (t == null) return `at ${fmtTime(daT)}`;
  return t < daT ? `in ${mmss(daT - t)}` : `entered ${fmtTime(daT)}`;
}

/**
 * One threat's block as a data display (2026-11-02, user request): four fixed rows, each value
 * always at the same place. Row 1, identity: the id, the step reached, the next step with its
 * countdown. Row 2, the readout: Range, Height, Speed, Closing. Row 3, the holders. Row 4, the
 * status: Margin and DA. An empty slot shows the dash.
 */
export function ThreatBlock({ f, t }: { f: FrameThreat; t: number | null }) {
  const units = useUi((s) => s.units);
  const selected = useUi((s) => s.selectedKeys.includes(f.key));
  const doc = useDocument((s) => s.doc);
  const keyOf = (id: string) => (doc ? idMaps(boardScene(doc)).keyOfId.get(id) : undefined);
  const select = (key: string | undefined) => {
    if (key) useUi.getState().setSelection([key]);
  };
  const marginBad = f.margin != null && f.margin < 0;
  const daBad = f.daT != null && t != null && t >= f.daT;
  return (
    <div
      className={`flex flex-col gap-1.5 border-t border-surface-3 pt-2 pl-2 text-xs first:border-t-0 first:pt-0 ${selected ? 'shadow-[inset_2px_0_0_var(--accent)]' : ''}`}
      data-testid="brief-frame-threat"
      data-selected={selected || undefined}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Select ${f.id}`}
          aria-pressed={selected}
          onClick={() => select(f.key)}
          className={`-ml-1 rounded px-1 font-mono text-body font-medium text-text hover:bg-surface-2 ${focusRing}`}
        >
          {f.id}
        </button>
        <span
          className="flex min-w-0 items-center gap-1.5 text-micro tracking-caps text-text uppercase"
          data-testid="brief-frame-step"
        >
          {f.reached ? (
            <>
              <Glyph stage={f.reached.stage} className="tl-current" />
              <span className="truncate">{f.reached.label}</span>
            </>
          ) : (
            <span className="text-muted">No step yet</span>
          )}
        </span>
        {t != null ? (
          f.next ? (
            <button
              type="button"
              className={`ml-auto flex shrink-0 items-center gap-1.5 rounded-[4px] border border-surface-3 px-1.5 py-px text-muted hover:bg-surface-2 hover:text-text ${focusRing}`}
              aria-label={`Move the time to ${f.id} ${f.next.label} at ${fmtTime(f.next.t)}`}
              title={f.next.definition}
              onClick={() => jump(f.next!.t)}
            >
              <Glyph stage={f.next.stage} className="tl-future" />
              <span className="text-micro tracking-caps uppercase">{f.next.label}</span>
              <span className="font-mono text-text">{mmss(f.next.t - t)}</span>
            </button>
          ) : (
            <span className="ml-auto pr-1">{DASH}</span>
          )
        ) : null}
      </div>
      <div className="grid grid-cols-4 gap-0.5">
        <Stat label="Range" text={f.at ? formatRange(f.at.r, units) : null} />
        <Stat
          label="Height"
          text={f.at ? formatAltitude(f.at.z, units).replace(/ AGL$/, '') : null}
        />
        <Stat label="Speed" text={f.at ? formatSpeed(f.at.spd, units) : null} />
        <Stat label="Closing" text={f.at ? formatSpeed(f.at.vc, units) : null} />
      </div>
      <div className="grid grid-cols-4 gap-0.5">
        {t != null ? (
          <Cell label="Held" wide testId="brief-frame-holders">
            <span className="flex min-h-[16px] flex-wrap items-center gap-x-1.5">
              {f.holders.length
                ? f.holders.map((h) => (
                    <Pill key={h.id} id={h.id} kind={h.kind} onPress={() => select(keyOf(h.id))} />
                  ))
                : DASH}
            </span>
          </Cell>
        ) : (
          <span className="col-span-2" />
        )}
        <span className="contents" data-testid="brief-frame-status">
          <Cell label="Margin">
            {f.margin == null ? (
              DASH
            ) : (
              <span
                className={`font-mono whitespace-nowrap text-data font-medium ${marginBad ? 'brief-ink-hostile' : 'text-text'}`}
              >
                {marginSeconds(f.margin)}
              </span>
            )}
          </Cell>
          <Cell label="DA">
            {f.daT == null ? (
              DASH
            ) : (
              <span
                className={`font-mono whitespace-nowrap text-data font-medium ${daBad ? 'brief-ink-hostile' : 'text-text'}`}
              >
                {daSlot(f.daT, t)}
              </span>
            )}
          </Cell>
        </span>
      </div>
    </div>
  );
}

/** "3 of 7" at the head while blocks are held back; nothing when every block shows. */
export function frameCount(frame: FrameData): string | null {
  return frame.more ? `${frame.threats.length} of ${frame.threats.length + frame.more}` : null;
}

/** The blocks with the "Show n more" press at the foot and "Show fewer" after it. */
export function FrameBlocks({
  frame,
  all,
  t,
  open,
  setOpen,
  gap,
}: {
  frame: FrameData;
  all: FrameData;
  t: number | null;
  open: boolean;
  setOpen: (v: boolean) => void;
  gap: string;
}) {
  const shown = open ? all : frame;
  return (
    <>
      {shown.threats.length ? (
        <div className={`flex flex-col ${gap}`}>
          {shown.threats.map((f) => (
            <ThreatBlock key={f.key} f={f} t={t} />
          ))}
        </div>
      ) : (
        <p className="ps-hint m-0">Add a threat to see what is true in the frame.</p>
      )}
      {frame.more ? (
        <button
          type="button"
          className={`ps-hint m-0 self-start rounded px-1 text-left hover:bg-surface-2 hover:text-text ${focusRing}`}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Show fewer' : `Show ${frame.more} more`}
        </button>
      ) : null}
    </>
  );
}

export default function Frame({ v, card }: { v: Vignette; card: Card | null }) {
  const tS = useUi((s) => s.tS);
  const timeOn = useUi((s) => s.timeOn);
  const selectedKeys = useUi((s) => s.selectedKeys);
  const [open, setOpen] = useState(false);
  const t = timeOn ? tS : null;
  const s = boardScene(v);
  const d = boardDerived(v);
  const ref = card ? toCardRec(v, card).cam.ref : 'asset';
  const focus = card ? card.focus : selectedKeys;
  const frame = frameOf(s, d, t, focus, ref, FRAME_MAX);
  const all = frame.more ? frameOf(s, d, t, focus, ref, Infinity) : frame;
  const items = card?.clip ? sliceItems(s, d, card.clip, focus) : null;
  const count = frameCount(frame);
  return (
    <>
      <Section
        title={t == null ? 'Full run' : `Frame at ${fmtTime(t)}`}
        heading={<FrameHead t={t} />}
        right={count ? <span className="font-mono text-micro text-muted">{count}</span> : null}
        testId="brief-frame"
      >
        <FrameBlocks frame={frame} all={all} t={t} open={open} setOpen={setOpen} gap="gap-2" />
      </Section>
      {items ? (
        <Section title="Inside the slice">
          {items.length ? (
            <ul className="m-0 list-none p-0" data-testid="brief-slice-list">
              {items.map((it, i) => (
                <li key={`${it.t}-${i}`}>
                  <button
                    type="button"
                    className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-surface-2 ${focusRing}`}
                    aria-label={`${it.text} at ${fmtTime(it.t)}`}
                    onClick={() => jump(it.t)}
                  >
                    <span className="w-12 shrink-0 font-mono text-text">{fmtTime(it.t)}</span>
                    <span className="flex w-3 shrink-0 justify-center">
                      {it.glyph ? <Glyph stage={it.glyph} /> : null}
                    </span>
                    <span className="min-w-0 text-text">{it.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ps-hint" data-testid="brief-slice-list">
              No key point, event or window change inside the slice.
            </p>
          )}
        </Section>
      ) : null}
    </>
  );
}
