// ── Withings integration (SCAFFOLD) ────────────────────────────────────────
//
// WHAT THIS IS
// A framework-agnostic seam for syncing weight from Withings, plus a MOCK
// implementation so the whole "Connect Withings → Sync" experience is usable
// today without any credentials or backend. Synced weigh-ins are written
// through the SAME repository seam as manual entries, tagged `source:
// 'withings'`, so the trend chart / current-weight logic pick them up with no
// other changes (WeightEntry.source already has the 'withings' value).
//
// WHY A MOCK (and not the real API yet)
// Withings uses OAuth, which requires a `client_secret` that must NOT live in
// the shipped app (it can be extracted). The real flow therefore needs a tiny
// backend/proxy to hold the secret and exchange tokens. That backend doesn't
// exist yet — see WITHINGS.md for the go-live steps.
//
// HOW TO GO LIVE (the only swap point)
// Implement `WithingsService` against the real API in a new file
// (e.g. realWithingsService.ts) — `connect()` opens the OAuth consent screen
// and stores the returned tokens via your backend; `sync()` calls
// `GET /measure?action=getmeas` (through the proxy) and maps results to
// WeightEntry. Then export that instead of the mock from `getWithingsService`
// below. Nothing in the UI or domain needs to change.

import type { Repositories } from './repositories';
import { newId, todayISO, addDays } from './ids';
import { currentWeightKg } from '../domain/goal';

export interface WithingsStatus {
  connected: boolean;
  /** ISO timestamp of the last successful sync, if any. */
  lastSyncAt: string | null;
  /** Account label to show in the UI (email/nickname). Mock uses a placeholder. */
  account: string | null;
}

export interface WithingsSyncResult {
  added: number;
  status: WithingsStatus;
}

export interface WithingsService {
  getStatus(): Promise<WithingsStatus>;
  /** Begin the OAuth handshake. Mock: simulates consent + token storage. */
  connect(): Promise<WithingsStatus>;
  disconnect(): Promise<WithingsStatus>;
  /** Pull recent weigh-ins into the app's weight history. */
  sync(): Promise<WithingsSyncResult>;
}

// ── Small persistence shim ──────────────────────────────────────────────────
// The mock keeps its connection state in localStorage. The REAL service would
// store OAuth tokens in secure storage (Capacitor Preferences / Keychain), not
// here — that's deliberately abstracted so swapping it out is local.
const LS_KEY = 'nutri.withings.state';
interface MockState { connected: boolean; account: string | null; lastSyncAt: string | null; }

function readState(): MockState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as MockState;
  } catch { /* ignore */ }
  return { connected: false, account: null, lastSyncAt: null };
}
function writeState(s: MockState): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
const toStatus = (s: MockState): WithingsStatus => ({
  connected: s.connected, account: s.account, lastSyncAt: s.lastSyncAt,
});
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Deterministic 0..1 from a date string, so re-syncing is stable (no jitter).
function seeded(date: string): number {
  let h = 2166136261;
  for (let i = 0; i < date.length; i++) { h ^= date.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Mock Withings: simulates a connected scale that backfills a gentle weight
 *  trend. Non-destructive — it never overwrites a date you already logged. */
function createMockWithingsService(repos: Repositories): WithingsService {
  return {
    async getStatus() {
      return toStatus(readState());
    },
    async connect() {
      await delay(700); // simulate the OAuth round-trip
      const s: MockState = { connected: true, account: 'Withings (demo)', lastSyncAt: null };
      writeState(s);
      return toStatus(s);
    },
    async disconnect() {
      await delay(150);
      const s: MockState = { connected: false, account: null, lastSyncAt: null };
      writeState(s);
      return toStatus(s);
    },
    async sync() {
      const state = readState();
      if (!state.connected) return { added: 0, status: toStatus(state) };
      await delay(600);

      const existing = await repos.weights.all();
      const taken = new Set(existing.map((w) => w.date));
      const anchor = currentWeightKg(existing) ?? 80; // start near known weight

      // Backfill the last 14 days that have no entry yet, with a gentle
      // downward drift + tiny deterministic noise. Demo data only.
      let added = 0;
      for (let i = 13; i >= 0; i--) {
        const date = addDays(todayISO(), -i);
        if (taken.has(date)) continue;
        const drift = -0.05 * (13 - i);              // ~0.65 kg over two weeks
        const noise = (seeded(date) - 0.5) * 0.3;
        const weightKg = round1(anchor + 0.6 + drift + noise);
        await repos.weights.upsertForDate({ id: newId(), date, weightKg, source: 'withings' });
        added++;
      }

      const next: MockState = { ...state, lastSyncAt: new Date().toISOString() };
      writeState(next);
      return { added, status: toStatus(next) };
    },
  };
}

// The single swap point. Today: mock. To go live, return the real service
// here (see WITHINGS.md) — callers never change.
export function getWithingsService(repos: Repositories): WithingsService {
  return createMockWithingsService(repos);
}
