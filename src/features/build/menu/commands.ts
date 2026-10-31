// Right-click commands the registry does not have yet (spec section 8 right-click table, plus
// every legacy/js/51-panel-menu.js item not in it). Each is a registry Command; `MENU_KINDS`
// lists the menu targets, since AssetKind has no event, plane, group or card yet.
import type { Draft } from 'immer';
import type { Command, CommandContext } from '../../../commands/types';
import type { Vignette } from '../../../domain/types';
import { dist3, posAt } from '../../../engine/geo';
import type { Preview } from '../../../engine/preview';
import { previewOf } from '../../../state/document';
import { addHeightPlane, selectedThreatKey } from '../palette/pick';
import { openQuickAdd } from '../palette/store';
import { EVENT_NAMES, EVENT_TYPES, tText } from '../rail/format';

export type MenuKind =
  | 'threat'
  | 'waypoint'
  | 'sensor'
  | 'effector'
  | 'node'
  | 'area'
  | 'vertex'
  | 'plane'
  | 'event'
  | 'group'
  | 'card'
  | 'map'
  | 'timeline';

/** A warning on an authored event and the time the geometry gives (legacy derive warnings). */
export type EventWarning = { eventKey: string; tGeoS: number; text: string };

type WarningSource = (doc: Vignette, preview: Preview) => readonly EventWarning[];
let warningSource: WarningSource = () => [];

/**
 * Set where event warnings come from. The MVP preview has no event warnings yet; the engine lane
 * that ports legacy derive warnings sets this, and Move to geometry shows when one applies.
 */
export function setEventWarnings(fn: WarningSource): void {
  warningSource = fn;
}

export function warningsFor(doc: Vignette, eventKey: string): EventWarning[] {
  return warningSource(doc, previewOf(doc)).filter((w) => w.eventKey === eventKey);
}

/** The menu's time cursor: the pointer's time on the timeline, else the playhead. */
export type MenuContext = CommandContext & { tCursor?: number | null };

export function timeCursor(ctx: CommandContext): number | null {
  const m = ctx as MenuContext;
  if (m.tCursor !== undefined) return m.tCursor;
  return ctx.pointer?.tS ?? ctx.ui.tS;
}

export const CARDS_LATER = 'Cards arrive in lane 9.4.1';
const OPEN_FIRST = 'Open a profile first';

const keyArg = (arg: unknown) => (typeof arg === 'string' ? arg : null);

function selectedEvent(ctx: CommandContext, arg?: unknown) {
  const doc = ctx.document.doc;
  if (!doc) return null;
  const keys = [keyArg(arg), ...ctx.ui.selectedKeys].filter(Boolean) as string[];
  for (const k of keys) {
    const e = doc.events.find((x) => x.key === k);
    if (e) return e;
  }
  return null;
}

function selectedPlane(ctx: CommandContext, arg?: unknown) {
  const doc = ctx.document.doc;
  if (!doc) return null;
  const keys = [keyArg(arg), ...ctx.ui.selectedKeys].filter(Boolean) as string[];
  for (const k of keys) {
    const p = doc.planes.find((x) => x.key === k);
    if (p) return p;
  }
  return null;
}

function selectedArea(ctx: CommandContext) {
  const doc = ctx.document.doc;
  return doc?.areas.find((a) => ctx.ui.selectedKeys.includes(a.key)) ?? null;
}

/** Group letters in use, in threat order. */
export function lettersInUse(doc: Vignette): string[] {
  const out: string[] = [];
  for (const t of doc.threats) if (t.group && !out.includes(t.group)) out.push(t.group);
  return out;
}

/** The group a command acts on: the letter passed, else the selected threat's group. */
function groupOf(ctx: CommandContext, arg?: unknown): string | null {
  if (typeof arg === 'string' && /^[A-Z]$/.test(arg)) return arg;
  const doc = ctx.document.doc;
  if (!doc) return null;
  const key = selectedThreatKey(doc, ctx.ui.selectedKeys);
  return doc.threats.find((t) => t.key === key)?.group || null;
}

/**
 * New letters for a group that is in two or more clusters at `t`: clusters link threats whose 3D
 * separation is at most the link distance (legacy envelopesAt). The cluster that holds the first
 * threat keeps the letter; the others take the lowest free letters. null when it is one cluster.
 */
