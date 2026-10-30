/** Item shapes the primitives render. Phase 4 maps the command registry to these. */

export type MenuItem = {
  id: string;
  label: string;
  /** Display string, for example `⌘K`, `⇧⌘Z`, `Del`. */
  shortcut?: string;
  /** Set when the item is disabled; shown as the item's tooltip. */
  disabledReason?: string;
  onSelect?: () => void;
  children?: MenuItem[];
  separatorAfter?: boolean;
};

export type PaletteItem = {
  id: string;
  label: string;
  group: string;
  shortcut?: string;
  disabledReason?: string;
  onSelect: () => void;
};
