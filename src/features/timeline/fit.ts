// The action span of a document (review of 2026-11-01, lane 12.4): the part of the run the
// strip opens on when the run is mostly empty ingress. From the earliest coverage window start
// over every system and threat (else the earliest key point, else 0), less a lead of 10 percent
// of the span or 30 s, whichever is larger, to the run's end.
import { STAGES, type Derived } from '../../engine';

/** The strip's shortest run, so an empty or short profile still has a usable axis. */
export const MIN_RUN_S = 60;
export const runEnd = (tmaxS: number) => Math.max(MIN_RUN_S, tmaxS);

export const LEAD_MIN_S = 30;
export const LEAD_FRAC = 0.1;
/** The strip opens on the action span when the run is more than this many times its length. */
export const FIT_RATIO = 3;

/** The earliest coverage window start, else the earliest key point, else 0. */
export function actionStart(d: Derived): number {
  let t0 = Infinity;
  for (const by of Object.values(d.windows))
    for (const wins of Object.values(by)) for (const w of wins) t0 = Math.min(t0, w.tIn);
  if (t0 === Infinity)
    for (const st of Object.values(d.stages))
      for (const s of STAGES) {
        const v = st[s];
        if (v) t0 = Math.min(t0, v.t);
      }
  if (t0 === Infinity)
    for (const t of Object.values(d.daEntry)) if (t != null) t0 = Math.min(t0, t);
  return t0 === Infinity ? 0 : t0;
}

/** The action span, or null when it is the whole run (nothing to fit to). */
export function actionSpan(d: Derived): { t0S: number; t1S: number } | null {
  const end = runEnd(d.tmax);
  const start = actionStart(d);
  const lead = Math.max(LEAD_MIN_S, LEAD_FRAC * (end - start));
  const t0 = Math.max(0, Math.round((start - lead) * 10) / 10);
  if (t0 <= 0 || end - t0 <= 0) return null;
  return { t0S: t0, t1S: end };
}

/** True when the strip should open on the action span: the run is over FIT_RATIO times it. */
export function wantsFit(d: Derived): boolean {
  const span = actionSpan(d);
  return !!span && runEnd(d.tmax) > FIT_RATIO * (span.t1S - span.t0S);
}
