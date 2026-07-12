# Getting leve onto TestFlight

This is separate from your day-to-day loop (`npm run ios` → Xcode ▶ Run over
cable). That stays exactly as fast as it is today. TestFlight is an
additional, optional distribution channel, not a replacement. See the bottom
of this doc for how the two relate.

Everything below happens on your Mac, in Xcode and on
appstoreconnect.apple.com; none of it can be scripted from a chat session,
since it needs your Apple ID login (with 2FA) and, for the App Store Connect
parts, a browser session.

Your project's identifiers (already set, nothing to change):
- Bundle ID: `com.marcosilva86.nutritiongoal`
- Team ID: `AJE2P7Z7EP`
- Version / build: `1.0` / `1` (you'll bump the build number each upload, see step 5)

## One-time setup

### 1. Confirm your paid team is active in Xcode
Xcode → Settings → Accounts → select your Apple ID → the team list should show
your paid Developer Program membership (not just "\<name\> (Personal Team)").
If it only shows Personal Team, the enrollment may still be processing;
check developer.apple.com/account for "Membership: Active" first.

### 2. Create the app record in App Store Connect
Go to appstoreconnect.apple.com → **Apps** → **+** → **New App**.
- Platform: iOS
- Name: `leve` (or whatever public name you want, this is just the
  TestFlight/App Store listing name, doesn't affect the installed app)
- Primary language: English (or your preference)
- Bundle ID: select `com.marcosilva86.nutritiongoal` from the dropdown
  (Apple auto-registers it the first time Xcode archives with automatic
  signing, if it's not in the dropdown yet, do step 4 once first, then
  come back here)
- SKU: any unique string, e.g. `leve-ios-001`
- User Access: Full Access is fine for a personal app

### 3. Switch Xcode's signing to Distribution
In Xcode → App target → **Signing & Capabilities**: "Automatically manage
signing" should already be checked. With your paid team selected, Xcode
will generate an **Apple Distribution** certificate automatically the first
time you archive (step 5), no manual certificate/profile creation needed.

## Every time you want a new TestFlight build

### 4. Sync the latest code
```bash
cd ~/leve && git pull && npm run ios:sync
```

### 5. Bump the build number
In Xcode → App target → **General** → **Build**, increment it (e.g. `1` →
`2`). App Store Connect rejects an upload whose build number was already
used for the current version. Leave **Version** (`1.0`) alone until you
actually want to mark a new marketing version.

### 6. Archive
At the top of Xcode, where you normally pick your iPhone as the run target,
switch it to **Any iOS Device (arm64)** instead (Archive is disabled while a
simulator or a specific connected device is selected).
Then **Product → Archive**. This takes a minute or two: a build that
doesn't launch on a tethered device, just gets packaged.

### 7. Upload
When the Organizer window opens (or **Window → Organizer** if it doesn't):
select the new archive → **Distribute App** → **App Store Connect** →
**Upload** → keep the default automatic signing options → Upload.
Xcode handles re-signing with the distribution certificate itself.

### 8. Wait for processing
Apple's automated processing (not human review) takes anywhere from a few
minutes to about an hour. You'll get an email, or you can watch it in App
Store Connect → your app → **TestFlight** tab → **iOS Builds**.
The first time only, you may be prompted for an **Export Compliance**
answer, since the app only uses standard HTTPS, the answer is "No" /
"this app is exempt."

### 9. Add yourself as an internal tester
App Store Connect → your app → **TestFlight** tab → **Internal Testing** →
create a group (e.g. "Me") → add testers. Internal testers must already be
users on your App Store Connect team with a role (as the account holder,
that's you by default). **No Beta App Review for internal testing, ever:**
a processed build shows up for internal testers within minutes.

### 10. Install via the TestFlight app
On your iPhone, install **TestFlight** from the App Store, sign in with the
same Apple ID, accept the invite (you'll get one the first time), and install
leve from there.

## If you ever want to share it with other people
**External Testing** groups (App Store Connect → TestFlight → External
Testing) don't require the tester to be on your dev team, just an email, or
a public link, up to 10,000 testers. The **first** build sent to an external
group needs Apple's **Beta App Review** (human, usually well under 48h).
Builds after that, to the same group, skip review unless you change
permissions/encryption/etc. Not needed for solo use, only mentioned here
in case you want to hand it to someone later.

## Shared beta mode (temporary, for handing this to external testers)
If you're sharing this app so people can try it without needing their own
Anthropic API key, there's a build-time switch for that: `VITE_SHARED_BETA`
in `.env.local` (gitignored, never committed — see `.env.example` for the
two lines to copy in). It's OFF unless you explicitly set it, so it can
never affect your own regular builds by accident.

**Right before archiving a build to hand to testers:**
1. In `.env.local`, add:
   ```
   VITE_SHARED_BETA=true
   VITE_SHARED_BETA_ANTHROPIC_KEY=sk-ant-your-temporary-key
   ```
   (Use a key you're comfortable sharing — see the note on revoking it below.)
2. Build/archive as normal (steps 4-8 above).

**What this does, while it's on:** a fresh install of that build defaults
into the app's isolated "Test account" instead of Real (so testers always
get an empty sandbox, never real personal data), and AI Food Scan
auto-connects using your temporary key there — no key entry screen, the
manual "AI Food Scan" row in Settings is hidden entirely since there's
nothing to configure.

**Right after archiving:** turn `VITE_SHARED_BETA` back off (or comment out
both lines) before your next regular `npm run ios:sync` to your own phone —
otherwise your own phone would also default into the empty Test account on
its next launch. The hidden Developer menu (triple-tap the Account title)
shows a clear warning banner whenever a build has shared-beta mode baked in,
so you can always double check.

**To end the test for everyone, at any time, without an app update:**
delete the temporary key in the Claude Console (console.anthropic.com → API
Keys). This is instant and permanent — every device using it stops working
on its very next request, no reinstall needed on their end. There's no
per-key spend limit in the Console, so if you want a safety net against
runaway usage while the key is still live, create it in its own Workspace
with a workspace-level spend limit, or simply fund it with prepaid credits
and turn off auto-reload — once those credits hit zero, it just stops.

## How this relates to your normal workflow
Nothing above touches `npm run ios` / Xcode ▶ Run. Keep using that for
every regular code change, as often as you want, zero waiting. TestFlight is
just an extra channel you reach for occasionally (e.g. testing without a
cable, or eventually sharing with someone else), via steps 4-10 above.
