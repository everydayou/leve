// ── Shared-beta mode (temporary, opt-in) ─────────────────────────────────────
// A single build-time switch for the rare case of handing this app to
// external testers who shouldn't need their own Anthropic API key. OFF by
// default so Marco's normal day-to-day build (npm run ios / ios:sync) is
// always unaffected — this only matters right before archiving a build
// specifically to share with testers. See TESTFLIGHT.md's "Shared beta
// mode" section for the exact steps.
//
// Set in .env.local (gitignored, never committed):
//   VITE_SHARED_BETA=true
//   VITE_SHARED_BETA_ANTHROPIC_KEY=sk-ant-...   (Marco's own temporary key)
//
// When SHARED_BETA is true:
//   - A fresh install with no profile choice yet defaults into the Test
//     account (src/data/db.ts) instead of Real, so testers land in an empty
//     sandbox, never Marco's own data.
//   - AI Food Scan auto-connects using SHARED_BETA_ANTHROPIC_KEY while on
//     the Test profile (src/lib/apiKey.ts) — no key entry needed.
//   - The manual "AI Food Scan" Settings row is hidden (src/ui/screens/
//     AccountScreen.tsx), since there's nothing for a tester to configure.
//
// Turn it back off (or remove both lines) before your next regular
// npm run ios:sync to your own phone.
export const SHARED_BETA = (import.meta.env.VITE_SHARED_BETA as string | undefined) === 'true';

export const SHARED_BETA_ANTHROPIC_KEY =
  (import.meta.env.VITE_SHARED_BETA_ANTHROPIC_KEY as string | undefined) ?? '';
