# Phase 3 review (lane 3.R)

Scope: `git diff c2aaeaf..5b1cdcd -- src` (lanes 3.1 and 3.2). Reviewer: lane 3.R, 2026-10-30.

## Verdict

Phase 3 is sound in structure and needs one fix lane before phase 4 builds on it. The patch undo
core is correct: a drag is one step, `cancelDrag` and undo restore the document deep-equal, redo
replays minted keys, and selection, view and time stay out of history. The registry holds all 51
commands, and every shortcut string matches the spec Keys table. `npm run gate` passes (typecheck,
lint, 42 files and 265 tests, build), with no `any` and no act() or console warnings. There is one
blocker: autosave loses the last edit when another vignette opens within 500 ms, and when autosave
stops with a save pending. There are four majors. The `updated` stamp turns every no-op edit into an
undo step. Undo can unlock a prediction and remove a run, so a prediction can be revised after its
result is seen. The legacy app's library export fails to import. One Escape closes the palette and
also clears the selection.

## Findings

### F-01 blocker: autosave drops the pending save on document switch and on stop
- File: `src/state/persist.ts:95-107`
- Defect: a new document reference clears the timer that holds the previous document's unsaved
  edit, and the stop function clears a pending timer without saving.
- Evidence: scratch S9. Open A, wait 600 ms, rename A, open B after 100 ms, wait 600 ms. The saves
  are `['A:test vignette', 'B:test vignette']`, so `A-edited` was never written. Then edit B and call
  `stop()`. No further save happens. Nothing flushes on `pagehide` either.
- Fix: when the document id changes, becomes null, or autosave stops, save the pending document at
  once instead of clearing its timer. Add a `pagehide`/`visibilitychange` flush in phase 4.

### F-02 major: undo can unlock a prediction and delete a run (hypothesis lock)
- File: `src/state/runs.ts:98-103` (lock step) and `:129-139` (Run step)
- Defect: 'Lock predictions' and 'Run' are both ordinary undo steps, so two undos restore
  `lockedAt: null` and remove the RunSummary. The prediction can then be edited and re-run after
  the result was seen, which breaks principle 4.1 and acceptance 12.5.
- Evidence: scratch S6. One hypothesis with a prediction, one run, two undos. Result:
  `lockedAt null`, `runs 0`. Also, after an undone Run, `useRuns.activeKey` still points to a result
  whose RunSummary no longer exists in the document.
- Decision: put the lock in the run result, not in undo history. At run start, snapshot each
  hypothesis prediction (key, low, high) into the RunSummary. Results then evaluate against that
  snapshot, and `Hypothesis.lockedAt` is derived from whether any stored run cites it. Append
  RunSummaries outside undo history (a non-history write), and give run removal its own explicit
  command.

### F-03 major: every edit stamps `updated`, so a no-op edit becomes an undo step
- File: `src/state/document.ts:42-47`, `:78-79`, `:95-96`
- Defect: `stamp()` writes `d.updated = now()` inside every recipe. `patches.length === 0` is
  therefore never true, and an edit that changes nothing still pushes a step. Undo of that step
  shows no change.
- Evidence: scratch S1. `edit('noop', () => {})` gives `history ['noop']`. Scratch S2: the first run
  on a vignette with no hypotheses pushes 'Lock predictions' with only an `updated` patch. The same
  happens for Set altitude to the current value, Make omni on an already-omni mixed selection, and
  Set top below `zMinM`.
- Fix: run the recipe without the stamp, push only when its patches are non-empty, and set `updated`
  outside history (in the same `set`, or at save time). This also stops undo from rewinding
  `updated` (see N-03).

