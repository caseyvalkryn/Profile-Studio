// F2T2EA steps for display (docs/reference/jiatf-401.md section c) and the Monte Carlo trace
// times behind each one.
import type { Stages } from '../../../engine/preview';
import type { RunTrace, TraceKey } from '../../../engine/run';

export type Step = keyof Stages;

export const STEPS: readonly { key: Step; label: string }[] = [
  { key: 'find', label: 'Find' },
  { key: 'fix', label: 'Fix' },
  { key: 'track', label: 'Track' },
  { key: 'target', label: 'Target' },
  { key: 'engage', label: 'Engage' },
  { key: 'assess', label: 'Assess' },
];

/** The run trace gate behind each step: detect, track, identify, target, engage, effect. */
export const TRACE_OF_STEP: Record<Step, TraceKey> = {
  find: 'detect',
  fix: 'track',
  track: 'identify',
  target: 'target',
  engage: 'engage',
  assess: 'effect',
};

export type StepMean = { meanS: number; n: number };

/** Mean step time over the replicates that reached it, for one threat (display id). */
export function runStepMeans(
  trace: readonly RunTrace[],
  threatId: string,
): Partial<Record<Step, StepMean>> {
  const sums: Partial<Record<Step, StepMean>> = {};
  for (const tr of trace) {
    if (tr.threat !== threatId) continue;
    for (const { key } of STEPS) {
      const t = tr.times[TRACE_OF_STEP[key]];
      if (t == null) continue;
      const s = (sums[key] ??= { meanS: 0, n: 0 });
      s.meanS += t;
      s.n += 1;
    }
  }
  for (const s of Object.values(sums)) if (s.n) s.meanS /= s.n;
  return sums;
}
