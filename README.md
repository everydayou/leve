# Nutrition Goal Tracker — V1 scaffold

Personal nutrition + weight-management app. **Goal management first** — tracking
exists only to answer "Am I on track to hit my goal?" Replaces the spreadsheet.

Web stack now (installable PWA), **Capacitor-ready** so it can wrap into a native
iOS app later to reach HealthKit/Withings without a rewrite.

## Stack
- **Vite 6 + React 19 + TypeScript**
- **Tailwind CSS v4** (`@tailwindcss/vite`)
- **Dexie (IndexedDB)** behind a storage-agnostic repository interface
- **vite-plugin-pwa** (installable, offline shell)
- **Vitest** for the domain logic

## Run it
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build -> dist/ (PWA)
npm run preview    # serve the build
npm test           # vitest (domain logic)
npm run typecheck  # tsc --noEmit
```
First run seeds demo data (Summer Cut goal, a pantry, today's log) so every
screen has something to show. Data lives in your browser's IndexedDB; clear it
to re-seed.

## Architecture — the important part
The code is layered so deferred features slot in without a rebuild:

```
src/
  domain/      Pure, framework-agnostic. No React, no Dexie, no DOM.
    types.ts     The V1 data model (User, Goal, FoodItem, FoodEntry,
                 ActivityEntry, WeightEntry + derived Day/Week).
    calc.ts      nutritionFor(), summarizeDay() — Total Burn = BMR + active,
                 deficit = burn - consumed.
    goal.ts      goalIntensity() (the "how hard is this?" feedback),
                 weekVerdict(), currentWeightKg() = latest WeightEntry.
    *.test.ts    Unit tests, incl. the wireframe example (4kg/8wk).
  data/        Persistence. The ONLY place that knows about IndexedDB.
    repositories.ts     Interfaces the rest of the app depends on.
    db.ts / dexieRepositories.ts   Dexie implementation.
    seed.ts, exportJson.ts, ids.ts
  state/       repos.ts (single composition point) + reactive hooks.
  ui/          AppShell (tabs + Add sheet) and the 5 screens.
```

### Two confirmed design decisions, enforced in code
1. **Current weight is never stored** — it's always the latest `WeightEntry`
   (`currentWeightKg()` in `domain/goal.ts`).
2. **FoodEntry snapshots its nutrition at log time** — editing a pantry item
   later never rewrites history (`FoodEntry.snapshot`, set in `nutritionFor()`).

### Swapping storage later (Capacitor SQLite / Withings / HealthKit)
Implement the interfaces in `src/data/repositories.ts` with a new backend and
point `src/state/repos.ts` at it. Nothing in `domain/` or `ui/` changes.

## Going native (when you want HealthKit, or the weekly re-sign gets old)
```bash
npm i @capacitor/core && npm i -D @capacitor/cli
npx cap init   # config is pre-stubbed in capacitor.config.ts (webDir: dist)
npm run build && npx cap add ios && npx cap open ios
```
Sign + install on the iPhone via Xcode (free Apple ID = 7-day expiry;
$99/yr Developer Program removes it and unlocks HealthKit).

## V1 scope built here
Today (deficit hero, frequent foods, log, day nav), Goal (trend-vs-target,
weekly verdict), Pantry (CRUD, per-100g / per-serving), Add-entry sheet
(food / activity / weight), Account (profile, manual BMR, JSON export),
Goal setup (choice list → form + live intensity feedback).

Deferred (V1.5+): other goal types, BMR auto-calibration, AI meal estimation,
History tab, Withings/HealthKit. The data model already leaves room for them.
