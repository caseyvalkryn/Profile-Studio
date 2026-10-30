// Interface state: selection, hover, tool, time, view, units, theme, overlays, workspace.
// None of it is a vignette edit, so none of it is an undo step.
import { create } from 'zustand';
import type {
  AreaKind,
  Area,
  Effector,
  EffectorKind,
  Node,
  NodeKind,
  Sensor,
  SensorKind,
  Threat,
} from '../domain/types';

export type Tool = 'select' | 'place' | 'path' | 'measure';

/** A library item armed for one click on the map. `type` is the threat archetype id. */
export type ArmedItem =
  | { group: 'threat'; type: string }
  | { group: 'sensor'; kind: SensorKind }
  | { group: 'effector'; kind: EffectorKind }
  | { group: 'node'; kind: NodeKind }
  | { group: 'area'; kind: AreaKind };

export type View = 'plan' | 'profile';
export type Units = 'nav' | 'si';
export type Theme = 'system' | 'light' | 'dark';
export type Workspace = 'library' | 'build' | 'results' | 'report';
export type LoopRange = { startS: number; endS: number };
export type MapPoint = { x: number; y: number };
/** A request to the map's path drawing, numbered so the same action can repeat. */
export type PathSignal = { seq: number; action: 'cancel' | 'finish' };
/** The selected target's place in the stack a repeat click cycles: `n` of `m`, top-most is 1. */
export type StackPosition = { key: string; n: number; m: number };

/** Copied assets, deep copies. Paste mints new keys and ids. */
export type Clip =
  | { group: 'threat'; value: Threat }
  | { group: 'sensor'; value: Sensor }
  | { group: 'effector'; value: Effector }
  | { group: 'node'; value: Node }
  | { group: 'area'; value: Area };

export type UiState = {
  selectedKeys: string[];
  hoverKey: string | null;
  tool: Tool;
  armed: ArmedItem | null;
  /** Start point of the measure tool, map metres. */
  measureFrom: MapPoint | null;
  /** True while the map draws a flight path. The map sets it; Escape and Enter read it. */
  drawing: boolean;
  /** The latest cancel or finish request for the path being drawn. The map acts on each new one. */
  pathSignal: PathSignal;
  /** Set by the map while a repeat click can cycle a stack; null otherwise. The map is the only writer. */
  stack: StackPosition | null;
  tS: number;
  playing: boolean;
  loop: LoopRange | null;
  rate: number;
  view: View;
  units: Units;
  theme: Theme;
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  workspace: Workspace;
  clipboard: Clip[];
  /** Incremented by requestFit; the map fits its view when this changes. */
  fitSeq: number;
  setSelection: (keys: string[]) => void;
  setHover: (key: string | null) => void;
  setTool: (tool: Tool) => void;
  setArmed: (item: ArmedItem | null) => void;
  setMeasureFrom: (p: MapPoint | null) => void;
  setDrawing: (drawing: boolean) => void;
  signalPath: (action: PathSignal['action']) => void;
  setStack: (stack: StackPosition | null) => void;
  setTime: (tS: number) => void;
  setPlaying: (playing: boolean) => void;
  setLoop: (loop: LoopRange | null) => void;
  setRate: (rate: number) => void;
  setView: (view: View) => void;
  setUnits: (units: Units) => void;
  setTheme: (theme: Theme) => void;
  setPaletteOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  setWorkspace: (w: Workspace) => void;
  setClipboard: (clips: Clip[]) => void;
  requestFit: () => void;
};

export const UI_DEFAULTS = {
  selectedKeys: [] as string[],
  hoverKey: null,
  tool: 'select',
  armed: null,
  measureFrom: null,
  drawing: false,
  pathSignal: { seq: 0, action: 'cancel' } as PathSignal,
  stack: null as StackPosition | null,
  tS: 0,
  playing: false,
  loop: null,
  rate: 1,
  view: 'plan',
  units: 'nav',
  theme: 'system',
  paletteOpen: false,
  shortcutsOpen: false,
  workspace: 'library',
  clipboard: [] as Clip[],
  fitSeq: 0,
} satisfies Partial<UiState>;

export const useUi = create<UiState>()((set) => ({
  ...UI_DEFAULTS,
  setSelection: (selectedKeys) => set({ selectedKeys }),
  setHover: (hoverKey) => set({ hoverKey }),
  setTool: (tool) => set({ tool }),
  setArmed: (armed) => set({ armed }),
  setMeasureFrom: (measureFrom) => set({ measureFrom }),
  setDrawing: (drawing) => set({ drawing }),
  signalPath: (action) => set((s) => ({ pathSignal: { seq: s.pathSignal.seq + 1, action } })),
  setStack: (stack) => set({ stack }),
  setTime: (tS) => set({ tS: Math.max(0, tS) }),
  setPlaying: (playing) => set({ playing }),
  setLoop: (loop) => set({ loop }),
  setRate: (rate) => set({ rate }),
  setView: (view) => set({ view }),
  setUnits: (units) => set({ units }),
  setTheme: (theme) => set({ theme }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setWorkspace: (workspace) => set({ workspace }),
  setClipboard: (clipboard) => set({ clipboard }),
  requestFit: () => set((s) => ({ fitSeq: s.fitSeq + 1 })),
}));
