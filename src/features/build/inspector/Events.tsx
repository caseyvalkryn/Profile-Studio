// Events (legacy/mockup-v3.html drawInspector): the planned events on the paths, sorted by time.
// The time slider is one undo step per drag: beginDrag on pointerdown, updateDrag on input,
// endDrag on pointerup.
import type { Draft } from 'immer';
import { newKey } from '../../../domain/ids';
import type { AuthoredEvent, AuthoredEventType, Vignette } from '../../../domain/types';
import { useDocument, usePreview } from '../../../state/document';
import { useUi } from '../../../state/ui';
import { focusRing } from '../../../ui/focus';
import { EVENT_LETTERS, EVENT_NAMES, EVENT_TYPES } from '../rail/format';
import { deselect, dropRefs, useOne } from './common';
import { Choice, edit, F, Field, Hint, Item, Mini, NumField, Sec, toggle } from './Row';

const TYPE_OPTIONS = EVENT_TYPES.map((t) => [t, EVENT_NAMES[t]] as const);
const NAMES = new Set<string>(Object.values(EVENT_NAMES));

function at(e: AuthoredEvent, f: (r: Draft<AuthoredEvent>) => void) {
  return (d: Draft<Vignette>) => {
    const r = d.events.find((x) => x.key === e.key);
    if (r) f(r);
  };
}

function nextEventId(events: readonly AuthoredEvent[]): string {
  const used = new Set(events.map((e) => e.id));
  let n = 1;
  while (used.has(`e${n}`)) n++;
  return `e${n}`;
}

export function Events({ v }: { v: Vignette }) {
  const one = useOne();
  const pv = usePreview();
  const tmax = Math.max(1, Math.round(pv?.tmaxS ?? 0));
  const pathOf = new Map(v.threats.map((t) => [t.key, t]));
  const events = [...v.events].sort((a, b) => a.tS - b.tS);
  const add = () => {
    const sel = one
      ? v.threats.find((t) => t.key === one || t.path.some((w) => w.key === one))
      : null;
    const t = sel ?? v.threats[0];
    if (!t) return;
    const key = newKey();
    edit('add event', (d) => {
      d.events.push({
        key,
        id: nextEventId(d.events),
        tS: Math.round(tmax / 2),
        type: 'detect',
        label: EVENT_NAMES.detect,
        threatKey: t.key,
        sensorKey: null,
      });
    });
    useUi.getState().setSelection([key]);
  };
  return (
    <Sec
      title="Events"
      action={
        <Mini
          name="Add event"
          disabled={v.threats.length === 0}
          title={v.threats.length === 0 ? 'Add a path first.' : undefined}
          onClick={add}
        >
          Add
        </Mini>
      }
    >
      {events.map((e) => {
        const current = one === e.key;
        return (
          <Item
            key={e.key}
            id={e.id}
            current={current}
            onSelect={() => toggle(e.key, current)}
            lead={
              <span className="w-[46px] shrink-0 pt-px text-right font-mono text-data text-muted">
                {Math.round(e.tS)} s
              </span>
            }
            title={
              <span className="font-normal">
                {EVENT_LETTERS[e.type]} {e.label}{' '}
                <span className="font-mono text-micro text-muted">
                  {pathOf.get(e.threatKey)?.id ?? ''}
                </span>
              </span>
            }
            onRemove={() => {
              edit(`remove ${e.id}`, (d) => {
                d.events = d.events.filter((x) => x.key !== e.key);
                dropRefs(d, [e.key]);
              });
              deselect([e.key]);
            }}
          >
            <EventFields v={v} e={e} tmax={tmax} />
          </Item>
        );
      })}
    </Sec>
  );
}

function EventFields({ v, e, tmax }: { v: Vignette; e: AuthoredEvent; tmax: number }) {
  const label = `set ${e.id} time`;
  const slide = (t: number) => at(e, (r) => void (r.tS = t));
  const mine = () => useDocument.getState().drag?.label === label;
  const paths = v.threats.map((t) => [t.key, t.id] as const);
  return (
    <>
      <F two>
        <Choice<AuthoredEventType>
          name={`${e.id} type`}
          value={e.type}
          options={TYPE_OPTIONS}
          onChange={(type) =>
            edit(
              `set ${e.id} type`,
              at(e, (r) => {
                if (!r.label || NAMES.has(r.label)) r.label = EVENT_NAMES[type];
                r.type = type;
              }),
            )
          }
        />
        <span className="col-span-2">
          <Field
            name={`${e.id} label`}
            label={`set ${e.id} label`}
            value={e.label}
            write={(text) => at(e, (r) => void (r.label = text))}
          />
        </span>
      </F>
      <F caption="Path · t s" two>
        <Choice
          name={`${e.id} path`}
          value={e.threatKey}
          options={
            paths.some(([k]) => k === e.threatKey) ? paths : [[e.threatKey, '(none)'], ...paths]
          }
          onChange={(k) =>
            edit(
              `set ${e.id} path`,
              at(e, (r) => void (r.threatKey = k)),
            )
          }
        />
        <NumField
          name={`${e.id} time`}
          label={label}
          ty="t"
          stored={e.tS}
          set={(t) => at(e, (r) => void (r.tS = Math.max(0, t ?? 0)))}
        />
      </F>
      <input
        type="range"
        aria-label={`${e.id} time slider`}
        min={0}
        max={tmax}
        step={1}
        value={Math.min(tmax, Math.round(e.tS))}
        onPointerDown={() => useDocument.getState().beginDrag(label)}
        onChange={(ev) => {
          const t = Number(ev.target.value);
          if (mine()) useDocument.getState().updateDrag(slide(t));
          else edit(label, slide(t));
        }}
        onPointerUp={() => {
          if (mine()) useDocument.getState().endDrag();
        }}
        onPointerCancel={() => {
          if (mine()) useDocument.getState().endDrag();
        }}
        className={`my-1 w-full accent-[var(--accent)] ${focusRing}`}
      />
      <Hint>Or drag the event along its path in Plan.</Hint>
    </>
  );
}
