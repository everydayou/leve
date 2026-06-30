// Framework-agnostic domain types. No React, no Dexie, no DOM.
// Designed so deferred features (other goal types, BMR calibration,
// Withings/HealthKit) attach later without a rebuild.

export type Units = 'kg' | 'lbs';
export type MeasurementType = 'per_100g' | 'per_serving';
export type GoalType = 'lose_by_date' | 'gain_by_date'; // gain_by_date added r61
export type GoalStatus = 'active' | 'completed' | 'abandoned';
export type WeightSource = 'manual' | 'withings' | 'healthkit';

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
  // ── Tracking preferences (gain_by_date goals only, r65) ──────────────────
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
  // ── Surplus range (gain_by_date goals only, r66) ──────────────────────────
  /** Min daily surplus (kcal) for the gauge arc to turn green. */
  surplusFloor?: number;
  /** Max daily surplus (kcal) before the gauge arc turns dark again. */
  surplusCeiling?: number;
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
}

/** One logged food line on a day. Stores a SNAPSHOT of computed nutrition
 *  at log time — editing a pantry item later does NOT rewrite past entries.
 *  When a multi-item scan is logged as a meal, `mealData` holds the original
 *  items so the user can re-open and edit the full meal later. */
export interface FoodEntry {
  id: string;
  date: string; // YYYY-MM-DD
  foodItemId?: string;
  quantity?: number; // in the unit basis of the item's referenceAmount
  manualName?: string;
  isManual: boolean;
  snapshot: NutritionSnapshot;
  createdAt: string; // ISO timestamp
  /** Present only when this entry was logged from a multi-item photo scan. */
  mealData?: { name: string; photo?: string; items: MealItem[] };
}

export interface ActivityEntry {
  id: string;
  date: string;
  name?: string;
  activeCalories: number;
  createdAt: string; // ISO timestamp — lets Today sort all entries by time
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
