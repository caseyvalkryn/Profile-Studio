// Interface state: selection, hover, tool, time, view, units, theme, overlays, workspace, panels.
// None of it is a profile edit, so none of it is an undo step.
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

/** Build centre views: 1 Plan, 2 Elevation, 3 3D (legacy `46-keys.js`). */
export type View = 'plan' | 'elevation' | '3d';
export type Units = 'nav' | 'si';
/** `auto` follows the system setting (legacy `90-app.js` theme cycle). */
export type Theme = 'auto' | 'light' | 'dark';
export type Workspace = 'library' | 'build' | 'brief';
/** The Elevation view's section: along the selected path, or the ring around the selected asset. */
export type ElevationMode = 'alongPath' | 'fromAsset';
/** Build panel visibility (legacy `ui.panels`): inspector, asset list and top bar. */
export type Panels = {
  inspector: boolean;
  list: boolean;
  topbar: boolean;
};
export type PanelName = keyof Panels;
/** The shell's modal dialogs (legacy `51-panel-dialog.js`). */
export type ShellDialog = 'export' | 'import';
export const PANEL_DEFAULTS: Panels = {
  inspector: true,
  list: true,
  topbar: true,
};
export type LoopRange = { startS: number; endS: number };
/** The timeline's zoomed span in seconds; null shows the whole run. */
export type TimeView = { t0S: number; t1S: number };
export type MapPoint = { x: number; y: number };
/** A request to the map's path drawing, numbered so the same action can repeat. */
export type PathSignal = { seq: number; action: 'cancel' | 'finish' };
/** The selected target's place in the stack a repeat click cycles: `n` of `m`, top-most is 1. */
export type StackPosition = { key: string; n: number; m: number };
/**
 * The Build camera and time, stashed when Brief opens and restored when it closes (spec section
 * 7, Brief; principle 8.1). `view`, `elevationMode`, `tS` and `timeOn` are this store's; the rest
 * are the board store's (src/features/build/board/store.ts), copied as plain values.
 */
export type BuildStash = {
  view: View;
  elevationMode: ElevationMode;
  tS: number;
  timeOn: boolean;
  zoom: number;
  px: number;
  py: number;
  yaw: number;
  pitch: number;
  ref: string;
  layers: Record<string, boolean>;
};

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
  /** Set by the board while a repeat click can cycle a stack; null otherwise. A selection of another key clears it. */
  stack: StackPosition | null;
  tS: number;
  /**
   * The time cursor (T). Off (legacy and mockup default) draws every path in full with no track
   * frames; the board reads t only while it is on. Scrub, step, play and set-here turn it on.
   */
  timeOn: boolean;
  playing: boolean;
  loop: LoopRange | null;
  rate: number;
  /** The timeline zoom, shared by Build and Brief (one strip, two hosts). */
  tview: TimeView | null;
  view: View;
  units: Units;
  theme: Theme;
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  /** The open export or import dialog, else null. */
  dialog: ShellDialog | null;
  workspace: Workspace;
  panels: Panels;
  elevationMode: ElevationMode;
  clipboard: Clip[];
  /** Incremented by requestFit; the map fits its view when this changes. */
  fitSeq: number;
  /** The Brief's current card, by key; null or a key no longer in the deck means the first card. */
  cardKey: string | null;
  /** The Build view to restore when Brief closes; null while Brief is closed. */
  buildStash: BuildStash | null;
  setSelection: (keys: string[]) => void;
  setHover: (key: string | null) => void;
  setTool: (tool: Tool) => void;
  setArmed: (item: ArmedItem | null) => void;
  setMeasureFrom: (p: MapPoint | null) => void;
  setDrawing: (drawing: boolean) => void;
  signalPath: (action: PathSignal['action']) => void;
  setStack: (stack: StackPosition | null) => void;
  setTime: (tS: number) => void;
  setTimeOn: (on: boolean) => void;
  /** Playing turns the time cursor on. */
  setPlaying: (playing: boolean) => void;
  setLoop: (loop: LoopRange | null) => void;
  setRate: (rate: number) => void;
  setTview: (tview: TimeView | null) => void;
  setView: (view: View) => void;
  setUnits: (units: Units) => void;
  setTheme: (theme: Theme) => void;
  setPaletteOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  setDialog: (dialog: ShellDialog | null) => void;
  setWorkspace: (w: Workspace) => void;
  /** Set one panel; `show` omitted flips it. */
  togglePanel: (name: PanelName, show?: boolean) => void;
  setPanels: (panels: Partial<Panels>) => void;
  setElevationMode: (mode: ElevationMode) => void;
  setClipboard: (clips: Clip[]) => void;
  requestFit: () => void;
  setCardKey: (key: string | null) => void;
  setBuildStash: (stash: BuildStash | null) => void;
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
  timeOn: false,
  playing: false,
  loop: null,
  rate: 1,
  tview: null as TimeView | null,
  view: 'plan',
  units: 'nav',
  theme: 'auto',
  paletteOpen: false,
  shortcutsOpen: false,
  dialog: null as ShellDialog | null,
  // The shell sets the workspace from the route. Build is the default so a Build view mounted
  // without the shell (unit tests) gets the Build keys.
  workspace: 'build',
  panels: PANEL_DEFAULTS,
  // legacy opens Elevation as range from the asset
  elevationMode: 'fromAsset' as ElevationMode,
  clipboard: [] as Clip[],
  fitSeq: 0,
  cardKey: null as string | null,
  buildStash: null as BuildStash | null,
} satisfies Partial<UiState>;

export const useUi = create<UiState>()((set) => ({
  ...UI_DEFAULTS,
  // A selection of another key ends the board's stack cycle (moved here from the board gestures).
  setSelection: (selectedKeys) =>
    set((s) =>
      s.stack && s.stack.key !== selectedKeys[0] ? { selectedKeys, stack: null } : { selectedKeys },
    ),
  setHover: (hoverKey) => set({ hoverKey }),
  setTool: (tool) => set({ tool }),
  setArmed: (armed) => set({ armed }),
  setMeasureFrom: (measureFrom) => set({ measureFrom }),
  setDrawing: (drawing) => set({ drawing }),
  signalPath: (action) => set((s) => ({ pathSignal: { seq: s.pathSignal.seq + 1, action } })),
  setStack: (stack) => set({ stack }),
  setTime: (tS) => set({ tS: Math.max(0, tS) }),
  setTimeOn: (timeOn) => set({ timeOn }),
  setPlaying: (playing) => set(playing ? { playing, timeOn: true } : { playing }),
  setLoop: (loop) => set({ loop }),
  setRate: (rate) => set({ rate }),
  setTview: (tview) => set({ tview }),
  setView: (view) => set({ view }),
  setUnits: (units) => set({ units }),
  setTheme: (theme) => set({ theme }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setDialog: (dialog) => set({ dialog }),
  setWorkspace: (workspace) => set({ workspace }),
  togglePanel: (name, show) =>
    set((s) => ({ panels: { ...s.panels, [name]: show ?? !s.panels[name] } })),
  setPanels: (panels) => set((s) => ({ panels: { ...s.panels, ...panels } })),
  setElevationMode: (elevationMode) => set({ elevationMode }),
  setClipboard: (clipboard) => set({ clipboard }),
  requestFit: () => set((s) => ({ fitSeq: s.fitSeq + 1 })),
  setCardKey: (cardKey) => set({ cardKey }),
  setBuildStash: (buildStash) => set({ buildStash }),
}));
