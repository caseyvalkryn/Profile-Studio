// The Build workspace (spec section 7, Build; legacy layout of 51-panel-board.js and 90-app.js).
// The Build bar on top; the scene rail on the left; the board over the strip in the centre; the
// readout above the inspector on the right. The board takes all the space the panels leave
// (principle 5.1). One board renders Plan, Elevation and 3D (src/board).
import '../../board/board.css';
import { useId, useState } from 'react';
import { currentContext, execute, get, shortcutLabel } from '../../commands/registry';
import { useDocument } from '../../state/document';
import { useUi } from '../../state/ui';
import { chips, LAYER_LABELS, defaultLayers } from '../../board';
import { setBoardCancel, toggleLayer } from '../../commands/commands';
import { Tooltip } from '../../ui/Tooltip';
import { focusRing } from '../../ui/focus';
import Board, { cancel } from './board/Board';
import { useBoard } from './board/store';
import Inspector from './inspector/Inspector';
import { FormationPopover } from './palette/FormationPopover';
import { Rail } from './rail/Rail';
import Readout from './readout/Readout';
import { Tip } from './tip/Tip';
import Timeline from './timeline/Timeline';

// The shell's Escape asks the board first: drag, then placing, then ruler.
setBoardCancel(cancel);

/**
 * The timeline panel: its 1 px top border, the 32 px control bar, the 20 px time axis and two
 * threat rows of 64 px (review 7.R F-08). More rows scroll under the sticky axis.
 */
export const TIMELINE_HEIGHT = 1 + 32 + 20 + 2 * 64;

/** Re-render on any store change a command's enable rule reads, then ask the rule. */
function useWhen(id: string): true | string {
  useDocument((s) => s.doc);
  useUi((s) => s.selectedKeys);
  const cmd = get(id);
  return cmd ? cmd.when(currentContext()) : `No command ${id}`;
}

/**
 * A top-bar button that runs one command. When the command cannot run, the button stays
 * focusable and its tooltip and description say why.
 */