### F-04 major: the legacy app's library export does not import
- File: `src/state/persist.ts:76-82`
- Defect: `importJson` passes `{schema: 'profile-studio/4', library: [...]}` (legacy
  `PS.persist.exportLibrary`, used by the legacy dialog's export at `legacy/js/51-panel-dialog.js:57`)
  to `importLegacyV4`, which needs `scene`. A bare array, and a record with no stamp (legacy reads
  it as v3), are rejected as "Unknown record stamp: undefined".
- Evidence: scratch S8. Legacy seeds through `exportLibrary` give "This is not a profile record.
  Check the JSON." The single-record `exportText` imports. The legacy parser `P.parse`
  (`legacy/js/33-persist.js:105-137`) accepts an object, an array, or `{library}`.
- Fix: make `importJson` return `Vignette[]`, unwrap `library` and arrays the way `P.parse` does,
  and import each record. Say which records failed and why. Acceptance 12.9 depends on this.

### F-05 major: one Escape closes the palette and also clears the selection
- File: `src/commands/keys.ts:56-62` with `src/commands/commands.ts:438-453`
- Defect: Radix closes its layer on a capture-phase document `keydown` before the window listener
  runs. `edit.escape` then sees `paletteOpen === false` and falls through to clearing the selection.
  The same happens in a Field: Escape reverts the value and also deselects, which closes the
  inspector.
- Evidence: scratch S13 renders `Palette` wired to `useUi`, with `bindKeys(window)` and selection
  `['x']`. One Escape gives `paletteOpen false selection []`. Scratch S14: Escape in a Field gives
  value `5` (reverted) and `selection []`.
- Fix: in `dispatchKey`, ignore events with `defaultPrevented` set. Make Field's Escape call
  `preventDefault()` (or `stopPropagation()`), so that one Escape does one stage.

### F-06 minor: context-menu order follows registration, so Delete and Fit view come first
- File: `src/commands/registry.ts:28-30`
- Defect: `forTarget` returns registration order. The Keys-table commands register first, so every
  asset menu opens with Delete, and the empty-map menu opens with Fit view. This is the reverse of
  the spec table.
- Evidence: scratch S11. Threat menu: `Delete | Duplicate | Add waypoint here | ... | Reverse`.
  Map menu: `Fit view | Add threat here | ... | Set time here`.
- Fix: add a per-kind order list (the spec table rows) to `MENU_TARGETS` and sort `forTarget` by it.

### F-07 minor: "Add threat here" cannot pick a threat type
- File: `src/commands/commands.ts:353-363`
- Defect: the Threats submenu has one item that reads an `arg` type but is not marked `needsArg`, so
  menu and palette always add `THREAT_ARCHETYPES[0]`.
- Evidence: scratch S11 `needsArg` list omits `map.add.threat`. The map menu has one threat entry.
- Fix: register one "Add here > Threats" item per archetype, as the sensors do, or set `needsArg` and
  have phase 4 show the type picker.

### F-08 minor: Delete leaves an empty threat and dangling TSPI references
- File: `src/commands/commands.ts:426-433`
- Defect: deleting every waypoint of a threat keeps a threat with `path: []`, and the schema accepts
  it. Deleting a TSPI node does not remove its key from `report.truth.stationKeys`.
- Evidence: scratch S12: `path length 0 isVignette true` (the preview tolerates it, S15). The node
  filter at `:431` leaves `stationKeys` alone. Hypotheses reference a measure ID, not an asset key,
  so they cannot dangle.
- Fix: drop a threat whose path becomes empty, and filter `stationKeys` by surviving node keys, in
  the same recipe.

### F-09 minor: a run is scored on the start snapshot but stored into the edited document
- File: `src/state/runs.ts:104-139`
- Defect: edits made while a run is in flight are allowed. The RunSummary is then appended to a
  document whose threats may no longer match `rows[].threat`.
- Fix: store a content hash of the run-start vignette in RunSummary and mark the run stale in
  Results when it differs, or block vignette edits while a run is running.

### F-10 minor: worker errors surface internal wording
- File: `src/workers/simClient.ts:33`, `src/state/runs.ts:141`
- Defect: `RunEntry.error` holds raw messages such as "sim worker failed" and "sim worker: run
  returned no rows", which breaks principle 5.6.
- Evidence: scratch S5: status `error`, error `sim worker failed`. The store state is consistent
  otherwise (no RunSummary is added), but the 'Lock predictions' step stays.
- Fix: map worker failures to "The run stopped: <reason>" in `runs.ts`, and keep the raw text for
  the console.

### F-11 minor: the Field unit is hidden from assistive technology
- File: `src/ui/Field.tsx:120`
- Defect: the unit span is `aria-hidden`, so the accessible name is "Range" with no unit
  (principle 5.7).
- Fix: put the unit in the label's accessible name (``aria-label={`${label}, ${unit}`}``) or link the
  unit span through `aria-describedby`.

### F-12 minor: key repeat re-fires toggles
- File: `src/commands/keys.ts:70-72`
- Defect: `bindKeys` does not check `e.repeat`, so holding Space, M, U, ? or Cmd+K toggles them on
  every repeat.
- Fix: ignore `e.repeat` for every command except the time steps, undo and redo.

### F-13 minor: "Make sector or Make omni" is two items
- File: `src/commands/commands.ts:833-865`
- Defect: the spec lists one item that toggles. The menu shows both, with one disabled as "Already
  a sector" or "Already omni".
- Fix: in the phase 4 menu mapping, hide a disabled `system.makeSector`/`makeOmni` instead of
  greying it out, or merge them into one command whose label comes from the selection.

### Notes (no action)
- N-01 `src/state/runs.ts:95`: `startRun` has no guard of its own, so two direct calls append two
  runs (scratch S4: `['Lock predictions', 'Run', 'Run']`). The `run.start` command guards
  correctly: the second execute returns "A run is in progress" (S4b). Route every caller through
  the command.
- N-02 `src/workers/simClient.ts:19-38`: cancel leaves the worker running. Each call has its own
  worker, so a new run never queues behind it. The cost is CPU only. Stale results are dropped
  (scratch S3: 0 runs after the stale result resolves, 1 after the live one).
- N-03 `src/state/document.ts:42-47`: undo restores the old `updated`, so the Library order rewinds
  with it. The fix in F-03 removes this.
- N-04 `src/state/persist.ts:95-96`: autosave writes once on `open` (S9, first save). It does not
  bump `updated`. The cost is one extra write.
- N-05 `src/ui/types.ts:6` says `⌘K`, but `shortcutLabel` produces `Cmd+K`. Choose one format for
  menus, the palette and the shortcut sheet, so that acceptance 12.10 compares like with like.
- N-06 The spec right-click table has no row for C2 and TSPI nodes, so `forTarget('node')` is
  empty (S11). Spec gap. Ask whether nodes get Duplicate and Delete.
- N-07 `src/ui/menuItems.tsx:62-71`: a disabled menu item's reason is a pointer-only tooltip
  (flagged by 3.2). `aria-description` covers screen readers, and the palette shows the reason
  inline, so keyboard users can still read it.
- N-08 Label case: "Add Acoustic here" and "Add Directed energy here" sit beside "Add 3D radar
  here" (`SYSTEM_LABELS`). Use sentence case throughout.
- N-09 Radix portals render into `document.body`, outside the MapLibre container, so map
  `pointer-events` and stacking contexts do not reach them. `z-50` is enough. The risk is input:
  MapLibre's right-drag rotate and Radix ContextMenu both use `contextmenu`, and on macOS it fires on
  mousedown. Disable `dragRotate` on the plan map, and take the pointer from the map's own
  `contextmenu` event.

## Confirmed correct

- Drag is one step. Five `updateDrag` calls plus `endDrag` push one entry. Undo restores the pre-drag
  document deep-equal. `cancelDrag` restores `drag.base` deep-equal. Redo replays it (scratch,
  "drag is one step").
- Drag inverse order is newest first (`document.ts:103`). `edit`, `beginDrag` and `redo` end an open
  drag, and `undo` cancels it.
- `applyPatches` on the frozen immer output returns a new tree. Minted keys and ids are in the patches,
  so redo is deterministic.
- `HISTORY_LIMIT` 200 with `slice(-HISTORY_LIMIT)` drops the oldest (`document.ts:62`). Read only.
  No test covers it.
- Selection, hover, tool, time, view, units and clipboard live in `ui.ts`, which has no history.
- Cancel then a new run: the stale result is dropped (S3). A worker error sets `status: 'error'` and
  adds no RunSummary (S5). Stale progress callbacks check `live()`.
- `importJson` on a malformed v5 throws "This is not a valid vignette." with the zod detail (S7).
  Bad JSON gives "This file is not JSON." The error is thrown, not swallowed.
- Autosave debounce coalesces several edits into one save, 500 ms after the last edit (existing
  test). It skips `close` (null doc).
- The registry has 51 commands (S11). Shortcuts: `Mod+K Mod+Z Shift+Mod+Z Delete Escape Space
  ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight Mod+D Mod+C Mod+V Mod+Enter F M U 1 2 ?`,
  one for each row of the Keys table. `shortcutLabel` maps Arrow to Left/Right and Mod to Cmd/Ctrl.
- `?` with Shift dispatches `help.shortcuts`, because a symbol carries its own Shift (S10). Single
  letters are blocked in a text input ("F in input: null", S10). Backspace maps to Delete.
- The Escape order inside `edit.escape` is right: drag, palette, sheet, tool, then selection. F-05
  is the event-routing defect around it.
- Every right-click row of the spec table is present (S11). Add here covers 4 sensors, 3 effectors,
  C2, TSPI and 4 areas. Threat types: see F-07.
- Every `when` reason reads in test-engineer words: "Select a flight path first", "A run is in
  progress", "Copy something first", "Right-click the map first". No internal names.
- Command effects, checked:
  - Duplicate mints a new `key` and `id` on the asset and on each waypoint, offset +50 m east and
    −50 m north.
  - Reverse reverses the path.
  - Set altitude for all sets every waypoint `z`.
  - Hold +30 s adds to `holdS`.
  - Insert after uses the midpoint, or extends 100 m along the last leg.
  - Make omni sets `fovDeg` 360 and keeps `bearingDeg`. Make sector restores the kind's default or
    90.
  - Set top clamps to `zMinM`.
  - Delete removes a threat with its waypoints.
  - Every `run` writes through `ctx.document.edit` or a ui setter. No direct mutation.
- Tooltip: 400 ms delay, 300 ms skip window, `side` and `sideOffset` 6 with `avoidCollisions`. Radix
  never places content over the trigger.
- Menus show shortcuts through `Kbd`. The palette lists every item, disabled ones included, with
  the reason and the shortcut. It filters on label and group only.
- Motion: 100 ms in and 80 ms out, `prefers-reduced-motion` honoured. Focus rings on Button, menu
  items (`ring-accent`) and Field (`focus-within:border-accent`).
- No `any` in `src/state`, `src/commands` or `src/ui`. No act() or console warnings in those test
  runs.

## Phase 4 wiring list

1. Mount `<TooltipProvider>` once at the App root. Until then each Tooltip makes its own provider,
   and the skip delay is not shared.
2. Call `registerCommands()` once at startup (import of `commands.ts` does it) and
   `bindKeys(window)` in a root effect, with its cleanup. Add the `defaultPrevented` and `e.repeat`
   checks (F-05, F-12).
3. Map the registry to the primitives with one adapter. `Command` to `MenuItem` and `PaletteItem`:
   `label`, `shortcut: shortcutLabel(cmd)`, `disabledReason: when(ctx) !== true ? reason`,
   `onSelect: () => execute(id, ctx, arg)`. Build "Add here" submenus from `submenu` (split on
   ` > `). Order by the spec table (F-06). Hide the inactive Make sector/Make omni (F-13).
4. `needsArg` commands open `PromptNumber` (speed m/s, altitude m, range m, top m) or a type picker
   (Change threat type), then call `execute(id, ctx, value)`.
5. Right-click: on the map's `contextmenu`, set the selection to the hit asset, build
   `Pointer {x, y}` from `map.unproject`, then open `ContextMenu` with
   `forTarget(kind)`. The timeline passes `tS`. Disable MapLibre `dragRotate` (N-09).
6. Wire `paletteOpen` and `shortcutsOpen` to `Palette` and the shortcut sheet through `useUi`. The
   sheet reads `all()` and `shortcutLabel` (acceptance 12.10).
7. Start autosave once (`startAutosave()` in a root effect) after the F-01 fix, plus a
   `pagehide` flush. Surface `onError` as a quiet status message, not `console.error`.
8. Add an `AbortSignal` to `runInWorker` and `sweepInWorker` that terminates the worker. Pass it
   from `useRuns.cancel` and `cancelSweep`.
9. Route Run through `execute('run.start')` only (N-01). Apply the F-02 lock redesign before the
   Results screen evaluates hypotheses.
10. Drags on map handles call `beginDrag`, `updateDrag` each frame, and `endDrag` on pointerup.
    Escape calls `cancelDrag` through `edit.escape`. Selection changes go through `useUi` only.
11. Render `Field` with `unit` and `source` from `entered[...].source` in the inspector, with commit
    through `edit` (one step per commit).
