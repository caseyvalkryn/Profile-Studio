// Aircraft and Paths (legacy/mockup-v3.html drawInspector). v6 has no aircraft record: one row
// per distinct threat archetype, and a retype or a cruise speed applies to every threat of it.
import type { Draft } from 'immer';
import { archetypeById, THREAT_ARCHETYPES } from '../../../domain/catalog';
import type { Threat, Vignette } from '../../../domain/types';
import { usePreview } from '../../../state/document';
import { useUi } from '../../../state/ui';
import { focusRing } from '../../../ui/focus';
import { deselect, dropRefs, useOne } from './common';
import { shown, suffix } from './parse';
import {
  Choice,
  edit,
  F,
  Field,
  Hint,
  Item,
  NumField,
  Remove,
  Sec,
  Swatch,
  toggle,
  useSuffix,
  Warn,
} from './Row';

const ARCH_OPTIONS = THREAT_ARCHETYPES.map((a) => [a.id, `G${a.group} · ${a.name}`] as const);

function archName(type: string): string {
  return archetypeById(type)?.name ?? type;
}

export function Aircraft({ v }: { v: Vignette }) {
  const units = useUi((s) => s.units);
  const spd = useSuffix('spd');
  const types = [...new Set(v.threats.map((t) => t.type))];
  return (
    <Sec title="Aircraft">
      {types.map((type) => {
        const a = archetypeById(type);
        const name = archName(type);
        const of = v.threats.filter((t) => t.type === type);
        const speeds = new Set(of.map((t) => t.speedMs));
        const shared = speeds.size === 1 ? [...speeds][0] : undefined;
        const alt = a
          ? `${shown(a.altM[0], 'v', units)} to ${shown(a.altM[1], 'v', units)} ${suffix('vz', units)}`
          : '';
        return (
          <div key={type} className="mb-2">
            <F caption={`${of.length} path${of.length === 1 ? '' : 's'}`}>
              <Choice
                name={`${name} aircraft`}
                value={type}
                options={a ? ARCH_OPTIONS : [[type, type], ...ARCH_OPTIONS]}
                onChange={(next) =>
                  edit(`retype ${name}`, (d) => {
                    for (const t of d.threats)
                      if (t.type === type) {
                        t.type = next;
                        delete t.speedMs;
                      }
                  })
                }
              />
            </F>
            <F caption={`Cruise ${spd}`}>
              <NumField
                name={`${name} cruise`}
                label={`set ${name} cruise`}
                ty="spd"
                nullable
                placeholder={a ? shown(a.cruiseMs, 'spd', units) : undefined}
                stored={shared}
                set={(m) => (d) => {
                  for (const t of d.threats)
                    if (t.type === type) {
                      if (m === null) delete t.speedMs;
                      else t.speedMs = Math.max(0.1, m);
                    }
                }}
              />
            </F>
            {a ? (
              <p className="my-1 text-data text-muted">
                {alt} · {a.link} · {a.behaviors.join(', ')}.{' '}
                <a
                  href={a.src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`text-muted underline ${focusRing}`}
                >
                  source
                </a>
              </p>
            ) : null}
          </div>
        );
      })}
      <Hint>Add aircraft from the Threats group in the rail, or from the palette (A).</Hint>
    </Sec>
  );
}

function removeThreat(t: Threat) {
  const keys = [t.key, ...t.path.map((w) => w.key)];
  edit(`remove ${t.id}`, (d) => {
    const events = d.events.filter((e) => e.threatKey === t.key).map((e) => e.key);
    d.threats = d.threats.filter((x) => x.key !== t.key);
    d.events = d.events.filter((e) => e.threatKey !== t.key);
    dropRefs(d, [...keys, ...events]);
  });
  deselect(keys);
}

export function Paths({ v }: { v: Vignette }) {
  const one = useOne();
  const pv = usePreview();
  return (
    <Sec title="Paths">
      {v.threats.map((t) => {
        const current = one === t.key || t.path.some((w) => w.key === one);
        const end = pv?.threats[t.key]?.endS ?? 0;
        return (
          <Item
            key={t.key}
            id={t.id}
            current={current}
            onSelect={() => toggle(t.key, current)}
            lead={<Swatch kind="hostile" />}
            title={
              <>
                {t.id}
                {t.group ? (
                  <span className="ml-1.5 font-mono text-micro font-normal text-muted">
                    group {t.group}
                  </span>
                ) : null}
              </>
            }
            meta={`${archName(t.type)} · ${t.path.length} wp · ${Math.round(end)} s`}
            onRemove={() => removeThreat(t)}
          >
            <PathFields t={t} selected={one} />
          </Item>
        );
      })}
      {v.threats.length === 0 ? (
        <Hint>No paths. Add aircraft from the rail or the palette (A).</Hint>
      ) : null}
    </Sec>
  );
}

