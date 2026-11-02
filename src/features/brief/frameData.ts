// What is true in a frame (plan phase 13, reading 3; lane 13.2 item 2): for each threat in focus,
// the F2T2EA step reached at the time, the next step and its countdown, the readout (range,
// height, speed, closing speed), the systems that hold it, the engage margin and the time to the
// defended asset. For a slice, what happens inside it: every key point, authored event and
// coverage window start or end between its start and end, in time order. Pure functions over the
// scene and the derived fields; Frame.tsx, the stage aids and the print deck read them.
import type { Clip } from '../../domain/types';
import type { Scene } from '../../board';
import type { Derived } from '../../engine';
import type { Readout } from '../../engine/at';
import { mmss } from '../../engine/tokens';
import { fmtTime } from '../shared/units';
import type { GlyphStage } from '../timeline/glyphs';
import { T_EPS, marginSeconds, stepAt } from '../timeline/layout';
import { keyPoints, type KeyPoint } from '../timeline/stages';

/** At most this many threat blocks; the rest are counted as "and n more". */
export const FRAME_MAX = 6;

export type Holder = { id: string; kind: string };

export type FrameThreat = {
  key: string;
  id: string;
  /** The latest F2T2EA key point at or before t (over the whole run with time off). */
  reached: KeyPoint | null;
  /** The first F2T2EA key point after t; null with time off or after the last. */
  next: KeyPoint | null;
  /** The readout at t; null with time off or with no sample. */
  at: Readout | null;
  /** The systems whose window holds the threat at t. */
  holders: Holder[];
  margin: number | null;
  /** Defended asset entry time; null when the path never enters it. */
  daT: number | null;
};

export type Frame = { t: number | null; threats: FrameThreat[]; more: number };

/** "x2", "x0.25": the strip's rate label. */
export const rateText = (rate: number) => `x${rate}`;

/** "t+0:10 to t+0:40 · x2". */
export function sliceText(clip: Pick<Clip, 't0S' | 't1S' | 'rate'>): string {
  return `${fmtTime(clip.t0S)} to ${fmtTime(clip.t1S)} · ${rateText(clip.rate)}`;
}

/** "margin +18 s", "margin -5 s"; null without an engage window. */
export function marginText(margin: number | null): string | null {
  return margin == null ? null : `margin ${marginSeconds(margin)}`;
}

/** "DA in 1:02", "DA at t+1:02" with time off, "DA entered at t+1:02" after the entry. */
export function daText(daT: number | null, t: number | null): string {
  if (daT == null) return 'No DA entry';
  if (t == null) return `DA at ${fmtTime(daT)}`;
  return t < daT ? `DA in ${mmss(daT - t)}` : `DA entered at ${fmtTime(daT)}`;
}

/** The F2T2EA key points of a threat, without the defended asset entry. */
const steps = (d: Derived, id: string) => keyPoints(d, id).filter((k) => k.stage !== 'da');

/** The next step after t: the earliest F2T2EA key point after t; null with time off. */
export function nextStep(d: Derived, id: string, t: number | null): KeyPoint | null {
  if (t == null) return null;
  let out: KeyPoint | null = null;
  for (const k of steps(d, id)) if (k.t > t + T_EPS && (!out || k.t < out.t)) out = k;
  return out;
}

/** The paths in focus: those the focus keys name, else every path. */
export function pathsInFocus(s: Scene, focus: readonly string[]) {
  const paths = s.scene.paths;
  const hit = paths.filter((p) => focus.includes(p.key));
  return hit.length ? hit : paths;
}

