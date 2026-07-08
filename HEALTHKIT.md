# Apple Health integration

## Status: REAL (not a mock)

Unlike Withings, this talks to the real `@capgo/capacitor-health` plugin —
HealthKit is an on-device permission grant, not OAuth, so there's no backend
to build first.

**Where it shows up:**
- **Account → Connections → Apple Health** — connect, force a sync, or
  disconnect. The explicit, always-available entry point.
- **Log Activity / Log Weight** — a small dismissible banner offers to
  connect right there, only shown when Health is available and not yet
  connected (never once you're connected, never if previously dismissed).
- **Day's log** — a synced Activity row is visually tagged (a Health icon
  instead of the usual activity icon) and opens a read-only view instead of
  the normal edit form.

**Scope (read-only):**
- **Weight** — imported into the same weight history as manual entries,
  tagged `source: 'healthkit'`. Never overwrites a date you've already
  logged (by hand or from a prior sync) — weight is one value per day, so
  logging your own is how you correct a bad reading; `WeightLogSheet`
  already always saves as `'manual'`, which protects it going forward.
- **Activity/active-energy — additive, not exclusive.** Every sync
  upserts at most ONE Activity entry per day tagged `source: 'healthkit'`
  (`name: 'Apple Health'`) with that day's Health total, refreshing it in
  place as more of the day's data lands — completely independent of
  whatever manual entries also exist that day. Both are legitimate,
  separate line items; Day's log just sums everything, the same as any two
  manual entries would. A synced entry is never edited inline (tapping it
  opens a read-only view, not the manual edit form) — the only action is
  **Ignore**, which removes it and permanently excludes that date from
  future syncs, same finality as deleting a manual entry.
- **Sync cadence** — runs quietly once when the app launches and again
  each time it returns to the foreground (`AppShell.tsx`, via
  `@capacitor/app`'s `resume` event), plus on-demand via "Sync now" in
  Account. No continuous polling.
- Nothing is written **to** Health — leve only reads.

Everything lives behind one seam: `src/data/healthkit.ts` (the
`HealthKitService` interface + swap point `getHealthKitService`), same shape
as `withings.ts`. The UI (`HealthCard` in `AccountScreen.tsx`,
`HealthConnectBanner.tsx`, `SyncedActivitySheet` in `TodayScreen.tsx`) and
the rest of the app don't know or care that it's real instead of mocked.

## The one manual step (Xcode, on your Mac)

HealthKit needs its capability + entitlement registered against your App ID
— Apple provisions this through Xcode's signing flow, so it can't be done by
hand-editing project files reliably.

1. Pull this change and sync natively (`npm install` first — new JS
   dependencies were added, and just syncing without installing them first
   is a common miss):
   ```bash
   cd ~/Documents/leve && git pull && npm install && npm run ios:sync
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
