// App appearance (dark / light).
//
// Strategy: follow the device's system setting by default, with an optional
// manual override the user picks in Account. The choice is stored in
// localStorage so it survives reloads, and applied by toggling a `.dark`
// class on <html>. The dark palette lives in index.css (token overrides), so
// this file only decides WHEN .dark is on — it never touches colors.
//
// A tiny inline script in index.html applies the same logic BEFORE first
// paint to avoid a light flash; this module keeps it in sync at runtime.

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'nutri.theme';

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* localStorage unavailable — fall through to system */
  }
  return 'system';
}

function systemPrefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Resolve a preference to an actual dark on/off and apply it to <html>. */
export function applyTheme(pref: ThemePref = getThemePref()): void {
  const dark = pref === 'dark' || (pref === 'system' && systemPrefersDark());
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
  // Re-apply the correct set of dev token overrides for the new mode.
  // Import is lazy to avoid a circular dep at boot (devTokens imports nothing from theme).
  try {
    void import('./devTokens').then(m => m.applyDevOverrides());
  } catch { /* non-fatal */ }
}

export function setThemePref(pref: ThemePref): void {
  try { localStorage.setItem(KEY, pref); } catch { /* ignore */ }
  applyTheme(pref);
}

/** Re-apply when the OS appearance changes, but only while on 'system'. */
export function watchSystemTheme(): void {
  if (typeof matchMedia !== 'function') return;
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getThemePref() === 'system') applyTheme('system');
  });
}
