// The Frame panel (plan phase 13, lane 13.2 item 2): the top section of the notes panel. "Frame
// at t+0:10" (or "Full run" with time off), then one block per threat in focus (every threat when
// the focus names none, at most six): the glyph and name of the step reached, the next step with
// its countdown (a press moves the time there), range, height, speed and closing speed in the
// display units, the systems that hold it as the strip's pills, the engage margin and the time to
// the defended asset. A card with a slice adds "Inside the slice": every key point, authored
// event and window open or close between its start and end, each a press that moves the time.
import type { Card, Vignette } from '../../domain/types';
import { useUi } from '../../state/ui';
import { focusRing } from '../../ui/focus';
import { boardDerived, boardScene } from '../build/board/derived';
import { fmtTime, formatAltitude, formatRange, formatSpeed } from '../shared/units';
import { mmss } from '../../engine/tokens';
import { kindPill, stageGlyph, type GlyphStage } from '../timeline/glyphs';
import { barClass } from '../timeline/layout';
import { frameOf, daText, marginText, sliceItems, type FrameThreat } from './frameData';
import { Section } from './Section';
import { toCardRec } from './toCardRec';

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
export function Pill({ id, kind }: { id: string; kind: string }) {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-text">
      <svg width="10" height="6" aria-hidden="true">
        {kindPill(barClass(kind), 0, 3)}
      </svg>
      {id}
    </span>
  );
}

const jump = (t: number) => {
  const u = useUi.getState();
  u.setTime(t);
  u.setTimeOn(true);
};

function ThreatBlock({ f, t }: { f: FrameThreat; t: number | null }) {
  const units = useUi((s) => s.units);
  const margin = marginText(f.margin);
  return (
    <div className="flex flex-col gap-1 text-xs" data-testid="brief-frame-threat">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono font-medium text-text">{f.id}</span>
        <span
          className={`font-mono ${f.margin != null && f.margin < 0 ? 'brief-ink-hostile' : 'text-muted'}`}
        >
          {margin ?? 'no engage window'}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-text" data-testid="brief-frame-step">
          {f.reached ? (
            <>
              <Glyph stage={f.reached.stage} className="tl-current" />
              {f.reached.label}
            </>
          ) : (
            <span className="text-muted">No step yet</span>
          )}
        </span>
        {f.next && t != null ? (
          <button
            type="button"
            className={`flex items-center gap-1.5 rounded px-1 text-text hover:bg-surface-2 ${focusRing}`}
            aria-label={`Move the time to ${f.id} ${f.next.label} at ${fmtTime(f.next.t)}`}
            title={f.next.definition}
            onClick={() => jump(f.next!.t)}
          >
            <Glyph stage={f.next.stage} className="tl-future" />
            <span>
              {f.next.label} in <span className="font-mono">{mmss(f.next.t - t)}</span>
            </span>
          </button>
        ) : null}
      </div>
      {f.at ? (
        <dl className="m-0 grid grid-cols-[52px_minmax(0,1fr)_52px_minmax(0,1fr)] gap-x-2 gap-y-0.5">
          <dt className="text-muted">Range</dt>
          <dd className="m-0 font-mono text-text">{formatRange(f.at.r, units)}</dd>
          <dt className="text-muted">Height</dt>
          <dd className="m-0 font-mono text-text">{formatAltitude(f.at.z, units)}</dd>
          <dt className="text-muted">Speed</dt>
          <dd className="m-0 font-mono text-text">{formatSpeed(f.at.spd, units)}</dd>
          <dt className="text-muted">Closing</dt>
          <dd className="m-0 font-mono text-text">{formatSpeed(f.at.vc, units)}</dd>
        </dl>
      ) : null}
      {t != null ? (
        <div
          className="flex flex-wrap items-center gap-x-2.5 gap-y-1"
          data-testid="brief-frame-holders"
        >
          <span className="text-muted">Held by</span>
          {f.holders.length ? (
            f.holders.map((h) => <Pill key={h.id} id={h.id} kind={h.kind} />)
          ) : (
            <span className="text-muted">no system</span>
          )}
        </div>
      ) : null}
      <div
        className={`font-mono ${f.daT != null && t != null && t >= f.daT ? 'brief-ink-hostile' : 'text-muted'}`}
      >
        {daText(f.daT, t)}
      </div>
    </div>
  );
}

export default function Frame({ v, card }: { v: Vignette; card: Card | null }) {
  const tS = useUi((s) => s.tS);
  const timeOn = useUi((s) => s.timeOn);
  const selectedKeys = useUi((s) => s.selectedKeys);
  const t = timeOn ? tS : null;
  const s = boardScene(v);
  const d = boardDerived(v);
  const ref = card ? toCardRec(v, card).cam.ref : 'asset';
  const focus = card ? card.focus : selectedKeys;
  const frame = frameOf(s, d, t, focus, ref);
  const items = card?.clip ? sliceItems(s, d, card.clip, focus) : null;
  return (
    <>
      <Section title={t == null ? 'Full run' : `Frame at ${fmtTime(t)}`} testId="brief-frame">
        {frame.threats.length ? (
          frame.threats.map((f) => <ThreatBlock key={f.key} f={f} t={t} />)
        ) : (
          <p className="ps-hint">Add a threat to see what is true in the frame.</p>
        )}
        {frame.more ? <p className="ps-hint">and {frame.more} more</p> : null}
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