export function splitAssignment(
  doc: Vignette,
  preview: Preview,
  letter: string,
  t: number,
): Record<string, string> | null {
  const dLink = preview.dLink.value;
  const members = doc.threats.filter((x) => x.group === letter && preview.threats[x.key]);
  if (dLink == null || members.length < 2) return null;
  const ps = members.map((m) => posAt(preview.threats[m.key]!.timed, t));
  const lab = new Array<number>(members.length).fill(-1);
  let c = 0;
  for (let i = 0; i < members.length; i++) {
    if (lab[i]! >= 0) continue;
    const stack = [i];
    lab[i] = c;
    while (stack.length) {
      const k = stack.pop()!;
      for (let j = 0; j < members.length; j++)
        if (lab[j]! < 0 && dist3(ps[k]!, ps[j]!) <= dLink) {
          lab[j] = c;
          stack.push(j);
        }
    }
    c++;
  }
  if (c < 2) return null;
  const used = new Set(lettersInUse(doc));
  const assign: Record<string, string> = {};
  for (let cl = 1; cl < c; cl++) {
    let L: string | null = null;
    for (let k = 0; k < 26; k++) {
      const ch = String.fromCharCode(65 + k);
      if (!used.has(ch)) {
        L = ch;
        break;
      }
    }
    if (!L) break;
    used.add(L);
    members.forEach((m, i) => {
      if (lab[i] === cl) assign[m.key] = L!;
    });
  }
  return assign;
}

const edit = (ctx: CommandContext, label: string, recipe: (d: Draft<Vignette>) => void) =>
  ctx.document.edit(label, recipe);

const stub = (id: string, label: string): Command => ({
  id,
  label,
  group: 'view',
  workspaces: ['build'],
  when: () => CARDS_LATER,
  run: () => {},
});

