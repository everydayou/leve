import { SecureStorage } from '@aparajita/capacitor-secure-storage';

// Bring-your-own Claude API key (Settings → AI Food Scan). When set, food
// scan/describe calls Anthropic directly from the device instead of going
// through the shared Vercel proxy — see lib/foodScan.ts.
//
// Stored in the iOS Keychain / Android Keystore via @aparajita/capacitor-
// secure-storage (unencrypted localStorage on the web preview only, which
// is fine since that's dev-only). Never logged, never sent anywhere except
// straight to api.anthropic.com with the user's own key.
const STORE_KEY = 'nutri.anthropicApiKey';

// In-memory cache so callers don't pay a keychain round-trip on every scan.
// undefined = not loaded yet; null = loaded, no key set.
let cache: string | null | undefined;

async function readFromStore(): Promise<string | null> {
  try {
    const v = await SecureStorage.getItem(STORE_KEY);
    return v || null;
  } catch {
    return null; // nothing stored yet, or storage unavailable
  }
}

/** The user's own Anthropic API key, or null if they haven't set one. */
export async function getApiKey(): Promise<string | null> {
  if (cache === undefined) cache = await readFromStore();
  return cache;
}

/** Synchronous read of the cached value — null until getApiKey() has been
 *  called once (e.g. on app boot). Use for instant UI state; fall back to
 *  the async getApiKey() when correctness matters more than latency. */
export function getCachedApiKey(): string | null {
  return cache ?? null;
}

/** Save the user's key. Overwrites any existing value. */
export async function setApiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  await SecureStorage.setItem(STORE_KEY, trimmed);
  cache = trimmed;
}

/** Remove the user's key — food scan reverts to the shared proxy. */
export async function clearApiKey(): Promise<void> {
  try { await SecureStorage.removeItem(STORE_KEY); } catch { /* already gone */ }
  cache = null;
}

// ── Global "open the API key sheet" trigger ────────────────────────────────
// A plain DOM event instead of prop-drilling/context: AI-feature call sites
// (Day's-log basket, Pantry meal builder, DescribeOverlay — several layers
// deep in different component trees) all need a one-line way to jump
// straight to Settings → AI Food Scan when a scan/describe call fails.
// AppShell mounts a single ApiKeySheet instance and listens for this event,
// same pattern as the existing 'devmenu:reset-tab' event in AppShell.tsx.
const OPEN_EVENT = 'nutri:open-api-key-sheet';

/** Opens the bring-your-own-key sheet from anywhere in the app. */
export function requestApiKeySheet(): void {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

/** Subscribe to open requests (AppShell only). Returns an unsubscribe fn. */
export function onRequestApiKeySheet(handler: () => void): () => void {
  window.addEventListener(OPEN_EVENT, handler);
  return () => window.removeEventListener(OPEN_EVENT, handler);
}
