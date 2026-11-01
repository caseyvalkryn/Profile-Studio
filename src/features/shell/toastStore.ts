// The one toast (legacy `51-panel-dialog.js`): a short status line at the bottom centre that
// fades after TOAST_MS. Any lane can call it.
//
// API:
//   showToast(text, ms?)  Show `text`, replacing any toast on screen. `ms` defaults to TOAST_MS.
//   hideToast()           Hide it now.
//   useToast              The zustand store; `<Toast />` in the shell renders `text` while
//                         `visible`. Tests read `useToast.getState().text`.
// Text is one sentence ending with a full stop: "Undid: Delete.", "Copied.".
import { create } from 'zustand';

/** Legacy toast duration. */
export const TOAST_MS = 2400;

type ToastState = { text: string; visible: boolean; seq: number };

export const useToast = create<ToastState>()(() => ({ text: '', visible: false, seq: 0 }));

let timer: ReturnType<typeof setTimeout> | null = null;

export function showToast(text: string, ms = TOAST_MS): void {
  if (timer) clearTimeout(timer);
  useToast.setState((s) => ({ text, visible: true, seq: s.seq + 1 }));
  timer = setTimeout(hideToast, ms);
}

export function hideToast(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  useToast.setState({ visible: false });
}

/** The undo and redo toasts (legacy `90-app.js`): "Undid: <label>." and "Redid: <label>.". */
export const undidText = (label: string | undefined) => `Undid: ${label || 'edit'}.`;
export const redidText = (label: string | undefined) => `Redid: ${label || 'edit'}.`;