function CommandButton({
  id,
  label,
  variant,
  pressed,
  onRun,
}: {
  id: string;
  label: string;
  variant?: 'quiet' | 'accent';
  pressed?: boolean;
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
        className={`inline-flex h-6 shrink-0 items-center rounded-sm px-2 text-xs select-none ${
          variant === 'accent'
            ? 'border border-accent bg-accent text-accent-text hover:opacity-90'
            : pressed
              ? 'bg-surface-2 text-text'
              : 'text-muted hover:bg-surface-2 hover:text-text'
        } ${disabled ? 'cursor-default opacity-50' : ''} ${focusRing}`}
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

function BuildBar() {
  const question = useDocument((s) => s.doc?.questions.find((q) => q.text.trim())?.text);
  const units = useUi((s) => s.units);
  const view = useUi((s) => s.view);
  return (
    <div className="flex h-8 shrink-0 items-center gap-3 border-b border-surface-3 bg-surface-1 px-2">
      {question ? (
        <span className="min-w-0 flex-1 truncate text-xs text-muted" title={question}>
          {question}
        </span>
      ) : (
        <span className="flex-1" />
      )}
      <CommandButton id="view.units" label={units === 'nav' ? 'nm · ft · kt' : 'km · m · m/s'} />
      <RefSelect />
      <CommandButton id="view.fit" label="Fit" />
      <div className="flex items-center gap-0.5" role="group" aria-label="View">
        <CommandButton id="view.plan" label="Plan" pressed={view === 'plan'} />
        <CommandButton id="view.elevation" label="Elevation" pressed={view === 'elevation'} />
        <CommandButton id="view.3d" label="3D" pressed={view === '3d'} />
      </div>
      {view === 'elevation' ? <ElevationModeSegments /> : null}
    </div>
  );
}

/** From asset | Along path, bound to ui.elevationMode; shown while the view is Elevation. */
function ElevationModeSegments() {
  const mode = useUi((s) => s.elevationMode);
  const setMode = useUi((s) => s.setElevationMode);
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Elevation mode">
      <CommandButton
        id="view.elevationMode"
        label="From asset"
        pressed={mode === 'fromAsset'}
        onRun={() => setMode('fromAsset')}
      />
      <CommandButton
        id="view.elevationMode"
        label="Along path"
        pressed={mode === 'alongPath'}
        onRun={() => setMode('alongPath')}
      />
    </div>
  );
}

/** The range reference (legacy `#bd-ref`): the asset, its edge, or a system. Writes `useBoard.ref`. */
function RefSelect() {
  const ref = useBoard((s) => s.ref);
  const ids = useDocument((s) =>
    s.doc ? [...s.doc.sensors, ...s.doc.effectors, ...s.doc.nodes].map((x) => x.id).join('\n') : '',
  );
  const systems = ids ? ids.split('\n') : [];
  return (
    <label className="flex items-center gap-1 text-xs text-muted">
      Ref
      <select
        value={ref === 'asset' || ref === 'asset-edge' || systems.includes(ref) ? ref : 'asset'}
        onChange={(e) => useBoard.getState().set({ ref: e.target.value })}
        className={`h-6 rounded-sm border border-surface-3 bg-surface-1 px-1 text-xs text-text ${focusRing}`}
      >
        <option value="asset">Asset</option>
        <option value="asset-edge">Asset edge</option>
        {systems.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The layer chips (legacy `#bd-layers`), shown by `ui.panels.chips`; Shift+n flips chip n. */
function LayerChips() {
  const show = useUi((s) => s.panels.chips);
  const layers = useBoard((s) => s.layers);
  if (!show) return null;
  const defs = defaultLayers() as Record<string, boolean>;
  return (
    <div
      role="group"
      aria-label="Layers"
      className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-surface-3 bg-surface-1 px-2 py-1 text-xs"
    >
      <span className="text-micro text-muted uppercase">Layers</span>
      {chips().map((l) => {
        const on = layers[l.id] ?? defs[l.id] ?? false;
        return (
          <button
            key={l.id}
            type="button"
            aria-pressed={on}
            title={`Shift+${l.chip}`}
            onClick={() => toggleLayer(l.id)}
            className={`h-6 shrink-0 rounded-sm border px-2 ${
              on ? 'border-accent text-text' : 'border-surface-3 text-muted'
            } ${focusRing}`}
          >
            {l.chip} {LAYER_LABELS[l.id as keyof typeof LAYER_LABELS] ?? l.id}
          </button>
        );
      })}
    </div>
  );
}

export default function BuildWorkspace() {
  // I and \ show and hide the side panels through `ui.panels` (legacy, review 9.1 F-04).
  const showList = useUi((s) => s.panels.list);
  const showInspector = useUi((s) => s.panels.inspector);
  // The rail's hover tip. The board draws its own tip; its pointer is null off the board, so
  // one hover key never has two tips.
  const [railPointer, setRailPointer] = useState<{ x: number; y: number } | null>(null);
  return (
    <main aria-label="Build" className="flex min-h-0 flex-1 flex-col">
      <BuildBar />
      <div className="flex min-h-0 flex-1">
        {showList ? (
          <div
            className="flex min-h-0 shrink-0"
            onPointerMove={(e) => setRailPointer({ x: e.clientX, y: e.clientY })}
            onPointerLeave={() => setRailPointer(null)}
          >
            <Rail />
            <Tip pointer={railPointer} />
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col">
          <LayerChips />
          <section aria-label="Map" className="relative min-h-0 min-w-0 flex-1 bg-surface-0">
            <Board />
          </section>
          <section
            aria-label="Timeline"
            style={{ height: TIMELINE_HEIGHT }}
            className="shrink-0 border-t border-surface-3 bg-surface-1"
          >
            <Timeline />
          </section>
        </div>
        {showInspector ? (
          <div className="flex h-full min-h-0 w-col-right shrink-0 flex-col">
            <Readout variant="panel" />
            <div className="min-h-0 flex-1">
              <Inspector />
            </div>
          </div>
        ) : null}
      </div>
      <FormationPopover />
    </main>
  );
}
