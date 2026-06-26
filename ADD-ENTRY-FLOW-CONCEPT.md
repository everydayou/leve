================================================================
ADD-ENTRY FLOW (FOOD · ACTIVITY · WEIGHT) — CONCEPT SPEC (pre-implementation)
================================================================
Status: conceptual, fresh brainstorm — not yet built, not yet wireframed.
Companion to nutrition-goal-app-PROJECT-CONTEXT.txt (current shipped app)
and CHANGELOG.txt (history of the shipped app). Also touches the same
surfaces as FIRST-OPEN-FLOW-CONCEPT.md (Today screen's quick-add row,
Activity teaching moment) — the two specs have NOT been reconciled with
each other. Flag any conflict found during build rather than silently
picking one over the other (see §8, last item).
This file does not describe what's running today — it describes what
we've designed to replace/extend it, plus what's still genuinely open.
Goal of this doc: enough shared understanding to build a first-draft
wireframe to experience and react to — not a final spec. Expect tweaks.

----------------------------------------------------------------
0. WHY THIS EXISTS
----------------------------------------------------------------
Three things converged at once, each with knock-on effects on the others:
  - Activity and Weight are gaining automated sources (HealthKit; Weight
    already has a Withings mock — see WITHINGS.md). Manual entry doesn't
    disappear, but its role changes once data starts showing up on its
    own.
  - Food has grown from 3 input methods (Pantry / Manual / Photo scan)
    to a target of 5–6 (+ nutrition-label scan, + describe-in-text AI,
    + a "frequent" quick-log). The current 2-option segmented control
    (Pantry / New food) doesn't scale to that.
  - The FAB speed-dial (FloatingTabBar.tsx) positions its 4 action
    buttons directly above the tab bar's own icons by construction — a
    known, deliberate tradeoff at the time, now straining further as
    more entry methods are added. Decision: retire the speed-dial
    entirely rather than patch it.
All three threads pull toward the same fix: one full-height Add-entry
sheet, opened directly from the FAB, with a clearer internal structure
than today's.

----------------------------------------------------------------
1. TOP-LEVEL STRUCTURE
----------------------------------------------------------------
Tapping the FAB ("+") opens the Add-entry sheet immediately, full
height. No speed-dial, no intermediate menu, no emanate-from-FAB
animation — that entire mechanic is retired (confirmed deliberate, not
a bug to patch — see CLAUDE.md/FloatingTabBar.tsx choreography notes).

Inside the sheet, top of screen: a segmented control, icon + label,
matching the bottom tab bar's existing visual language:
  [ food icon  Food ]   [ activity icon  Activity ]   [ weight icon  Weight ]
Food is the default/first segment — confirmed as the most-used by far.

Decided: NOT a second segmented control for Food's own entry methods
(reads as two stacked segmented controls). Pattern still TBD — parked,
see §8.

Existing deep-link shortcuts (gauge-card taps on Today, currently
`ctx.openAddEntry(type, { hideTabs: true })`) still jump straight to a
segment — but "hideTabs" as a concept needs revisiting once Food has
its own sub-chooser: jumping straight to "Food" no longer means jumping
straight to *a* form, since there's no longer one single Food form.
Parked, see §8.

----------------------------------------------------------------
2. ACTIVITY
----------------------------------------------------------------
Two states, never in conflict because automated and manual don't
compete for the same number — they ADD together:
  - Connected: pull all activity from Health automatically. Manual
    entry stays available, explicitly as an ADDITION on top — not an
    alternative, not a duplicate. (This sidesteps double-counting
    entirely: there's no dedup logic needed, because manual entries are
    never meant to represent the same activity Health already reported
    — they're for the extra stuff it didn't capture.)
  - Disconnected: behaves exactly as today (Manual / Estimate modes,
    `ActivityForm` in AddEntrySheet.tsx) — nothing changes for
    not-connected users.

Schema note: `ActivityEntry` currently has no `source` field (unlike
`WeightEntry`, which already has `source: 'manual'|'withings'|
'healthkit'` — confirmed in types.ts). Health-connected activity needs
this field added, mirroring Weight's existing pattern.

Open, feasibility-gated, not blocking: whether Health gives (and we
show) one daily total row, or one row per synced workout — use whatever
HealthKit exposes cleanly; no strong design preference either way.

----------------------------------------------------------------
3. WEIGHT
----------------------------------------------------------------
Same two-state shape as Activity (Connected / Disconnected), but the
resolution rule is different, and was explicitly decided:
  - Manual REPLACES, does not add. (Weights don't sum — there's only
    ever one "current weight.")

