# Installing Nutrition Goal Tracker on your iPhone (Capacitor + Xcode)

This wraps the web app in a native iOS shell so it installs like a real app and
stores your data durably in the app's own container. Capacitor (v8) is already
added to the project; you only run the steps below on your Mac.

## One-time prerequisites
- **Xcode** installed (from the Mac App Store), opened once so it finishes setup.
- **CocoaPods** (Capacitor needs it). If `pod --version` fails, install it:
  ```bash
  brew install cocoapods       # or: sudo gem install cocoapods
  ```
- A **free Apple ID** (no paid Developer account needed to start).

## First build (run from the project folder)
```bash
cd ~/Desktop/nutri/nutrition-goal-tracker
npm install            # pulls in the Capacitor packages
npm run ios:add        # one time only — creates the ios/ project
npm run ios            # builds the web app, syncs it, and opens Xcode
```

## In Xcode (first time)
1. In the left sidebar select the **App** project → the **App** target.
2. Open **Signing & Capabilities**.
3. Tick **Automatically manage signing**.
4. **Team** → add your Apple ID (Add an Account…) and select it. The bundle id
   `com.marco.nutritiongoal` is fine; change it only if Xcode complains it's taken.
5. Plug in your iPhone with a cable. Unlock it and tap **Trust** if prompted.
6. At the top of Xcode pick your iPhone as the run target.
7. Press **▶ Run**.
8. On the iPhone the first launch is blocked: go to **Settings → General → VPN &
   Device Management**, tap your developer profile, and **Trust** it. Re-open the app.

That's it — the app is on your phone.

## Fixing things in parallel (the iterate loop)
When I push web-code fixes to this folder, you bring them onto the phone with:
```bash
npm run ios:sync       # rebuilds the web app + syncs into the iOS project
```
then press **▶ Run** in Xcode again (or just `npm run ios` to do both and reopen Xcode).

**Your logged data survives this.** It lives in IndexedDB inside the app's data
container, which is separate from the app code. Re-running a new build updates the
code only — your weigh-ins, foods, and goal stay. Data is lost **only** if you
delete/uninstall the app from the phone.

## Free Apple ID caveats (and how data is affected)
- Free-signed apps **stop launching after ~7 days** until you re-run from Xcode
  (plug in, press Run — that re-signs it). **Re-signing does NOT erase your data**;
  only deleting the app does. The paid Apple Developer Program ($99/yr) removes the
  7-day expiry (profiles last ~1 year) and is also what unlocks Apple HealthKit later.
- Free accounts allow a small number of apps/devices — plenty for personal use.

## If you hit trouble
- **`pod: command not found`** → install CocoaPods (see prerequisites).
- **Signing error / "Failed to register bundle identifier"** → change `appId` in
  `capacitor.config.ts` to something unique (e.g. `com.marco.ngt2`), then
  `npm run ios:sync` and try again.
- **App shows old content after a sync** → the PWA service worker may be serving a
  stale cache. Tell me and I'll disable the service worker for the native build
  (one small config change); it's only needed for the browser PWA path.
- Anything else: copy the Xcode error text to me.

## Later: HealthKit / Withings
These arrive as Capacitor plugins behind the existing `repositories.ts` interface —
no rewrite. We add the plugin, implement the interface, and point `repos.ts` at it.
