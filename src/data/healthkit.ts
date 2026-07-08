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
// - Activity/active-energy: written as one ActivityEntry per day, tagged
//   source: 'healthkit'. Skips any day that has a manual entry; a previously
//   synced healthkit entry for that day gets its value refreshed in place
//   (Health's daily total can grow through the day as more workouts/steps
//   land, unlike weight which is a single point-in-time reading).
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
}

// ── Local "opted in" + lastSyncAt bookkeeping ──────────────────────────────
// HealthKit itself is the source of truth for the actual OS-level grant;
// this just remembers whether the user has turned the leve-side sync on.
const LS_KEY = 'nutri.healthkit.state';
interface LocalState { connected: boolean; lastSyncAt: string | null; }

function readState(): LocalState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as LocalState;
  } catch { /* ignore */ }
  return { connected: false, lastSyncAt: null };
}
function writeState(s: LocalState): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

const SYNC_WINDOW_DAYS_WEIGHT = 30;
const SYNC_WINDOW_DAYS_ACTIVITY = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

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
    const startDate = new Date(Date.now() - SYNC_WINDOW_DAYS_WEIGHT * DAY_MS).toISOString();
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
    const startDate = new Date(Date.now() - SYNC_WINDOW_DAYS_ACTIVITY * DAY_MS).toISOString();
    const { samples } = await Health.readSamples({
      dataType: 'calories', startDate, endDate: new Date().toISOString(),
      limit: 1000, ascending: true,
    });

    const byDate = new Map<string, number>();
    for (const sample of samples) {
      const date = todayISO(new Date(sample.startDate));
      byDate.set(date, (byDate.get(date) ?? 0) + sample.value);
    }

    let daysSynced = 0;
    for (const [date, totalCalories] of byDate) {
      const dayEntries = await repos.activities.byDate(date);
      const manualEntries = dayEntries.filter((e) => e.source !== 'healthkit');
      if (manualEntries.length > 0) continue; // respect hand-logged activity

      const rounded = Math.round(totalCalories);
      const [existingSync, ...extras] = dayEntries; // all healthkit-sourced here
      for (const extra of extras) await repos.activities.remove(extra.id); // dedupe stray syncs

      if (existingSync) {
        await repos.activities.update({ ...existingSync, activeCalories: rounded });
      } else {
        await repos.activities.add({
          id: newId(), date, name: 'Apple Health', activeCalories: rounded,
          createdAt: new Date().toISOString(), source: 'healthkit',
        });
      }
      daysSynced++;
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
      writeState({ connected: true, lastSyncAt: readState().lastSyncAt });
      return buildStatus();
    },

    async disconnect() {
      writeState({ connected: false, lastSyncAt: null });
      return buildStatus();
    },

    async sync() {
      const status = await buildStatus();
      if (!status.available || !status.connected) {
        return { weightAdded: 0, activityDaysSynced: 0, status };
      }
      const [weightAdded, activityDaysSynced] = await Promise.all([syncWeight(), syncActivity()]);
      writeState({ connected: true, lastSyncAt: new Date().toISOString() });
      return { weightAdded, activityDaysSynced, status: await buildStatus() };
    },
  };
}

// The single swap point, matching withings.ts's shape. There's no mock to
// swap out here — this already talks to the real plugin.
export function getHealthKitService(repos: Repositories): HealthKitService {
  return createHealthKitService(repos);
}
