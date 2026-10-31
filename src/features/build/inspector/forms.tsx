// One form per selected kind, ported from legacy/js/51-panel-inspector.js (pathForm, systemForm,
// volumeForm, planeForm, eventForm, groupForm, cardForm). Field order, labels, validation words and
// numbers follow legacy; names follow the spec (threat, sensor, effector, area). Each commit is one
// undo step labelled in the legacy style: "set RDR-1 range".
import { useState } from 'react';
import {
  AREA_KINDS,
  AREA_LABELS,
  AUTHORED_EVENT_TYPES,
  EFFECTOR_KINDS,
  NODE_KINDS,
  SENSOR_KINDS,
  SYSTEM_LABELS,
  THREAT_ARCHETYPES,
  archetypeById,
  defaultSensorModel,
} from '../../../domain/catalog';
import { newKey } from '../../../domain/ids';
import type {
  Area,
  AreaKind,
  AuthoredEvent,
  AuthoredEventType,
  Card,
  Effector,
  EffectorKind,
  HeightPlane,
  Node,
  NodeKind,
  Sensor,
  SensorKind,
  Threat,
  Vignette,
} from '../../../domain/types';
import { usePreview } from '../../../state/document';
import { useUi } from '../../../state/ui';
import { focusRing } from '../../../ui/focus';
import { EnteredSection } from './Entered';
import { displayIds, editRecord } from './edit';
import { parseValue, shown, suffix, tText, vText, type FieldType } from './parse';
import { editKeyed, eventWarnings } from './resolve';
import { CommitInput, Hint, IdRow, SelectRow, ShowRow, TextRow, UnitRow, Warn } from './Row';
import { SensorModelSection } from './SensorModel';

const MINI = `h-ctl-mini rounded-[3px] border border-surface-3 bg-surface-1 px-1 text-micro text-text hover:bg-surface-2 disabled:opacity-40 ${focusRing}`;
const TH = 'px-0.5 py-0.5 text-left text-micro font-medium tracking-caps text-muted uppercase';

/** Legacy C.EV_TYPES and C.EV_NAMES: the glyph and the name of each authored event type. */
export const EVENT_GLYPH: Record<AuthoredEventType, string> = {
  detect: 'D',
  track: 'T',
  identify: 'I',
  engage: 'E',
  split: 'S',
  merge: 'M',
  loiter: 'L',
  terminal: 'X',
  checkpoint: 'C',
};
export const EVENT_NAME: Record<AuthoredEventType, string> = {
  detect: 'Detect',
  track: 'Track init',
  identify: 'Identify',
  engage: 'Engage',
  split: 'Split',
  merge: 'Merge',
  loiter: 'Loiter',
  terminal: 'Terminal',
  checkpoint: 'Checkpoint',
};

/** Legacy `in-head`: the id in bold and a sub line (kind name, or "waypoint n"). */
export function Head({ id, sub }: { id: string; sub: string }) {
  return (
    <div className="flex items-baseline gap-2 px-2.5 pt-2">
      <b className="font-mono text-body font-medium text-text">{id}</b>
      <span className="text-micro text-muted">{sub}</span>
    </div>
  );
}

/** A table cell value with a hidden label (legacy `in-vh`). A parse error goes to `onError`. */
function Cell(props: {
  label: string;
  ty: FieldType;
  stored: number;
  onCommit: (v: number) => void;
  onError: (text: string | null) => void;
}) {
  const units = useUi((s) => s.units);
  const [seq, setSeq] = useState(0);
  const value = shown(props.stored, props.ty, units);
  return (
    <CommitInput
      key={`${value}-${seq}`}
      mono
      ariaLabel={props.label}
      value={value}
      className="w-full"
      onCommit={(text) => {
        const r = parseValue(props.ty, text, units);
        if (r.err !== undefined) {
          props.onError(r.err);
          setSeq((n) => n + 1);
          return;
        }
        props.onError(null);
        if (r.v !== props.stored) props.onCommit(r.v);
      }}
    />
  );
}

// ---------------------------------------------------------------- threat (legacy path)

