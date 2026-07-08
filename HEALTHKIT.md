# Apple Health integration

## Status: REAL (not a mock)

Unlike Withings, this talks to the real `@capgo/capacitor-health` plugin —
HealthKit is an on-device permission grant, not OAuth, so there's no backend
to build first.

**Where it shows up:**
- **Account → Settings → Connections → Apple Health** — connect or
  disconnect only, no "Sync now" here. Syncing itself is contextual: it
  happens automatically (app open/foreground) and, for one specific day,
  from that day's row in Day's log.
- **Log Activity / Log Weight** — a small dismissible banner offers to
  connect right there when Health is available and not yet connected
  (dismissible, never nags). Once connected, it switches to a persistent
  (non-dismissible) status line instead of disappearing entirely — "Apple
  Health connected · Synced 5m ago" — so connecting has a visible,
  ongoing result instead of the nudge just vanishing.
- **Day's log** — a synced Activity row is visually tagged (a Health icon)
  and opens a read-only view (`SyncedActivitySheet`) instead of the normal
  edit form: the kcal value, plus two small icon buttons — an eye to
  hide/un-hide the entry from totals, and a refresh icon to sync just this
  view on demand. A hidden entry stays in Day's log with an eye-off icon
  and a muted number instead of disappearing.

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
  **Hide** (`ActivityEntry.hidden`, toggled via `setActivityHidden`), which
  is a toggle, not a delete: the entry stays visible in Day's log with
  muted styling but is excluded from every total (`summarizeDay` and every
  other place that sums `activeCalories`), and future syncs skip a hidden
  day instead of reviving it. Un-hiding is the same toggle in reverse.
- **Sync cadence** — runs quietly once when the app launches and again
  each time it returns to the foreground (`AppShell.tsx`, via
  `@capacitor/app`'s `resume` event), plus on-demand via "Sync now" in
  Account. No continuous polling.
- **No historical backfill** — sync never reaches further back than the
  moment you actually hit Connect (`connectedAt`, reset on every connect
  including a reconnect), even if that's more recent than the normal
  30/14-day rolling window. Otherwise connecting after already having used
  leve manually for a while would quietly backfill weeks of Health data
  behind your back — harmless for weight (already protected by the
  skip-if-any-entry rule) but a real double-counting risk for the additive
  Activity sync. Connections made before this existed self-heal to "today"
  on their next sync rather than falling back to an unclamped backfill.
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
   Settings → Connections shows the real iOS permission sheet, listing
   Weight and Active Energy as the two requested read types.

That's the only GUI step — the usage description
(`NSHealthShareUsageDescription`) is already in `Info.plist`, and the sync
logic needs no further configuration.

## Notes

- Activity sync uses `queryAggregated` (native per-day sum), not
  `readSamples` summed by hand — HealthKit can hold multiple overlapping
  raw active-energy samples (iPhone + Watch + a workout app each writing
  their own), and only the native statistics engine resolves that the same
  way the Health app's own "Active Calories" number does. Summing raw
  samples client-side both misses that resolution and risked silently
  truncating at the sample-count limit before reaching today's data.
  Weight sync still uses `readSamples` deliberately — it's individual
  point-in-time readings, not something to aggregate.

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
