// The Build workspace (spec section 7, Build; mockup `.board`, lines 378 to 393). The scene rail
// on the left; in the centre the Build bar, the board stage, the scrub and the thumbnails of the
// two other cameras; the inspector on the right. The stage takes all the height the bar, the
// scrub and the thumbnails leave (principle 5.1). One board renders Plan, Elevation and 3D.
import '../../board/board.css';
import { useState } from 'react';
import { setBoardCancel } from '../../commands/commands';
import { useUi } from '../../state/ui';
import BuildBar from './bar/BuildBar';
import Scrub from './bar/Scrub';
import Thumbnails from './bar/Thumbnails';
import Board, { cancel, mounted } from './board/Board';
import { setBoardCam } from './cards/cards';
import Inspector from './inspector/Inspector';
import { FormationPopover } from './palette/FormationPopover';
import { Rail } from './rail/Rail';
import { Tip } from './tip/Tip';

// The shell's Escape asks the board first: drag, then placing, then ruler.
setBoardCancel(cancel);
// Save as card reads the camera of the board on screen.
setBoardCam(() => [...mounted][0]?.renderer.last ?? null);

export default function BuildWorkspace() {
  // I and \ show and hide the side panels through `ui.panels` (legacy, review 9.1 F-04).
  const showList = useUi((s) => s.panels.list);
  const showInspector = useUi((s) => s.panels.inspector);
  // The rail's hover tip. The board draws its own tip; its pointer is null off the board, so
  // one hover key never has two tips.
  const [railPointer, setRailPointer] = useState<{ x: number; y: number } | null>(null);
  return (
    <main aria-label="Build" className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        {showList ? (
          <div
            className="flex min-h-0 shrink-0"
            onPointerMove={(e) => setRailPointer({ x: e.clientX, y: e.clientY })}
            onPointerLeave={() => setRailPointer(null)}
          >
            <Rail />
            <Tip pointer={railPointer} />
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col px-3.5 pt-2.5 pb-3.5">
          <BuildBar />
          <section
            aria-label="Map"
            className="relative min-h-80 min-w-0 flex-1 overflow-hidden bg-surface-0"
          >
            <Board />
          </section>
          <Scrub />
          <Thumbnails />
        </div>
        {showInspector ? (
          <div className="flex h-full min-h-0 w-col-right shrink-0 flex-col">
            <div className="min-h-0 flex-1">
              <Inspector />
            </div>
          </div>
        ) : null}
      </div>
      <FormationPopover />
    </main>
  );
}
