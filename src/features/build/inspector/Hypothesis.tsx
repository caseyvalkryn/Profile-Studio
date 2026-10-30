// The selected hypothesis in the inspector (review 6 F-03): its measure, operator, threshold and
// prediction, in display units. Values are stored in the measure's DroneScore unit. The first run
// locks the hypothesis; after that the fields are read-only.
import '../../../commands/commands';
import { execute } from '../../../commands/registry';
import { measureById } from '../../../domain/measures';
import { thresholdInCanonical } from '../../../engine/score';
import type { Hypothesis, Op, Vignette } from '../../../domain/types';
import { useDocument } from '../../../state/document';
import { useUi } from '../../../state/ui';
import { Field } from '../../../ui';
import { Grid, Note, Select } from './fields';
import {
  OP_TEXT,
  measureFromDisplay,
  measureScale,
  measureToDisplay,
  round,
  utc,
} from '../../shared/units';

const OPS: readonly { value: Op; label: string }[] = [
  { value: '>=', label: `${OP_TEXT['>=']} at least` },
  { value: '<=', label: `${OP_TEXT['<=']} at most` },
];

export function HypothesisFields({ v, h }: { v: Vignette; h: Hypothesis }) {
  const units = useUi((s) => s.units);
  const edit = useDocument((s) => s.edit);
  const locked = h.lockedAt != null;
  const scale = measureScale(units, h.measure);
  const decimals = scale.decimals + 1;
  const shown = (canonical: number) =>
    round(measureToDisplay(units, h.measure, canonical), decimals);
  const stored = (display: number) => measureFromDisplay(units, h.measure, display);

  const ids = v.measures.map((m) => m.id);
  if (!ids.includes(h.measure)) ids.unshift(h.measure);
  const measureOptions = ids.map((id) => ({
    value: id,
    label: `${id} ${measureById(id)?.name ?? ''}`.trim(),
  }));

  const setHyp = (label: string, fn: (x: Hypothesis) => void) =>
    edit(label, (d) => {
      const x = d.hypotheses.find((y) => y.key === h.key);
      if (x && !x.lockedAt) fn(x);
    });

  const setMeasure = (id: string) =>
    setHyp('Set hypothesis measure', (x) => {
      x.measure = id;
      // Take the operator and threshold of the vignette's setting for that measure. The old
      // prediction was in the old measure's unit, so it is cleared.
      const s = v.measures.find((m) => m.id === id);
      const canonical = measureById(id)?.unit ?? '';
      const t = s ? thresholdInCanonical(s.threshold, s.unit, canonical) : null;
      if (s) x.op = s.op;
      if (t != null) x.value = t;
      x.prediction = null;
    });

  const setPrediction = (low: number, high: number) =>
    execute('hypothesis.setPrediction', undefined, { low, high });

  const lockText = locked ? `Locked at the first run, ${utc(h.lockedAt as string)}.` : '';
  return (
    <div className="flex flex-col gap-2 rounded-sm p-1 ring-1 ring-accent" data-hypothesis-fields>
      <Select
        label="Measure"
        value={h.measure}
        options={measureOptions}
        disabled={locked}
        onChange={setMeasure}
      />
      <Grid>
        <Select
          label="Operator"
          value={h.op}
          options={OPS}
          disabled={locked}
          onChange={(op) => setHyp('Set hypothesis operator', (x) => void (x.op = op))}
        />
        <Field
          label="Threshold"
          unit={scale.unit}
          value={shown(h.value)}
          disabled={locked}
          onCommit={(n) => setHyp('Set hypothesis threshold', (x) => void (x.value = stored(n)))}
        />
      </Grid>
      <Grid>
        <Field
          label="Prediction low"
          unit={scale.unit}
          allowBlank
          value={h.prediction ? shown(h.prediction.low) : undefined}
          disabled={locked}
          onCommit={(n) => {
            if (n === undefined) return;
            const low = stored(n);
            setPrediction(low, h.prediction ? Math.max(low, h.prediction.high) : low);
          }}
        />
        <Field
          label="Prediction high"
          unit={scale.unit}
          allowBlank
          value={h.prediction ? shown(h.prediction.high) : undefined}
          disabled={locked}
          onCommit={(n) => {
            if (n === undefined) return;
            const high = stored(n);
            setPrediction(h.prediction ? Math.min(high, h.prediction.low) : high, high);
          }}
        />
      </Grid>
      <Note>
        {locked
          ? `${lockText} The prediction stays as recorded.`
          : 'The first run locks the prediction.'}
      </Note>
    </div>
  );
}
