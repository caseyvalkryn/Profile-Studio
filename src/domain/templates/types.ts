import type { Factor } from '../../engine/sweep';
import type { Step } from '../measures';
import type { Vignette } from '../types';

/** Lane 6.1 contract. `make()` returns a fresh vignette (new id and keys) on every call. */
export type Template = {
  id: string;
  name: string;
  question: string;
  /** F2T2EA steps the preview reaches with the template as built. */
  steps: Step[];
  /** DroneScore ids the question rests on. */
  mainMeasures: string[];
  make: () => Vignette;
  /** Sweep hint for templates that are a parameter sweep; levels mirror `factor.levels`. */
  sweep?: { factor: Factor; levels: number[] };
};
