// Board-only state (legacy `ui.view`, `ui.cam.yaw/pitch/ref`, `ui.placing`, `ui.ruler`,
// `ui.snap`, `ui.hover.t`): the viewer transform, the axon orbit, the placement and ruler
// objects, the pointer and the index part of the selection. Nothing here is a profile edit.
// `ui.view` and `ui.elevationMode` (src/state/ui.ts) pick the camera; `ui.selectedKeys` and
// `ui.hoverKey` carry the selection; this store keeps what v6 keys cannot (a vertex index).
import { create } from 'zustand';
import type { Bounds } from '../../../board/geo';
import type { Ghost, Placing, Ruler } from '../../../board/layers';
import type { Size } from '../../../board';

/** Legacy placing plus the fields the renderer does not read (the area kind, the event type). */
export type BoardPlacing = Placing & {
  volKind?: string;
  evType?: string;
  group?: string;
  /** The snap name of the ghost ("on RDR-1 ring"), shown beside the cursor, not in the SVG. */
  label?: string | null;
};

/** Where the pointer is: board pixels, viewport pixels and the world position under it. */
export type BoardPointer = {
  sx: number;
  sy: number;
  clientX: number;
  clientY: number;
  /** Plan: metres. Elevation: `r`, `z`. 3D: null. */
  world: { x: number; y: number } | { r: number; z: number } | null;
};

/** The index part of a selection (`Sel.i`) for the key it was set with. */
export type SelIndex = { key: string; i: number };

export type BoardState = {
  zoom: number;
  px: number;
  py: number;
  yaw: number;
  pitch: number;
  /** Range reference: 'asset' or a system display id. */
  ref: string;
  /** Frozen scene bounds during a drag (legacy `ui.ghost.before`); null follows the scene. */
  bounds: Bounds | null;
  ruler: Ruler | null;
  placing: BoardPlacing | null;
  /** Snap to grid, rings, vertices and edges (G). */
  snap: boolean;
  hoverT: number | null;
  pointer: BoardPointer | null;
  selIndex: SelIndex | null;
  size: Size;
  /** The pre-drag record drawn dim under the live one (legacy `ui.ghost.before`). */
  ghost: Ghost | null;
  /** The drag's value text (legacy `ui.ghost.label`). */
  ghostLabel: string | null;
  /** The label beside the cursor: the value and the largest downstream change. */
  dragLabel: { text: string; sub: string | null } | null;
  /** The hint line (legacy `ui.readout`). */
  readout: { text: string; level: 'info' | 'warn' } | null;
  /** Layer chips the user flipped (legacy `ui.layers`); a missing id keeps the layer default. */
  layers: Record<string, boolean>;
  set: (patch: Partial<Omit<BoardState, 'set' | 'reset'>>) => void;
  reset: () => void;
};

export const BOARD_DEFAULTS = {
  zoom: 1,
  px: 0,
  py: 0,
  yaw: -35,
  pitch: 55,
  ref: 'asset',
  bounds: null as Bounds | null,
  ruler: null as Ruler | null,
  placing: null as BoardPlacing | null,
  snap: true,
  hoverT: null as number | null,
  pointer: null as BoardPointer | null,
  selIndex: null as SelIndex | null,
  size: { W: 900, H: 600 } as Size,
  ghost: null as Ghost | null,
  ghostLabel: null as string | null,
  dragLabel: null as { text: string; sub: string | null } | null,
  readout: null as { text: string; level: 'info' | 'warn' } | null,
  layers: {} as Record<string, boolean>,
};

export const useBoard = create<BoardState>()((set) => ({
  ...BOARD_DEFAULTS,
  set: (patch) => set(patch),
  reset: () => set({ ...BOARD_DEFAULTS }),
}));
