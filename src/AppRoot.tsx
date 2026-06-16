import { useEffect, useState } from 'react';
import { HashRouter } from 'react-router-dom';
import App from './App';
import LeveLoadingScreen from './ui/screens/LeveLoadingScreen';
import { getSplashPromise } from './lib/splashCoordinator';

/** Wraps the real App behind the loading screen overlay.
 *  The App mounts immediately so Dexie live queries are subscribed before seeds
 *  complete. LeveLoadingScreen sits on top and fades out when bootstrap signals. */
export default function AppRoot() {
  const [splashDone, setSplashDone] = useState(false);
  const [exiting,    setExiting]    = useState(false);

  useEffect(() => {
    getSplashPromise().then(() => {
      setExiting(true);
      // Wait for the CSS fade-out (350 ms) before unmounting the overlay.
      setTimeout(() => {
        setSplashDone(true);
        // Replace the startup dark body background (#161618 from index.html)
        // with the theme's surface colour. The app shell covers all normal
        // content, but this prevents WKWebView keyboard-open gaps from
        // flashing the dark startup colour in light mode.
        document.body.style.background = 'var(--color-surface)';
      }, 380);
    });
  }, []);

  return (
    <>
      {/* Real app — always mounted so Dexie live queries are ready.
          Seeds completing while mounted automatically trigger re-renders. */}
      <HashRouter>
        <App />
      </HashRouter>

      {/* Loading overlay — covers App and fades out when bootstrap is done */}
      {!splashDone && <LeveLoadingScreen exiting={exiting} />}
    </>
  );
}
