// One-time seeding (round 179): populates the ~150 bundled default Pantry
// items (src/data/defaultPantry.ts) into every device's local Pantry, the
// same way runMealsMigration (round 123) does its one-time conversion —
// same localStorage-flag-gated runner, same "exported separately so it's
// directly testable" split.
//
// Design notes:
//  - Stable IDs (see defaultPantry.ts) mean this could safely be re-run —
//    repos.foodItems.put() on an id that already exists is an upsert, not a
//    duplicate insert — but this pass only ever seeds once (flag below).
//    A FUTURE update that adds/corrects items would need its own new
//    versioned flag + migration step (see mealsMigration.ts's own history
//    for the established pattern of one flag per one-time change).
//  - If someone already has their own Food item with the exact same name
//    (any origin) — e.g. they created "Chicken breast" by hand before this
//    update shipped — that default is skipped rather than seeded alongside
//    it, so nobody ends up with two identically-named rows. Their own item
//    wins; nothing about it is touched.
//  - Every seeded row is origin:'app', isArchived:false, measurementType
//    'per_100g' with referenceAmount 100 — FoodItemForm locks macro editing
//    for origin:'app' items (see its own doc comment).
import { repos } from '../state/repos';
import { DEFAULT_PANTRY_FOODS } from './defaultPantry';
import type { Repositories } from './repositories';
import type { FoodItem } from '../domain/types';

const FLAG_KEY = 'ngt-default-pantry-seed-v1-done';

export async function runDefaultPantrySeedIfNeeded(): Promise<void> {
  if (typeof localStorage !== 'undefined' && localStorage.getItem(FLAG_KEY)) return;
  try {
    await runDefaultPantrySeed();
  } finally {
    if (typeof localStorage !== 'undefined') localStorage.setItem(FLAG_KEY, '1');
  }
}

/** Exported separately from the guarded runner so it's testable directly
 *  against any Repositories implementation (e.g. memoryRepositories in
 *  tests) — defaults to the real app repos. */
export async function runDefaultPantrySeed(repositories: Repositories = repos): Promise<void> {
  const existing = await repositories.foodItems.all(true);
  const existingNamesLower = new Set(existing.map((i) => i.name.trim().toLowerCase()));

  for (const food of DEFAULT_PANTRY_FOODS) {
    if (existingNamesLower.has(food.name.trim().toLowerCase())) continue; // user's own item wins

    const item: FoodItem = {
      id: food.id,
      name: food.name,
      measurementType: 'per_100g',
      referenceAmount: 100,
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fiber: food.fiber,
      fat: food.fat,
      isArchived: false,
      origin: 'app',
    };
    await repositories.foodItems.put(item);
    existingNamesLower.add(food.name.trim().toLowerCase());
  }
}
