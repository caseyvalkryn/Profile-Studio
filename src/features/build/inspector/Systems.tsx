// Systems (legacy/mockup-v3.html drawInspector): sensors, effectors, and C2 and TSPI nodes. The
// expanded row edits id, kind within its family, position, range, field of view and bearing; More
// holds the rest of the record.
import type { Draft } from 'immer';
import {
  defaultSensorModel,
  EFFECTOR_KINDS,
  NODE_KINDS,
  SENSOR_KINDS,
  SYSTEM_LABELS,
} from '../../../domain/catalog';
import type {
  Effector,
  EffectorKind,
  Node,
  NodeKind,
  Sensor,
  SensorKind,
  Vignette,
} from '../../../domain/types';
import { useUi } from '../../../state/ui';
import { deselect, dropRefs, useOne } from './common';
import { displayIds } from './edit';
import { hText } from './parse';
import {
  Choice,
  edit,
  F,
  Field,
  Group,
  Item,
  NumField,
  Sec,
  Swatch,
  toggle,
  useSuffix,
  Warn,
} from './Row';

type Sys =
  | { family: 'sensors'; value: Sensor }
  | { family: 'effectors'; value: Effector }
  | { family: 'nodes'; value: Node };

/** Any of the three, for the shared rows; each row writes only fields its kind has. */
type Rec = Omit<Sensor, 'kind'> & Omit<Effector, 'kind'> & Omit<Node, 'kind'> & { kind: string };

const KINDS = {
  sensors: SENSOR_KINDS,
  effectors: EFFECTOR_KINDS,
  nodes: NODE_KINDS,
} as const;

function rec(d: Draft<Vignette>, s: Sys): Rec | undefined {
  return (d[s.family] as { key: string }[]).find((x) => x.key === s.value.key) as unknown as
    Rec | undefined;
}

function at(s: Sys, f: (r: Rec) => void) {
  return (d: Draft<Vignette>) => {
    const r = rec(d, s);
    if (r) f(r);
  };
}

function removeSystem(s: Sys) {
  const key = s.value.key;
  edit(`remove ${s.value.id}`, (d) => {
    if (s.family === 'sensors') d.sensors = d.sensors.filter((x) => x.key !== key);
    else if (s.family === 'effectors') d.effectors = d.effectors.filter((x) => x.key !== key);
    else d.nodes = d.nodes.filter((x) => x.key !== key);
    for (const e of d.events) if (e.sensorKey === key) e.sensorKey = null;
    dropRefs(d, [key]);
  });
  deselect([key]);
}

export function Systems({ v }: { v: Vignette }) {
  const one = useOne();
  const units = useUi((s) => s.units);
  const groups: [string, Sys[]][] = [
    ['Sensors', v.sensors.map((value) => ({ family: 'sensors', value }) as const)],
    ['Effectors', v.effectors.map((value) => ({ family: 'effectors', value }) as const)],
    [
      'Command and control (C2) nodes and time-space-position information (TSPI) stations',
      v.nodes.map((value) => ({ family: 'nodes', value }) as const),
    ],
  ];
  const coord = (m: number) => hText(m, units).split(' ')[0];
  return (
    <Sec title="Systems">
      {groups.map(([title, list]) =>
        list.length ? (
          <div key={title}>
            <Group>{title}</Group>
            {list.map((s) => {
              const b = s.value;
              const current = one === b.key;
              const fov =
                b.fovDeg > 0 && b.fovDeg < 360 ? ` · ${b.fovDeg}° at ${b.bearingDeg}°` : '';
              return (
                <Item
                  key={b.key}
                  id={b.id}
                  current={current}
                  onSelect={() => toggle(b.key, current)}
                  lead={<Swatch kind="friend" />}
                  title={
                    <>
                      {b.id}
                      <span className="ml-1.5 text-data font-normal text-muted">
                        {SYSTEM_LABELS[b.kind]}
                      </span>
                    </>
                  }
                  meta={`${coord(b.x)}, ${coord(b.y)} · ${b.rangeM > 0 ? hText(b.rangeM, units) : 'no reach'}${fov}`}
                  onRemove={() => removeSystem(s)}
                >
                  <SystemFields v={v} s={s} />
                </Item>
              );
            })}
          </div>
        ) : null,
      )}
      {groups.every(([, l]) => l.length === 0) ? (
        <p className="my-1 text-data text-muted">
          No systems. Add them from the rail or the palette (A).
        </p>
      ) : null}
    </Sec>
  );
}

