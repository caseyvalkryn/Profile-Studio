// The Build map (spec section 7, Build; section 8, Interaction). Fills its container and reads
// the stores itself. MapLibre runs in MapController; React holds only the menu and the prompt.
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { ContextMenu } from '../../../ui/ContextMenu';
import { PromptNumber } from '../../../ui/PromptNumber';
import type { MenuItem } from '../../../ui/types';
import { MapController } from './controller';
import { menuItemsFor, type ArgRequest } from '../../commands/adapter';

export default function MapView() {
  const mapEl = useRef<HTMLDivElement>(null);
  const overlayEl = useRef<HTMLDivElement>(null);
  const tipEl = useRef<HTMLDivElement>(null);
  const ctl = useRef<MapController | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [arg, setArg] = useState<ArgRequest | null>(null);

  useEffect(() => {
    if (!mapEl.current || !overlayEl.current || !tipEl.current) return;
    const c = new MapController(mapEl.current, overlayEl.current, tipEl.current);
    ctl.current = c;
    return () => {
      c.destroy();
      ctl.current = null;
    };
  }, []);

  const onContextMenu = (e: MouseEvent) => {
    const target = ctl.current?.menuAt(e.clientX, e.clientY);
    if (!target) {
      e.preventDefault();
      return;
    }
    setItems(menuItemsFor(target.kind, { pointer: target.pointer, onArg: setArg }));
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-surface-0" data-testid="map-view">
      <ContextMenu items={items}>
        <div ref={mapEl} className="absolute inset-0" onContextMenu={onContextMenu} />
      </ContextMenu>
      <div ref={overlayEl} className="pointer-events-none absolute inset-0" aria-hidden />
      <div
        ref={tipEl}
        hidden
        role="status"
        className="pointer-events-none absolute left-0 top-0 rounded-sm bg-surface-1 px-1.5 py-0.5 font-mono text-[11px] text-text shadow-sm"
      />
      {arg ? (
        <PromptNumber
          open
          onOpenChange={(open) => {
            if (!open) setArg(null);
          }}
          title={arg.title}
          label={arg.label}
          unit={arg.unit}
          value={arg.value}
          onSubmit={(v) => arg.submit(v)}
        />
      ) : null}
    </div>
  );
}
