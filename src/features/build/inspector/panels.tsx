// One panel per selected kind. Each shows only the fields of that kind, in display units.
import { Button, Field } from '../../../ui';
import {
  AREA_LABELS,
  SYSTEM_LABELS,
  THREAT_ARCHETYPES,
  archetypeById,
} from '../../../domain/catalog';
import type { Area, Effector, Node, Sensor, Threat } from '../../../domain/types';
import { useUi } from '../../../state/ui';
import { EnteredSection } from './Entered';
import { IdField } from './IdField';
import { editRecord } from './edit';
import { Grid, Hint, NumberInput, Readout, Section, Select, UnitField } from './fields';
import { formatBearing, round, toDisplay, toStored, unitOf } from './units';

type Pos = { x: number; y: number; z: number };

function Position({ value, onSet }: { value: Pos; onSet: (axis: keyof Pos, m: number) => void }) {
  return (
    <Grid cols={3}>
      <UnitField label="East (x)" q="range" stored={value.x} onCommit={(m) => onSet('x', m)} />
      <UnitField label="North (y)" q="range" stored={value.y} onCommit={(m) => onSet('y', m)} />
      <UnitField label="Height AGL" q="alt" stored={value.z} onCommit={(m) => onSet('z', m)} />
    </Grid>
  );
}

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

// ---------------------------------------------------------------- threat

/** Ground-plus-height path length (m) and flight time (s) at `speedMs`, holds included. */
export function pathStats(t: Threat, speedMs: number): { lengthM: number; timeS: number } {
  let lengthM = 0;
  let holdS = 0;
  t.path.forEach((w, i) => {
    holdS += w.holdS;
    const p = t.path[i - 1];
    if (p) lengthM += Math.hypot(w.x - p.x, w.y - p.y, w.z - p.z);
  });
  return { lengthM, timeS: speedMs > 0 ? lengthM / speedMs + holdS : holdS };
}

function mss(s: number): string {
  const r = Math.round(s);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
}

export function ThreatPanel({ t, activeKey }: { t: Threat; activeKey?: string }) {
  const units = useUi((s) => s.units);
  const arch = archetypeById(t.type);
  const cruise = arch?.cruiseMs ?? 0;
  const speed = t.speedMs ?? cruise;
  const { lengthM, timeS } = pathStats(t, speed);
  const ed = (label: string, fn: (r: Threat) => void) =>
    editRecord(label, 'threat', t.key, (r) => fn(r as Threat));
  const spd = unitOf(units, 'speed');

  return (
    <>
      <Section title="Threat">
        <IdField value={t.id} onRename={(id) => ed('Rename', (r) => void (r.id = id))} />
        <Select
          label="Type"
          value={t.type}
          options={THREAT_ARCHETYPES.map((a) => ({
            value: a.id,
            label: `${a.name} (Group ${a.group})`,
          }))}
          onChange={(type) => ed('Set type', (r) => void (r.type = type))}
        />
        <NumberInput
          label="Speed"
          unit={spd}
          blank
          value={t.speedMs === undefined ? undefined : toDisplay(units, 'speed', t.speedMs)}
          placeholder={`${toDisplay(units, 'speed', cruise)} cruise`}
          onCommit={(v) =>
            ed('Set speed', (r) => {
              if (v === undefined) delete r.speedMs;
              else r.speedMs = toStored(units, 'speed', v);
            })
          }
        />
        <Readout label="Waypoints" value={String(t.path.length)} />
        <Readout
          label="Path length"
          value={String(toDisplay(units, 'range', lengthM))}
          unit={unitOf(units, 'range')}
        />
        <Readout label="Path time" value={mss(timeS)} unit="m:ss" />
      </Section>
      <Section title="Waypoints">
        {t.path.map((w, i) => (
          <div
            key={w.key}
            className={`flex flex-col gap-1 rounded-sm p-1 ${w.key === activeKey ? 'ring-1 ring-accent' : ''}`}
          >
            <div className="flex items-center justify-between text-xs text-muted">
              <span className="font-mono">WP {i + 1}</span>
              <Button
                size="sm"
                disabled={t.path.length <= 2}
                tooltip={t.path.length <= 2 ? 'A path needs two waypoints' : 'Delete this waypoint'}
                aria-label={`Delete waypoint ${i + 1}`}
                onClick={() =>
                  ed('Delete waypoint', (r) => {
                    const j = r.path.findIndex((p) => p.key === w.key);
                    if (j >= 0) r.path.splice(j, 1);
                  })
                }
              >
                Delete
              </Button>
            </div>
            <Grid cols={4}>
              {(['x', 'y', 'z'] as const).map((axis) => (
                <UnitField
                  key={axis}
                  label={`WP ${i + 1} ${axis === 'z' ? 'alt' : axis}`}
                  q={axis === 'z' ? 'alt' : 'range'}
                  stored={w[axis]}
                  onCommit={(m) =>
                    ed(axis === 'z' ? 'Set waypoint altitude' : 'Move waypoint', (r) => {
                      const p = r.path.find((q) => q.key === w.key);
                      if (p) p[axis] = m;
                    })
                  }
                />
              ))}
              <Field
                label={`WP ${i + 1} hold`}
                unit="s"
                min={0}
                value={w.holdS}
                onCommit={(v) =>
                  ed('Set hold', (r) => {
                    const p = r.path.find((q) => q.key === w.key);
                    if (p) p.holdS = v;
                  })
                }
              />
            </Grid>
          </div>
        ))}
      </Section>
    </>
  );
}

