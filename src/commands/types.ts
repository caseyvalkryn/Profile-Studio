// Command contract (spec section 8, Commands). Menus, palette, keys and the shortcut sheet all
// read the one registry.
import type { DocumentState } from '../state/document';
import type { RunsState } from '../state/runs';
import type { UiState } from '../state/ui';

/** What a right-click lands on. `map` is empty map, `timeline` the timeline lanes. */
export type AssetKind =
  'map' | 'threat' | 'waypoint' | 'sensor' | 'effector' | 'node' | 'area' | 'timeline';

export type CommandGroup = 'file' | 'edit' | 'view' | 'time' | 'map' | 'run' | 'help';

/** Where the pointer was for a "here" command: map metres, and the timeline time when on it. */
export type Pointer = { x: number; y: number; tS?: number };

export type CommandContext = {
  document: DocumentState;
  ui: UiState;
  runs: RunsState;
  pointer: Pointer | null;
};

/** One choice for a command that takes `arg` from a fixed list, such as a threat archetype. */
export type CommandOption = {
  /** Passed to `run` as `arg`. */
  value: string;
  label: string;
  /** Submenu group, such as 'Group 1'. */
  group?: string;
};

export type Command = {
  id: string;
  label: string;
  group: CommandGroup;
  /** Canonical form: modifiers in the order Shift, Alt, Mod, then the key. `Mod` is Cmd or Ctrl. */
  shortcut?: string;
  /** Right-click targets that list this command. */
  kinds?: AssetKind[];
  /** Submenu name inside a context menu, such as 'Add here > Sensors'. */
  submenu?: string;
  /** True when the command reads ctx.pointer (a "here" command). */
  needsPointer?: boolean;
  /** True when the UI must collect `arg` first (set speed, set range, set altitude). */
  needsArg?: boolean;
  /** The fixed choices for `arg`, in menu order. A menu builds one child item per option. */
  options?: readonly CommandOption[];
  /** True when enabled, else the reason it is disabled. */
  when: (ctx: CommandContext) => true | string;
  run: (ctx: CommandContext, arg?: unknown) => void;
};
