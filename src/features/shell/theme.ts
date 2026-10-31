// Theme (legacy `90-app.js` setTheme): auto follows the system, light and dark force it through
// `data-theme` on the root element, which `src/styles/tokens.css` reads. Auto removes the
// attribute. The choice persists in localStorage under its own key: the legacy app shares this
// origin and keeps its state under `profileStudio.v4`, so the port does not write there. The
// stored field name is the legacy one (`SAVED_UI` in `33-persist.js`).
import { useUi, type Theme } from '../../state/ui';

export const THEME_KEY = 'profileStudio.ui';
const THEMES: readonly Theme[] = ['auto', 'light', 'dark'];

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function storage(): Store | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** The stored theme, else auto. */
export function loadTheme(store: Store | null = storage()): Theme {
  try {
    const raw = store?.getItem(THEME_KEY);
    const t = raw ? (JSON.parse(raw) as { theme?: unknown }).theme : undefined;
    return THEMES.includes(t as Theme) ? (t as Theme) : 'auto';
  } catch {
    return 'auto';
  }
}

export function saveTheme(theme: Theme, store: Store | null = storage()): void {
  try {
    store?.setItem(THEME_KEY, JSON.stringify({ theme }));
  } catch {
    // Private mode or a full quota: the theme still applies for this tab.
  }
}

export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

/** Load the stored theme into the ui store, apply it, then apply and save every change. */
export function bindTheme(): () => void {
  const initial = loadTheme();
  useUi.getState().setTheme(initial);
  applyTheme(initial);
  return useUi.subscribe((s, prev) => {
    if (s.theme === prev.theme) return;
    applyTheme(s.theme);
    saveTheme(s.theme);
  });
}
