/** Coordinates the JS loading screen between main.tsx (bootstrap) and AppRoot.
 *  main.tsx calls splashResolve() once seeding + min-time are done;
 *  AppRoot subscribes to splashPromise to trigger the fade-out. */

let _resolve!: () => void;
let _promise: Promise<void> = new Promise<void>(r => { _resolve = r; });

/** main.tsx calls this before mounting React to get a fresh signal pair. */
export function initSplash(): () => void {
  _promise = new Promise<void>(r => { _resolve = r; });
  return () => _resolve();
}

/** AppRoot subscribes to this to know when to start the fade-out. */
export function getSplashPromise(): Promise<void> {
  return _promise;
}
