// F2T2EA steps for display (docs/reference/jiatf-401.md section c).
import type { Stages } from '../../../engine/preview';

export type Step = keyof Stages;

export const STEPS: readonly { key: Step; label: string }[] = [
  { key: 'find', label: 'Find' },
  { key: 'fix', label: 'Fix' },
  { key: 'track', label: 'Track' },
  { key: 'target', label: 'Target' },
  { key: 'engage', label: 'Engage' },
  { key: 'assess', label: 'Assess' },
];
