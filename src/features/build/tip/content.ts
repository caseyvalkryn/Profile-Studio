// What the tip says for a hovered record (legacy/js/51-panel-tip.js content): a head of id and
// name, then one or two facts by kind. Rows are key word and value pairs, or a warning line.
import { archetypeById, AREA_LABELS, SYSTEM_LABELS } from '../../../domain/catalog';
import type { Vignette } from '../../../domain/types';
import { rangeAt } from '../../../engine/geo';
import type { Preview } from '../../../engine/preview';
import type { Units } from '../../../state/ui';
import {
  areaText,
  EVENT_NAMES,
  hDist,
  polygonArea,
  spd,
  tText,
  vHeight,
} from '../rail/format';
import { warningsFor } from '../menu/commands';

export type TipRow = { parts?: string[]; text?: string; warn?: boolean };
export type TipContent = { head: { id: string | null; name: string; pre?: boolean }; rows: TipRow[] };

/** The hover key of a threat group, such as `group:A`. */
export const groupHoverKey = (letter: string) => `group:${letter}`;

export function tipContent(
  doc: Vignette,
  preview: Preview | null,
  hoverKey: string,
  units: Units,
  tS: number | null,
): TipContent | null {
  const origin = preview?.origin ?? { x: 0, y: 0, z: 0 };
  const rows: TipRow[] = [];
  const row = (parts: string[]) => rows.push({ parts });

  if (hoverKey.startsWith('group:')) {
    const letter = hoverKey.slice(6);
    const n = doc.threats.filter((t) => t.group === letter).length;
    rows.push({ text: `${n} ${n === 1 ? 'member' : 'members'}` });
    return { head: { id: letter, name: 'Group', pre: true }, rows };
  }

  for (const t of doc.threats) {
    const tp = preview?.threats[t.key];
    if (t.key === hoverKey) {
      const a = archetypeById(t.type);
      if (tp) row(['Speed', spd(tp.speedMs, units)]);
      if (tp?.timed.length) row(['Run', tText(tp.endS)]);
      if (tS != null && tp?.timed.length)
        row(['Range', hDist(rangeAt(tp.timed, tS, origin), units), 'at', tText(tS)]);
      return { head: { id: t.id, name: a?.name ?? 'Threat' }, rows };
    }
    const i = t.path.findIndex((w) => w.key === hoverKey);
    if (i >= 0) {
      const w = t.path[i]!;
      row(['x', hDist(w.x, units), 'y', hDist(w.y, units), 'z', vHeight(w.z, units, 'AGL')]);
      const tw = tp?.timed[i];
      if (tw)
        row([
          'Arrive',
          tText(tw.t0),
          ...(tw.t1 > tw.t0 ? ['hold', `${Math.round(tw.t1 - tw.t0)} s`] : []),
        ]);
      return { head: { id: t.id, name: `waypoint ${i + 1}` }, rows };
    }
  }

  const sys = [...doc.sensors, ...doc.effectors, ...doc.nodes].find((s) => s.key === hoverKey);
  if (sys) {
    rows.push(sys.rangeM > 0 ? { parts: ['Range', hDist(sys.rangeM, units)] } : { text: 'No reach' });
    // The threat nearest the system at the time cursor (0 when off).
    let best: { key: string; id: string } | null = null;
    let bd = Infinity;
    for (const t of doc.threats) {
      const tp = preview?.threats[t.key];
      if (!tp?.timed.length) continue;
      const r = rangeAt(tp.timed, tS ?? 0, sys);
      if (r < bd) {
        bd = r;
        best = { key: t.key, id: t.id };
      }
    }
    if (!best && doc.threats[0]) best = { key: doc.threats[0].key, id: doc.threats[0].id };
    if (best) {
      const w = preview?.windows[sys.key]?.[best.key]?.[0];
      row(w ? ['First see', best.id, 'at', tText(w.tIn)] : ['No first see on', best.id]);
    }
    return { head: { id: sys.id, name: SYSTEM_LABELS[sys.kind] }, rows };
  }

  const ev = doc.events.find((e) => e.key === hoverKey);
  if (ev) {
    const th = doc.threats.find((t) => t.key === ev.threatKey);
    row(['Time', tText(ev.tS), ...(th ? ['on', th.id] : [])]);
    const tp = th ? preview?.threats[th.key] : undefined;
    if (tp?.timed.length) row(['Range', hDist(rangeAt(tp.timed, ev.tS, origin), units)]);
    for (const w of warningsFor(doc, ev.key)) rows.push({ text: w.text, warn: true });
    return { head: { id: ev.id, name: EVENT_NAMES[ev.type] }, rows };
  }

  const area = doc.areas.find((a) => a.key === hoverKey);
  if (area) {
    row(['Area', areaText(polygonArea(area.pts), units)]);
    row([
      'Height',
      vHeight(area.zMinM, units),
      ...(area.zMaxM ? ['to', vHeight(area.zMaxM, units)] : ['and up']),
    ]);
    return { head: { id: area.id, name: AREA_LABELS[area.kind] }, rows };
  }

  const plane = doc.planes.find((p) => p.key === hoverKey);
  if (plane) {
    row(['Height', vHeight(plane.zM, units, 'AGL')]);
    return { head: { id: plane.id, name: plane.label || 'Height plane' }, rows };
  }

  const card = doc.cards.find((c) => c.key === hoverKey);
  if (card) {
    row(['Time', tText(card.tS)]);
    return { head: { id: null, name: card.name || card.id }, rows };
  }
  return null;
}
