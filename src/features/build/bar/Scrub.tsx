// The scrub under the board (mockup `.scrub`, line 390): the Time checkbox (`ui.timeOn`), the
// range 0 to the profile's end time (`ui.tS`, off while time is off) and its value, "200 s" or
// "full run". The authored events sit on the track as beads; a bead click sets the time there
// and selects the event. Right-click is the scrub menu (spec section 8: Set time here, Add event
// here). The scrub mounts the playback clock, so Space plays while Build is open.
import { useMemo, useRef, useState } from 'react';
import { usePreview, useDocument } from '../../../state/document';
import { useUi } from '../../../state/ui';
import { ContextMenu, type MenuItem } from '../../../ui';
import { focusRing } from '../../../ui/focus';
import { menuItemsFor } from '../../commands/adapter';
import { usePlayback } from './usePlayback';

/** The scrub's shortest span, so an empty or short profile still has a usable range. */
export const SCRUB_MIN_S = 60;

/** Half the range thumb: a bead at t sits over the thumb's centre at t. */
const THUMB_HALF_PX = 8;

export function scrubMax(tmaxS: number): number {
  return Math.max(SCRUB_MIN_S, Math.round(tmaxS));
}

export default function Scrub() {
  usePlayback();
  const events = useDocument((s) => s.doc?.events);
  const preview = usePreview();
  const tS = useUi((s) => s.tS);
  const timeOn = useUi((s) => s.timeOn);
  const max = scrubMax(preview?.tmaxS ?? 0);
  const trackEl = useRef<HTMLDivElement>(null);
  const [menuT, setMenuT] = useState<number | null>(null);

  const menuItems: MenuItem[] = useMemo(
    // Scrub commands take no number, so the prompt callback is never called.
    () => menuItemsFor('timeline', { pointer: { x: 0, y: 0, tS: menuT ?? 0 }, onArg: () => {} }),
    // Rebuilt for each right-click; the stores are read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [menuT, events],
  );

  const timeAt = (clientX: number): number => {
    const el = trackEl.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    const w = r.width - 2 * THUMB_HALF_PX;
    const f = w > 0 ? (clientX - r.left - THUMB_HALF_PX) / w : 0;
    return Math.round(Math.min(1, Math.max(0, f)) * max);
  };

  const ui = useUi.getState;
  return (
    <div
      role="group"
      aria-label="Time"
      className="mt-2 flex shrink-0 items-center gap-2"
      data-testid="scrub"
    >
      <label className="inline-flex cursor-pointer items-center gap-1.5 text-data text-muted">
        <input
          type="checkbox"
          checked={timeOn}
          onChange={(e) => ui().setTimeOn(e.target.checked)}
          className={focusRing}
        />
        Time
      </label>
      <ContextMenu items={menuItems}>
        <div
          ref={trackEl}
          className="relative flex min-w-0 flex-1 items-center"
          onContextMenu={(e) => setMenuT(timeAt(e.clientX))}
        >
          <input
            type="range"
            aria-label="Scene time"
            min={0}
            max={max}
            step={1}
            value={Math.min(Math.round(tS), max)}
            disabled={!timeOn}
            onChange={(e) => ui().setTime(Number(e.target.value))}
            className={`w-full accent-[var(--accent)] disabled:opacity-60 ${focusRing}`}
          />
          {(events ?? []).map((e) => {
            const f = Math.min(1, Math.max(0, e.tS / max));
            return (
              <button
                key={e.key}
                type="button"
                title={e.label}
                aria-label={`${e.id} ${e.label}, ${Math.round(e.tS)} s`}
                data-testid="scrub-bead"
                data-t={e.tS}
                onClick={() => {
                  const u = ui();
                  u.setTimeOn(true);
                  u.setTime(e.tS);
                  u.setSelection([e.key]);
                }}
                className={`absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-surface-0 bg-text ${focusRing}`}
                style={{
                  left: `calc(${THUMB_HALF_PX}px + (100% - ${2 * THUMB_HALF_PX}px) * ${f})`,
                }}
              />
            );
          })}
        </div>
      </ContextMenu>
      <span
        className="w-14 shrink-0 text-right font-mono text-data text-text"
        data-testid="scrub-value"
      >
        {timeOn ? `${Math.round(tS)} s` : 'full run'}
      </span>
    </div>
  );
}
