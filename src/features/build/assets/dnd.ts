// Drag from the asset library. The MIME type and payload belong to the map's dnd.ts, which reads
// them on drop. `type` is the threat archetype id for a threat, else the member kind.
import { ASSET_MIME, type AssetDragPayload } from '../map/dnd';

export { ASSET_MIME, type AssetDragPayload };

/** Write the payload and a small label-chip ghost. */
export function startAssetDrag(dt: DataTransfer, payload: AssetDragPayload, chip: string): void {
  dt.setData(ASSET_MIME, JSON.stringify(payload));
  dt.effectAllowed = 'copy';
  if (typeof dt.setDragImage !== 'function') return;
  const ghost = document.createElement('div');
  ghost.textContent = chip;
  ghost.style.cssText =
    'position:fixed;top:-100px;left:-100px;padding:2px 6px;border-radius:4px;' +
    'font:600 11px var(--font-mono);background:var(--surface-1);color:var(--text);' +
    'border:1px solid var(--accent)';
  document.body.appendChild(ghost);
  dt.setDragImage(ghost, 8, 8);
  setTimeout(() => ghost.remove(), 0);
}

/** Read the payload on drop, or null when the drag is not a library item. */
export function readAssetDrag(dt: DataTransfer): AssetDragPayload | null {
  const raw = dt.getData(ASSET_MIME);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as AssetDragPayload;
    return typeof v.kind === 'string' ? v : null;
  } catch {
    return null;
  }
}
