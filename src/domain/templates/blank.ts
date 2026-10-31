// Blank (spec section 9, last row): a site, a defended asset, an empty question. Nothing else.
import type { Template } from './types';
import { question, vignette } from './build';

export const blank: Template = {
  id: 'blank',
  name: 'Blank',
  question: '',
  steps: [],
  mainMeasures: [],
  make: () => vignette({ name: 'Untitled profile', questions: [question('')] }),
};