function PathFields({ t, selected }: { t: Threat; selected: string | null }) {
  const h = useSuffix('h');
  const vz = useSuffix('v');
  const known = archetypeById(t.type) !== undefined;
  const set = (field: string) => `set ${t.id} ${field}`;
  const onPath = (d: Draft<Vignette>) => d.threats.find((x) => x.key === t.key);
  return (
    <>
      <F caption="Aircraft · group" cols="grid-cols-[88px_1fr_48px]">
        <Choice
          name={`${t.id} aircraft`}
          value={t.type}
          options={known ? ARCH_OPTIONS : [[t.type, t.type], ...ARCH_OPTIONS]}
          onChange={(next) =>
            edit(`retype ${t.id}`, (d) => {
              const r = onPath(d);
              if (!r) return;
              r.type = next;
              delete r.speedMs;
            })
          }
        />
        <Field
          name={`${t.id} group`}
          label={set('group')}
          mono
          placeholder="group"
          value={t.group}
          write={(text) => {
            const g = text.trim().toUpperCase();
            if (!/^[A-Z]?$/.test(g)) return 'Type one letter, or leave it blank.';
            return (d) => {
              const r = onPath(d);
              if (r) r.group = g;
            };
          }}
        />
      </F>
      <table aria-label={`${t.id} waypoints`} className="my-1 w-full table-fixed border-collapse">
        <thead>
          <tr className="font-mono text-micro text-muted">
            <th className="w-5 px-0.5 py-0.5 font-medium" />
            <th className="px-1 py-0.5 text-left font-medium">x {h}</th>
            <th className="px-1 py-0.5 text-left font-medium">y {h}</th>
            <th className="px-1 py-0.5 text-left font-medium">alt {vz}</th>
            <th className="px-1 py-0.5 text-left font-medium">hold s</th>
            <th className="w-[26px]" />
          </tr>
        </thead>
        <tbody>
          {t.path.map((w, i) => {
            const n = i + 1;
            const wp = (field: string) => `${t.id} waypoint ${n} ${field}`;
            const write =
              (f: (r: { x: number; y: number; z: number; holdS: number }) => void) =>
              (d: Draft<Vignette>) => {
                const r = onPath(d)?.path.find((x) => x.key === w.key);
                if (r) f(r);
              };
            const cur = selected === w.key;
            return (
              <tr key={w.key} aria-current={cur ? 'true' : undefined}>
                <td className={`px-0 py-px text-center ${cur ? 'bg-surface-3' : ''}`}>
                  <button
                    type="button"
                    aria-label={`Select ${t.id} waypoint ${n}`}
                    onClick={() => useUi.getState().setSelection([cur ? t.key : w.key])}
                    className={`w-full font-mono text-micro text-muted ${focusRing}`}
                  >
                    {n}
                  </button>
                </td>
                <td className={`px-0.5 py-px ${cur ? 'bg-surface-3' : ''}`}>
                  <NumField
                    name={wp('x')}
                    label={`move ${t.id} waypoint ${n}`}
                    ty="h"
                    stored={w.x}
                    set={(m) => write((r) => void (r.x = m ?? 0))}
                  />
                </td>
                <td className={`px-0.5 py-px ${cur ? 'bg-surface-3' : ''}`}>
                  <NumField
                    name={wp('y')}
                    label={`move ${t.id} waypoint ${n}`}
                    ty="h"
                    stored={w.y}
                    set={(m) => write((r) => void (r.y = m ?? 0))}
                  />
                </td>
                <td className={`px-0.5 py-px ${cur ? 'bg-surface-3' : ''}`}>
                  <NumField
                    name={wp('altitude')}
                    label={`set ${t.id} waypoint ${n} altitude`}
                    ty="vz"
                    stored={w.z}
                    set={(m) => write((r) => void (r.z = Math.max(0, m ?? 0)))}
                  />
                </td>
                <td className={`px-0.5 py-px ${cur ? 'bg-surface-3' : ''}`}>
                  <NumField
                    name={wp('hold')}
                    label={`set ${t.id} waypoint ${n} hold`}
                    ty="s"
                    stored={w.holdS}
                    set={(m) => write((r) => void (r.holdS = m ?? 0))}
                  />
                </td>
                <td className={`px-0 py-px ${cur ? 'bg-surface-3' : ''}`}>
                  <Remove
                    name={`Remove ${t.id} waypoint ${n}`}
                    disabled={t.path.length < 2}
                    onClick={() => {
                      edit(`remove ${t.id} waypoint ${n}`, (d) => {
                        const r = onPath(d);
                        if (r) r.path = r.path.filter((x) => x.key !== w.key);
                        dropRefs(d, [w.key]);
                      });
                      if (cur) useUi.getState().setSelection([t.key]);
                    }}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {t.path.length < 2 ? <Warn>{`${t.id} needs two waypoints.`}</Warn> : null}
      <Hint>
        Times come from cruise speed and holds. Turn on Add waypoints in the bar, then click Plan.
        Drag a point in Plan to move it, or in Elevation to change its altitude; double-click a
        point to remove it.
      </Hint>
    </>
  );
}
