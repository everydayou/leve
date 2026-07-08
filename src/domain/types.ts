// Framework-agnostic domain types. No React, no Dexie, no DOM.
// Designed so deferred features (other goal types, BMR calibration,
// Withings/HealthKit) attach later without a rebuild.

export type Units = 'kg' | 'lbs';
export type MeasurementType = 'per_100g' | 'per_serving';
export type GoalType = 'lose_by_date' | 'gain_by_date' | 'maintain'; // gain_by_date added r61; maintain added r182
export type GoalStatus = 'active' | 'completed' | 'abandoned';
export type WeightSource = 'manual' | 'withings' | 'healthkit';
export type ActivitySource = 'manual' | 'healthkit';

/** Single user. NOTE: current weight is NOT stored here — it is always
 *  the latest WeightEntry, the one source of truth. */
export type Sex = 'male' | 'female';

export interface User {
  id: string;
  heightCm: number;
  units: Units;
  bmr: number; // manual kcal/day in V1
  // Optional profile fields. Used only to pre-fill the BMR via Mifflin–St
  // Jeor; bmr stays the single number the rest of the app trusts.
  age?: number;
  sex?: Sex;
  /** Daily protein target in grams. When set, Diary shows a progress bar. */
  proteinGoalG?: number;
  /** How often the user weighs in. Defaults to 'daily' when absent. */
  weightCadence?: 'daily' | 'weekly';
  /** Day of week for weekly weigh-in: 0 = Monday … 6 = Sunday.
   *  Only meaningful when weightCadence === 'weekly'. */
  weeklyWeightDay?: number;
}

export type TrackingMode = 'simple' | 'detailed';
export type MacroStyle = 'balanced' | 'performance' | 'lower_carb';

export interface Goal {
  id: string;
  name: string;
  type: GoalType;
  startWeightKg: number;
  targetWeightKg: number;
  startDate: string; // ISO date YYYY-MM-DD
  targetDate: string; // ISO date YYYY-MM-DD
  status: GoalStatus;
  /** Optional manual override for the daily kcal deficit target.
   *  When set, this replaces the auto-computed value from weights + dates. */
  dailyDeficitKcalOverride?: number;
  // ── Tracking preferences (used by all goal types, r65) ───────────────────
  /** Simple = calories + protein only; Detailed = full macro targets. */
  trackingMode?: TrackingMode;
  /** Only present when trackingMode === 'detailed'. */
  macroStyle?: MacroStyle;
  /** Balanced: fat target (g/day). Performance: fat baseline (g/day).
   *  Not used for lower_carb (fat adjusts from remaining calories). */
  fatTargetG?: number;
  /** Lower carb only: max carb intake (g/day). */
  carbLimitG?: number;
  /** Which macros are visible in the Diary gauge card (only when macroStyle is set). Default true. */
  diaryShowProtein?: boolean;
  diaryShowCarbs?: boolean;
  diaryShowFat?: boolean;
  /** Set to true when the user has dismissed the GoalOutcomeView for this goal. */
  outcomeViewed?: boolean;
  /** Whether this goal was created in Simple or Custom setup mode. */
  setupMode?: 'simple' | 'custom';
  // ── Daily kcal band (gain_by_date AND maintain goals, r66 / r182) ─────────
  /** Min daily kcal (relative to burn) for the gauge arc to turn green.
   *  gain_by_date: min surplus. maintain: min offset from maintenance,
   *  may be negative (an allowed small deficit). */
  surplusFloor?: number;
  /** Max daily kcal (relative to burn) before the gauge arc turns dark again.
   *  gain_by_date: max surplus. maintain: max offset from maintenance. */
  surplusCeiling?: number;
  // ── Weight range (maintain goals only, r182) ──────────────────────────────
  /** Lower bound of the acceptable weight band. targetWeightKg is kept as the
   *  midpoint, so existing single-number display code keeps working. */
  weightRangeFloorKg?: number;
  /** Upper bound of the acceptable weight band. */
  weightRangeCeilingKg?: number;
  /** Which preset band (tight/standard/relaxed) was chosen in Guided mode.
   *  Undefined when set up in Detailed/Custom mode with hand-picked bounds. */
  maintainBandId?: 'tight' | 'standard' | 'relaxed';
  /** Optional reminder-only check-in date (maintain goals). Purely a UI
   *  nudge — does NOT end or expire the goal; unlike lose/gain's targetDate,
   *  which is a real deadline, this is informational only. */
  reviewDate?: string;
  /** Date (YYYY-MM-DD) the goal actually transitioned to completed/abandoned.
   *  Set once, at the moment status changes away from 'active'. Distinct from
   *  targetDate, which for maintain goals is a far-future sentinel with no
   *  relation to when the goal really ended. Absent on goals ended before
   *  this field existed. */
  endedDate?: string;
}

export interface FoodItem {
  id: string;
  name: string;
  measurementType: MeasurementType;
  referenceAmount: number; // 100 for per_100g, serving size for per_serving
  // Per reference amount. carbs/fiber/fat stored for insulin awareness,
  // but day/week views surface only calories + protein.
  calories: number;
  protein: number;
  carbs: number;
  fiber: number;
  fat: number;
  photo?: string; // optional data URL (camera/file); thumbnail in lists
  isArchived: boolean;
  /** Round 177: 'app' marks one of the bundled default Pantry items (fixed
   *  macros, not user-editable) vs 'user' for anything someone added
   *  themselves. Optional/undefined on every item created before this
   *  field existed — always treated as 'user' when read, so no migration
   *  is needed; only a future seeding script would ever write 'app'. */
  origin?: 'app' | 'user';
}