function SystemFields({ v, s }: { v: Vignette; s: Sys }) {
  const b = s.value;
  const h = useSuffix('h');
  const vz = useSuffix('vz');
  const set = (field: string) => `set ${b.id} ${field}`;
  const taken = displayIds(v).filter((id) => id !== b.id);
  const options = KINDS[s.family].map((k) => [k, SYSTEM_LABELS[k]] as const);
  return (
    <>
      <F two>
        <Field
          name={`${b.id} id`}
          label={`rename ${b.id}`}
          mono
          value={b.id}
          write={(text) => {
            const id = text.trim();
            if (!id) return 'Type an id.';
            if (taken.includes(id)) return `${id} is in use. Pick another id.`;
            return at(s, (r) => void (r.id = id));
          }}
        />
        <span className="col-span-2">
          <Choice
            name={`${b.id} kind`}
            value={b.kind as string}
            options={options}
            onChange={(k) =>
              edit(
                set('kind'),
                at(s, (r) => {
                  if (s.family === 'sensors') {
                    const kind = k as SensorKind;
                    const model = defaultSensorModel(kind, r.rangeM);
                    if (model.pd.kind !== r.model.pd.kind) r.model = model;
                    r.kind = kind;
                  } else r.kind = k as EffectorKind | NodeKind;
                }),
              )
            }
          />
        </span>
      </F>
      <F caption={`Position ${h}`} two>
        <NumField
          name="East (x)"
          label={`move ${b.id}`}
          ty="h"
          stored={b.x}
          set={(m) => at(s, (r) => void (r.x = m ?? 0))}
        />
        <NumField
          name="North (y)"
          label={`move ${b.id}`}
          ty="h"
          stored={b.y}
          set={(m) => at(s, (r) => void (r.y = m ?? 0))}
        />
      </F>
      <F caption={`Range ${h}`} two>
        <NumField
          name="Range"
          label={set('range')}
          ty="h"
          stored={b.rangeM}
          set={(m) => at(s, (r) => void (r.rangeM = Math.max(0, m ?? 0)))}
        />
        <span />
      </F>
      <F caption="FOV° · brg°" two>
        <NumField
          name={`${b.id} field of view`}
          label={set('field of view')}
          ty="num"
          stored={b.fovDeg}
          set={(m) => at(s, (r) => void (r.fovDeg = Math.min(360, Math.max(1, m ?? 360))))}
        />
        <NumField
          name={`${b.id} bearing`}
          label={set('bearing')}
          ty="num"
          stored={b.bearingDeg}
          set={(m) => at(s, (r) => void (r.bearingDeg = (((m ?? 0) % 360) + 360) % 360))}
        />
      </F>
      {s.family !== 'nodes' && !(b.rangeM > 0) ? (
        <Warn>{`${b.id} has no reach. Drag its ring out.`}</Warn>
      ) : null}
      <details className="mt-1">
        <summary className="mb-1.5 cursor-default text-data font-medium text-muted">More</summary>
        <F caption={`Height ${vz}`}>
          <NumField
            name={`${b.id} height`}
            label={set('height')}
            ty="vz"
            stored={b.z}
            set={(m) => at(s, (r) => void (r.z = m ?? 0))}
          />
        </F>
        {s.family === 'sensors' ? (
          <>
            <F caption={`Min range ${h}`}>
              <NumField
                name={`${b.id} minimum range`}
                label={set('minimum range')}
                ty="h"
                stored={s.value.minRangeM}
                set={(m) => at(s, (r) => void (r.minRangeM = Math.max(0, m ?? 0)))}
              />
            </F>
            <F caption="Elevation°" two>
              <NumField
                name={`${b.id} elevation min`}
                label={set('elevation min')}
                ty="num"
                stored={s.value.elMinDeg}
                set={(m) => at(s, (r) => void (r.elMinDeg = m ?? 0))}
              />
              <NumField
                name={`${b.id} elevation max`}
                label={set('elevation max')}
                ty="num"
                stored={s.value.elMaxDeg}
                set={(m) => at(s, (r) => void (r.elMaxDeg = m ?? 0))}
              />
            </F>
          </>
        ) : null}
        {s.family === 'effectors' ? (
          <>
            <F caption="Time to effect s">
              <NumField
                name={`${b.id} time to effect`}
                label={set('time to effect')}
                ty="s"
                stored={s.value.timeToEffectS}
                set={(m) => at(s, (r) => void (r.timeToEffectS = m ?? 0))}
              />
            </F>
            <F caption="Pk">
              <NumField
                name={`${b.id} Pk`}
                label={set('Pk')}
                ty="num"
                stored={s.value.pk}
                set={(m) => at(s, (r) => void (r.pk = Math.min(1, Math.max(0, m ?? 0))))}
              />
            </F>
          </>
        ) : null}
      </details>
    </>
  );
}
