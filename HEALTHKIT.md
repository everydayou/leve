# Apple Health integration

## Status: REAL (not a mock)

Unlike Withings, this talks to the real `@capgo/capacitor-health` plugin —
HealthKit is an on-device permission grant, not OAuth, so there's no backend
to build first. Account → Connections → **Apple Health** lets you connect,
sync, and disconnect today.

**Scope (read-only):**
- **Weight** — imported into the same weight history as manual entries,
  tagged `source: 'healthkit'`. Never overwrites a date you've already
  logged (by hand or from a prior sync).
- **Activity/active-energy** — imported as one Activity entry per day
  (`name: 'Apple Health'`), tagged `source: 'healthkit'`. Skips any day with
  a manual activity entry; re-syncing refreshes the healthkit entry's total
  as more of the day's data lands in Health.
- Nothing is written **to** Health — leve only reads.

Everything lives behind one seam: `src/data/healthkit.ts` (the
`HealthKitService` interface + swap point `getHealthKitService`), same shape
as `withings.ts`. The UI (`HealthCard` in `AccountScreen.tsx`) and the rest
of the app don't know or care that it's real instead of mocked.

## The one manual step (Xcode, on your Mac)

HealthKit needs its capability + entitlement registered against your App ID
— Apple provisions this through Xcode's signing flow, so it can't be done by
hand-editing project files reliably.

1. Pull this change and sync natively:
   ```bash
   cd ~/Documents/leve && git pull && npm run ios:sync
   ```
2. In Xcode → App target → **Signing & Capabilities** → **+ Capability** →
   search **HealthKit** → double-click to add it. Leave both checkboxes
   (Clinical Health Records, Background Delivery) unchecked — not used here.
3. **▶ Run** once. Xcode will register the capability with your account and
   regenerate the provisioning profile automatically (automatic signing is
   already on).
4. First launch after that, tapping **Connect Apple Health** in Account →
   Connections shows the real iOS permission sheet, listing Weight and
   Active Energy as the two requested read types.

That's the only GUI step — the usage description
(`NSHealthShareUsageDescription`) is already in `Info.plist`, and the sync
logic needs no further configuration.

## Notes

- HealthKit only exists on a real device — the Simulator has no Health app,
  and the plugin correctly reports `available: false` there and in the web
  dev server / preview build, so the card just shows as unavailable rather
  than erroring.
- HealthKit deliberately never tells an app whether a **read** permission
  was actually granted or denied (Apple hides this to stop apps from
  inferring sensitive info from a refusal) — `connect()` proceeds
  optimistically and a denied read just means `sync()` finds 0 rows. This is
  normal HealthKit behavior, not a bug.
- **Disconnect** in the app only stops leve from syncing further — HealthKit
  gives apps no API to revoke their own access. To fully revoke, go to
  Settings → Privacy & Security → Health → leve on the phone.
- If you later want the reverse direction (writing leve's food log out to
  Health's Nutrition data), the same plugin supports `saveSample()` — it's a
  new, separate feature slice, not part of this scaffold.
