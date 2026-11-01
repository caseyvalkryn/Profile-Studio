// Build workspace right column (spec section 7), ported from legacy/js/51-panel-inspector.js: the
// selected object's form, or the profile sections with no selection. Reads the selection from the
// ui store and edits the document, one undo step per field commit.
import { SYSTEM_LABELS } from '../../../domain/catalog';
import { useDocument } from '../../../state/document';
import { useUi } from '../../../state/ui';
import {
  AreaForm,
  CardForm,
  EventForm,
  GroupForm,
  Head,
  PlaneForm,
  SystemForm,
  ThreatForm,
} from './forms';
import { ProfileForm } from './ProfileForm';
import { pick, type Picked } from './resolve';
import { Hint, Sec } from './Row';
import type { Vignette } from '../../../domain/types';

/** The right-column token (`--col-right`, legacy `.right`). */
export const INSPECTOR_WIDTH = 320;

export default function Inspector() {
  const doc = useDocument((s) => s.doc);
  const keys = useUi((s) => s.selectedKeys);
  const stack = useUi((s) => s.stack);
  const inStack = stack && keys.length === 1 && keys[0] === stack.key ? stack : null;

  let body;
  if (!doc) {
    body = <Hint>No profile.</Hint>;
  } else {
    const found = keys.map((k) => pick(doc, k)).filter((f): f is Picked => f !== null);
    const one = found[0];
    if (found.length > 1) {
      body = (
        <Sec title="Selection">
          <Hint>{found.length} items selected. Select one to see its fields.</Hint>
        </Sec>
      );
    } else if (!one) {
      body = <ProfileForm v={doc} />;
    } else {
      body = <Selected v={doc} one={one} />;
    }
  }

  return (
    <aside
      aria-label="Inspector"
      className="relative flex h-full w-col-right shrink-0 flex-col overflow-y-auto border-l border-surface-3 bg-surface-1 pb-3 text-text"
    >
      {inStack ? (
        <span
          title="Click the same point again for the next object under it"
          className="absolute top-2 right-2.5 font-mono text-micro text-muted"
        >
          {inStack.n} of {inStack.m}
        </span>
      ) : null}
      {body}
    </aside>
  );
}

function Selected({ v, one }: { v: Vignette; one: Picked }) {
  switch (one.kind) {
    case 'threat':
    case 'waypoint': {
      const t = one.kind === 'threat' ? one.value : one.threat;
      const i = one.kind === 'waypoint' ? one.index : null;
      return (
        <div key={t.key}>
          <Head id={t.id} sub={i === null ? 'threat' : `waypoint ${i + 1}`} />
          <Sec title="Threat">
            <ThreatForm v={v} t={t} wpIndex={i} />
          </Sec>
        </div>
      );
    }
    case 'sensor':
    case 'effector':
    case 'node': {
      const sys = one;
      const title = { sensor: 'Sensor', effector: 'Effector', node: 'Node' }[one.kind];
      return (
        <div key={one.value.key}>
          <Head id={one.value.id} sub={SYSTEM_LABELS[one.value.kind]} />
          <Sec title={title}>
            <SystemForm v={v} sys={sys} />
          </Sec>
        </div>
      );
    }
    case 'area':
      return (
        <div key={one.value.key}>
          <Head id={one.value.id} sub="area" />
          <Sec title="Area">
            <AreaForm v={v} a={one.value} />
          </Sec>
        </div>
      );
    case 'plane':
      return (
        <div key={one.value.key}>
          <Head id={one.value.id} sub="height plane" />
          <Sec title="Height plane">
            <PlaneForm v={v} p={one.value} />
          </Sec>
        </div>
      );
    case 'event':
      return (
        <div key={one.value.key}>
          <Head id={one.value.id} sub="event" />
          <Sec title="Event">
            <EventForm v={v} e={one.value} />
          </Sec>
        </div>
      );
    case 'group':
      return (
        <div key={one.letter}>
          <Head id={`Group ${one.letter}`} sub="group" />
          <Sec title="Members">
            <GroupForm letter={one.letter} members={one.members} />
          </Sec>
        </div>
      );
    case 'card':
      return (
        <div key={one.value.key}>
          <Head id={one.value.id} sub="card" />
          <Sec title="Card">
            <CardForm c={one.value} />
          </Sec>
        </div>
      );
  }
}
