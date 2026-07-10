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
cd ~/Documents/leve && git pull
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

### 7. Build a signed release APK
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

## Known gap: Apple Health integration is iOS-only
`@capgo/capacitor-health` (used for weight/activity sync) is HealthKit-only
— there's no Android equivalent shipped yet. Android testers can still log
weight/activity manually; auto-sync via Health Connect (Android's
equivalent) would need a separate plugin/implementation, not covered here.

## If you hit trouble
- **Gradle sync fails on first open** → make sure Android Studio finished
  its own SDK/tools setup (its welcome-screen SDK Manager) before opening
  the project.
- **"SDK location not found"** → Android Studio usually writes
  `android/local.properties` itself on first sync; if missing, File →
  Project Structure → SDK Location and let it regenerate.
- **`google-services.json` missing** error at build time → re-check step 5,
  the file must be at `android/app/google-services.json`.