// ---------------------------------------------------------------- sensor and effector

function Bearing({ value, onSet }: { value: number; onSet: (deg: number) => void }) {
  return (
    <NumberInput
      label="Bearing"
      value={round(value, 1)}
      format={formatBearing}
      onCommit={(v) => v !== undefined && onSet(((v % 360) + 360) % 360)}
    />
  );
}

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

export function SensorPanel({ s }: { s: Sensor }) {
  const ed = (label: string, fn: (r: Sensor) => void) =>
    editRecord(label, 'sensor', s.key, (r) => fn(r as Sensor));
  const m = s.model;
  const pd = m.pd;
  return (
    <>
      <Section title={SYSTEM_LABELS[s.kind]}>
        <IdField value={s.id} onRename={(id) => ed('Rename', (r) => void (r.id = id))} />
        <Position value={s} onSet={(a, v) => ed('Move sensor', (r) => void (r[a] = v))} />
        <Grid>
          <UnitField
            label="Range"
            q="range"
            min={0}
            stored={s.rangeM}
            onCommit={(v) => ed('Set range', (r) => void (r.rangeM = v))}
          />
          <UnitField
            label="Min range"
            q="range"
            min={0}
            stored={s.minRangeM}
            onCommit={(v) => ed('Set min range', (r) => void (r.minRangeM = v))}
          />
          <Field
            label="Field of view"
            unit="°"
            min={0}
            max={360}
            value={s.fovDeg}
            onCommit={(v) => ed('Set field of view', (r) => void (r.fovDeg = v))}
          />
          <Bearing
            value={s.bearingDeg}
            onSet={(v) => ed('Set bearing', (r) => void (r.bearingDeg = v))}
          />
          <Field
            label="Elevation min"
            unit="°"
            min={-90}
            max={90}
            value={s.elMinDeg}
            onCommit={(v) => ed('Set elevation min', (r) => void (r.elMinDeg = v))}
          />
          <Field
            label="Elevation max"
            unit="°"
            min={-90}
            max={90}
            value={s.elMaxDeg}
            onCommit={(v) => ed('Set elevation max', (r) => void (r.elMaxDeg = v))}
          />
        </Grid>
      </Section>
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
              q="alt"
              min={0}
              stored={m.trackErrorM}
              onCommit={(v) => ed('Set track error', (r) => void (r.model.trackErrorM = v))}
            />
          </Hint>
        </Grid>
      </Section>
      <EnteredSection group="sensor" assetKey={s.key} entered={s.entered} />
    </>
  );
}

