// The five layer toggles of the Build bar (mockup `LAYER_DEFS`, line 232) over the board's chip
// layers (src/board/layers.ts). Only chip layers can be switched off; the structural layers
// (grid, paths, systems, volumes, planes, handles) always draw.
//
// | Toggle    | Board layers        |
// | Reach     | reach               |
// | Events    | events              |
// | Envelopes | envelopes           |
// | Telemetry | telemetry, target   |
// | Labels    | labels, labelsRest  |
//
// Labels has three states (2026-11-02): all (both on), focus (labels on, labelsRest off: only the
// selection's and the focus's labels place) and off. Its checkbox reads indeterminate in the
// focus state; a press or Shift+5 cycles all, focus, off.
//
// Two chip layers have no toggle and keep their default: `tracks` (on; the track frames at t are
// the scene, not an overlay) and `rings` (off; the range rings belong to the grid).
// Defaults stay `defaultLayers()`: Reach, Events, Envelopes and Labels read on, Telemetry reads
// off (telemetry off, target on), as mockup line 233 has it.
import { defaultLayers } from '../../../board';
import type { LayerId } from '../../../domain/types';
import { useBoard } from '../board/store';

export type ToggleId = 'reach' | 'events' | 'envelopes' | 'telemetry' | 'labels';

export type LayerToggle = { id: ToggleId; label: string; layers: readonly LayerId[] };

export const LAYER_TOGGLES: readonly LayerToggle[] = [
  { id: 'reach', label: 'Reach', layers: ['reach'] },
  { id: 'events', label: 'Events', layers: ['events'] },
  { id: 'envelopes', label: 'Envelopes', layers: ['envelopes'] },
  { id: 'telemetry', label: 'Telemetry', layers: ['telemetry', 'target'] },
  { id: 'labels', label: 'Labels', layers: ['labels', 'labelsRest'] },
];

/** Every board layer a toggle drives, in toggle order. */
export const TOGGLED_LAYERS: readonly LayerId[] = LAYER_TOGGLES.flatMap((t) => t.layers);

type Layers = Readonly<Record<string, boolean | undefined>>;

/** A board layer's state: the flipped value, else its default. */
export function layerOn(layers: Layers, id: LayerId): boolean {
  return layers[id] ?? defaultLayers()[id];
}

/** A toggle reads on when every board layer it drives is on. */
export function toggleOn(layers: Layers, t: LayerToggle): boolean {
  return t.layers.every((id) => layerOn(layers, id));
}

export type ToggleState = 'on' | 'focus' | 'off';

/** A toggle's state: 'focus' is Labels with `labels` on and `labelsRest` off. */
export function toggleState(layers: Layers, t: LayerToggle): ToggleState {
  if (toggleOn(layers, t)) return 'on';
  if (t.id === 'labels' && layerOn(layers, 'labels')) return 'focus';
  return 'off';
}

/** The state a press moves a toggle to: Labels cycles all, focus, off; the others flip. */
export function nextToggleState(layers: Layers, t: LayerToggle): ToggleState {
  const s = toggleState(layers, t);
  if (t.id !== 'labels') return s === 'on' ? 'off' : 'on';
  return s === 'on' ? 'focus' : s === 'focus' ? 'off' : 'on';
}

/** Set a toggle to a state. */
export function setToggleState(t: LayerToggle, s: ToggleState): void {
  const b = useBoard.getState();
  const next = { ...b.layers };
  for (const id of t.layers) next[id] = s === 'on';
  if (s === 'focus') next.labels = true;
  b.set({ layers: next });
}

/** A press on a toggle: the next state. */
export function cycleToggle(t: LayerToggle): void {
  setToggleState(t, nextToggleState(useBoard.getState().layers, t));
}

/** Set every board layer of one toggle. */
export function setToggle(t: LayerToggle, on: boolean): void {
  const b = useBoard.getState();
  const next = { ...b.layers };
  for (const id of t.layers) next[id] = on;
  b.set({ layers: next });
}

/** The toggled board layers' states, as a card stores them. */
export function toggledLayers(layers: Layers): Partial<Record<LayerId, boolean>> {
  const out: Partial<Record<LayerId, boolean>> = {};
  for (const id of TOGGLED_LAYERS) out[id] = layerOn(layers, id);
  return out;
}