This already matches existing code, not just intent: `weights.
upsertForDate()` already replaces same-day entries, and the Withings
mock already protects manual entries from being silently overwritten by
sync (confirmed in WITHINGS.md: "the mock never overwrites a day you
logged by hand"). Extending this to a real HealthKit weight source
needs no new conflict-resolution mechanism — the precedent already
exists; it just needs a second source wired into the same pattern.

Context: Withings itself stays parked — its OAuth flow needs a small
backend proxy that doesn't exist yet (see WITHINGS.md). If HealthKit
can supply weight without that backend dependency (a native, on-device
Capacitor plugin — no OAuth secret involved), that's the nearer-term
path. Withings doesn't need to be unblocked for this to ship.

Explicitly deferred to a later session — not yet discussed:
  - What the Weight segment's Connected/Disconnected containers actually
    look like (the "without being pushy" disconnected-state invite, in
    particular — copy and visual treatment both open).
  - Whether the segment's shape changes over time as more weigh-ins
    accumulate from sync (e.g. should it ever surface a mini-trend, or
    stay a single current-value display).

----------------------------------------------------------------
4. FOOD — TWO FAMILIES OF INPUT
----------------------------------------------------------------
The growing list of food-input methods clusters into two families, not
five-to-six unrelated options:

KNOWN-EXACT — numbers are already trusted, no review step needed:
  - Pantry pick (existing: `PantryPick` in AddEntrySheet.tsx)
  - Manual typed entry (existing: `NewFood` in AddEntrySheet.tsx)
  - Frequent/quick-log (existing: one-tap chips on Today — really just
    a fast path into Pantry pick, see §7)

AI-ESTIMATED — numbers are a guess; all should reach the same review
step before logging:
  - Photo scan of a meal/plate (existing: `ScanResults` review screen)
  - Nutrition-label photo (NEW — does NOT use the same review screen,
    see note below)
  - Describe in free text (NEW — uses the same review screen as photo
    scan)

Important distinction surfaced during discussion: a meal photo and a
label photo produce different SHAPES of result, despite both starting
with a camera — don't treat them as the same mechanism:
  - Meal photo / describe-in-text: estimating "how much is roughly on
    this plate" — inherently approximate, belongs in the AI-estimate
    review flow (§5).
  - Label photo: OCR/AI reads exact per-100g or per-serving values off a
    real label — the same SHAPE of data as a `FoodItem`. This should
    feed the Pantry-creation fields (same as NewFood/Manual entry), not
    the estimate-review flow. "How many grams did I actually eat" is
    then handled by the existing, exact `nutritionFor(item, qty)`
    mechanism — the same one Pantry-pick already uses — not by
    proportional rescaling from an AI guess.

Open, parked for later: describe-in-text may sometimes describe several
items in one sentence ("rice, chicken and salad") — does that parse
into multiple items in the same review screen, same as a multi-item
photo scan? Likely yes, not yet confirmed.

----------------------------------------------------------------
5. THE UNIFIED EDITOR — RESOLVING "ITEM vs MEAL"
----------------------------------------------------------------
This is the core structural change this spec proposes, and it's
grounded directly in what's already shipped, not invented from scratch.

Confirmed in code: "item vs. meal" already exists as a data concept —
`FoodEntry.mealData` is present when 2+ items were logged together,
absent for a single item (types.ts). It is NOT a deliberate user choice
today — it's purely a side-effect of how many items happened to be
selected at log time.

Confirmed in code: a real unified review/edit surface already exists
and is already reused — `MealEditSheet` (TodayScreen.tsx) wraps
`ScanResults` (AddEntrySheet.tsx) as its entire body, plus an "add from
pantry" extra section. This is the target pattern, already proven, for
meal entries specifically.

The gap: single-item entries do NOT get this. They fall through to two
separate, thinner forms instead:
  - `PantryFoodQty` — a bare quantity stepper, no way to add a second
    item (so a single Pantry-pick can never become a meal after the
    fact without deleting and re-adding).
  - `ManualFoodFields` — 5 plain number fields, same limitation.
  - Sharpest version of the gap: a single-item PHOTO SCAN currently logs
    with no `mealData` at all, so editing it later drops into
    `ManualFoodFields` — losing the scan's own proportional-rescale-by-
    grams behavior that existed seconds earlier during the original
    review. Same data, weaker editor, purely because the count was 1.

Proposal: collapse `PantryFoodQty` + `ManualFoodFields` into the same
list-based editor `ScanResults` already provides, used everywhere — pre
-log AND post-log, for both single items and multi-item meals. A single
Pantry-pick or manual entry becomes "a list of 1," using the identical
component a 2-item meal uses — "add another item" is just always
available, and that's how a single item organically becomes a meal,
with no separate toggle or declared intent needed anywhere.

This directly resolves two things raised in discussion:
  - "Known-exact entries should be editable on tap" — yes, tapping ANY
    logged food entry opens the same list editor, regardless of how
    many items or which method created it.
  - "Save to pantry" for AI-sourced items (scanned/described food) —
    folds into this same editor's existing checkbox (already present in
    `NewFood`) instead of needing a bespoke implementation per method.

Not yet specified (build-time detail, not a UX decision):
  - Does "save to pantry" apply per-item within a multi-item entry, or
    only meaningfully when there's exactly one item?
  - Does a 1-item entry still show/need the "name this meal" field, or
    only once a second item is added?
  - `EditFoodSheet` as a wrapper likely retires once `PantryFoodQty`/
    `ManualFoodFields` are absorbed — confirm during build, don't assume
    it disappears cleanly without checking callers.

