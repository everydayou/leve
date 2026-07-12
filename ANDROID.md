# Android build + tester distribution (Firebase App Distribution)

This adds Android as a second native target alongside iOS. Same shared
`src/` code, same Dexie storage layer — Android testers get their own
separate on-device data store, same as any other device. Nothing about
your iPhone build, TestFlight, or your own data changes.

Firebase App Distribution is the TestFlight-equivalent for Android: free,
invite-only (no Play Store listing, no review), testers install a small
one-time helper app then get an "you're invited" link for each build.
When you're ready for a public release, the same signed build can be
uploaded to Google Play — no rework.

Everything below happens on your Mac; none of it can be run from a chat
session (needs Android Studio, a Google account login, and device/emulator
access).

## One-time setup

### 1. Install Android Studio
Download from developer.android.com/studio, open it once so it finishes
its own SDK setup (Android SDK + an emulator image if you want one).

### 2. Pull this session's changes and open the Android project
```bash
cd ~/leve && git pull
npm install
npx cap sync android
npx cap open android
```
This opens the `android/` folder (already scaffolded by this session) in
Android Studio. Let Gradle finish syncing the first time — can take a
few minutes.

### 3. Run it once on a device or emulator to confirm it builds
- Plug in an Android phone (enable Developer Options → USB debugging), or
  use Android Studio's built-in emulator (Device Manager → create a
  virtual device).
- Press **Run** in Android Studio, pick the device/emulator.
- This is just a sanity check before setting up distribution.

### 4. Create a Firebase project
Go to console.firebase.google.com → **Add project** (free, no billing
needed for App Distribution). Any project name is fine, e.g. `leve`.

### 5. Register the Android app in Firebase
In the Firebase console → **Add app** → Android icon.
- Package name: use the same `applicationId` in
  `android/app/build.gradle` (defaults to whatever `appId` Capacitor set,
  e.g. `com.marco.nutritiongoal` — check the file, it should match your
  iOS bundle id's Android counterpart).
- Download the generated `google-services.json` and drop it into
  `android/app/` (this file is safe to commit — it's not a secret, just
  an app identifier).

### 6. Enable App Distribution
In the Firebase console left sidebar → **Release & Monitor** →
**App Distribution** → follow the prompt to enable it. Create a tester
group (e.g. "leve-testers") and add tester emails.

## Every time you want to send testers a new build

### 6.5. Turn on shared-beta mode first (so testers don't need their own key)
Same `VITE_SHARED_BETA` switch documented in TESTFLIGHT.md for iOS applies
here too — the app has no Android-specific logic for this at all, it's a
single build-time flag read at build time, same code path on both
platforms. Skipping this step is why early Android testers were prompted
to enter their own Anthropic key: the APK was built as a normal (flag-off)
build, same as your own day-to-day build.

**Right before building a release for testers:**
1. In `.env.local` (gitignored, create from `.env.example` if you don't
   have one yet), add:
   ```
   VITE_SHARED_BETA=true
   VITE_SHARED_BETA_ANTHROPIC_KEY=sk-ant-your-temporary-key
   ```
   (Same temporary key you use for iOS TestFlight testers works fine here
   too — one flag covers both platforms since it's just an env var read
   at build time, not anything platform-specific. Use a separate key
   instead if you'd rather be able to cut off Android testers without
   affecting iOS testers, or vice versa.)
2. Run `npm run android:sync` (rebuilds the web bundle with the flag
   baked in, then syncs it into `android/`) *before* step 7 below.

**Right after uploading the build:** turn `VITE_SHARED_BETA` back off (or
comment out both lines) before your next regular `npm run android:sync` /
`npm run ios:sync` for your own phone — otherwise your own device would
also default into the empty Test account on its next launch. The hidden
Developer menu (triple-tap the Account title) shows a warning banner
whenever a build has shared-beta mode baked in, on both platforms.

See TESTFLIGHT.md's "Shared beta mode" section for the full story
(what it does, how to end access for everyone instantly via the Claude
Console).

### 7. Build a signed release APK
**First, bump the version** in `android/app/build.gradle`'s `defaultConfig`
block — `versionCode` must go up by at least 1 (e.g. 2 -> 3), and
`versionName` should change too (e.g. "1.1" -> "1.2"). Skipping this means
Android can refuse to install the new release over an existing install of
the same versionCode, on some devices without any clear error — this bit
the first shared-beta release (round 205 stayed at the scaffold's
untouched versionCode 1 / versionName "1.0" for every release up to then).

In Android Studio: **Build → Generate Signed Bundle / APK → APK**.
First time, create a new keystore (Android Studio walks you through it —
save the keystore file and its password somewhere safe, you'll reuse it
for every future build, including eventually Google Play). Pick
**release** build variant.

### 8. Upload to Firebase App Distribution
Easiest path: in the Firebase console → App Distribution → your app →
**Upload release**, drag in the APK from
`android/app/release/app-release.apk`, pick your tester group, add release
notes, **Distribute**.

(Optional, once you're comfortable: this step can be scripted with the
`firebase-tools` CLI — `firebase appdistribution:distribute <path-to-apk>
--app <firebase-app-id> --groups "leve-testers"` — so it's one command
instead of a console upload each time.)

### 9. Testers install
Each tester gets an email invite → installs the small Firebase
App Tester helper app (one-time) → installs leve from the link → gets
a notification for each new build you distribute.

## Path to Google Play later
When ready: create a Google Play Console account ($25 one-time), create
an app listing, and upload the same signed release build (or a signed
App Bundle `.aab`, which Android Studio can generate the same way as the
APK) to an internal/closed testing track first, then promote to
production. Nothing in this Firebase setup needs to be undone — Firebase
App Distribution and Play testing tracks can run side by side.

## Apple Health / Health Connect sync works on both platforms
`@capgo/capacitor-health` (used for weight/activity sync) natively supports
both Apple HealthKit (iOS) and Health Connect (Android, the modern
replacement for Google Fit) through one unified API — our sync code
(`src/data/healthkit.ts`) has no platform-specific branching and works
identically on both. UI copy says "Apple Health" on iOS and "Health
Connect" on Android automatically (`healthServiceName()`).

One real Android-only requirement: Health Connect requires apps to show a
privacy policy when requesting permission. `public/privacypolicy.html`
covers this (bundled into the app, no hosting needed) — it's loaded
automatically by the plugin's native rationale screen, no extra config.

Health Connect itself ships built-in on Android 14+; on earlier versions
a tester needs to install "Health Connect by Android" from the Play Store
first (the app's own connect flow will still show, just won't do anything
until Health Connect is present).

## If you hit trouble
- **Gradle sync fails on first open** → make sure Android Studio finished
  its own SDK/tools setup (its welcome-screen SDK Manager) before opening
  the project.
- **"SDK location not found"** → Android Studio usually writes
  `android/local.properties` itself on first sync; if missing, File →
  Project Structure → SDK Location and let it regenerate.
- **`google-services.json` missing** error at build time → re-check step 5,
  the file must be at `android/app/google-services.json`.
