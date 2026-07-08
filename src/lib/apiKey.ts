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
