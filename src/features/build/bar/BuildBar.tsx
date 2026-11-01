// The Build bar (mockup `.bar`, line 380): the view segment, Add waypoints and the Elevation
// modes on the left; the five layer toggles in the middle; Save as card and the readout on the
// right. Fit, the units toggle and the reference live in the palette (view.fit, view.units,
// view.ref).
import { useId } from 'react';
import { DEFAULT_THREAT_TYPE } from '../../../commands/commands';
import { currentContext, execute, get, shortcutLabel } from '../../../commands/registry';
import { usePreview, useDocument } from '../../../state/document';
import { useUi, type View } from '../../../state/ui';
import { Tooltip } from '../../../ui/Tooltip';
import { focusRing } from '../../../ui/focus';
import { useBoard } from '../board/store';
import LayerToggles from './LayerToggles';
import { readoutLine } from './readout';

/** Re-render on any store change a command's enable rule reads, then ask the rule. */
function useWhen(id: string): true | string {
  useDocument((s) => s.doc);
  useUi((s) => s.selectedKeys);
  const cmd = get(id);
  return cmd ? cmd.when(currentContext()) : `No command ${id}`;
}

const SEG_BTN = 'inline-flex h-[26px] shrink-0 items-center px-2.5 text-data select-none';
const MINI_BTN = 'inline-flex h-6 shrink-0 items-center rounded border px-2 text-data select-none';

/**
 * A bar button that runs one command. When the command cannot run, the button stays focusable
 * and its tooltip and description say why.
 */
function CommandButton({
  id,
  label,
  pressed,
  className,
  onRun,
}: {
  id: string;
  label: string;
  pressed?: boolean;
  className: string;
  /** Runs in place of the command, under the command's when() (a segment that sets one value). */
  onRun?: () => void;
}) {
  const ok = useWhen(id);
  const reasonId = useId();
  const cmd = get(id);
  const disabled = ok !== true;
  return (
    <Tooltip
      content={disabled ? ok : (cmd?.label ?? label)}
      shortcut={cmd ? shortcutLabel(cmd) : ''}
    >
      <button
        type="button"
        aria-disabled={disabled || undefined}
        aria-pressed={pressed}
        aria-describedby={disabled ? reasonId : undefined}
        onClick={() => {
          if (disabled) return;
          if (onRun) onRun();
          else execute(id);
        }}
        className={`${className} ${disabled ? 'cursor-default opacity-50' : ''} ${focusRing}`}
      >
        {label}
        {disabled ? (
          <span id={reasonId} className="sr-only">
            {ok}
          </span>
        ) : null}
      </button>
    </Tooltip>
  );
}

function segClass(on: boolean): string {
  return `${SEG_BTN} ${on ? 'bg-text text-surface-0' : 'text-muted hover:bg-surface-3 hover:text-text'}`;
}

const VIEWS: { view: View; id: string; label: string }[] = [
  { view: 'plan', id: 'view.plan', label: 'Plan' },
  { view: 'elevation', id: 'view.elevation', label: 'Elevation' },
  { view: '3d', id: 'view.3d', label: '3D' },
];

function ViewSegment() {
  const view = useUi((s) => s.view);
  return (
    <div
      role="group"
      aria-label="View"
      className="flex shrink-0 overflow-hidden rounded border border-surface-3"
    >
      {VIEWS.map((v) => (
        <CommandButton
          key={v.view}
          id={v.id}
          label={v.label}
          pressed={view === v.view}
          className={segClass(view === v.view)}
        />
      ))}
    </div>
  );
}

/** From asset | Along path, bound to ui.elevationMode; shown while the view is Elevation. */
function ElevationModeSegments() {
  const mode = useUi((s) => s.elevationMode);
  const setMode = useUi((s) => s.setElevationMode);
  return (
    <div
      role="group"
      aria-label="Elevation mode"
      className="flex shrink-0 overflow-hidden rounded border border-surface-3"
    >
      <CommandButton
        id="view.elevationMode"
        label="From asset"
        pressed={mode === 'fromAsset'}
        className={segClass(mode === 'fromAsset')}
        onRun={() => setMode('fromAsset')}
      />
      <CommandButton
        id="view.elevationMode"
        label="Along path"
        pressed={mode === 'alongPath'}
        className={segClass(mode === 'alongPath')}
        onRun={() => setMode('alongPath')}
      />
    </div>
  );
}

/**
 * Add waypoints (mockup `t-wp`, line 445): arms the path placement. With a threat selected, each
 * click on the plan appends a waypoint to that threat's path (placing.pathId); with none selected,
 * the clicks draw a new threat. The placing is set before ui.armed, so the board's armed sync
 * keeps it (same kind) and does not replace it with a new-threat placing.
 */
export function toggleAddWaypoints(): void {
  const ui = useUi.getState();
  const b = useBoard.getState();
  if (b.placing?.kind === 'aircraft') {
    ui.setArmed(null);
    b.set({ placing: null });
    return;
  }
  const doc = useDocument.getState().doc;
  if (!doc) return;
  const threat = doc.threats.find((t) => ui.selectedKeys.includes(t.key));
  if (threat) {
    b.set({
      placing: { kind: 'aircraft', arch: threat.type, pts: [], pathId: threat.id },
      ruler: null,
    });
    ui.setDrawing(true);
  }
  ui.setArmed({ group: 'threat', type: threat?.type ?? DEFAULT_THREAT_TYPE });
  ui.setTool('path');
}

function AddWaypoints() {
  const on = useBoard((s) => s.placing?.kind === 'aircraft');
  const hasDoc = useDocument((s) => !!s.doc);
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={!hasDoc}
      onClick={toggleAddWaypoints}
      className={`${MINI_BTN} ${
        on ? 'border-text bg-text text-surface-0' : 'border-surface-3 text-text hover:bg-surface-3'
      } disabled:opacity-50 ${focusRing}`}
    >
      Add waypoints
    </button>
  );
}

function Readout() {
  const doc = useDocument((s) => s.doc);
  const preview = usePreview();
  const key = useUi((s) => s.selectedKeys[0]);
  const units = useUi((s) => s.units);
  if (!doc || !preview) return null;
  return (
    <span
      className="truncate font-mono text-micro text-muted tabular-nums"
      data-testid="bar-readout"
    >
      {readoutLine(doc, preview, key, units)}
    </span>
  );
}

export default function BuildBar() {
  const view = useUi((s) => s.view);
  return (
    <div
      role="toolbar"
      aria-label="Build bar"
      className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2.5"
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <ViewSegment />
        <AddWaypoints />
        {view === 'elevation' ? <ElevationModeSegments /> : null}
      </div>
      <LayerToggles />
      <div className="flex min-w-0 items-center gap-2.5">
        <CommandButton
          id="card.save"
          label="Save as card"
          className={`${MINI_BTN} border-surface-3 text-text hover:bg-surface-3`}
        />
        <Readout />
      </div>
    </div>
  );
}
