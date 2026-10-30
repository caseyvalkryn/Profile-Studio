// Build workspace right panel (spec section 7): the fields of the selected kind, with units.
// Reads the selection from the ui store and edits the document, one undo step per field.
import { Field } from '../../../ui';
import { selected } from '../../../commands/select';
import { measureById } from '../../../domain/measures';
import type { Vignette } from '../../../domain/types';
import { useDocument } from '../../../state/document';
import { useUi } from '../../../state/ui';
import { focusRing } from '../../../ui/focus';
import { formatThreshold } from '../../shared/units';
import { Grid, Note, Section, UnitField } from './fields';
import { HypothesisFields } from './Hypothesis';
import { AreaPanel, EffectorPanel, NodePanel, SensorPanel, ThreatPanel } from './panels';

export const INSPECTOR_WIDTH = 280;

export default function Inspector() {
  const doc = useDocument((s) => s.doc);
  const keys = useUi((s) => s.selectedKeys);

  let body;
  if (!doc) {
    body = <Note>No vignette open.</Note>;
  } else {
    const found = selected(doc, keys);
    const one = found[0];
    if (found.length > 1) {
      body = (
        <Section title="Selection">
          <Note>{found.length} items selected. Select one to see its fields.</Note>
        </Section>
      );
    } else if (!one) {
      body = <VignetteHeader v={doc} />;
    } else if (one.kind === 'threat') {
      body = <ThreatPanel key={one.value.key} t={one.value} />;
    } else if (one.kind === 'waypoint') {
      body = <ThreatPanel key={one.threat.key} t={one.threat} activeKey={one.value.key} />;
    } else if (one.kind === 'sensor') {
      body = <SensorPanel key={one.value.key} s={one.value} />;
    } else if (one.kind === 'effector') {
      body = <EffectorPanel key={one.value.key} e={one.value} />;
    } else if (one.kind === 'node') {
      body = <NodePanel key={one.value.key} n={one.value} />;
    } else {
      body = <AreaPanel key={one.value.key} a={one.value} />;
    }
  }

  return (
    <aside
      aria-label="Inspector"
      style={{ width: INSPECTOR_WIDTH }}
      className="flex h-full shrink-0 flex-col overflow-y-auto border-l border-surface-3 bg-surface-1"
    >
      {body}
    </aside>
  );
}

function VignetteHeader({ v }: { v: Vignette }) {
  const edit = useDocument((s) => s.edit);
  const units = useUi((s) => s.units);
  const keys = useUi((s) => s.selectedKeys);
  const setSelection = useUi((s) => s.setSelection);
  const qById = new Map(v.questions.map((q) => [q.key, q.id]));
  return (
    <>
      <Section title="Vignette">
        <Field
          kind="text"
          label="Name"
          value={v.name}
          onCommit={(s) => edit('Rename vignette', (d) => void (d.name = s))}
        />
      </Section>
      <Section title="Site">
        <Field
          kind="text"
          label="Site name"
          value={v.site.name}
          onCommit={(s) => edit('Rename site', (d) => void (d.site.name = s))}
        />
        <Grid>
          <Field
            label="Latitude"
            unit="°"
            min={-90}
            max={90}
            value={v.site.lat}
            onCommit={(n) => edit('Set site latitude', (d) => void (d.site.lat = n))}
          />
          <Field
            label="Longitude"
            unit="°"
            min={-180}
            max={180}
            value={v.site.lon}
            onCommit={(n) => edit('Set site longitude', (d) => void (d.site.lon = n))}
          />
        </Grid>
        <UnitField
          label="Ground elevation"
          q="elevation"
          stored={v.site.elevM}
          onCommit={(n) => edit('Set site elevation', (d) => void (d.site.elevM = n))}
        />
      </Section>
      <Section title="Questions and hypotheses">
        {v.questions.length === 0 && v.hypotheses.length === 0 ? (
          <Note>No question stated yet.</Note>
        ) : null}
        <ul className="flex flex-col gap-1 text-xs">
          {v.questions.map((q) => (
            <li key={q.key} className="truncate" title={q.text}>
              <span className="font-mono text-muted">{q.id}</span> {q.text}
            </li>
          ))}
          {v.hypotheses.map((h) => {
            const m = measureById(h.measure);
            // Stored in the measure's DroneScore unit; shown in the display units (review 6 F-10).
            const threshold = formatThreshold(units, {
              id: h.measure,
              op: h.op,
              threshold: h.value,
              unit: '',
            });
            const line = `${m ? `${m.id} ${m.name}` : h.measure} ${threshold}`;
            const isSel = keys.length === 1 && keys[0] === h.key;
            return (
              <li key={h.key} className="flex flex-col gap-1">
                <button
                  type="button"
                  aria-pressed={isSel}
                  aria-label={`${h.id} ${line}`}
                  title={line}
                  onClick={() => setSelection(isSel ? [] : [h.key])}
                  className={`truncate rounded-sm px-1 py-0.5 text-left hover:bg-surface-2 ${
                    isSel ? 'bg-surface-2 shadow-[inset_2px_0_0_var(--accent)]' : ''
                  } ${focusRing}`}
                >
                  <span className="font-mono text-muted">{h.id}</span>{' '}
                  <span className="font-mono text-muted">{qById.get(h.question) ?? ''}</span> {line}
                </button>
                {isSel ? <HypothesisFields v={v} h={h} /> : null}
              </li>
            );
          })}
        </ul>
      </Section>
      <Section title="Chain time">
        <Grid>
          <Field
            label="Decision time"
            unit="s"
            min={0}
            value={v.chainTime.decisionS}
            onCommit={(n) => edit('Set decision time', (d) => void (d.chainTime.decisionS = n))}
          />
          <Field
            label="Assignment time"
            unit="s"
            min={0}
            value={v.chainTime.assignS}
            onCommit={(n) => edit('Set assignment time', (d) => void (d.chainTime.assignS = n))}
          />
        </Grid>
        <Note>These two times feed the Target step.</Note>
      </Section>
    </>
  );
}
