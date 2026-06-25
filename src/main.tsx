import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { seedIfEmpty } from './data/seed';
import { importStarterPantry } from './data/pantrySeed';
import { PREVIEW, repos } from './state/repos';
import { applyTheme, watchSystemTheme } from './lib/theme';
import { clearStaleDevOverrides, applyDevOverrides } from './lib/devTokens';
import { initDynamicType } from './lib/dynamicType';
import AppRoot from './AppRoot';
import { initSplash } from './lib/splashCoordinator';
import './index.css';

// Minimum time the loading screen is shown — two full animation cycles (0.9 s each).
// On a dev-profile reload (sessionStorage flag set) we skip the minimum entirely
// so profile switching isn't gated behind a 1.8 s wait.
const SPLASH_SHOWN_KEY = 'leve-splash-shown';
const alreadyShown = !!sessionStorage.getItem(SPLASH_SHOWN_KEY);
sessionStorage.setItem(SPLASH_SHOWN_KEY, '1');
const MIN_SPLASH_MS = alreadyShown ? 0 : 1800;

/** Preload the most-read IndexedDB collections so the first modal open
 *  (AddEntrySheet, WeightSheet, etc.) feels instant.  All reads are
 *  fire-and-forget — failures are silently ignored. */
async function warmUp(): Promise<void> {
  if (PREVIEW) return;
  try {
    const today = new Date().toISOString().split('T')[0];
    await Promise.all([
      repos.user.get(),
      repos.goals.getActive(),
      repos.foodItems.all(),
      repos.foodEntries.byDate(today),
      repos.activities.byDate(today),
      repos.weights.all(),
    ]);
  } catch { /* non-fatal */ }
}

async function bootstrap() {
  // Apply theme before first paint (also reinforced by the inline script in
  // index.html). Dynamic Type scale, dev overrides, and system-theme watcher
  // are set up synchronously so they are active before React renders.
  initDynamicType();
  applyTheme();
  clearStaleDevOverrides();
  applyDevOverrides();
  watchSystemTheme();

  // Best-effort: ask the browser to exempt IndexedDB from eviction (iOS Safari).
  if (!PREVIEW && navigator.storage?.persist) {
    navigator.storage.persist().catch(() => { /* non-fatal */ });
  }

  // Wire up the loading-screen coordination before mounting React.
  const splashResolve = initSplash();

  // Mount React immediately so the loading screen appears right away,
  // before the (potentially slow) seed operations begin.
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppRoot />
    </StrictMode>,
  );

  // Dismiss the native Capacitor splash — our JS loading screen takes over.
  // Dynamic import keeps @capacitor/splash-screen out of the browser bundle.
  if (Capacitor.isNativePlatform()) {
    requestAnimationFrame(() => {
      import('@capacitor/splash-screen')
        .then(({ SplashScreen }) => SplashScreen.hide({ fadeOutDuration: 300 }))
        .catch(() => { /* non-fatal — splash times out naturally */ });
    });
  }

  // Run seeding + warm-up in parallel with the minimum display time.
  // warmUp() fires after seeding so the DB is fully populated before reads.
  await Promise.all([
    PREVIEW
      ? Promise.resolve()
      : seedIfEmpty().then(() => importStarterPantry(repos.foodItems)).then(() => warmUp()),
    new Promise<void>(r => setTimeout(r, MIN_SPLASH_MS)),
  ]);

  // Signal AppRoot to fade out the loading screen and reveal the app.
  splashResolve();
}

void bootstrap();
