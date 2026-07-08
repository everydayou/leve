// ── Apple Health integration (real, on-device — no backend needed) ────────
//
// WHAT THIS IS
// A framework-agnostic seam (same shape as withings.ts) for syncing weight
// and active-energy from Apple Health via @capgo/capacitor-health. Unlike
// Withings, HealthKit needs no OAuth/backend — it's a native on-device
// permission grant — so this talks to the real plugin directly, no mock.
//
// SCOPE (read-only, per product decision)
// - Weight: written through the same repo seam as manual entries, tagged
//   source: 'healthkit'. Never overwrites a date that already has ANY entry
//   (manual or previously-synced) — same non-destructive rule as Withings.
//   Weight is one value per day, so editing IS how you correct a bad
//   reading — WeightLogSheet already always saves as 'manual', which
//   protects it from being overwritten again on the next sync.
// - Activity/active-energy: ADDITIVE, not exclusive. Every sync upserts (at
//   most) ONE ActivityEntry per day tagged source: 'healthkit' with that
//   day's total active-energy, refreshing it in place as the day's Health
//   data grows — completely independent of whatever manual entries also
//   exist that day (both are legitimate, separate line items; Day's log
//   just sums everything, same as any two manual entries would). A
//   healthkit entry is never editable inline (the number isn't yours to
//   correct) — the only interaction is Ignore, which removes it for that
//   day and records the date so future syncs leave it alone for good.
// - Nothing is written TO Health — leve is read-only against HealthKit today.
//
// PLATFORM SAFETY
// Health.isAvailable() reports platform:'web' with available:false in the
// browser/preview build, so every call here is safe to make unconditionally
// — dev server and VITE_PREVIEW builds just see an always-disconnected card.
//
// THE ONE MANUAL STEP
// HealthKit needs its capability + entitlement registered through Xcode's
// Signing & Capabilities UI (Apple provisions this against your App ID) —
// see HEALTHKIT.md. Everything else here is plain TypeScript.

import { Health } from '@capgo/capacitor-health';
import type { Repositories } from './repositories';
import { newId, todayISO } from './ids';

export interface HealthKitStatus {
  /** False on web/Android/simulator, or if the device has no Health app. */
  available: boolean;
  /** True once the user has opted in via connect() and not disconnected. */
  connected: boolean;
  /** ISO timestamp of the last successful sync, if any. */
  lastSyncAt: string | null;
}

export interface HealthKitSyncResult {
  weightAdded: number;
  activityDaysSynced: number;
  status: HealthKitStatus;
}

export interface HealthKitService {
  getStatus(): Promise<HealthKitStatus>;
  /** Requests HealthKit read authorization, then runs an initial sync. */
  connect(): Promise<HealthKitStatus>;
  /** Stops leve from syncing further. Does NOT revoke the OS-level grant —
   *  HealthKit deliberately gives apps no API for that; the user would go to
   *  Settings > Privacy & Security > Health > leve to fully revoke. */
  disconnect(): Promise<HealthKitStatus>;
  sync(): Promise<HealthKitSyncResult>;
  /** Removes the healthkit-tagged Activity entry for `date` (if any) and
   *  permanently excludes that date from future activity syncs — a one-way
   *  action, same finality as deleting a manual entry. Manual entries on
   *  that date, if any, are untouched. */
  ignoreActivityDay(date: string): Promise<void>;
}

// ── Local "opted in" + lastSyncAt bookkeeping ──────────────────────────────
// HealthKit itself is the source of truth for the actual OS-level grant;
// this just remembers whether the user has turned the leve-side sync on.
const LS_KEY = 'nutri.healthkit.state';
interface LocalState {
  connected: boolean;
  lastSyncAt: string | null;
  /** Dates (YYYY-MM-DD) permanently excluded from activity sync via Ignore. */
  ignoredActivityDates: string[];
  /** Date (YYYY-MM-DD) connect() was last called. Sync never reaches earlier
   *  than this — see "no historical backfill" note above syncWeight/syncActivity. */
  connectedAt: string | null;
}

function readState(): LocalState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocalState>;
      return {
        connected: parsed.connected ?? false,
        lastSyncAt: parsed.lastSyncAt ?? null,
        ignoredActivityDates: parsed.ignoredActivityDates ?? [],
        connectedAt: parsed.connectedAt ?? null,
      };
    }
  } catch { /* ignore */ }
  return { connected: false, lastSyncAt: null, ignoredActivityDates: [], connectedAt: null };
}
function writeState(s: LocalState): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

const SYNC_WINDOW_DAYS_WEIGHT = 30;
const SYNC_WINDOW_DAYS_ACTIVITY = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

// No historical backfill: sync never reaches further back than the moment
// the user actually connected, even if that's more recent than the normal
// rolling window. Without this, connecting Health after already having used
// leve manually for a while would backfill weeks of Health data behind your
// back, colliding with days you'd already logged by hand yourself (weight
// is protected either way by the skip-if-any-entry rule, but Activity is
// additive, so an un-clamped backfill would double-count real activity you
// already logged manually before ever connecting Health).
function effectiveSyncStart(windowDays: number, connectedAt: string | null): string {
  const windowStart = Date.now() - windowDays * DAY_MS;
  const connectedAtStart = connectedAt ? new Date(connectedAt + 'T00:00:00').getTime() : 0;
  return new Date(Math.max(windowStart, connectedAtStart)).toISOString();
}

