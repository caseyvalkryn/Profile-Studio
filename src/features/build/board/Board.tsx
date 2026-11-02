// The board view (legacy/js/51-panel-board.js panel one to one): one stage with the SVG, the
// hint line (#bd-msg), the cursor readout (#bd-cursor) and the drag label (#bd-label), the
// per-layer renderer, the gesture controller, the right-click menu, the number prompt and the
// hover tip. The toolbar (reference, layers, fit, snap) is the rail's in lane 9.2.6.
import { useEffect, useRef, useState } from 'react';
import type { ArgRequest } from '../../commands/adapter';
import { Menu } from '../../../ui/Menu';
import { PromptNumber } from '../../../ui/PromptNumber';
import type { MenuItem } from '../../../ui/types';
import { useDocument } from '../../../state/document';
import { useUi } from '../../../state/ui';
import { VIEW_TO_CAM } from '../../../board';
import { openTargetMenu } from '../menu/TargetMenu';
import { useQuickAdd } from '../palette/store';
import { Tip } from '../tip/Tip';
import { BoardGestures, hintText, type MenuRequest } from './gestures';
import { BoardRenderer } from './renderer';
import { useBoard } from './store';
import { anchor, cancelPlacing, finishPlacing, fit, placeAt, placingFor, ruler } from './tools';
import { ASSET_MIME, parseAssetPayload } from '../rail/dnd';
import { importSiteFile, isSiteFile } from '../../../commands/commands';
import { showToast } from '../../shell/toastStore';

export type BoardProps = {
  /** Fixed board size in pixels; otherwise the stage size is observed. */
  width?: number;
  height?: number;
};

export type BoardHandle = {
  renderer: BoardRenderer;
  gestures: BoardGestures;
};

/** Registry of mounted boards, for tests and the 9.2.6 shell (`cancel()` from the shell Escape). */
export const mounted = new Set<BoardHandle>();

/** Cancel the drag, the placement or the ruler of every mounted board. */
export function cancel(): boolean {
  let any = false;
  for (const h of mounted) if (h.gestures.cancel()) any = true;
  return any;
}

const LABEL_STYLE: React.CSSProperties = {
  background: 'var(--surface-2)',
  border: '1px solid var(--rule-strong, var(--border))',
  borderRadius: 3,
  padding: '2px 6px',
  whiteSpace: 'pre-line',
  zIndex: 2,
};

/** The selection rectangle: the accent as a dashed stroke and a faint fill (principle 5.2).
 *  `--accent` (tokens.css), not `--select`, which board.css scopes to the SVG. */
const MARQUEE_STYLE: React.CSSProperties = {
  border: '1px dashed var(--accent)',
  background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
  zIndex: 1,
};

