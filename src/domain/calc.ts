import type {
  FoodItem, FoodEntry, ActivityEntry, NutritionSnapshot,
} from './types';

/** Atwater-style constant: ~7700 kcal per kg of body mass. */
export const KCAL_PER_KG = 7700;

/** Compute the nutrition snapshot for `quantity` of a pantry item.
 *  For per_100g, quantity is grams. For per_serving, quantity is servings. */
export function nutritionFor(item: FoodItem, quantity: number): NutritionSnapshot {
  const factor =
    item.measurementType === 'per_100g'
      ? quantity / item.referenceAmount // referenceAmount is 100
      : quantity; // servings
  return {
    calories: round(item.calories * factor),
    protein: round(item.protein * factor),
    carbs: round(item.carbs * factor),
    fiber: round(item.fiber * factor),
    fat: round(item.fat * factor),
  };
}

/** The nutrition a FoodEntry actually contributes right now.
 *
 *  Pantry-backed entries (have a foodItemId + quantity) are recomputed LIVE
 *  from the CURRENT pantry item, so editing a pantry food's macros instantly
 *  reflects everywhere it was logged. Manual entries (no pantry item) keep
 *  their stored snapshot — there's nothing live to recompute them from.
 *
 *  `itemsById` maps FoodItem.id → FoodItem. If an entry's item is missing
 *  (e.g. deleted from the pantry) we fall back to the stored snapshot so the
 *  history doesn't vanish. */
export function effectiveNutrition(
  entry: FoodEntry,
  itemsById?: Map<string, FoodItem>,
): NutritionSnapshot {
  if (entry.foodItemId && entry.quantity != null && itemsById) {
    const item = itemsById.get(entry.foodItemId);
    if (item) return nutritionFor(item, entry.quantity);
  }
  return entry.snapshot;
}

/** Build the id→item lookup once for a batch of computations. */
export function itemsByIdMap(items: FoodItem[]): Map<string, FoodItem> {
  return new Map(items.map((i) => [i.id, i]));
}

export interface DaySummary {
  consumed: number;
  protein: number;
  activeCalories: number;
  /** Estimated Thermic Effect of Food — calories used to digest and process food.
   *  Derived from logged macros (protein 25%, carbs 7.5%, fat 2%).
   *  Zero when no macro data is available. */
  digestionCalories: number;
  totalBurn: number; // BMR + active + digestion; positive calories out
  deficit: number;   // totalBurn - consumed; positive = under budget
}

/** Estimate the Thermic Effect of Food (TEF) from logged macro snapshots.
 *  Rates: protein 25%, carbs 7.5%, fat 2% (well-established mid-range values).
 *  Uses only macros that are present — if all are zero, returns 0.
 *  Result is rounded to the nearest whole calorie. */
export function calcDigestionCalories(
  foods: FoodEntry[],
  itemsById?: Map<string, FoodItem>,
): number {
  let proteinG = 0;
  let carbsG   = 0;
  let fatG     = 0;
  for (const f of foods) {
    const n  = effectiveNutrition(f, itemsById);
    proteinG += n.protein;
    carbsG   += n.carbs;  // fiber stored separately; its TEF ≈ 0, excluded
    fatG     += n.fat;
  }
  const digestion =
    (proteinG * 4) * 0.25 +
    (carbsG   * 4) * 0.075 +
    (fatG     * 9) * 0.02;
  return Math.round(digestion);
}

/** Derived Day. Day is never stored.
 *  Pass `itemsById` so pantry-backed entries are valued from the CURRENT
 *  pantry item (live); omit it to fall back to each entry's stored snapshot. */
export function summarizeDay(
  bmr: number,
  foods: FoodEntry[],
  activities: ActivityEntry[],
  itemsById?: Map<string, FoodItem>,
): DaySummary {
  const consumed          = round(sum(foods.map((f) => effectiveNutrition(f, itemsById).calories)));
  const protein           = round(sum(foods.map((f) => effectiveNutrition(f, itemsById).protein)));
  const activeCalories    = round(sum(activities.map((a) => a.activeCalories)));
  const digestionCalories = calcDigestionCalories(foods, itemsById);
  const totalBurn         = round(bmr + activeCalories + digestionCalories);
  return { consumed, protein, activeCalories, digestionCalories, totalBurn, deficit: round(totalBurn - consumed) };
}

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const round = (n: number): number => Math.round(n * 10) / 10;
