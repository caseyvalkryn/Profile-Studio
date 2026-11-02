// The profile sections of the whole-scene inspector (legacy/mockup-v3.html drawInspector):
// Purpose, Telemetry, Data products and Site.
import { useEffect, useState } from 'react';
import { newKey, nextId } from '../../../domain/ids';
import { PROFILE_CLASSES, type Vignette } from '../../../domain/types';
import { lastListing, listVignettes } from '../../../state/persist';
import { usePreview } from '../../../state/document';
import { useUi, type Units } from '../../../state/ui';
import { hText, parseIds, parseValue } from './parse';
import { Choice, edit, F, Field, Hint, Mini, NumField, Remove, Sec, useSuffix } from './Row';

const CLASS_OPTIONS = PROFILE_CLASSES.map((c) => [c, c] as const);
const COLLECTIONS_LIST = 'inspector-collections';

/**
 * The collections in the stored library and the open profile, sorted, for the datalist. The
 * listing the session already read serves (the Library's or the start's); with none, one read.
 */
function useCollections(current: string): string[] {
  const [stored, setStored] = useState<string[]>(
    () => lastListing()?.map((x) => x.collection) ?? [],
  );
  useEffect(() => {
    if (lastListing()) return;
    let live = true;
    listVignettes()
      .then((l) => {
        if (live) setStored(l.map((x) => x.collection));
      })
      .catch(() => {
        // No storage: only the open profile's collection.
      });
    return () => {
      live = false;
    };
  }, []);
  return [...new Set([...stored, current].filter(Boolean))].sort();
}

/** A latitude or longitude to 6 decimals (0.1 m) for display; the stored value keeps all (N-05). */
const deg6 = (d: number) => Math.round(d * 1e6) / 1e6;

