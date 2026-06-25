import type { CapacitorConfig } from '@capacitor/cli';

// Placeholder for the later native wrap (section 2 of the project context).
// Run `npm i -D @capacitor/cli && npm i @capacitor/core` and `npx cap add ios`
// when you're ready to install on the iPhone via Xcode. HealthKit/Withings
// arrive as Capacitor plugins behind the existing repository interface.
const config: CapacitorConfig = {
  appId: 'com.marco.nutritiongoal',
  appName: 'leve',
  webDir: 'dist',
  // Sets the WKWebView background colour before the page CSS is parsed.
  // Prevents the white flash on cold launch while the JS bundle loads.
  backgroundColor: '#161618',
  plugins: {
    Keyboard: {
      // Do not resize the WKWebView when the keyboard appears.
      // The keyboard overlays the web content instead of shrinking the viewport.
      // Our JS (Sheet.tsx visualViewport tracking + GoalSetupScreen useKeyboardScroll)
      // handles padding and scroll-into-view, eliminating the black-void / content-jump.
      resize: 'none',
      // Keep the accessory bar (Done / next / prev) above the keyboard.
      style: 'default',
    },
    SplashScreen: {
      // Show the native splash for 0 ms then auto-dismiss — the JS LeveLoadingScreen
      // takes over immediately so there is no visible native splash at all.
      launchAutoHide: true,
      launchShowDuration: 0,
      // Dark background matches our JS loading screen so there is no flash.
      backgroundColor: '#161618',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
  },
};

export default config;
