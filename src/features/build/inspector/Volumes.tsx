// Volumes and Reference planes (legacy/mockup-v3.html drawInspector). A volume is a v6 area; its
// vertices edit as text, one "x, y" per line in display units.
import type { Draft } from 'immer';
import { AREA_KINDS, AREA_LABELS } from '../../../domain/catalog';
import { newKey } from '../../../domain/ids';
import type { Area, AreaKind, HeightPlane, Vignette } from '../../../domain/types';
import { useUi } from '../../../state/ui';
import { deselect, dropRefs, useOne } from './common';
import { parseValue, shown, vText } from './parse';
import {
  Choice,
  edit,
  F,
  Field,
  Hint,
  Item,
  Mini,
  NumField,
  Remove,
  Sec,
  Swatch,
  toggle,
  useSuffix,
} from './Row';

const KIND_OPTIONS = AREA_KINDS.map((k) => [k, AREA_LABELS[k]] as const);

function at(a: Area, f: (r: Draft<Area>) => void) {
  return (d: Draft<Vignette>) => {
    const r = d.areas.find((x) => x.key === a.key);
    if (r) f(r);
  };
}

export function Volumes({ v }: { v: Vignette }) {
  const one = useOne();
  const units = useUi((s) => s.units);
  return (
    <Sec title="Volumes">
      {v.areas.map((a) => {
        const current = one === a.key;
        return (
          <Item
            key={a.key}
            id={a.id}
            current={current}
            onSelect={() => toggle(a.key, current)}
            lead={<Swatch kind="volume" />}
            title={a.label || a.id}
            meta={`${AREA_LABELS[a.kind]} · ${a.pts.length} vertices${
              a.zMaxM > 0 ? ` · to ${vText(a.zMaxM, units)}` : ''
            }`}
            onRemove={() => {
              edit(`remove ${a.id}`, (d) => {
                d.areas = d.areas.filter((x) => x.key !== a.key);
                dropRefs(d, [a.key]);
              });
              deselect([a.key]);
            }}
          >
            <VolumeFields a={a} />
          </Item>
        );
      })}
      {v.areas.length === 0 ? (
        <Hint>No volumes. Add them from the rail or the palette (A).</Hint>
      ) : null}
    </Sec>
  );
}

function VolumeFields({ a }: { a: Area }) {
  const units = useUi((s) => s.units);
  const h = useSuffix('h');
  const vu = useSuffix('v');
  const set = (field: string) => `set ${a.id} ${field}`;
  return (
    <>
      <F two>
        <Field
          name={`${a.id} label`}
          label={set('label')}
          value={a.label}
          write={(text) => at(a, (r) => void (r.label = text))}
        />
        <span className="col-span-2">
          <Choice<AreaKind>
            name={`${a.id} kind`}
            value={a.kind}
            options={KIND_OPTIONS}
            onChange={(k) =>
              edit(
                set('kind'),
                at(a, (r) => void (r.kind = k)),
              )
            }
          />
        </span>
      </F>
      <F caption={`Bottom · top ${vu}`} two>
        <NumField
          name={`${a.id} bottom`}
          label={set('bottom')}
          ty="v"
          stored={a.zMinM}
          set={(m) => at(a, (r) => void (r.zMinM = Math.max(0, m ?? 0)))}
        />
        <NumField
          name={`${a.id} top`}
          label={set('top')}
          ty="v"
          stored={a.zMaxM}
          set={(m) => at(a, (r) => void (r.zMaxM = Math.max(0, m ?? 0)))}
        />
      </F>
      <F caption="Vertices" top>
        <Field
          name={`${a.id} vertices`}
          label={set('vertices')}
          mono
          rows={3}
          value={a.pts
            .map(([x, y]) => `${shown(x, 'h', units)}, ${shown(y, 'h', units)}`)
            .join('\n')}
          write={(text) => {
            const pts: [number, number][] = [];
            for (const line of text.split('\n')) {
              if (!line.trim()) continue;
              const parts = line.split(/[\s,]+/).filter(Boolean);
              const x = parts.length === 2 ? parseValue('h', parts[0]!, units) : null;
              const y = parts.length === 2 ? parseValue('h', parts[1]!, units) : null;
              if (!x || !y || x.err !== undefined || y.err !== undefined)
                return 'Type one vertex per line: x, y.';
              pts.push([x.v, y.v]);
            }
            if (pts.length < 3) return 'Type at least three vertices.';
            return at(a, (r) => void (r.pts = pts));
          }}
        />
      </F>
      <Hint>
        One vertex per line: x, y in {h}. A top above 0 draws the volume in Elevation and 3D.
      </Hint>
    </>
  );
}

function nextPlaneId(planes: readonly HeightPlane[]): string {
  const used = new Set(planes.map((p) => p.id));
  let n = 1;
  while (used.has(`P${n}`)) n++;
  return `P${n}`;
}

export function Planes({ v }: { v: Vignette }) {
  const vz = useSuffix('vz');
  return (
    <Sec
      title="Reference planes"
      action={
        <Mini
          name="Add reference plane"
          onClick={() =>
            edit('add reference plane', (d) => {
              d.planes.push({
                key: newKey(),
                id: nextPlaneId(d.planes),
                label: 'Ceiling',
                zM: 120,
              });
            })
          }
        >
          Add
        </Mini>
      }
    >
      {v.planes.map((p) => {
        const at = (f: (r: Draft<HeightPlane>) => void) => (d: Draft<Vignette>) => {
          const r = d.planes.find((x) => x.key === p.key);
          if (r) f(r);
        };
        return (
          <div
            key={p.key}
            className="mb-1.5 grid grid-cols-[1fr_1fr_auto_auto] items-center gap-x-2"
          >
            <Field
              name={`${p.id} label`}
              label={`set ${p.id} label`}
              value={p.label}
              write={(text) => at((r) => void (r.label = text))}
            />
            <NumField
              name={`${p.id} height`}
              label={`set ${p.id} height`}
              ty="vz"
              stored={p.zM}
              set={(m) => at((r) => void (r.zM = Math.max(0, m ?? 0)))}
            />
            <span className="font-mono text-micro text-muted">{vz}</span>
            <Remove
              name={`Remove ${p.id}`}
              onClick={() =>
                edit(`remove ${p.id}`, (d) => {
                  d.planes = d.planes.filter((x) => x.key !== p.key);
                  dropRefs(d, [p.key]);
                })
              }
            />
          </div>
        );
      })}
    </Sec>
  );
}
