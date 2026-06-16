import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { seedIfEmpty } from './data/seed';
import { importStarterPantry } from './data/pantrySeed';
import { PREVIEW } from './state/repos';
import { applyTheme, watchSystemTheme } from './lib/theme';
import { clearStaleDevOverrides, applyDevOverrides } from './lib/devTokens';
import { initDynamicType } from './lib/dynamicType';
import AppRoot from './AppRoot';
import { initSplash } from './lib/splashCoordinator';
import './index.css';

// Minimum time the loading screen is shown (matches the 5 s arc animation).
const MIN_SPLASH_MS = 5000;

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

  // Run data seeding in parallel with the minimum display time so the loading
  // screen always shows for at least MIN_SPLASH_MS (matching the arc animation),
  // while also staying up as long as seeding actually takes if it is slower.
  await Promise.all([
    PREVIEW
      ? Promise.resolve()
      : seedIfEmpty().then(() => importStarterPantry()),
    new Promise<void>(r => setTimeout(r, MIN_SPLASH_MS)),
  ]);

  // Signal AppRoot to fade out the loading screen and reveal the app.
  splashResolve();
}

void bootstrap();
