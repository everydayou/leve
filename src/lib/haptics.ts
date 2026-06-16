import { Capacitor, registerPlugin } from '@capacitor/core';

/** Minimal Haptics interface — the native Capacitor bridge handles the call.
 *  Does NOT require @capacitor/haptics to be installed as an npm package. */
const HapticsProxy = registerPlugin<{
  impact(options: { style: string }): Promise<void>;
}>('Haptics');

const HAPTICS_KEY = 'nutri.haptics';

/** Returns true (enabled) unless the user has explicitly turned haptics off. */
export function getHapticsPref(): boolean {
  return localStorage.getItem(HAPTICS_KEY) !== 'false';
}

/** Persist the haptics preference. */
export function setHapticsPref(on: boolean): void {
  localStorage.setItem(HAPTICS_KEY, on ? 'true' : 'false');
}

/** Light haptic impact on native iOS — fire-and-forget, no-op on web or when disabled. */
export function hapticLight(): void {
  if (!Capacitor.isNativePlatform()) return;
  if (!getHapticsPref()) return;
  HapticsProxy.impact({ style: 'LIGHT' }).catch(() => {});
}
