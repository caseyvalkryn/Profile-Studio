// Palette-local state: which groups the palette opens on, the formation popover, and the arming
// shape for the two Add groups the board has not taken over yet (height planes and events).
import { create } from 'zustand';
import type { AuthoredEventType } from '../../../domain/types';
import { useUi } from '../../../state/ui';

/** The Add groups in spec order (spec section 7, Build, left panel; section 8, Quick-add). */
export type AddGroupId =
  'threats' | 'sensors' | 'effectors' | 'nodes' | 'areas' | 'planes' | 'events';

export const ADD_GROUPS: readonly { id: AddGroupId; title: string }[] = [
  { id: 'threats', title: 'Threats' },
  { id: 'sensors', title: 'Sensors' },
  { id: 'effectors', title: 'Effectors' },
  { id: 'nodes', title: 'C2 and TSPI' },
  { id: 'areas', title: 'Areas' },
  { id: 'planes', title: 'Height planes' },
  { id: 'events', title: 'Events' },
];

export const ADD_TITLE: Record<AddGroupId, string> = Object.fromEntries(
  ADD_GROUPS.map((g) => [g.id, g.title]),
) as Record<AddGroupId, string>;

/**
 * Placement the board must arm for a row that `ui.armed` cannot carry. Lane 9.2.5 owns the board
 * side: it places an event on the threat path the user clicks. A height plane needs no placement
 * (it is added at once, as in legacy), so `plane` is here only for completeness of the shape.
 */
export type BoardArmed = { group: 'event'; type: AuthoredEventType } | { group: 'plane' };

/** null: the plain command palette (Cmd+K). 'add': every Add group (A). A group id: that group. */
export type PaletteScope = null | 'add' | AddGroupId;

type QuickAddState = {
  scope: PaletteScope;
  formationOpen: boolean;
  boardArmed: BoardArmed | null;
  setScope: (scope: PaletteScope) => void;
  setFormationOpen: (open: boolean) => void;
  setBoardArmed: (armed: BoardArmed | null) => void;
};

export const useQuickAdd = create<QuickAddState>()((set) => ({
  scope: null,
  formationOpen: false,
  boardArmed: null,
  setScope: (scope) => set({ scope }),
  setFormationOpen: (formationOpen) => set({ formationOpen }),
  setBoardArmed: (boardArmed) => set({ boardArmed }),
}));

/** Open the palette on the Add groups (`'add'`) or on one group. */
export function openQuickAdd(scope: Exclude<PaletteScope, null>): void {
  useQuickAdd.getState().setScope(scope);
  useUi.getState().setPaletteOpen(true);
}

/** The groups a scope focuses, by title. */
export function focusTitles(scope: PaletteScope): string[] | undefined {
  if (scope === null) return undefined;
  if (scope === 'add') return ADD_GROUPS.map((g) => g.title);
  return [ADD_TITLE[scope]];
}