export default function Board({ width, height }: BoardProps) {
  const stageEl = useRef<HTMLDivElement>(null);
  const svgEl = useRef<SVGSVGElement>(null);
  const msgEl = useRef<HTMLDivElement>(null);
  const cursorEl = useRef<HTMLDivElement>(null);
  const labelEl = useRef<HTMLDivElement>(null);
  const marqueeEl = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ items: MenuItem[]; x: number; y: number } | null>(null);
  const [arg, setArg] = useState<ArgRequest | null>(null);
  const pointer = useBoard((s) => s.pointer);
  const placing = useBoard((s) => s.placing);
  const rulerOn = useBoard((s) => !!s.ruler);
  const view = useUi((s) => s.view);
  const readout = useBoard((s) => s.readout);
  const handleRef = useRef<BoardHandle | null>(null);

  // A library row dropped on the board (lane 9.2.6): arm it, then place it at the drop point.
  // A threat starts its path there; the user continues it as after an armed click.
  // A KML or KMZ file dropped on the board imports its polygons as range areas (lane 14.2).
  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    const types = Array.from(e.dataTransfer.types);
    if (!types.includes(ASSET_MIME) && !types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    // Any file drop is ours: an uncancelled drop would open the file in the tab (review 14 F-03).
    const file = e.dataTransfer.files?.[0];
    if (file) {
      e.preventDefault();
      if (!isSiteFile(file)) {
        showToast('Drop a KML or KMZ file to import a site.');
        return;
      }
      importSiteFile(file).catch(() => undefined);
      stageEl.current?.focus();
      return;
    }
    const item = parseAssetPayload(e.dataTransfer.getData(ASSET_MIME));
    const last = handleRef.current?.renderer.last;
    if (!item || !last || !stageEl.current) return;
    e.preventDefault();
    const ui = useUi.getState();
    ui.setArmed(item);
    ui.setTool(item.group === 'threat' ? 'path' : 'place');
    const r = stageEl.current.getBoundingClientRect();
    const sx = (e.clientX - r.left) * (r.width ? last.W / r.width : 1);
    const sy = (e.clientY - r.top) * (r.height ? last.H / r.height : 1);
    const world = last.cam.unproject(sx, sy);
    if (world) placeAt(world, { cam: last.cam });
    stageEl.current.focus();
  };

  // renderer and gestures
  useEffect(() => {
    const stage = stageEl.current;
    const svg = svgEl.current;
    if (
      !stage ||
      !svg ||
      !msgEl.current ||
      !cursorEl.current ||
      !labelEl.current ||
      !marqueeEl.current
    )
      return;
    const size = () => {
      if (width && height) return { W: width, H: height };
      const r = stage.getBoundingClientRect();
      const W = Math.max(1, Math.round(r.width || stage.clientWidth || useBoard.getState().size.W));
      const H = Math.max(
        1,
        Math.round(r.height || stage.clientHeight || useBoard.getState().size.H),
      );
      return { W, H };
    };
    const renderer = new BoardRenderer(svg, size);
    const onMenu = (req: MenuRequest) => {
      const r = stage.getBoundingClientRect();
      setMenu({
        items: openTargetMenu(req.kind, req.target, req.pointer, setArg),
        x: req.clientX - r.left,
        y: req.clientY - r.top,
      });
    };
    const gestures = new BoardGestures(
      {
        stage,
        label: labelEl.current,
        cursor: cursorEl.current,
        msg: msgEl.current,
        marquee: marqueeEl.current,
      },
      renderer,
      onMenu,
    );
    const handle: BoardHandle = { renderer, gestures };
    handleRef.current = handle;
    mounted.add(handle);
    renderer.attach();
    gestures.attach();
    let ro: ResizeObserver | null = null;
    if (!(width && height) && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        const s = size();
        const b = useBoard.getState();
        if (s.W !== b.size.W || s.H !== b.size.H) b.set({ size: s });
      });
      ro.observe(stage);
    } else {
      useBoard.getState().set({ size: size() });
    }
    return () => {
      if (ro) ro.disconnect();
      gestures.detach();
      renderer.detach();
      mounted.delete(handle);
      handleRef.current = null;
    };
  }, [width, height]);

  // ui.armed and the palette's boardArmed start a placement; a placement that ends clears them
  useEffect(() => {
    const sync = () => {
      const ui = useUi.getState();
      const qa = useQuickAdd.getState();
      const b = useBoard.getState();
      const want = qa.boardArmed && qa.boardArmed.group === 'event' ? qa.boardArmed : ui.armed;
      const p = placingFor(want);
      if (p && (!b.placing || b.placing.kind === 'formation')) {
        b.set({ placing: p, ruler: null });
        if (p.kind === 'aircraft') ui.setDrawing(true);
      } else if (p && b.placing && b.placing.kind !== p.kind) {
        b.set({ placing: p });
      }
    };
    sync();
    const u1 = useUi.subscribe((s, prev) => {
      if (s.armed !== prev.armed && s.armed) sync();
      if (s.armed !== prev.armed && !s.armed && useBoard.getState().placing) {
        const b = useBoard.getState();
        const qa = useQuickAdd.getState();
        if (b.placing && b.placing.kind !== 'event' && !qa.boardArmed) b.set({ placing: null });
      }
      if (s.pathSignal !== prev.pathSignal) {
        if (s.pathSignal.action === 'finish') finishPlacing();
        else cancelPlacing();
      }
      if (s.tool !== prev.tool) {
        const b = useBoard.getState();
        if (s.tool === 'measure' && !b.ruler) ruler.toggle();
        if (s.tool !== 'measure' && b.ruler) ruler.clear();
      }
      if (s.measureFrom !== prev.measureFrom && s.measureFrom) {
        const b = useBoard.getState();
        const r = b.ruler || { a: null, b: null, done: false };
        const h = [...mounted][0];
        const cam = h && h.renderer.last ? h.renderer.last.cam : null;
        const a = anchor(s.measureFrom, cam);
        b.set({ ruler: { ...r, a, b: { x: a.x, y: a.y }, done: false } });
      }
      if (s.fitSeq !== prev.fitSeq) fit();
    });
    const u2 = useQuickAdd.subscribe((s, prev) => {
      if (s.boardArmed !== prev.boardArmed) {
        if (s.boardArmed) sync();
        else {
          const b = useBoard.getState();
          if (b.placing && b.placing.kind === 'event') b.set({ placing: null });
        }
      }
    });
    // a placement that ends clears the armed item, the tool and the drawing flag
    const u3 = useBoard.subscribe((s, prev) => {
      if (s.placing === prev.placing) return;
      // an append that starts drops an earlier readout, so its hint shows until the first point
      const pid = s.placing && s.placing.kind === 'aircraft' ? s.placing.pathId : undefined;
      if (pid && s.readout && !(prev.placing && prev.placing.pathId === pid))
        useBoard.getState().set({ readout: null });
      const ui = useUi.getState();
      const qa = useQuickAdd.getState();
      if (!s.placing) {
        if (ui.armed) ui.setArmed(null);
        if (ui.tool === 'place' || ui.tool === 'path') ui.setTool('select');
        if (ui.drawing) ui.setDrawing(false);
        if (qa.boardArmed) qa.setBoardArmed(null);
      }
    });
    const u4 = useBoard.subscribe((s, prev) => {
      if (s.ruler === prev.ruler) return;
      const ui = useUi.getState();
      if (!s.ruler && ui.tool === 'measure') ui.setTool('select');
      if (s.ruler && ui.tool !== 'measure') ui.setTool('measure');
    });
    return () => {
      u1();
      u2();
      u3();
      u4();
    };
  }, []);

  const hasDoc = useDocument((s) => !!s.doc);
  const hint = hintText(placing, rulerOn, VIEW_TO_CAM[view]);
  // in an append (placing.pathId) the leg readout of the last added waypoint shows over the hint
  const msg =
    placing && placing.kind === 'aircraft' && placing.pathId && readout
      ? readout.text
      : hint || (readout ? readout.text : '');

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ background: 'var(--surface-0)', minHeight: 220, minWidth: 0 }}
      data-testid="board-view"
    >
      <div
        ref={stageEl}
        tabIndex={0}
        role="application"
        aria-label="Board"
        className="board-stage absolute inset-0 select-none outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--select,#2862b0)]"
        style={{
          touchAction: 'none',
          width: width ? width : undefined,
          height: height ? height : undefined,
        }}
        data-testid="board-stage"
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <svg
          ref={svgEl}
          className="board edit"
          style={{ display: 'block', width: '100%', height: '100%' }}
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label={hasDoc ? undefined : 'Board, no profile'}
        />
      </div>
      <div
        ref={msgEl}
        className={
          'pointer-events-none absolute left-2 right-2 top-1.5 text-sub' +
          (readout && readout.level === 'warn' && !hint ? ' text-state-warning' : ' text-muted')
        }
        data-testid="board-msg"
        role="status"
      >
        {msg}
      </div>
      <div
        ref={cursorEl}
        className="pointer-events-none absolute bottom-1.5 right-2 whitespace-pre font-mono text-data text-muted"
        data-testid="board-cursor"
      />
      <div
        ref={marqueeEl}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 hidden"
        style={MARQUEE_STYLE}
        data-testid="board-marquee"
      />
      <div
        ref={labelEl}
        className="pointer-events-none absolute left-0 top-0 hidden font-mono text-data"
        style={LABEL_STYLE}
        data-testid="board-label"
      />
      <Tip pointer={pointer ? { x: pointer.clientX, y: pointer.clientY } : null} />
      {menu ? (
        <Menu
          key={`${menu.x},${menu.y}`}
          open
          onOpenChange={(open) => {
            if (!open) setMenu(null);
          }}
          items={menu.items}
          trigger={
            <span
              aria-hidden
              data-testid="board-menu-anchor"
              className="pointer-events-none absolute size-0"
              style={{ left: menu.x, top: menu.y }}
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
