import type {
  FoodItem, FoodEntry, ActivityEntry, NutritionSnapshot, Meal, MeasurementType,
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

/** Converts a stored quantity from one Food item unit basis to another,
 *  preserving the actual physical amount. Needed when a Food item's own
 *  measurementType/referenceAmount changes after it's already been
 *  referenced elsewhere (Day's-log entries, Meal items) — those stored
 *  quantities are expressed in the OLD unit basis and mean something
 *  completely different under the new one otherwise (round 133: switching
 *  per_100g -> per_serving on an already-used item was multiplying
 *  calories by 100+, since "100" silently went from meaning grams to
 *  meaning servings). */
export function convertQuantity(
  quantity: number,
  oldType: MeasurementType, oldRefAmount: number,
  newType: MeasurementType, newRefAmount: number,
): number {
  if (oldType === newType && oldRefAmount === newRefAmount) return quantity;
  const grams = oldType === 'per_100g' ? quantity : quantity * oldRefAmount;
  return newType === 'per_100g' ? grams : grams / (newRefAmount || 1);
}

/** Sum of NutritionSnapshots — used for Meal totals. */
function sumSnapshots(list: NutritionSnapshot[]): NutritionSnapshot {
  return list.reduce(
    (acc, n) => ({
      calories: round(acc.calories + n.calories),
      protein: round((acc.protein + n.protein) * 10) / 10,
      carbs: round((acc.carbs + n.carbs) * 10) / 10,
      fiber: round((acc.fiber + n.fiber) * 10) / 10,
      fat: round((acc.fat + n.fat) * 10) / 10,
    }),
    { calories: 0, protein: 0, carbs: 0, fiber: 0, fat: 0 },
  );
}

/** A reusable Pantry Meal's total nutrition, computed LIVE from its current
 *  Food items — a Meal never stores its own macros (round 123+). If a
 *  referenced Food item is missing (deleted), that item contributes 0. */
export function mealNutritionFor(meal: Meal, itemsById: Map<string, FoodItem>): NutritionSnapshot {
  return sumSnapshots(
    meal.items.map((mi) => {
      const item = itemsById.get(mi.foodItemId);
      return item ? nutritionFor(item, mi.quantity) : { calories: 0, protein: 0, carbs: 0, fiber: 0, fat: 0 };
    }),
  );
}

/** A Meal's display photo — its own explicit photo if set, otherwise the
 *  first current ingredient that has one (round 124). Meals rarely get an
 *  explicit photo of their own (there's no "set meal photo" step); this
 *  keeps the Meal's photo live and consistent with how its nutrition is
 *  never stored, always derived from the current Food items. */
export function mealPhotoFor(meal: Meal, itemsById: Map<string, FoodItem>): string | undefined {
  if (meal.photo) return meal.photo;
  for (const mi of meal.items) {
    const photo = itemsById.get(mi.foodItemId)?.photo;
    if (photo) return photo;
  }
  return undefined;
}

/** All distinct photos available for a Meal — its own explicit photo (if
 *  any) plus every current ingredient's photo, deduplicated, capped at 4 to
 *  match ImageHero's collage limit (round 124/125's single-photo
 *  mealPhotoFor stays for contexts that only have room for one, like a list
 *  row thumbnail). */
export function mealPhotosFor(meal: Meal, itemsById: Map<string, FoodItem>): string[] {
  const photos = [
    meal.photo,
    ...meal.items.map((mi) => itemsById.get(mi.foodItemId)?.photo),
  ].filter((p): p is string => !!p);
  return Array.from(new Set(photos)).slice(0, 4);
}

/** The nutrition a FoodEntry actually contributes right now.
 *
 *  Pantry-backed entries (have a foodItemId + quantity) are recomputed LIVE
 *  from the CURRENT pantry item, so editing a pantry food's macros instantly
 *  reflects everywhere it was logged. Manual entries (no pantry item) keep
 *  their stored snapshot — there's nothing live to recompute them from.
 *
 *  Meal entries (mealData present) recompute per-item: any item carrying a
 *  foodItemId is pulled live from the current pantry item; items without one
 *  (local/unlinked, or the pantry item was later deleted) fall back to their
 *  own stored macro values within mealData.
 *
 *  `itemsById` maps FoodItem.id → FoodItem. If an entry's item is missing
 *  (e.g. deleted from the pantry) we fall back to the stored snapshot so the
 *  history doesn't vanish. */
export function effectiveNutrition(
  entry: FoodEntry,
  itemsById?: Map<string, FoodItem>,
): NutritionSnapshot {
  if (entry.mealData && itemsById) {
    return sumSnapshots(
      entry.mealData.items.map((mi) => {
        const qty = mi.qty ?? 1;
        if (mi.foodItemId) {
          const item = itemsById.get(mi.foodItemId);
          if (item) return nutritionFor(item, qty);
        }
        return {
          calories: round(mi.calories * qty),
          protein: round(mi.protein * qty * 10) / 10,
          carbs: round(mi.carbs * qty * 10) / 10,
          fiber: round(mi.fiber * qty * 10) / 10,
          fat: round(mi.fat * qty * 10) / 10,
        };
      }),
    );
  }
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
