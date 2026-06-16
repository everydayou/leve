/** Dev-menu token override utilities.
 *  Overrides are persisted to localStorage and applied on every boot via
 *  applyDevOverrides(). Calling setTokenOverride/clearTokenOverride also
 *  updates the live DOM so changes are visible instantly.
 *
 *  CSS_VERSION: bump this string whenever CSS defaults change (new colours,
 *  shadow values, etc.). On the next boot, any stale localStorage overrides
 *  from prior DevMenu sessions are wiped so the new CSS values take effect. */

const STORAGE_KEY  = 'nutri.dev.overrides';
const VERSION_KEY  = 'nutri.dev.css-version';
const CSS_VERSION  = '58';

/** Wipes stale overrides when the CSS version changes. Call once at boot,
 *  before applyDevOverrides(). */
export function clearStaleDevOverrides(): void {
  try {
    if (localStorage.getItem(VERSION_KEY) !== CSS_VERSION) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(VERSION_KEY, CSS_VERSION);
    }
  } catch { /* ignore */ }
}

export interface DevOverrides {
  light: Record<string, string>;
  dark: Record<string, string>;
}

export function loadDevOverrides(): DevOverrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<DevOverrides>;
      return { light: p.light ?? {}, dark: p.dark ?? {} };
    }
  } catch { /* ignore */ }
  return { light: {}, dark: {} };
}

export function saveDevOverrides(o: DevOverrides): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(o)); } catch { /* ignore */ }
}

let _applied: Set<string> = new Set();

/** Apply the correct set for the current dark/light mode. Call after every
 *  theme change so the right overrides are on <html> inline styles. */
export function applyDevOverrides(): void {
  const isDark = document.documentElement.classList.contains('dark');
  const set = loadDevOverrides()[isDark ? 'dark' : 'light'];
  for (const k of _applied) document.documentElement.style.removeProperty(k);
  _applied = new Set();
  for (const [k, v] of Object.entries(set)) {
    document.documentElement.style.setProperty(k, v);
    _applied.add(k);
  }
}

export function setTokenOverride(name: string, value: string, mode: 'light' | 'dark'): void {
  const o = loadDevOverrides();
  o[mode][name] = value;
  saveDevOverrides(o);
  document.documentElement.style.setProperty(name, value);
  _applied.add(name);
}

export function clearTokenOverride(name: string, mode: 'light' | 'dark'): void {
  const o = loadDevOverrides();
  delete o[mode][name];
  saveDevOverrides(o);
  const isDark = document.documentElement.classList.contains('dark');
  if ((mode === 'dark') === isDark) {
    document.documentElement.style.removeProperty(name);
    _applied.delete(name);
  }
}

export function resetDevOverrides(mode: 'light' | 'dark'): void {
  const o = loadDevOverrides();
  const keys = Object.keys(o[mode]);
  o[mode] = {};
  saveDevOverrides(o);
  const isDark = document.documentElement.classList.contains('dark');
  if ((mode === 'dark') === isDark) {
    for (const k of keys) { document.documentElement.style.removeProperty(k); _applied.delete(k); }
  }
}

/** Fully-resolved color value for a CSS variable (handles var() chains).
 *  Reads from :root computed styles recursively, then normalises the result
 *  to a hex or rgba string. Handles modern color formats (oklch, lab, etc.)
 *  via an off-screen canvas, so the DevMenu always receives a parseable value. */
export function resolveColorToken(name: string): string {
  function resolve(prop: string, depth = 0): string {
    if (depth > 8) return '#000000';
    const raw = getComputedStyle(document.documentElement).getPropertyValue(prop).trim();
    if (!raw) return '#000000';
    const varMatch = raw.match(/^var\(\s*(--[\w-]+)/);
    if (varMatch) return resolve(varMatch[1], depth + 1);
    return raw;
  }
  const resolved = resolve(name);
  // If already hex or rgb/rgba, return as-is — no canvas needed.
  if (resolved.startsWith('#') || /^rgba?\(/.test(resolved)) return resolved;
  // For modern color formats (oklch, lab, lch, color(…), etc.) that parseColor
  // in DevMenu cannot parse, convert to hex via a 1×1 canvas fill.
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return resolved;
    ctx.fillStyle = resolved;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (a < 255) {
      const alpha = (a / 255).toFixed(2);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  } catch {
    return resolved;
  }
}

/** Raw string value of a CSS custom property (may be a var() reference). */
export function readRawToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Generate CSS text for all overrides. */
export function exportCss(): string {
  const { light, dark } = loadDevOverrides();
  const lines: string[] = [];
  const lightE = Object.entries(light);
  const darkE  = Object.entries(dark);
  if (lightE.length) {
    lines.push(':root {');
    for (const [k, v] of lightE) lines.push(`  ${k}: ${v};`);
    lines.push('}');
  }
  if (darkE.length) {
    if (lines.length) lines.push('');
    lines.push('.dark {');
    for (const [k, v] of darkE) lines.push(`  ${k}: ${v};`);
    lines.push('}');
  }
  return lines.join('\n');
}
