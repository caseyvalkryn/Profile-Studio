// The F2T2EA key points of a threat (principle 1.2: the step names are the same on the board,
// the timeline, the inspector and the brief) and the one-line definition of each step, as the
// preview computes it (src/engine/preview.ts). The timeline draws them as ticks; the Brief's
// notes panel lists them so the briefer can jump to each and teach the step.
import { STAGES, type Derived, type StageName } from '../../engine';

export const STAGE_LABEL: Record<StageName, string> = {
  find: 'Find',
  fix: 'Fix',
  track: 'Track',
  target: 'Target',
  engage: 'Engage',
  assess: 'Assess',
};

export const STAGE_DEFINITION: Record<StageName, string> = {
  find: 'The first sensor window on the threat: the first time any sensor can see it.',
  fix: 'A sensor holds the threat for its confirm time, so the contact becomes a track.',
  track:
    'An EO/IR sensor holds the threat for the identification dwell, so the track is identified.',
  target: 'Track plus the decision time and the assignment time set in the profile.',
  engage: 'The first effector window at or after Target.',
  assess: 'Engage plus the effector time to effect: the first time the result can be judged.',
};

/** One key point on a threat's timeline. `system` is the display id that gives the time. */
export type KeyPoint = {
  stage: StageName | 'da';
  label: string;
  t: number;
  system: string | null;
  definition: string;
};

export const DA_DEFINITION = 'The threat enters the defended asset.';

/** The threat's F2T2EA times in order, then its defended asset entry, each with its definition. */
export function keyPoints(d: Derived, threatId: string): KeyPoint[] {
  const out: KeyPoint[] = [];
  const st = d.stages[threatId];
  if (st)
    for (const s of STAGES) {
      const v = st[s];
      if (v)
        out.push({
          stage: s,
          label: STAGE_LABEL[s],
          t: v.t,
          system: v.system,
          definition: STAGE_DEFINITION[s],
        });
    }
  const da = d.daEntry[threatId];
  if (da != null)
    out.push({ stage: 'da', label: 'DA', t: da, system: null, definition: DA_DEFINITION });
  return out;
}
