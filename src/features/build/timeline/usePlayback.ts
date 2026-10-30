// The playback clock. One requestAnimationFrame loop for the whole app, however many components
// call usePlayback(). It advances useUi.tS by dt times rate while playing.
import { useEffect } from 'react';
import { previewOf, useDocument } from '../../../state/document';
import { useUi, type LoopRange } from '../../../state/ui';

/** The time after `ds` seconds of play. `stop` is true when play reached tmaxS without a loop. */
export function advanceTime(
  tS: number,
  ds: number,
  loop: LoopRange | null,
  tmaxS: number,
): { tS: number; stop: boolean } {
  const next = tS + ds;
  if (loop) {
    const span = loop.endS - loop.startS;
    if (next < loop.endS) return { tS: next, stop: false };
    if (span <= 0) return { tS: loop.startS, stop: false };
    return { tS: loop.startS + ((next - loop.endS) % span), stop: false };
  }
  if (next >= tmaxS) return { tS: Math.max(0, tmaxS), stop: true };
  return { tS: next, stop: false };
}

function endS(): number {
  const doc = useDocument.getState().doc;
  return doc ? previewOf(doc).tmaxS : 0;
}

let users = 0;
let raf: number | null = null;
let last: number | null = null;
let unsub: (() => void) | null = null;

function frame(now: number) {
  raf = null;
  const ui = useUi.getState();
  if (!ui.playing) {
    last = null;
    return;
  }
  const dt = last == null ? 0 : Math.max(0, (now - last) / 1000);
  last = now;
  if (dt > 0) {
    const r = advanceTime(ui.tS, dt * ui.rate, ui.loop, endS());
    ui.setTime(r.tS);
    if (r.stop) {
      ui.setPlaying(false);
      last = null;
      return;
    }
  }
  raf = requestAnimationFrame(frame);
}

function start() {
  if (raf != null) return;
  const ui = useUi.getState();
  // Play from the end restarts at the beginning.
  if (!ui.loop && ui.tS >= endS()) ui.setTime(0);
  last = null;
  raf = requestAnimationFrame(frame);
}

function stop() {
  if (raf != null) cancelAnimationFrame(raf);
  raf = null;
  last = null;
}

/** Runs the clock while mounted anywhere. Safe to call from several components at once. */
export function usePlayback(): void {
  useEffect(() => {
    users++;
    if (users === 1) {
      unsub = useUi.subscribe((s, prev) => {
        if (s.playing && !prev.playing) start();
        else if (!s.playing && prev.playing) stop();
      });
      if (useUi.getState().playing) start();
    }
    return () => {
      users--;
      if (users === 0) {
        unsub?.();
        unsub = null;
        stop();
      }
    };
  }, []);
}

/** For tests: whether a frame is scheduled. */
export function playbackScheduled(): boolean {
  return raf != null;
}