export function EffectorPanel({ e }: { e: Effector }) {
  const ed = (label: string, fn: (r: Effector) => void) =>
    editRecord(label, 'effector', e.key, (r) => fn(r as Effector));
  return (
    <>
      <Section title={SYSTEM_LABELS[e.kind]}>
        <IdField value={e.id} onRename={(id) => ed('Rename', (r) => void (r.id = id))} />
        <Position value={e} onSet={(a, v) => ed('Move effector', (r) => void (r[a] = v))} />
        <Grid>
          <UnitField
            label="Range"
            q="range"
            min={0}
            stored={e.rangeM}
            onCommit={(v) => ed('Set range', (r) => void (r.rangeM = v))}
          />
          <Field
            label="Field of view"
            unit="°"
            min={0}
            max={360}
            value={e.fovDeg}
            onCommit={(v) => ed('Set field of view', (r) => void (r.fovDeg = v))}
          />
          <Bearing
            value={e.bearingDeg}
            onSet={(v) => ed('Set bearing', (r) => void (r.bearingDeg = v))}
          />
          <Field
            label="Time to effect"
            unit="s"
            min={0}
            value={e.timeToEffectS}
            onCommit={(v) => ed('Set time to effect', (r) => void (r.timeToEffectS = v))}
          />
          <Pct label="Pk" value={e.pk} onSet={(v) => ed('Set Pk', (r) => void (r.pk = v))} />
        </Grid>
      </Section>
      <EnteredSection group="effector" assetKey={e.key} entered={e.entered} />
    </>
  );
}

// ---------------------------------------------------------------- node and area

export function NodePanel({ n }: { n: Node }) {
  const ed = (label: string, fn: (r: Node) => void) =>
    editRecord(label, 'node', n.key, (r) => fn(r as Node));
  return (
    <Section title={SYSTEM_LABELS[n.kind]}>
      <IdField value={n.id} onRename={(id) => ed('Rename', (r) => void (r.id = id))} />
      <Position value={n} onSet={(a, v) => ed('Move node', (r) => void (r[a] = v))} />
    </Section>
  );
}

/** Centre and radius when every vertex sits at one distance from the centroid (16 or more). */
export function asCircle(pts: [number, number][]): { cx: number; cy: number; r: number } | null {
  if (pts.length < 16) return null;
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const radii = pts.map(([x, y]) => Math.hypot(x - cx, y - cy));
  const r = radii.reduce((s, v) => s + v, 0) / radii.length;
  if (r <= 0 || radii.some((v) => Math.abs(v - r) > 0.01 * r)) return null;
  return { cx, cy, r };
}

export function AreaPanel({ a }: { a: Area }) {
  const units = useUi((s) => s.units);
  const ed = (label: string, fn: (r: Area) => void) =>
    editRecord(label, 'area', a.key, (r) => fn(r as Area));
  const circle = asCircle(a.pts);
  const rng = unitOf(units, 'range');
  return (
    <Section title={AREA_LABELS[a.kind]}>
      <IdField value={a.id} onRename={(id) => ed('Rename', (r) => void (r.id = id))} />
      <UnitField
        label="Top"
        q="alt"
        min={0}
        stored={a.zMaxM}
        onCommit={(v) => ed('Set top', (r) => void (r.zMaxM = v))}
      />
      <Readout label="Vertices" value={String(a.pts.length)} />
      {circle ? (
        <>
          <Readout
            label="Centre east"
            value={String(toDisplay(units, 'range', circle.cx))}
            unit={rng}
          />
          <Readout
            label="Centre north"
            value={String(toDisplay(units, 'range', circle.cy))}
            unit={rng}
          />
          <UnitField
            label="Radius"
            q="range"
            min={0}
            stored={circle.r}
            onCommit={(v) =>
              ed('Set radius', (r) => {
                const k = v / circle.r;
                r.pts = r.pts.map(([x, y]) => [
                  circle.cx + (x - circle.cx) * k,
                  circle.cy + (y - circle.cy) * k,
                ]);
              })
            }
          />
        </>
      ) : null}
    </Section>
  );
}
