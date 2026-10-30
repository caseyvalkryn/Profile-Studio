// The Build map (spec section 7, Build; section 8, Interaction). Fills its container and reads
// the stores itself. MapLibre runs in MapController; React holds only the menu and the prompt.
import { useEffect, useRef, useState } from 'react';
import { Menu } from '../../../ui/Menu';
import { PromptNumber } from '../../../ui/PromptNumber';
import type { MenuItem } from '../../../ui/types';
import { MapController, type MenuRequest } from './controller';
import { menuItemsFor, type ArgRequest } from '../../commands/adapter';

export default function MapView() {
  const mapEl = useRef<HTMLDivElement>(null);
  const overlayEl = useRef<HTMLDivElement>(null);
  const tipEl = useRef<HTMLDivElement>(null);
  const ctl = useRef<MapController | null>(null);
  const [menu, setMenu] = useState<{ items: MenuItem[]; at: MenuRequest['at'] } | null>(null);
  const [arg, setArg] = useState<ArgRequest | null>(null);

  useEffect(() => {
    if (!mapEl.current || !overlayEl.current || !tipEl.current) return;
    const onMenu = (req: MenuRequest) =>
      setMenu({
        items: menuItemsFor(req.kind, { pointer: req.pointer, onArg: setArg }),
        at: req.at,
      });
    const c = new MapController(mapEl.current, overlayEl.current, tipEl.current, onMenu);
    ctl.current = c;
    return () => {
      c.destroy();
      ctl.current = null;
    };
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-surface-0" data-testid="map-view">
      <div ref={mapEl} className="absolute inset-0" data-testid="map-canvas" />
      <div ref={overlayEl} className="pointer-events-none absolute inset-0" aria-hidden />
      <div
        ref={tipEl}
        hidden
        role="status"
        className="pointer-events-none absolute left-0 top-0 rounded-sm bg-surface-1 px-1.5 py-0.5 font-mono text-[11px] text-text shadow-sm"
      />
      {menu ? (
        <Menu
          key={`${menu.at.x},${menu.at.y}`}
          open
          onOpenChange={(open) => {
            if (!open) setMenu(null);
          }}
          items={menu.items}
          trigger={
            <span
              aria-hidden
              data-testid="map-menu-anchor"
              className="pointer-events-none absolute size-0"
              style={{ left: menu.at.x, top: menu.at.y }}
            />
          }
        />
      ) : null}
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
