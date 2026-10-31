// The MVP sensor model rows under a sensor (spec section 4): Pd model, track start, scan, coast,
// identification and track error. Kept from the phase 4 inspector; legacy has no such section.
import { Field } from '../../../ui';
import type { Sensor } from '../../../domain/types';
import { editRecord } from './edit';
import { Grid, Hint, Section, Select, UnitField } from './fields';
import { formatSci, round } from '../../shared/units';

const TIPS = {
  swerling: 'Radar target fluctuation model, case 0 to 4',
  refRange: 'Range at which the reference target gives the reference SNR',
  refRcs: 'Radar cross section of the reference target',
  refSnr: 'Signal-to-noise ratio of the reference target at the reference range',
  pfa: 'Probability of false alarm per look',
  r50: 'Range at which the probability of detection is 50%',
  width: 'How fast the probability of detection falls off around the 50% range',
  m: 'Detections needed to start a track (M of N looks)',
  n: 'Looks counted for track start (M of N)',
  scan: 'Time between looks',
  coast: 'Gap after which a track is lost',
  dwell: 'Time on target before classification and identification',
  pId: 'Probability that an identification is correct',
  trackErr: 'One-sigma position error of the track',
};

function Pct({
  label,
  value,
  onSet,
}: {
  label: string;
  value: number;
  onSet: (p: number) => void;
}) {
  return (
    <Field
      label={label}
      unit="%"
      min={0}
      max={100}
      value={round(value * 100, 1)}
      onCommit={(v) => onSet(v / 100)}
    />
  );
}

export function SensorModelSection({ s }: { s: Sensor }) {
  const ed = (label: string, fn: (r: Sensor) => void) =>
    editRecord(`set ${s.id} ${label.replace(/^Set /, '')}`, 'sensor', s.key, (r) =>
      fn(r as Sensor),
    );
  const m = s.model;
  const pd = m.pd;
  return (
    <Section title="Sensor model">
      <Grid>
        {pd.kind === 'swerling' ? (
          <>
            <Hint text={TIPS.swerling}>
              <Select
                label="Swerling case"
                value={pd.swerling}
                options={([0, 1, 2, 3, 4] as const).map((n) => ({ value: n, label: String(n) }))}
                onChange={(n) =>
                  ed(
                    'Set Swerling case',
                    (r) => void (r.model.pd.kind === 'swerling' && (r.model.pd.swerling = n)),
                  )
                }
              />
            </Hint>
            <Hint text={TIPS.refRange}>
              <UnitField
                label="Reference range"
                q="range"
                min={0}
                stored={pd.refRangeM}
                onCommit={(v) =>
                  ed(
                    'Set reference range',
                    (r) => void (r.model.pd.kind === 'swerling' && (r.model.pd.refRangeM = v)),
                  )
                }
              />
            </Hint>
            <Hint text={TIPS.refRcs}>
              <Field
                label="Reference RCS"
                unit="m²"
                min={0}
                value={pd.refRcsM2}
                onCommit={(v) =>
                  ed(
                    'Set reference RCS',
                    (r) => void (r.model.pd.kind === 'swerling' && (r.model.pd.refRcsM2 = v)),
                  )
                }
              />
            </Hint>
            <Hint text={TIPS.refSnr}>
              <Field
                label="Reference SNR"
                unit="dB"
                value={pd.refSnrDb}
                onCommit={(v) =>
                  ed(
                    'Set reference SNR',
                    (r) => void (r.model.pd.kind === 'swerling' && (r.model.pd.refSnrDb = v)),
                  )
                }
              />
            </Hint>
            <Hint text={TIPS.pfa}>
              <Field
                label="Pfa"
                unit="per look"
                min={0}
                max={1}
                value={pd.pfa}
                format={formatSci}
                onCommit={(v) =>
                  ed(
                    'Set Pfa',
                    (r) => void (r.model.pd.kind === 'swerling' && (r.model.pd.pfa = v)),
                  )
                }
              />
            </Hint>
          </>
        ) : (
          <>
            <Hint text={TIPS.r50}>
              <UnitField
                label="50% range"
                q="range"
                min={0}
                stored={pd.r50M}
                onCommit={(v) =>
                  ed(
                    'Set 50% range',
                    (r) => void (r.model.pd.kind === 'logistic' && (r.model.pd.r50M = v)),
                  )
                }
              />
            </Hint>
            <Hint text={TIPS.width}>
              <UnitField
                label="Width"
                q="range"
                min={0}
                stored={pd.widthM}
                onCommit={(v) =>
                  ed(
                    'Set width',
                    (r) => void (r.model.pd.kind === 'logistic' && (r.model.pd.widthM = v)),
                  )
                }
              />
            </Hint>
          </>
        )}
        <Hint text={TIPS.m}>
          <Field
            label="Track M"
            unit="det"
            min={1}
            value={m.trackM}
            onCommit={(v) => ed('Set track M', (r) => void (r.model.trackM = Math.round(v)))}
          />
        </Hint>
        <Hint text={TIPS.n}>
          <Field
            label="Track N"
            unit="looks"
            min={1}
            value={m.trackN}
            onCommit={(v) => ed('Set track N', (r) => void (r.model.trackN = Math.round(v)))}
          />
        </Hint>
        <Hint text={TIPS.scan}>
          <Field
            label="Scan time"
            unit="s"
            min={0}
            value={m.scanS}
            onCommit={(v) => ed('Set scan time', (r) => void (r.model.scanS = v))}
          />
        </Hint>
        <Hint text={TIPS.coast}>
          <Field
            label="Coast time"
            unit="s"
            min={0}
            value={m.coastS}
            onCommit={(v) => ed('Set coast time', (r) => void (r.model.coastS = v))}
          />
        </Hint>
        <Hint text={TIPS.dwell}>
          <Field
            label="ID dwell"
            unit="s"
            min={0}
            value={m.idDwellS}
            onCommit={(v) => ed('Set ID dwell', (r) => void (r.model.idDwellS = v))}
          />
        </Hint>
        <Hint text={TIPS.pId}>
          <Pct
            label="Correct ID"
            value={m.pCorrectId}
            onSet={(v) => ed('Set correct ID probability', (r) => void (r.model.pCorrectId = v))}
          />
        </Hint>
        <Hint text={TIPS.trackErr}>
          <UnitField
            label="Track error"
            q="altitude"
            min={0}
            stored={m.trackErrorM}
            onCommit={(v) => ed('Set track error', (r) => void (r.model.trackErrorM = v))}
          />
        </Hint>
      </Grid>
    </Section>
  );
}
