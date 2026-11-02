// The strip's play bar: first, previous key point, play, next key point, last, the rate, the loop
// (Lucide Repeat for the whole run, Repeat1 for the range: a pressed toggle each, lane 13.1), the
// boxed clock (type a time and press Enter) and Time off.
import {
  ChevronFirst,
  ChevronLast,
  Pause,
  Play,
  Repeat,
  Repeat1,
  SkipBack,
  SkipForward,
  TimerOff,
} from 'lucide-react';
import { useState } from 'react';
import { nextStop, prevStop } from '../../engine';
import { useUi } from '../../state/ui';
import { Tooltip } from '../../ui/Tooltip';
import { focusRing } from '../../ui/focus';
import { fmtTime } from '../shared/units';
import { parseTime } from './layout';

export const RATES = [0.25, 0.5, 1, 2, 4, 8, 16, 32] as const;

export type PlayBarProps = {
  mode: 'build' | 'brief';
  /** The run's last time. */
  tmax: number;
  /** The key point stops, read at the press. */
  stopList: () => number[];
  /** Set the time (rounded and clamped) and turn time on. */
  setTimeHere: (t: number) => void;
};

export default function PlayBar({ mode, tmax, stopList, setTimeHere }: PlayBarProps) {
  const tS = useUi((s) => s.tS);
  const timeOn = useUi((s) => s.timeOn);
  const playing = useUi((s) => s.playing);
  const loop = useUi((s) => s.loop);
  const rate = useUi((s) => s.rate);
  const zoomed = useUi((s) => s.tview != null);
  const ui = useUi.getState;
  const [clockDraft, setClockDraft] = useState<string | null>(null);

  const loopMode: 'off' | 'all' | 'range' = !loop
    ? 'off'
    : loop.startS <= 0 && loop.endS >= tmax - 1e-9
      ? 'all'
      : 'range';
  // At the full view the range is the whole run, so the range toggle waits for a zoom; it stays
  // focusable (aria-disabled) so its tooltip says why (review 13 N-13).
  const rangeOff = !zoomed && loopMode !== 'range';
  const onLoop = (v: 'all' | 'range') => {
    const u = ui();
    if (loopMode === v) u.setLoop(null);
    else if (v === 'all') u.setLoop({ startS: 0, endS: tmax });
    else if (u.tview) u.setLoop({ startS: u.tview.t0S, endS: u.tview.t1S });
  };
  const clockText = timeOn ? fmtTime(tS) : '';
  const onClockKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = parseTime(e.currentTarget.value);
      if (v != null) setTimeHere(v);
      setClockDraft(null);
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setClockDraft(null);
      e.currentTarget.blur();
    }
  };
  const mini = `ps-btn mini quiet ${focusRing}`;

  return (
    <div className="tl-bar" role="toolbar" aria-label="Play bar">
      <Tooltip content="Time to start" shortcut="Home">
        <button
          type="button"
          className={mini}
          aria-label="Time to start"
          onClick={() => setTimeHere(0)}
        >
          <ChevronFirst aria-hidden="true" />
        </button>
      </Tooltip>
      <Tooltip content="Previous key point" shortcut="[">
        <button
          type="button"
          className={mini}
          aria-label="Previous key point"
          onClick={() => setTimeHere(prevStop(stopList(), ui().tS))}
        >
          <SkipBack aria-hidden="true" />
        </button>
      </Tooltip>
      <Tooltip content={playing ? 'Pause' : 'Play'} shortcut={mode === 'build' ? 'Space' : 'P'}>
        <button
          type="button"
          className={mini}
          aria-label={playing ? 'Pause' : 'Play'}
          aria-pressed={playing}
          onClick={() => ui().setPlaying(!ui().playing)}
        >
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </button>
      </Tooltip>
      <Tooltip content="Next key point" shortcut="]">
        <button
          type="button"
          className={mini}
          aria-label="Next key point"
          onClick={() => setTimeHere(nextStop(stopList(), ui().tS, tmax))}
        >
          <SkipForward aria-hidden="true" />
        </button>
      </Tooltip>
      <Tooltip content="Time to end" shortcut="End">
        <button
          type="button"
          className={mini}
          aria-label="Time to end"
          onClick={() => setTimeHere(tmax)}
        >
          <ChevronLast aria-hidden="true" />
        </button>
      </Tooltip>
      <select
        aria-label="Play rate"
        className={`ps-input tl-select ${focusRing}`}
        value={String(rate)}
        onChange={(e) => ui().setRate(Number(e.target.value))}
      >
        {RATES.map((r) => (
          <option key={r} value={String(r)}>
            x{r}
          </option>
        ))}
      </select>
      <div className="tl-loop" role="group" aria-label="Loop">
        <Tooltip content={loopMode === 'all' ? 'Loop off' : 'Loop the whole run'}>
          <button
            type="button"
            className={mini}
            aria-label="Loop all"
            aria-pressed={loopMode === 'all'}
            onClick={() => onLoop('all')}
          >
            <Repeat aria-hidden="true" />
          </button>
        </Tooltip>
        <Tooltip
          content={
            loopMode === 'range'
              ? 'Loop off'
              : rangeOff
                ? 'Zoom the timeline first'
                : 'Loop the range (Shift and drag on the axis)'
          }
        >
          <button
            type="button"
            className={mini}
            aria-label="Loop range"
            aria-pressed={loopMode === 'range'}
            aria-disabled={rangeOff || undefined}
            onClick={() => {
              if (!rangeOff) onLoop('range');
            }}
          >
            <Repeat1 aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
      <span className="tl-sp" />
      <input
        aria-label="Time"
        className={`ps-input tl-clock ${focusRing}`}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        placeholder="full run"
        value={clockDraft ?? clockText}
        onFocus={() => setClockDraft(clockText)}
        onChange={(e) => setClockDraft(e.target.value)}
        onKeyDown={onClockKey}
        onBlur={() => setClockDraft(null)}
        data-testid="tl-clock"
      />
      <Tooltip content="Time off">
        <button
          type="button"
          className={mini}
          aria-label="Time off"
          disabled={!timeOn}
          onClick={() => ui().setTimeOn(false)}
        >
          <TimerOff aria-hidden="true" />
        </button>
      </Tooltip>
    </div>
  );
}