export const menuCommands: Command[] = [
  {
    id: 'threat.addEventHere',
    label: 'Add event here',
    group: 'map',
    workspaces: ['build'],
    kinds: ['threat', 'timeline'],
    when: (ctx) => {
      const doc = ctx.document.doc;
      if (!doc) return OPEN_FIRST;
      return doc.threats.length ? true : 'Add a threat first';
    },
    run: (ctx) => {
      const doc = ctx.document.doc;
      if (!doc) return;
      const key = selectedThreatKey(doc, ctx.ui.selectedKeys);
      if (!key && doc.threats[0]) ctx.ui.setSelection([doc.threats[0].key]);
      if (ctx.pointer?.tS != null) ctx.ui.setTime(ctx.pointer.tS);
      openQuickAdd('events');
    },
  },
  {
    id: 'group.split',
    label: 'Split here',
    group: 'map',
    workspaces: ['build'],
    kinds: ['threat'],
    when: (ctx) => {
      const doc = ctx.document.doc;
      if (!doc) return OPEN_FIRST;
      const g = groupOf(ctx);
      if (!g) return 'Select a threat in a group';
      const t = timeCursor(ctx);
      if (t == null) return 'Set the time cursor to split the group.';
      return splitAssignment(doc, previewOf(doc), g, t)
        ? true
        : `Group ${g} is one cluster at ${tText(t)}.`;
    },
    run: (ctx, arg) => {
      const doc = ctx.document.doc;
      const g = groupOf(ctx, arg);
      const t = timeCursor(ctx);
      if (!doc || !g || t == null) return;
      const assign = splitAssignment(doc, previewOf(doc), g, t);
      if (!assign) return;
      edit(ctx, `split ${g}`, (d) => {
        for (const th of d.threats) if (assign[th.key]) th.group = assign[th.key]!;
      });
    },
  },
  {
    id: 'group.merge',
    label: 'Merge',
    group: 'map',
    workspaces: ['build'],
    kinds: ['threat'],
    when: (ctx) => {
      const doc = ctx.document.doc;
      if (!doc) return OPEN_FIRST;
      return lettersInUse(doc).length > 1 ? true : 'Merge needs two or more groups';
    },
    run: (ctx, arg) => {
      const doc = ctx.document.doc;
      if (!doc) return;
      const first = groupOf(ctx, arg);
      const letters = lettersInUse(doc);
      const into = first && letters.includes(first) ? first : letters[0];
      if (!into) return;
      edit(ctx, `merge ${[into, ...letters.filter((l) => l !== into)].join(' ')}`, (d) => {
        for (const th of d.threats) if (th.group) th.group = into;
      });
    },
  },
  {
    id: 'group.delete',
    label: 'Delete group',
    group: 'edit',
    workspaces: ['build'],
    when: (ctx) => (groupOf(ctx) ? true : 'Select a threat in a group'),
    run: (ctx, arg) => {
      const g = groupOf(ctx, arg);
      if (!g) return;
      edit(ctx, `delete group ${g}`, (d) => {
        for (const th of d.threats) if (th.group === g) th.group = '';
      });
      ctx.ui.setSelection([]);
    },
  },
  {
    id: 'area.setBottom',
    label: 'Set bottom',
    group: 'map',
    workspaces: ['build'],
    kinds: ['area'],
    needsArg: true,
    when: (ctx) => (selectedArea(ctx) ? true : 'Select an area first'),
    run: (ctx, arg) => {
      const a = selectedArea(ctx);
      const z = Number(arg);
      if (!a || !Number.isFinite(z)) return;
      edit(ctx, `set bottom ${a.id}`, (d) => {
        const x = d.areas.find((y) => y.key === a.key);
        if (x) x.zMinM = Math.max(0, z);
      });
    },
  },
  {
    id: 'map.addHeightPlane',
    label: 'Add height plane',
    group: 'map',
    workspaces: ['build'],
    kinds: ['map'],
    when: (ctx) => (ctx.document.doc ? true : OPEN_FIRST),
    run: () => void addHeightPlane(),
  },
  {
    id: 'plane.setHeight',
    label: 'Set height',
    group: 'map',
    workspaces: ['build'],
    needsArg: true,
    when: (ctx) => (selectedPlane(ctx) ? true : 'Select a height plane first'),
    run: (ctx, arg) => {
      const p = selectedPlane(ctx);
      const z = Number(arg);
      if (!p || !Number.isFinite(z)) return;
      edit(ctx, `set height ${p.id}`, (d) => {
        const x = d.planes.find((y) => y.key === p.key);
        if (x) x.zM = z;
      });
    },
  },
  {
    id: 'plane.delete',
    label: 'Delete',
    group: 'edit',
    workspaces: ['build'],
    when: (ctx) => (selectedPlane(ctx) ? true : 'Select a height plane first'),
    run: (ctx, arg) => {
      const p = selectedPlane(ctx, arg);
      if (!p) return;
      edit(ctx, `delete ${p.id}`, (d) => {
        d.planes = d.planes.filter((x) => x.key !== p.key);
      });
      ctx.ui.setSelection([]);
    },
  },
  {
    id: 'event.changeType',
    label: 'Change type',
    group: 'edit',
    workspaces: ['build'],
    options: EVENT_TYPES.map((t) => ({ value: t, label: EVENT_NAMES[t] })),
    when: (ctx) => (selectedEvent(ctx) ? true : 'Select an event first'),
    run: (ctx, arg) => {
      const e = selectedEvent(ctx);
      const type = EVENT_TYPES.find((t) => t === arg);
      if (!e || !type) return;
      edit(ctx, `change type ${e.id}`, (d) => {
        const x = d.events.find((y) => y.key === e.key);
        if (!x) return;
        if (x.label === EVENT_NAMES[x.type]) x.label = EVENT_NAMES[type];
        x.type = type;
      });
    },
  },
  {
    id: 'event.moveToGeometry',
    label: 'Move to geometry',
    group: 'edit',
    workspaces: ['build'],
    when: (ctx) => {
      const e = selectedEvent(ctx);
      if (!e || !ctx.document.doc) return 'Select an event first';
      return warningsFor(ctx.document.doc, e.key).length ? true : `${e.id} has no warning`;
    },
    run: (ctx, arg) => {
      const e = selectedEvent(ctx, arg);
      const doc = ctx.document.doc;
      const w = e && doc ? warningsFor(doc, e.key)[0] : undefined;
      if (!e || !w) return;
      const t = Math.round(w.tGeoS * 10) / 10;
      edit(ctx, `move ${e.id}`, (d) => {
        const x = d.events.find((y) => y.key === e.key);
        if (x) x.tS = t;
      });
    },
  },
  {
    id: 'event.delete',
    label: 'Delete',
    group: 'edit',
    workspaces: ['build'],
    when: (ctx) => (selectedEvent(ctx) ? true : 'Select an event first'),
    run: (ctx, arg) => {
      const e = selectedEvent(ctx, arg);
      if (!e) return;
      edit(ctx, `delete ${e.id}`, (d) => {
        d.events = d.events.filter((x) => x.key !== e.key);
      });
      ctx.ui.setSelection([]);
    },
  },
  stub('card.open', 'Open'),
  stub('card.openInBrief', 'Open in Brief'),
  stub('card.duplicate', 'Duplicate'),
  stub('card.moveUp', 'Move up'),
  stub('card.moveDown', 'Move down'),
  stub('card.delete', 'Delete'),
];

/** Menu targets per new command, including kinds AssetKind does not have yet. */
export const MENU_KINDS: Readonly<Record<string, readonly MenuKind[]>> = {
  'threat.addEventHere': ['threat', 'timeline'],
  'group.split': ['threat', 'group'],
  'group.merge': ['threat', 'group'],
  'group.delete': ['group'],
  'area.setBottom': ['area', 'vertex'],
  'map.addHeightPlane': ['map'],
  'plane.setHeight': ['plane'],
  'plane.delete': ['plane'],
  'event.changeType': ['event'],
  'event.moveToGeometry': ['event'],
  'event.delete': ['event'],
  'card.open': ['card'],
  'card.openInBrief': ['card'],
  'card.duplicate': ['card'],
  'card.moveUp': ['card'],
  'card.moveDown': ['card'],
  'card.delete': ['card'],
};

/** The quantity each numeric menu command asks for (merge into the adapter's ARG_QUANTITY). */
export const MENU_ARG_QUANTITY = {
  'area.setBottom': 'altitude',
  'plane.setHeight': 'altitude',
} as const;
