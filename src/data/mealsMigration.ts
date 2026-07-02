// One-time migration (round 123): "Meals in Pantry".
//
// Before Meals existed as a real Pantry entity, logging 2+ basket items
// together and ticking "Save to pantry" collapsed the whole group into a
// single per-serving Food item holding the SUMMED macros (see CHANGELOG
// rounds <=122, AddEntrySheet.logBasket). This migration finds those
// collapsed Food items and converts them into real Meals: one reusable
// Food item per original ingredient (recovered from the log entry's
// mealData breakdown), combined into a Meal, with every entry that used
// the collapsed item re-pointed at the new Meal.
//
// Safety: only converts when >=2 real ingredients can be recovered from
// mealData. If a Food item can't be proven to have been a collapsed meal,
// it's left exactly as-is. The old collapsed Food item is ARCHIVED, never
// deleted, so nothing referencing it by id can break.
import { repos } from '../state/repos';
import { newId } from './ids';
import type { Repositories } from './repositories';
import type { FoodItem, FoodEntry, Meal, MealFoodItem } from '../domain/types';

const FLAG_KEY = 'ngt-meals-migration-v1-done';

export async function runMealsMigrationIfNeeded(): Promise<void> {
  if (typeof localStorage !== 'undefined' && localStorage.getItem(FLAG_KEY)) return;
  try {
    await runMealsMigration();
  } finally {
    if (typeof localStorage !== 'undefined') localStorage.setItem(FLAG_KEY, '1');
  }
}

/** Exported separately from the guarded runner so it's testable directly
 *  against any Repositories implementation (e.g. memoryRepositories in tests) —
 *  defaults to the real app repos. */
export async function runMealsMigration(repositories: Repositories = repos): Promise<void> {
  const items = await repositories.foodItems.all(true);
  // Wide range covers the app's whole lifetime — this only ever runs once.
  const entries = await repositories.foodEntries.byDateRange('1970-01-01', '2999-12-31');

  const byNameLower = new Map(items.filter((i) => !i.isArchived).map((i) => [i.name.toLowerCase(), i]));

  for (const item of items) {
    if (item.isArchived) continue;
    // Shape of a collapsed meal-as-food-item from the old logBasket path.
    if (item.measurementType !== 'per_serving' || item.referenceAmount !== 1) continue;

    const owningEntries = entries.filter(
      (e) => e.foodItemId === item.id && e.mealData && e.mealData.items.length >= 2,
    );
    if (owningEntries.length === 0) continue;

    // Union of ingredient names across every entry that used this collapsed
    // item, so a Food item is created once per unique ingredient even if
    // the same pantry "meal" was logged more than once with slightly
    // different breakdowns.
    const nameToFoodItemId = new Map<string, string>();
    const mealItems: MealFoodItem[] = [];

    for (const e of owningEntries) {
      for (const mi of e.mealData!.items) {
        const key = mi.name.toLowerCase();
        if (nameToFoodItemId.has(key)) continue;
        const existing = byNameLower.get(key);
        let foodItemId: string;
        if (existing) {
          foodItemId = existing.id;
        } else {
          foodItemId = newId();
          const newItem: FoodItem = {
            id: foodItemId, name: mi.name, measurementType: 'per_serving', referenceAmount: 1,
            calories: mi.calories, protein: mi.protein, carbs: mi.carbs, fiber: mi.fiber, fat: mi.fat,
            isArchived: false,
          };
          await repositories.foodItems.put(newItem);
          byNameLower.set(key, newItem);
        }
        nameToFoodItemId.set(key, foodItemId);
        mealItems.push({ id: newId(), foodItemId, quantity: mi.qty ?? 1 });
      }
    }

    if (mealItems.length < 2) continue; // couldn't recover a real multi-item meal — leave the Food item alone

    const meal: Meal = { id: newId(), name: item.name, photo: item.photo, items: mealItems, isArchived: false };
    await repositories.meals.put(meal);

    for (const e of owningEntries) {
      const updated: FoodEntry = {
        ...e,
        mealId: meal.id,
        foodItemId: undefined,
        mealData: {
          ...e.mealData!,
          items: e.mealData!.items.map((mi) => ({
            ...mi,
            foodItemId: nameToFoodItemId.get(mi.name.toLowerCase()) ?? mi.foodItemId,
          })),
        },
      };
      await repositories.foodEntries.update(updated);
    }

    // Superseded by the new Meal — archive, don't delete.
    await repositories.foodItems.put({ ...item, isArchived: true });
  }
}