function createHealthKitService(repos: Repositories): HealthKitService {
  async function buildStatus(): Promise<HealthKitStatus> {
    const local = readState();
    let available = false;
    try {
      available = (await Health.isAvailable()).available;
    } catch { /* plugin not present on this platform build — stay false */ }
    return { available, connected: available && local.connected, lastSyncAt: local.lastSyncAt };
  }

  async function syncWeight(): Promise<number> {
    const startDate = effectiveSyncStart(SYNC_WINDOW_DAYS_WEIGHT, readState().connectedAt);
    const { samples } = await Health.readSamples({
      dataType: 'weight', startDate, endDate: new Date().toISOString(),
      limit: 200, ascending: true,
    });
    const existing = await repos.weights.all();
    const taken = new Set(existing.map((w) => w.date));

    let added = 0;
    for (const sample of samples) {
      const date = todayISO(new Date(sample.startDate));
      if (taken.has(date)) continue; // never overwrite manual or prior sync
      await repos.weights.upsertForDate({ id: newId(), date, weightKg: sample.value, source: 'healthkit' });
      taken.add(date);
      added++;
    }
    return added;
  }

  async function syncActivity(): Promise<number> {
    const startDate = effectiveSyncStart(SYNC_WINDOW_DAYS_ACTIVITY, readState().connectedAt);
    const { samples } = await Health.readSamples({
      dataType: 'calories', startDate, endDate: new Date().toISOString(),
      limit: 1000, ascending: true,
    });

    const byDate = new Map<string, number>();
    for (const sample of samples) {
      const date = todayISO(new Date(sample.startDate));
      byDate.set(date, (byDate.get(date) ?? 0) + sample.value);
    }

    const ignored = new Set(readState().ignoredActivityDates);

    let daysSynced = 0;
    for (const [date, totalCalories] of byDate) {
      if (ignored.has(date)) continue; // user explicitly dismissed this day

      // Additive: a manual entry on this date is a separate, independent
      // line item and is never touched here — only the healthkit-tagged
      // entry (at most one) is written or refreshed.
      const dayEntries = await repos.activities.byDate(date);
      const [existingSync, ...extraSyncs] = dayEntries.filter((e) => e.source === 'healthkit');
      for (const extra of extraSyncs) await repos.activities.remove(extra.id); // dedupe stray syncs

      // Only counts genuine writes, so the "synced N days" note stays
      // honest instead of counting every in-window day on every sync.
      const rounded = Math.round(totalCalories);
      if (existingSync) {
        if (existingSync.activeCalories !== rounded) {
          await repos.activities.update({ ...existingSync, activeCalories: rounded });
          daysSynced++;
        }
      } else {
        await repos.activities.add({
          id: newId(), date, name: 'Apple Health', activeCalories: rounded,
          createdAt: new Date().toISOString(), source: 'healthkit',
        });
        daysSynced++;
      }
    }
    return daysSynced;
  }

  return {
    getStatus: buildStatus,

    async connect() {
      const status = await buildStatus();
      if (!status.available) return status;
      await Health.requestAuthorization({ read: ['weight', 'calories'] });
      // HealthKit deliberately never confirms read grants (privacy-preserving
      // by design) — proceed optimistically; a denied read just syncs 0 rows.
      // connectedAt resets to today on every connect (including a reconnect
      // after disconnecting) — sync only ever looks forward from here.
      writeState({ ...readState(), connected: true, connectedAt: todayISO() });
      return buildStatus();
    },

    async disconnect() {
      // Only turns leve-side syncing off — Ignore history is kept, so
      // reconnecting later doesn't resurrect days you already dismissed.
      writeState({ ...readState(), connected: false });
      return buildStatus();
    },

    async sync() {
      const status = await buildStatus();
      if (!status.available || !status.connected) {
        return { weightAdded: 0, activityDaysSynced: 0, status };
      }
      // Self-heal: a connection made before connectedAt existed (or any
      // corrupted/cleared state) gets today as its floor rather than quietly
      // falling back to an unclamped backfill.
      if (!readState().connectedAt) {
        writeState({ ...readState(), connectedAt: todayISO() });
      }
      const [weightAdded, activityDaysSynced] = await Promise.all([syncWeight(), syncActivity()]);
      writeState({ ...readState(), connected: true, lastSyncAt: new Date().toISOString() });
      return { weightAdded, activityDaysSynced, status: await buildStatus() };
    },

    async ignoreActivityDay(date: string) {
      const dayEntries = await repos.activities.byDate(date);
      for (const entry of dayEntries.filter((e) => e.source === 'healthkit')) {
        await repos.activities.remove(entry.id);
      }
      const state = readState();
      if (!state.ignoredActivityDates.includes(date)) {
        writeState({ ...state, ignoredActivityDates: [...state.ignoredActivityDates, date] });
      }
    },
  };
}

// The single swap point, matching withings.ts's shape. There's no mock to
// swap out here — this already talks to the real plugin.
export function getHealthKitService(repos: Repositories): HealthKitService {
  return createHealthKitService(repos);
}