----------------------------------------------------------------
6. PANTRY-ITEM PICKER — ONE SHARED COMPONENT, NOT TWO
----------------------------------------------------------------
Confirmed in code: the "pick a pantry item" control is duplicated today,
independently, in two places — `PantryPick`'s item picker and
`MealEditSheet`'s `extraSection` ("Add from pantry") — both a plain
HTML `<select>`.

Friction raised directly: a native `<select>` is fine at the pantry's
current size, but doesn't scale past ~20–30 items and doesn't allow
search. Proposal: one shared, searchable inline-list component (reuse
the same search-pill pattern the Pantry screen itself already uses),
used by both call sites instead of fixed twice independently.

----------------------------------------------------------------
7. FREQUENT-FOOD CHIPS — TO BE RELOCATED
----------------------------------------------------------------
Currently: a row of one-tap quick-log chips inside Today's "Day's log"
card (TodayScreen.tsx, `frequentFoods` / `QuickLogCard`), driven by
`repos.foodEntries.frequentItemIds()`.

Decided: remove from the Day's log view. Reasons given directly: label
font too small, no images for recognition, clutters the log list
visually.

Open, not designed: where this lives instead. Floated but not
committed: "maybe worth considering something inside the new ADD
sheet" — e.g. surfaced inside Food's known-exact methods, near Pantry
pick, rather than living on Today at all. Needs its own pass once
Food's method-chooser pattern (§8) is settled, since it's effectively a
fast path INTO Pantry-pick, not a separate method.

----------------------------------------------------------------
8. OPEN ITEMS — NOT YET DECIDED, PARKED FOR LATER
----------------------------------------------------------------
- Food's own entry-method chooser UI. Ruled out: a second segmented
  control (one already exists at the top level). Not yet researched/
  decided: cards, list rows, icon grid, or something else. This was the
  original "next" topic — still open, and blocks the actual wireframe
  layout for the Food segment specifically (Activity/Weight segments
  can likely be wireframed without this being resolved first).
- Food categorization/tags on `FoodItem`. Re-opened (not abandoned) —
  parked specifically until the Pantry conversation. Current leaning,
  not yet decided: split between "what's provided" (a curated, optional
  base) and "what's added" (free user tagging, also optional) — neither
  mandatory at food-creation time. Three underlying strategies discussed
  and still on the table: hand-curated fixed taxonomy, AI-assisted
  auto-tagging, free-form user tags.
- "Favorites" vs. "frequent" as two distinct mechanisms. `frequent`
  already exists (`frequentItemIds`, usage-derived); "favorite" (user-
  marked) does not. Not designed, tied to the Pantry pass.
- Generic starter pantry for new users. Note: the existing
  `pantrySeed.ts` is Marco's own personal spreadsheet, transcribed — NOT
  a generic starter set. A "nice empty-state pantry for any new user"
  is a different artifact entirely (curated, generic, and presumably
  categorized once the categorization item above is resolved) — don't
  conflate the two when building.
- Pantry "variations/sizes" (e.g. raw vs. cooked chicken) — resolved
  conceptually: no new mechanism needed, just separate `FoodItem` rows,
  already supported today. Mentioned here only so it isn't
  re-litigated as if unresolved.
- Weight segment's Connected/Disconnected visual/copy treatment —
  explicitly deferred, see §3.
- Activity Health-sync granularity (daily total vs. per-workout) —
  feasibility-gated, see §2.
- Multi-item parsing from a single free-text description — likely yes,
  not confirmed, see §4.
- "Save to pantry" placement (per-item vs. per-entry) and whether a
  1-item entry still prompts for a meal name — build-time detail, see
  §5.
- This spec hasn't been reconciled against FIRST-OPEN-FLOW-CONCEPT.md,
  which also touches the Today screen's quick-add row and the first-tap
  teaching moment for Activity (its §9). Flag any conflict found during
  build rather than silently picking one spec over the other.

----------------------------------------------------------------
9. SOURCE COMPONENTS / FILES REFERENCED IN THIS SPEC
----------------------------------------------------------------
For whoever picks this up to wireframe — everything cited above is real,
current code, not hypothetical:
  src/ui/components/AddEntrySheet.tsx
    AddEntrySheet, FoodForm, ScanResults, PantryPick, NewFood,
    ActivityForm, WeightForm
  src/ui/screens/TodayScreen.tsx
    EditFoodSheet, PantryFoodQty, ManualFoodFields, MealEditSheet,
    EditActivitySheet, frequentFoods/QuickLogCard, gauge-card shortcuts
    (`ctx.openAddEntry`)
  src/ui/kit/FloatingTabBar.tsx — current FAB speed-dial, to retire
  src/ui/screens/PantryScreen.tsx — FoodItemForm, findByName guard
  src/domain/types.ts — FoodEntry.mealData, WeightEntry.source (no
    ActivityEntry.source yet)
  src/domain/calc.ts — nutritionFor(), effectiveNutrition()
  src/data/pantrySeed.ts — Marco's personal seed, not a generic starter
  src/data/repositories.ts — frequentItemIds()
  WITHINGS.md — existing Connected/Disconnected + sync precedent