/** Legacy archLine: "Height a to b. Link x. Signature y. behaviours." and a Source link. */
function ArchLine({ type }: { type: string }) {
  const units = useUi((s) => s.units);
  const arch = archetypeById(type);
  if (!arch) return null;
  const parts = [`Height ${vText(arch.altM[0], units)} to ${vText(arch.altM[1], units)}`];
  if (arch.link) parts.push(`Link ${arch.link}`);
  if (arch.sig) parts.push(`Signature ${arch.sig}`);
  if (arch.behaviors.length) parts.push(arch.behaviors.join(', '));
  const src = arch.src && /^https?:\/\//.test(arch.src) ? arch.src : null;
  return (
    <div className="mt-0.5 mb-1.5 ml-[102px] text-micro text-muted">
      {`${parts.join('. ')}.`}
      {src ? (
        <>
          {' '}
          <a href={src} target="_blank" rel="noopener noreferrer" className="text-accent">
            Source
          </a>
        </>
      ) : null}
    </div>
  );
}

export function ThreatForm({ v, t, wpIndex }: { v: Vignette; t: Threat; wpIndex: number | null }) {
  const units = useUi((s) => s.units);
  const pv = usePreview();
  const [err, setErr] = useState<string | null>(null);
  const tp = pv?.threats[t.key];
  const ed = (label: string, fn: (r: Threat) => void) =>
    editRecord(label, 'threat', t.key, (r) => fn(r as Threat));
  const n = t.path.length;
  return (
    <>
      <IdRow
        value={t.id}
        taken={displayIds(v)}
        onRename={(id) => ed(`rename ${t.id}`, (r) => void (r.id = id))}
      />
      <SelectRow
        label="Type"
        value={t.type}
        options={THREAT_ARCHETYPES.map((a) => [a.id, a.name] as const)}
        onChange={(type) => ed(`set ${t.id} type`, (r) => void (r.type = type))}
      />
      <ArchLine type={t.type} />
      <TextRow
        label="Group"
        mono
        value={t.group}
        placeholder="none"
        onCommit={(text) => {
          const g = text.trim().toUpperCase().slice(0, 1);
          if (g !== t.group) ed(`set ${t.id} group`, (r) => void (r.group = g));
        }}
      />
      <UnitRow
        label="Speed"
        ty="spd"
        nullable
        stored={t.speedMs ?? null}
        placeholder={tp ? `auto ${shown(tp.speedMs, 'spd', units)}` : 'auto'}
        onCommit={(m) =>
          ed(`set ${t.id} speed`, (r) => {
            if (m === null) delete r.speedMs;
            else r.speedMs = m;
          })
        }
      />
      {tp && tp.timed.length ? (
        <div className="mt-0.5 mb-1.5 ml-[102px] text-micro text-muted">Run {tText(tp.endS)}</div>
      ) : null}
      <table aria-label="Waypoints" className="w-full table-fixed border-collapse text-data">
        <thead>
          <tr>
            <th className={`${TH} w-[18px]`}>#</th>
            <th className={TH}>x {suffix('h', units)}</th>
            <th className={TH}>y {suffix('h', units)}</th>
            <th className={TH}>Height {suffix('v', units)}</th>
            <th className={TH}>Hold s</th>
            <th className={`${TH} w-[44px]`} />
          </tr>
        </thead>
        <tbody>
          {t.path.map((w, i) => (
            <tr key={w.key} className={wpIndex === i ? 'bg-accent/10' : ''}>
              <td className="w-[22px] px-0.5 py-px font-mono text-muted">{i + 1}</td>
              {(['x', 'y', 'z', 'holdS'] as const).map((axis) => {
                const word = axis === 'holdS' ? 'hold' : axis === 'z' ? 'height' : axis;
                return (
                  <td key={axis} className="px-0.5 py-px">
                    <Cell
                      label={`Waypoint ${i + 1} ${word}`}
                      ty={axis === 'z' ? 'vz' : axis === 'holdS' ? 's' : 'h'}
                      stored={w[axis]}
                      onError={setErr}
                      onCommit={(m) =>
                        ed(`set ${t.id} waypoint ${i + 1} ${word}`, (r) => {
                          const p = r.path[i];
                          if (p) p[axis] = m;
                        })
                      }
                    />
                  </td>
                );
              })}
              <td className="px-0.5 py-px whitespace-nowrap">
                <button
                  type="button"
                  className={MINI}
                  aria-label={`Insert after waypoint ${i + 1}`}
                  title="Insert after"
                  disabled={i === n - 1}
                  onClick={() =>
                    ed(`insert ${t.id} waypoint ${i + 2}`, (r) => {
                      const a = r.path[i];
                      const b = r.path[i + 1];
                      if (!a || !b) return;
                      r.path.splice(i + 1, 0, {
                        key: newKey(),
                        x: Math.round((a.x + b.x) / 2),
                        y: Math.round((a.y + b.y) / 2),
                        z: Math.round((a.z + b.z) / 2),
                        holdS: 0,
                      });
                    })
                  }
                >
                  +
                </button>{' '}
                <button
                  type="button"
                  className={MINI}
                  aria-label={`Delete waypoint ${i + 1}`}
                  disabled={n < 2}
                  onClick={() =>
                    ed(`delete ${t.id} waypoint ${i + 1}`, (r) => void r.path.splice(i, 1))
                  }
                >
                  x
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {err ? <Warn>{err}</Warn> : null}
      {n < 2 ? <Warn>{`${t.id} needs two waypoints.`}</Warn> : null}
    </>
  );
}

// ---------------------------------------------------------------- sensor, effector, node (legacy system)

type System =
  | { kind: 'sensor'; value: Sensor }
  | { kind: 'effector'; value: Effector }
  | { kind: 'node'; value: Node };

const KIND_OPTIONS = {
  sensor: SENSOR_KINDS.map((k) => [k, SYSTEM_LABELS[k]] as const),
  effector: EFFECTOR_KINDS.map((k) => [k, SYSTEM_LABELS[k]] as const),
  node: NODE_KINDS.map((k) => [k, SYSTEM_LABELS[k]] as const),
};

/** Any of the three, for the shared rows; each row writes only fields its kind has. */
type Rec = Omit<Sensor, 'kind'> & Omit<Effector, 'kind'> & Omit<Node, 'kind'> & { kind: string };

export function SystemForm({ v, sys }: { v: Vignette; sys: System }) {
  const s = sys.value;
  const ed = (label: string, fn: (r: Rec) => void) =>
    editRecord(label, sys.kind, s.key, (r) => fn(r as unknown as Rec));
  const set = (field: string, fn: (r: Rec) => void) => ed(`set ${s.id} ${field}`, fn);
  const num = (m: number | null) => m ?? 0;
  return (
    <>
      <IdRow
        value={s.id}
        taken={displayIds(v)}
        onRename={(id) => ed(`rename ${s.id}`, (r) => void (r.id = id))}
      />
      <SelectRow
        label="Kind"
        value={s.kind as string}
        options={KIND_OPTIONS[sys.kind]}
        onChange={(k) =>
          set('kind', (r) => {
            if (sys.kind === 'sensor') {
              const kind = k as SensorKind;
              const model = defaultSensorModel(kind, r.rangeM);
              if (model.pd.kind !== r.model.pd.kind) r.model = model;
              r.kind = kind;
            } else r.kind = k as EffectorKind | NodeKind;
          })
        }
      />
      <UnitRow
        label="x"
        ariaLabel="East (x)"
        ty="h"
        stored={s.x}
        onCommit={(m) => set('x', (r) => void (r.x = num(m)))}
      />
      <UnitRow
        label="y"
        ariaLabel="North (y)"
        ty="h"
        stored={s.y}
        onCommit={(m) => set('y', (r) => void (r.y = num(m)))}
      />
      <UnitRow
        label="Height"
        ty="vz"
        stored={s.z}
        onCommit={(m) => set('height', (r) => void (r.z = num(m)))}
      />
      <UnitRow
        label="Range"
        ty="h"
        stored={s.rangeM}
        onCommit={(m) => set('range', (r) => void (r.rangeM = Math.max(0, num(m))))}
      />
      {sys.kind === 'sensor' ? (
        <UnitRow
          label="Minimum range"
          ty="h"
          stored={sys.value.minRangeM}
          onCommit={(m) => set('minimum range', (r) => void (r.minRangeM = Math.max(0, num(m))))}
        />
      ) : null}
      {/* Every system kind, nodes included (legacy 51-panel-inspector.js:211-212). */}
      <UnitRow
        label="Field of view"
        ty="deg"
        stored={s.fovDeg}
        onCommit={(m) => set('field of view', (r) => void (r.fovDeg = num(m)))}
      />
      <UnitRow
        label="Bearing"
        ty="deg"
        stored={s.bearingDeg}
        onCommit={(m) => set('bearing', (r) => void (r.bearingDeg = num(m)))}
      />
      {sys.kind === 'sensor' ? (
        <>
          <UnitRow
            label="Elevation min"
            ty="deg"
            stored={sys.value.elMinDeg}
            onCommit={(m) => set('elevation min', (r) => void (r.elMinDeg = num(m)))}
          />
          <UnitRow
            label="Elevation max"
            ty="deg"
            stored={sys.value.elMaxDeg}
            onCommit={(m) => set('elevation max', (r) => void (r.elMaxDeg = num(m)))}
          />
        </>
      ) : null}
      {sys.kind === 'effector' ? (
        <>
          <UnitRow
            label="Time to effect"
            ty="s"
            stored={sys.value.timeToEffectS}
            onCommit={(m) => set('time to effect', (r) => void (r.timeToEffectS = num(m)))}
          />
          <UnitRow
            label="Pk"
            ty="num"
            suf=""
            stored={sys.value.pk}
            onCommit={(m) => set('Pk', (r) => void (r.pk = Math.min(1, Math.max(0, num(m)))))}
          />
        </>
      ) : null}
      {sys.kind !== 'node' && !(s.rangeM > 0) ? (
        <Warn>{`${s.id} has no reach. Drag its ring out.`}</Warn>
      ) : null}
    </>
  );
}

/** The MVP rows under a sensor or effector: the sensor model and the entered values. */
export function SystemExtras({ sys }: { sys: System }) {
  if (sys.kind === 'sensor')
    return (
      <>
        <SensorModelSection s={sys.value} />
        <EnteredSection group="sensor" assetKey={sys.value.key} entered={sys.value.entered} />
      </>
    );
  if (sys.kind === 'effector')
    return <EnteredSection group="effector" assetKey={sys.value.key} entered={sys.value.entered} />;
  return null;
}

// ---------------------------------------------------------------- area (legacy volume)

export function AreaForm({ v, a }: { v: Vignette; a: Area }) {
  const units = useUi((s) => s.units);
  const [err, setErr] = useState<string | null>(null);
  const ed = (label: string, fn: (r: Area) => void) =>
    editRecord(label, 'area', a.key, (r) => fn(r as Area));
  const n = a.pts.length;
  return (
    <>
      <IdRow
        value={a.id}
        taken={displayIds(v)}
        onRename={(id) => ed(`rename ${a.id}`, (r) => void (r.id = id))}
      />
      <SelectRow
        label="Kind"
        value={a.kind}
        options={AREA_KINDS.map((k) => [k, AREA_LABELS[k]] as const)}
        onChange={(k: AreaKind) => ed(`set ${a.id} kind`, (r) => void (r.kind = k))}
      />
      <TextRow
        label="Label"
        value={a.label}
        onCommit={(text) => ed(`set ${a.id} label`, (r) => void (r.label = text))}
      />
      <UnitRow
        label="Bottom"
        ty="v"
        stored={a.zMinM}
        onCommit={(m) => ed(`set ${a.id} bottom`, (r) => void (r.zMinM = m ?? 0))}
      />
      <UnitRow
        label="Top"
        ty="v"
        stored={a.zMaxM}
        onCommit={(m) => ed(`set ${a.id} top`, (r) => void (r.zMaxM = m ?? 0))}
      />
      <table aria-label="Vertices" className="w-full table-fixed border-collapse text-data">
        <thead>
          <tr>
            <th className={`${TH} w-[18px]`}>#</th>
            <th className={TH}>x {suffix('h', units)}</th>
            <th className={TH}>y {suffix('h', units)}</th>
            <th className={`${TH} w-[44px]`} />
          </tr>
        </thead>
        <tbody>
          {a.pts.map((p, i) => (
            <tr key={i}>
              <td className="w-[22px] px-0.5 py-px font-mono text-muted">{i + 1}</td>
              {([0, 1] as const).map((c) => (
                <td key={c} className="px-0.5 py-px">
                  <Cell
                    label={`Vertex ${i + 1} ${c === 0 ? 'x' : 'y'}`}
                    ty="h"
                    stored={p[c]}
                    onError={setErr}
                    onCommit={(m) =>
                      ed(`set ${a.id} vertex ${i + 1} ${c === 0 ? 'x' : 'y'}`, (r) => {
                        const q = r.pts[i];
                        if (q) q[c] = m;
                      })
                    }
                  />
                </td>
              ))}
              <td className="px-0.5 py-px whitespace-nowrap">
                <button
                  type="button"
                  className={MINI}
                  aria-label={`Insert after vertex ${i + 1}`}
                  title="Insert after"
                  onClick={() =>
                    ed(`insert ${a.id} vertex ${i + 2}`, (r) => {
                      const q0 = r.pts[i];
                      const q1 = r.pts[(i + 1) % r.pts.length];
                      if (!q0 || !q1) return;
                      r.pts.splice(i + 1, 0, [
                        Math.round((q0[0] + q1[0]) / 2),
                        Math.round((q0[1] + q1[1]) / 2),
                      ]);
                    })
                  }
                >
                  +
                </button>{' '}
                <button
                  type="button"
                  className={MINI}
                  aria-label={`Delete vertex ${i + 1}`}
                  disabled={n <= 3}
                  onClick={() =>
                    ed(`delete ${a.id} vertex ${i + 1}`, (r) => {
                      if (r.pts.length > 3) r.pts.splice(i, 1);
                    })
                  }
                >
                  x
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {err ? <Warn>{err}</Warn> : null}
    </>
  );
}

// ---------------------------------------------------------------- height plane

export function PlaneForm({ v, p }: { v: Vignette; p: HeightPlane }) {
  const ed = (label: string, fn: (r: HeightPlane) => void) =>
    editKeyed(label, 'planes', p.key, (r) => fn(r as unknown as HeightPlane));
  return (
    <>
      <IdRow
        value={p.id}
        taken={v.planes.map((x) => x.id)}
        onRename={(id) => ed(`rename ${p.id}`, (r) => void (r.id = id))}
      />
      <TextRow
        label="Label"
        value={p.label}
        onCommit={(text) => ed(`set ${p.id} label`, (r) => void (r.label = text))}
      />
      <UnitRow
        label="Height"
        ty="vz"
        stored={p.zM}
        onCommit={(m) => ed(`set ${p.id} height`, (r) => void (r.zM = m ?? 0))}
      />
    </>
  );
}

// ---------------------------------------------------------------- authored event

export function EventForm({ v, e }: { v: Vignette; e: AuthoredEvent }) {
  const ed = (label: string, fn: (r: AuthoredEvent) => void) =>
    editKeyed(label, 'events', e.key, (r) => fn(r as unknown as AuthoredEvent));
  const systems = [...v.sensors, ...v.effectors, ...v.nodes];
  const warnings = eventWarnings(v, e.key);
  return (
    <>
      <IdRow
        value={e.id}
        taken={v.events.map((x) => x.id)}
        onRename={(id) => ed(`rename ${e.id}`, (r) => void (r.id = id))}
      />
      <SelectRow
        label="Type"
        value={e.type}
        options={AUTHORED_EVENT_TYPES.map(
          (k) => [k, `${EVENT_GLYPH[k]} ${EVENT_NAME[k]}`] as const,
        )}
        onChange={(k) => ed(`set ${e.id} type`, (r) => void (r.type = k))}
      />
      <TextRow
        label="Label"
        value={e.label}
        onCommit={(text) => ed(`set ${e.id} label`, (r) => void (r.label = text))}
      />
      <SelectRow
        label="Path"
        value={e.threatKey}
        options={v.threats.map((t) => [t.key, t.id] as const)}
        onChange={(k) => ed(`set ${e.id} path`, (r) => void (r.threatKey = k))}
      />
      <UnitRow
        label="Time"
        ty="t"
        stored={e.tS}
        placeholder="2:55 or 175"
        onCommit={(m) => ed(`set ${e.id} time`, (r) => void (r.tS = m ?? 0))}
      />
      <SelectRow
        label="System"
        value={e.sensorKey ?? ''}
        options={[['', 'None'] as const, ...systems.map((s) => [s.key, s.id] as const)]}
        onChange={(k) => ed(`set ${e.id} system`, (r) => void (r.sensorKey = k || null))}
      />
      {warnings.map((w) => (
        <Warn key={w}>{w}</Warn>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- group and card

export function GroupForm({ letter, members }: { letter: string; members: Threat[] }) {
  const setSelection = useUi((s) => s.setSelection);
  return (
    <>
      <ul className="flex flex-wrap gap-1">
        {members.map((t) => (
          <li key={t.key}>
            <button
              type="button"
              aria-label={`Select ${t.id}`}
              className={`${MINI} font-mono`}
              onClick={() => setSelection([t.key])}
            >
              {t.id}
            </button>
          </li>
        ))}
      </ul>
      {members.length ? null : <Hint>{`No paths use group ${letter}.`}</Hint>}
    </>
  );
}

/** Display only: card editing belongs to lane 9.4.3. */
export function CardForm({ c }: { c: Card }) {
  return (
    <>
      <ShowRow label="Name" value={c.name} />
      <ShowRow label="Time" value={c.tS === null ? 'full run' : shownT(c.tS)} suf="s" />
      <ShowRow label="Caption" value={c.caption} />
      <ShowRow label="Notes" value={c.notes} />
      {(['timeline', 'chart', 'readout'] as const).map((k) => (
        <ShowRow key={k} label={`Show ${k}`} value={c.displays[k] ? 'yes' : 'no'} />
      ))}
    </>
  );
}

function shownT(s: number): string {
  return String(Math.round(s * 10) / 10);
}