/** The frame at t (null: time off) for the threats in focus; `ref` is the readout's origin. */
export function frameOf(
  s: Scene,
  d: Derived,
  t: number | null,
  focus: readonly string[],
  ref: string,
): Frame {
  const paths = pathsInFocus(s, focus);
  const kindOf = new Map(s.scene.systems.map((x) => [x.id, x.kind]));
  const threats = paths.slice(0, FRAME_MAX).map((p): FrameThreat => {
    const at = t == null ? null : d.at(p.id, t, ref);
    const holders = (at?.covering ?? []).map((id) => ({ id, kind: kindOf.get(id) ?? '' }));
    return {
      key: p.key,
      id: p.id,
      reached: stepAt(keyPoints(d, p.id), t),
      next: nextStep(d, p.id, t),
      at,
      holders,
      margin: d.window[p.id]?.margin ?? null,
      daT: d.daEntry[p.id] ?? null,
    };
  });
  return { t, threats, more: Math.max(0, paths.length - FRAME_MAX) };
}

/** One line of the inside-the-slice list. `glyph` marks a key point; null for other lines. */
export type SliceItem = { t: number; glyph: GlyphStage | null; text: string };

const EVENT_WORD: Record<string, string> = {
  detect: 'Detect',
  track: 'Track',
  id: 'Identify',
  identify: 'Identify',
  engage: 'Engage',
  split: 'Split',
  merge: 'Merge',
  loiter: 'Loiter',
  terminal: 'Terminal',
  checkpoint: 'Checkpoint',
};

/**
 * Inside the slice: the key points (with the defended asset entry), the authored events and the
 * coverage window opens and closes of the threats in focus between t0S and t1S (both included),
 * in time order. Ties keep the order key point, event, window.
 */
export function sliceItems(
  s: Scene,
  d: Derived,
  clip: Pick<Clip, 't0S' | 't1S'>,
  focus: readonly string[],
): SliceItem[] {
  const inside = (t: number) => t >= clip.t0S - 1e-6 && t <= clip.t1S + 1e-6;
  const out: (SliceItem & { o: number })[] = [];
  const ids = pathsInFocus(s, focus).map((p) => p.id);
  for (const id of ids) {
    for (const k of keyPoints(d, id))
      if (inside(k.t))
        out.push({
          t: k.t,
          glyph: k.stage,
          text: `${id} ${k.label}${k.system ? ` · ${k.system}` : ''}`,
          o: 0,
        });
    for (const e of s.events)
      if (e.path === id && inside(e.t)) {
        const word = EVENT_WORD[e.type] ?? e.type;
        const label = e.label && e.label !== word ? ` · ${e.label}` : '';
        out.push({
          t: e.t,
          glyph: null,
          text: `${id} ${word}${e.system ? ` · ${e.system}` : ''}${label}`,
          o: 1,
        });
      }
    for (const sys of s.scene.systems)
      for (const w of d.windows[sys.id]?.[id] ?? []) {
        if (inside(w.tIn))
          out.push({ t: w.tIn, glyph: null, text: `${sys.id} window opens on ${id}`, o: 2 });
        if (inside(w.tOut))
          out.push({ t: w.tOut, glyph: null, text: `${sys.id} window closes on ${id}`, o: 2 });
      }
  }
  out.sort((a, b) => a.t - b.t || a.o - b.o);
  return out.map(({ t, glyph, text }) => ({ t, glyph, text }));
}

/** The time a card opens at: its slice start, else its frame time, else null (full run). */
export function cardTime(card: { tS: number | null; clip: Clip | null }): number | null {
  return card.clip ? card.clip.t0S : card.tS;
}

/** "at t+1:40", "from t+0:10 to t+0:40", "full run": a card's time in a sentence. */
export function cardWhen(card: { tS: number | null; clip: Clip | null }): string {
  if (card.clip) return `from ${fmtTime(card.clip.t0S)} to ${fmtTime(card.clip.t1S)}`;
  return card.tS == null ? 'over the full run' : `at ${fmtTime(card.tS)}`;
}

/** The caption's empty state in a card (principle 6.1): what the caption should say. Not stored. */
export function captionPlaceholder(card: { tS: number | null; clip: Clip | null }): string {
  return `Write what the viewer must see ${cardWhen(card)}.`;
}
