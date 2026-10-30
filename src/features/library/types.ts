// The template contract with lane 6.2 (src/domain/templates). Templates arrive as a prop.
import type { Step } from '../../domain/measures';
import type { Vignette } from '../../domain/types';

export type Template = {
  id: string;
  name: string;
  /** The test question, shown in one or two lines on the card. */
  question: string;
  /** The F2T2EA steps the template exercises, in order. */
  steps: Step[];
  /** DroneScore IDs the template scores. */
  mainMeasures: string[];
  /** A fresh vignette with new keys. */
  make: () => Vignette;
};
