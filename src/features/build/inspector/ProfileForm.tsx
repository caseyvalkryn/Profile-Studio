// No selection: the profile sections (legacy profileSections). Profile and Telemetry map onto v6
// fields; Class and Datum have no v6 field and are omitted (declared losses). The MVP rows that
// legacy lacks follow: site position.
import { newKey } from '../../../domain/ids';
import type { Vignette } from '../../../domain/types';
import { useDocument, usePreview } from '../../../state/document';
import { useUi, type Units } from '../../../state/ui';
import { hText, parseIds } from './parse';
import { AreaRow, Sec, SelectRow, ShowRow, TextRow, UnitRow } from './Row';
import { useState } from 'react';

export function ProfileForm({ v }: { v: Vignette }) {
  const edit = useDocument((s) => s.edit);
  const units = useUi((s) => s.units);
  const setUnits = useUi((s) => s.setUnits);
  const pv = usePreview();
  const dLink = pv?.dLink.value ?? null;
  return (
    <>
      <Sec title="Profile">
        <TextRow
          label="Name"
          value={v.name}
          onCommit={(s) => edit('set profile name', (d) => void (d.name = s))}
        />
        <TextRow
          label="Id"
          mono
          value={v.id}
          onCommit={(s) => {
            const id = s.trim();
            if (id) edit(`rename ${v.id}`, (d) => void (d.id = id));
          }}
        />
        <TextRow
          label="Collection"
          value={v.site.name}
          onCommit={(s) => edit('set profile collection', (d) => void (d.site.name = s))}
        />
        <AreaRow
          label="Purpose"
          value={v.questions[0]?.text ?? ''}
          onCommit={(s) =>
            edit('set profile purpose', (d) => {
              const q = d.questions[0];
              if (q) q.text = s;
              else d.questions.push({ key: newKey(), id: 'Q-01', text: s, note: '' });
            })
          }
        />
        <SelectRow<Units>
          label="Units"
          value={units}
          options={[
            ['nav', 'Nautical (nm, ft, kt)'],
            ['si', 'Metric (km, m, m/s)'],
          ]}
          onChange={setUnits}
        />
        <UnitRow
          label="Site elevation"
          ty="v"
          stored={v.site.elevM}
          onCommit={(m) => edit('set site elevation', (d) => void (d.site.elevM = m ?? 0))}
        />
        <ShowRow
          label="Link distance"
          value={dLink === null ? 'auto' : `auto ${hText(dLink, units)}`}
        />
        <UnitRow
          label="Latitude"
          ty="deg"
          suf="°"
          stored={v.site.lat}
          onCommit={(m) =>
            edit(
              'set site latitude',
              (d) => void (d.site.lat = Math.max(-90, Math.min(90, m ?? 0))),
            )
          }
        />
        <UnitRow
          label="Longitude"
          ty="deg"
          suf="°"
          stored={v.site.lon}
          onCommit={(m) =>
            edit(
              'set site longitude',
              (d) => void (d.site.lon = Math.max(-180, Math.min(180, m ?? 0))),
            )
          }
        />
      </Sec>
      <Telemetry v={v} />
    </>
  );
}

function Telemetry({ v }: { v: Vignette }) {
  const edit = useDocument((s) => s.edit);
  const [err, setErr] = useState<string | null>(null);
  const systems = [...v.sensors, ...v.effectors, ...v.nodes];
  const idOf = new Map(systems.map((s) => [s.key, s.id]));
  const keyOf = new Map(systems.map((s) => [s.id, s.key]));
  const truth = v.report.truth;
  return (
    <Sec title="Telemetry">
      <TextRow
        label="TSPI source"
        value={truth.source}
        onCommit={(s) => edit('set telemetry TSPI source', (d) => void (d.report.truth.source = s))}
      />
      <UnitRow
        label="Interval"
        ty="s"
        stored={truth.intervalS}
        onCommit={(m) =>
          edit('set telemetry interval', (d) => void (d.report.truth.intervalS = m ?? 0))
        }
      />
      <TextRow
        label="Stations"
        mono
        placeholder="RDR-1, TM-1"
        err={err}
        value={truth.stationKeys.map((k) => idOf.get(k) ?? k).join(', ')}
        onCommit={(s) => {
          const r = parseIds(s, [...keyOf.keys()]);
          if (r.err !== undefined) {
            setErr(r.err);
            return;
          }
          setErr(null);
          edit(
            'set telemetry stations',
            (d) => void (d.report.truth.stationKeys = r.v.map((id) => keyOf.get(id)!)),
          );
        }}
      />
    </Sec>
  );
}
