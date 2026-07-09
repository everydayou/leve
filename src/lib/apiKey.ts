import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { SHARED_BETA, SHARED_BETA_ANTHROPIC_KEY } from './sharedBeta';
import { activeProfile, TEST_PROFILE } from '../data/db';

// Bring-your-own Claude API key (Settings → AI Food Scan). When set, food
// scan/describe calls Anthropic directly from the device instead of going
// through the shared Vercel proxy. See lib/foodScan.ts.
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

// Shared-beta mode (see lib/sharedBeta.ts): on the Test profile only, fall
// back to Marco's own temporary key when the tester hasn't set a personal
// one — never applied on the Real profile, and never persisted to the
// keychain, so it can't leak into a normal build or a normal profile.
function withSharedBetaFallback(key: string | null): string | null {
  if (key) return key;
  if (SHARED_BETA && activeProfile === TEST_PROFILE && SHARED_BETA_ANTHROPIC_KEY) {
    return SHARED_BETA_ANTHROPIC_KEY;
  }
  return key;
}

/** The user's own Anthropic API key, or the shared-beta fallback key on the
 *  Test profile, or null if neither is set. */
export async function getApiKey(): Promise<string | null> {
  if (cache === undefined) cache = await readFromStore();
  return withSharedBetaFallback(cache);
}

/** Synchronous read of the cached value. Null until getApiKey() has been
 *  called once (e.g. on app boot). Use for instant UI state; fall back to
 *  the async getApiKey() when correctness matters more than latency. */
export function getCachedApiKey(): string | null {
  return withSharedBetaFallback(cache ?? null);
}

/** Save the user's key. Overwrites any existing value. */
export async function setApiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  await SecureStorage.setItem(STORE_KEY, trimmed);
  cache = trimmed;
}

/** Remove the user's key. Food scan reverts to the shared proxy. */
export async function clearApiKey(): Promise<void> {
  try { await SecureStorage.removeItem(STORE_KEY); } catch { /* already gone */ }
  cache = null;
}

// ── Global "open the API key sheet" trigger ────────────────────────────────
// A plain DOM event instead of prop-drilling/context: AI-feature call sites
// (Day's-log basket, Pantry meal builder, DescribeOverlay, all several
// layers deep in different component trees) need a one-line way to jump
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
