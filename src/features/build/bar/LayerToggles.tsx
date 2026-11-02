// The five layer toggles of the Build bar (mockup `.chk`, line 386). The mapping to board layers
// lives in layers.ts. Labels has a third state, focus (2026-11-02): the checkbox reads
// indeterminate and the text says so.
import { focusRing } from '../../../ui/focus';
import { useBoard } from '../board/store';
import { LAYER_TOGGLES, cycleToggle, toggleState } from './layers';

export default function LayerToggles() {
  const layers = useBoard((s) => s.layers);
  return (
    <div role="group" aria-label="Layers" className="flex flex-wrap items-center gap-2.5">
      {LAYER_TOGGLES.map((t) => {
        const s = toggleState(layers, t);
        return (
          <label
            key={t.id}
            className="inline-flex cursor-pointer items-center gap-1.5 text-data text-muted select-none"
          >
            <input
              type="checkbox"
              checked={s === 'on'}
              ref={(el) => {
                if (el) el.indeterminate = s === 'focus';
              }}
              onChange={() => cycleToggle(t)}
              className={focusRing}
            />
            {s === 'focus' ? `${t.label} · focus` : t.label}
          </label>
        );
      })}
    </div>
  );
}