export function Purpose({ v }: { v: Vignette }) {
  const collections = useCollections(v.collection);
  return (
    <Sec title="Purpose">
      <F caption="Question" top>
        <Field
          name="Question"
          label="set question"
          rows={3}
          value={v.questions[0]?.text ?? ''}
          write={(text) => (d) => {
            const q = d.questions[0];
            if (q) q.text = text;
            else
              d.questions.push({
                key: newKey(),
                id: nextId(
                  'question',
                  d.questions.map((x) => x.id),
                ),
                text,
                note: '',
              });
          }}
        />
      </F>
      <F caption="Class">
        <Choice
          name="Class"
          value={v.class}
          options={CLASS_OPTIONS}
          onChange={(c) => edit('set class', (d) => void (d.class = c))}
        />
      </F>
      <F caption="Collection">
        <Field
          name="Collection"
          label="set collection"
          value={v.collection}
          list={COLLECTIONS_LIST}
          write={(text) => (d) => void (d.collection = text)}
        />
        <datalist id={COLLECTIONS_LIST}>
          {collections.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </F>
    </Sec>
  );
}

export function Telemetry({ v }: { v: Vignette }) {
  const units = useUi((s) => s.units);
  const systems = [...v.sensors, ...v.effectors, ...v.nodes];
  const idOf = new Map(systems.map((s) => [s.key, s.id]));
  const keyOf = new Map(systems.map((s) => [s.id, s.key]));
  const truth = v.report.truth;
  return (
    <Sec title="Telemetry">
      <F caption="Truth source">
        <Field
          name="Truth source"
          label="set truth source"
          placeholder="RTK GPS, 20 Hz"
          value={truth.source}
          write={(text) => (d) => void (d.report.truth.source = text)}
        />
      </F>
      <F caption="Sample every s">
        <NumField
          name="Sample interval"
          label="set sample interval"
          ty="s"
          stored={truth.intervalS}
          set={(s) => (d) => void (d.report.truth.intervalS = s ?? 0)}
        />
      </F>
      <F caption="Stations">
        <Field
          name="Stations"
          label="set stations"
          mono
          placeholder="TM-1, RDR-1"
          value={truth.stationKeys.map((k) => idOf.get(k) ?? k).join(', ')}
          write={(text) => {
            const r = parseIds(text, [...keyOf.keys()]);
            if (r.err !== undefined) return r.err;
            return (d) => void (d.report.truth.stationKeys = r.v.map((id) => keyOf.get(id)!));
          }}
        />
      </F>
      <F caption="Snapshots s">
        <Field
          name="Snapshots"
          label="set snapshots"
          mono
          placeholder="10, 95"
          value={v.snapshots.join(', ')}
          write={(text) => {
            const parts = text.split(/[\s,]+/).filter(Boolean);
            const out: number[] = [];
            for (const p of parts) {
              const r = parseValue('s', p, units);
              if (r.err !== undefined) return 'Type times in seconds, for example 10, 95.';
              out.push(r.v);
            }
            return (d) => void (d.snapshots = out);
          }}
        />
      </F>
      <Hint>
        The layer draws samples along every path and links stations to the aircraft when time is
        set. The Envelopes layer uses the time slider, or these snapshots when time is off.
      </Hint>
    </Sec>
  );
}

export function DataProducts({ v }: { v: Vignette }) {
  const list = v.report.dataSources;
  return (
    <Sec
      title="Data products"
      action={
        <Mini
          name="Add data product"
          onClick={() => edit('add data product', (d) => void d.report.dataSources.push(''))}
        >
          Add
        </Mini>
      }
    >
      <div className="flex flex-col gap-1">
        {list.map((text, i) => (
          // A data product is a plain string with no key; its place is its identity.
          <div key={i} className="flex items-center gap-1">
            <Field
              name={`Data product ${i + 1}`}
              label={`set data product ${i + 1}`}
              className="flex-1"
              value={text}
              write={(t) => (d) => void (d.report.dataSources[i] = t)}
            />
            <Remove
              name={`Remove data product ${i + 1}`}
              onClick={() =>
                edit(`remove data product ${i + 1}`, (d) => void d.report.dataSources.splice(i, 1))
              }
            />
          </div>
        ))}
      </div>
    </Sec>
  );
}

export function Site({ v }: { v: Vignette }) {
  const units = useUi((s) => s.units);
  const setUnits = useUi((s) => s.setUnits);
  const pv = usePreview();
  const dLink = pv?.dLink.value ?? null;
  const vUnit = useSuffix('v');
  return (
    <section aria-label="Site" className="border-t border-surface-3 pt-2.5 pb-1.5">
      <details>
        <summary className="mb-1.5 cursor-default text-data font-medium text-muted">Site</summary>
        <F caption="Name">
          <Field
            name="Name"
            label="set profile name"
            value={v.name}
            write={(text) => (d) => void (d.name = text)}
          />
        </F>
        <F caption="Id">
          <Field
            name="Profile id"
            label={`rename ${v.id}`}
            mono
            value={v.id}
            write={(text) => {
              const id = text.trim();
              return id ? (d) => void (d.id = id) : 'Type an id.';
            }}
          />
        </F>
        <F caption="Units">
          <Choice<Units>
            name="Units"
            value={units}
            options={[
              ['nav', 'Nautical (nm, ft, kt)'],
              ['si', 'Metric (km, m, m/s)'],
            ]}
            onChange={setUnits}
          />
        </F>
        <F caption={`Elevation ${vUnit}`}>
          <NumField
            name="Site elevation"
            label="set site elevation"
            ty="v"
            stored={v.site.elevM}
            set={(m) => (d) => void (d.site.elevM = m ?? 0)}
          />
        </F>
        <F caption="Latitude °">
          <NumField
            name="Latitude"
            label="set site latitude"
            ty="num"
            stored={deg6(v.site.lat)}
            set={(m) => (d) => void (d.site.lat = Math.max(-90, Math.min(90, m ?? 0)))}
          />
        </F>
        <F caption="Longitude °">
          <NumField
            name="Longitude"
            label="set site longitude"
            ty="num"
            stored={deg6(v.site.lon)}
            set={(m) => (d) => void (d.site.lon = Math.max(-180, Math.min(180, m ?? 0)))}
          />
        </F>
        <F caption="Link distance">
          <span className="truncate font-mono text-data text-text">
            {dLink === null ? 'auto' : `auto ${hText(dLink, units)}`}
          </span>
        </F>
      </details>
    </section>
  );
}
