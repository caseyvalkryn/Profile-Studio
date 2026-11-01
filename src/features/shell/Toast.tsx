// The toast view (legacy `51-panel-dialog.js` #dl-toast): bottom centre, polite live region.
// Call `showToast` from `./toastStore` to show text; this component only renders the store.
import { useToast } from './toastStore';

export default function Toast() {
  const text = useToast((s) => s.text);
  const visible = useToast((s) => s.visible);
  return (
    <div
      className="dl-toast ps-t-sub"
      role="status"
      aria-live="polite"
      data-hidden={visible ? undefined : ''}
    >
      {visible ? text : ''}
    </div>
  );
}
