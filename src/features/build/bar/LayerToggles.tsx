// The five layer toggles of the Build bar (mockup `.chk`, line 386). The mapping to board layers
// lives in layers.ts.
import { focusRing } from '../../../ui/focus';
import { useBoard } from '../board/store';
import { LAYER_TOGGLES, setToggle, toggleOn } from './layers';

export default function LayerToggles() {
  const layers = useBoard((s) => s.layers);
  return (
    <div role="group" aria-label="Layers" className="flex flex-wrap items-center gap-2.5">
      {LAYER_TOGGLES.map((t) => (
        <label
          key={t.id}
          className="inline-flex cursor-pointer items-center gap-1.5 text-data text-muted select-none"
        >
          <input
            type="checkbox"
            checked={toggleOn(layers, t)}
            onChange={(e) => setToggle(t, e.target.checked)}
            className={focusRing}
          />
          {t.label}
        </label>
      ))}
    </div>
  );
}
