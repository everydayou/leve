# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Execution style (default)

- Commit to the first viable technical approach; don't re-evaluate mid-task
- For files with multiple scattered changes, prefer one `Write` over many sequential `Edit` calls
- Read files with `offset`/`limit` — never pull a whole file unless every section is needed
- Skip `TaskCreate` for well-scoped tasks (< ~5 clear steps)
- No preamble before tool calls — act, then give one concise summary at the end

## Safe word: "careful mode"

If Marco says **"careful mode"**, switch to a slower, more thorough approach:
- Read full files before editing
- Plan the approach explicitly before writing any code
- Use `TaskCreate` to track every step
- Prefer many small targeted `Edit` calls over full-file rewrites
- Double-check each change before moving to the next
- Run typecheck and tests after every meaningful change

## Commands

```bash
npm run dev          # Vite dev server (browser)
npm run build        # tsc -b && vite build (always run before ios:sync)
npm run typecheck    # type-check only, no emit
npm run test         # vitest run (single pass)
npm run test:watch   # vitest watch
npm run lint         # eslint
npm run ios          # build + cap sync + open Xcode
npm run ios:sync     # build + cap sync (no Xcode)
```

Run a single test file:
```bash
npx vitest run src/domain/calc.test.ts
```

Always run `npm run typecheck` (or check tsc output is clean) after any TypeScript change.

## Architecture

### Layer model (strict dependency direction)

```
domain/       Pure TypeScript — no React, no Dexie, no DOM
data/         Storage: Dexie (IndexedDB) + memory stub for tests/preview
state/        React hooks that bridge data ↔ UI
ui/           React components (kit → components → screens)
```

Nothing in `domain/` imports from any other layer. `data/` imports only from `domain/`. `state/` imports from both. `ui/` imports from all.

### Domain layer (`src/domain/`)

- **`types.ts`** — all entity types (`User`, `Goal`, `FoodItem`, `FoodEntry`, `ActivityEntry`, `WeightEntry`). No framework deps.
- **`calc.ts`** — `summarizeDay()` / `effectiveNutrition()` / `calcDigestionCalories()`. Pantry-backed `FoodEntry` values are computed **live from the current `FoodItem`** (editing a pantry item instantly updates all logged days); manual entries keep their stored snapshot as fallback.
- **`bmr.ts`** — `bmrForDate()` uses Mifflin–St Jeor with the closest prior weight entry for that date, so each historical day's burn reflects the weight at that point in time. Falls back to `user.bmr` when profile is incomplete.
- **`goal.ts`** — `goalIntensity()`, `weekVerdict()`, `requiredDailyDeficit()`. The 7700 kcal/kg Atwater constant is the single source of truth.

### Data layer (`src/data/`)

- **`repositories.ts`** — storage-agnostic interfaces (`UserRepo`, `GoalRepo`, etc.). All UI/domain code depends **only** on these interfaces.
- **`dexieRepositories.ts`** — live implementation (IndexedDB via Dexie).
- **`memoryRepositories.ts`** — in-memory implementation used for tests and the `VITE_PREVIEW=true` build. Swapping storage never touches UI code.
- **`db.ts`** — `NgtDatabase` (Dexie schema). Supports two profiles: `real` (production DB) and `test` (isolated DB), controlled via `localStorage.getItem('ngt-active-profile')`.
- **`ids.ts`** — date utilities (`todayISO`, `addDays`) and `newId`. All dates in the app are `YYYY-MM-DD` strings in local time — **never UTC**.

### State layer (`src/state/`)

- **`repos.ts`** — exports `repos` (either dexie or memory based on `VITE_PREVIEW` build flag) and `PREVIEW` boolean.
- **`live.ts`** — exports `useLive<T>(fn, deps)`, the single reactive query hook. In normal builds it wraps `useLiveQuery` from dexie-react-hooks; in preview builds it subscribes to `memoryBus`. Use this everywhere instead of direct Dexie calls.
- **`useDay.ts`** — `useDay(date)` loads everything needed for one day (foods, activities, BMR, pantry lookup map) in a single reactive query. This is the primary hook for `TodayScreen`.

### UI layer

**`src/ui/AppShell.tsx`** — the tabbed layout wrapper. Owns `viewedDate` state (shared down via React Router `Outlet` context as `DayContext`), `mainRef` for scroll-to-top, the `AddEntrySheet`, and `Toaster`. Screens access date and `openAddEntry` via `useOutletContext<DayContext>()`.

**`src/App.tsx`** — router. Two layout zones: full-screen (`/onboarding`, `/goal-setup`, `/styleguide`) and tabbed (`/today`, `/goal`, `/pantry`, `/account` nested under `AppShell`).

**`src/ui/kit/`** — design system atoms. All components consume semantic tokens (never raw hex or neutral primitives). Notable:
- `FloatingTabBar.tsx` — glass pill nav. Active tab: icon `text-accent`, label `text-content`. Inactive: both `text-content-muted`.
- `Badge.tsx` — status badges. `success` status: `bg-success-soft text-content` (mint bg, black text for accessibility).
- `Sheet.tsx` — bottom sheet with upward rubber-band drag and spring-back.
- `Icon.tsx` — inline SVG icon set. Uses `currentColor` so colour is set by parent `text-*` class. Two rendering modes: standard 24×24 stroke paths and Material Design fill paths (see `MATERIAL_ICONS` set).

**`src/ui/screens/TodayScreen.tsx`** — most complex screen. Contains:
- `WeekStrip` — 3-panel carousel (prev/current/next week). The track is `width: 300%` with `translateX(-33.333%)` as center. `useLayoutEffect` keyed on `monday` resets position before paint. Navigation clamps: going back → `goalStartDate`; going forward → `today`.
- `ProteinBar` — shown when `user.proteinGoalG` is set.
- Day buttons in WeekStrip use `w-9 appearance-none bg-transparent` (no `transition`) to prevent WKWebView tap-ring artifacts.

### Styling (`src/index.css`)

Single CSS file; Tailwind v4 (`@import 'tailwindcss'`). Design tokens live in `@theme {}` — two layers:
1. **Primitives** — raw neutrals + brand mint hex values.
2. **Semantics** — surface/content/border/accent tokens that reference primitives via `var()`.

The `.dark` class remaps only the neutral primitives; the whole semantic layer flips automatically. Always use semantic tokens (`bg-surface`, `text-content`, `border-border-field`) — never neutral primitives directly.

Key utility classes defined in CSS (not Tailwind utilities): `.glass`, `.glass-strong`, `.ios-interactive`, `.segmented-active`.

Global button reset: `* { -webkit-tap-highlight-color: transparent }` + `button { -webkit-appearance: none; appearance: none; outline: none }` — suppresses WKWebView native tap highlighting.

### Capacitor / iOS

The app runs as a WKWebView via Capacitor. `hapticLight()` in `src/lib/haptics.ts` fires `@capacitor/haptics` on native and is a no-op on web. All interactive elements should call `hapticLight()` on tap.

Build + sync workflow: `npm run ios` (builds, syncs Capacitor, opens Xcode). After any JS/CSS change run `npm run ios:sync` before testing on device.

The `VITE_PREVIEW=true` build produces a self-contained single-file HTML (via `vite-plugin-singlefile`) backed by `memoryRepositories` — runnable from `file://` with no server.

### Testing

Tests live alongside source as `*.test.ts`. Domain logic is tested directly (no React needed). `app.preview.test.tsx` uses `@testing-library/react` against the full component tree with `memoryRepositories`. The test DB profile is isolated from the real IndexedDB.
