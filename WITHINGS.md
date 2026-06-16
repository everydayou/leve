# Withings integration

## Status: SCAFFOLD (mock data)

The app ships with the full **Connect Withings → Sync → Disconnect** experience
wired up in Account → Connections. Today it runs on a **mock**: connecting and
syncing backfill a gentle sample weight trend so you can see and feel the flow.
No credentials, no backend, nothing exposed.

Synced weigh-ins are written through the same data layer as manual entries,
tagged `source: 'withings'`, so the trend chart and "current weight" pick them
up automatically. The mock never overwrites a day you logged by hand.

Everything lives behind one seam: `src/data/withings.ts` (the `WithingsService`
interface + a swap point `getWithingsService`). The UI and the rest of the app
never need to change to go live.

## Why it isn't real yet

Withings uses **OAuth 2.0**. That gives you two values:

- `client_id` — public, safe to ship in the app.
- `client_secret` — a password proving requests come from *your* app. If it
  ships inside the app, anyone can extract it and impersonate you.

Because of the secret, the real flow needs a **tiny backend (proxy)** you
control to (a) exchange the OAuth code for tokens and (b) refresh tokens and
forward measurement requests. That backend doesn't exist yet — that's the only
missing piece.

## Going live — checklist

1. **Register the app** at the Withings developer portal
   (https://developer.withings.com) to get `client_id` + `client_secret`, and
   set a redirect URI.
2. **Stand up a small proxy** (any serverless function works — Vercel,
   Cloudflare Workers, a tiny Node service). It holds the secret and exposes:
   - `POST /withings/token` — exchange the auth `code` for access/refresh tokens.
   - `POST /withings/refresh` — refresh an expired access token.
   - `GET  /withings/measures` — call Withings `measure?action=getmeas`
     (`meastype=1` is weight) and return the rows.
3. **Implement the real service** in e.g. `src/data/realWithingsService.ts`,
   satisfying `WithingsService` from `withings.ts`:
   - `connect()` opens the Withings consent screen (in Capacitor, an in-app
     browser + deep-link redirect back to the app), then stores the returned
     tokens in **secure storage** (Capacitor Preferences / Keychain — *not*
     localStorage).
   - `sync()` calls your proxy's `/measures`, maps each weight reading to a
     `WeightEntry` (`source: 'withings'`), and writes via
     `repos.weights.upsertForDate(...)`.
   - `disconnect()` clears the stored tokens.
4. **Flip the swap point**: in `withings.ts`, have `getWithingsService` return
   the real service instead of the mock. Done — no UI changes.

## OAuth scope

Request the `user.metrics` scope (read body measurements). Weight is
`meastype = 1` in the Withings measure API.

## Notes

- Withings also syncs into Apple Health, so a later HealthKit path (native
  Capacitor plugin) is an alternative source for the same data — the same
  `WeightEntry.source` hook (`'healthkit'`) already exists for it.
- Keep the proxy's allowed origins locked to your app.