/** One Food item's quantity inside a reusable Pantry Meal.
 *  Quantity is in the SAME unit basis as the referenced FoodItem's
 *  referenceAmount (grams for per_100g, servings for per_serving) — same
 *  convention as FoodEntry.quantity. */
export interface MealFoodItem {
  id: string;
  foodItemId: string;
  quantity: number;
}

/** A reusable combination of Food items, saved in the Pantry (round 123+).
 *  Meal = reusable source object, mirrors FoodItem's role for single foods.
 *  Nutrition is never stored here — it's always computed live from the
 *  current Food items via mealNutritionFor(), so editing an ingredient's
 *  macros instantly updates every Meal (and every Meal entry) that uses it. */
export interface Meal {
  id: string;
  name: string;
  photo?: string;
  items: MealFoodItem[];
  isArchived: boolean;
}

export interface NutritionSnapshot {
  calories: number;
  protein: number;
  carbs: number;
  fiber: number;
  fat: number;
}

/** A single item within a scanned meal. Mirrors ScannedFood from lib/foodScan
 *  but lives in domain/types to avoid circular imports. `selected` tracks
 *  whether the user included this item when the meal was logged. */
export interface MealItem {
  name: string;
  description?: string;
  estimatedGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fiber: number;
  fat: number;
  confidence: 'high' | 'medium' | 'low';
  selected: boolean;
  /** Current serving multiplier (default 1). Stored so LogEntrySheet can restore qty on re-open. */
  qty?: number;
  /** Present when this item is linked to a reusable Pantry Food item (round 123+).
   *  Lets a Day's-log Meal entry live-recompute from the current Food item macros,
   *  same as a plain Food entry does via effectiveNutrition(). Absent = local/unlinked item. */
  foodItemId?: string;
  /** Original unit basis this item was captured in (round 138). When present,
   *  calories/protein/carbs/fiber/fat are the RATE at referenceAmount (same
   *  convention as FoodItem/BasketItem) and `qty` is the actual current
   *  amount — grams for per_100g, servings for per_serving — so the item
   *  reconstructs with the right stepper (10g steps vs 0.5-serving steps)
   *  and scales correctly via mealItemNutrition(). Without this (older
   *  entries, pre-round-138), `calories` etc. are the already-scaled TOTAL
   *  and `qty` is a plain multiplier on top of that total — the original
   *  behavior, preserved as a fallback with no migration needed. */
  measurementType?: MeasurementType;
  referenceAmount?: number;
}

/** One logged food line on a day. Stores a SNAPSHOT of computed nutrition
 *  at log time — editing a pantry item later does NOT rewrite past entries.
 *  When a multi-item scan is logged as a meal, `mealData` holds the original
 *  items so the user can re-open and edit the full meal later. */
export interface FoodEntry {
  id: string;
  date: string; // YYYY-MM-DD
  foodItemId?: string;
  /** For pantry-linked entries: in the unit basis of the FoodItem's
   *  referenceAmount. For manual entries (round 136, no foodItemId): in the
   *  unit basis of manualReferenceAmount below — together they let a manual
   *  entry re-open showing "400g" instead of collapsing to "1 serving". */
  quantity?: number;
  manualName?: string;
  /** Manual (non-pantry-linked, non-Meal) entries only (round 136) —
   *  preserves the original per_100g/per_serving unit context. Older
   *  entries predating this field fall back to "1 serving" on reopen, same
   *  as before. */
  manualMeasurementType?: MeasurementType;
  manualReferenceAmount?: number;
  isManual: boolean;
  snapshot: NutritionSnapshot;
  createdAt: string; // ISO timestamp
  /** Present when this entry groups multiple food items (multi-item photo scan,
   *  or a logged/converted Meal). */
  mealData?: { name: string; photo?: string; photos?: string[]; items: MealItem[] };
  /** Present when this Meal entry is linked to a reusable Pantry Meal (round 123+).
   *  Mirrors foodItemId's linked/local distinction, but for Meals: a linked Meal
   *  entry's items can each live-recompute from their current Pantry Food item. */
  mealId?: string;
}

export interface ActivityEntry {
  id: string;
  date: string;
  name?: string;
  activeCalories: number;
  createdAt: string; // ISO timestamp — lets Today sort all entries by time
  /** Absent = manual (pre-existing entries). 'healthkit' entries are written/
   *  refreshed by the Health sync and left alone by the UI's delete/edit
   *  affordances the same way manual entries are — the sync just won't
   *  overwrite a day that already has a manual entry on it. */
  source?: ActivitySource;
  /** Hides this entry from every calorie total (summarizeDay, gauges, week
   *  strip) while keeping it visible in Day's log with muted styling — a
   *  toggle, not a delete. Currently only surfaced for healthkit-sourced
   *  entries (see SyncedActivitySheet); a hidden healthkit entry is also
   *  skipped by future syncs so it doesn't silently come back. */
  hidden?: boolean;
}

export interface WeightEntry {
  id: string;
  date: string;
  weightKg: number;
  source: WeightSource; // manual now; withings/healthkit later = the hook
}

/** Everything needed to render & compute, loaded for the active context. */
export interface AppSnapshot {
  user: User;
  activeGoal: Goal | null;
  weights: WeightEntry[];
}
