import { describe, it, expect, beforeEach } from 'vitest';
import { memoryRepositories, resetMemory } from './memoryRepositories';
import { convertFoodItemReferences } from './quantityConversion';
import { effectiveNutrition, mealNutritionFor, itemsByIdMap } from '../domain/calc';
import { newId } from './ids';
import type { FoodItem, FoodEntry, Meal } from '../domain/types';

describe('convertFoodItemReferences', () => {
  beforeEach(() => resetMemory());

  it('converts a plain Food entry\'s quantity so its nutrition is unchanged after the unit switch', async () => {
    const itemId = newId();
    const item: FoodItem = {
      id: itemId, name: 'Rice', measurementType: 'per_100g', referenceAmount: 100,
      calories: 130, protein: 2.7, carbs: 28, fiber: 0.4, fat: 0.3, isArchived: false,
    };
    await memoryRepositories.foodItems.put(item);

    const entry: FoodEntry = {
      id: newId(), date: '2026-07-01', foodItemId: itemId, quantity: 100, isManual: false,
      snapshot: { calories: 130, protein: 2.7, carbs: 28, fiber: 0.4, fat: 0.3 }, createdAt: '',
    };
    await memoryRepositories.foodEntries.add(entry);

    // Before: 100g of a per_100g item = the full 130 kcal.
    const before = effectiveNutrition(entry, itemsByIdMap([item]));
    expect(before.calories).toBe(130);

    // Switch the item to per_serving, 50g/serving — macros re-entered for the
    // new reference amount (half of the per-100g values, since 50g is half
    // of 100g), exactly as the edit form expects the user to do. The cascade
    // being tested here is only responsible for the QUANTITY conversion —
    // preserving "how much was consumed" — not the macro re-entry itself.
    const updatedItem: FoodItem = {
      ...item, measurementType: 'per_serving', referenceAmount: 50,
      calories: 65, protein: 1.35, carbs: 14, fiber: 0.2, fat: 0.15,
    };
    await memoryRepositories.foodItems.put(updatedItem);
    await convertFoodItemReferences(memoryRepositories, itemId, 'per_100g', 100, 'per_serving', 50);

    const [convertedEntry] = await memoryRepositories.foodEntries.byDate('2026-07-01');
    expect(convertedEntry.quantity).toBe(2); // 100g / 50g-per-serving = 2 servings

    // After: nutrition for the SAME physical amount should be unchanged.
    const after = effectiveNutrition(convertedEntry, itemsByIdMap([updatedItem]));
    expect(after.calories).toBe(130);
  });

  it('converts a Meal\'s per-item quantity the same way', async () => {
    const itemId = newId();
    const item: FoodItem = {
      id: itemId, name: 'Couscous', measurementType: 'per_100g', referenceAmount: 100,
      calories: 112, protein: 3.8, carbs: 23, fiber: 1.4, fat: 0.2, isArchived: false,
    };
    await memoryRepositories.foodItems.put(item);

    const meal: Meal = {
      id: newId(), name: 'Bowl', isArchived: false,
      items: [{ id: newId(), foodItemId: itemId, quantity: 150 }],
    };
    await memoryRepositories.meals.put(meal);

    const before = mealNutritionFor(meal, itemsByIdMap([item]));
    expect(before.calories).toBe(168); // 112 * 1.5

    // 75g/serving = 3/4 of 100g, so macros re-entered at 3/4 of the per-100g values.
    const updatedItem: FoodItem = {
      ...item, measurementType: 'per_serving', referenceAmount: 75,
      calories: 84, protein: 2.85, carbs: 17.25, fiber: 1.05, fat: 0.15,
    };
    await memoryRepositories.foodItems.put(updatedItem);
    await convertFoodItemReferences(memoryRepositories, itemId, 'per_100g', 100, 'per_serving', 75);

    const [convertedMeal] = await memoryRepositories.meals.all();
    expect(convertedMeal.items[0].quantity).toBe(2); // 150g / 75g-per-serving = 2 servings

    const after = mealNutritionFor(convertedMeal, itemsByIdMap([updatedItem]));
    expect(after.calories).toBe(168);
  });

  it('does nothing when the unit basis is unchanged', async () => {
    const itemId = newId();
    const entry: FoodEntry = {
      id: newId(), date: '2026-07-01', foodItemId: itemId, quantity: 42, isManual: false,
      snapshot: { calories: 0, protein: 0, carbs: 0, fiber: 0, fat: 0 }, createdAt: '',
    };
    await memoryRepositories.foodEntries.add(entry);
    await convertFoodItemReferences(memoryRepositories, itemId, 'per_100g', 100, 'per_100g', 100);
    const [unchanged] = await memoryRepositories.foodEntries.byDate('2026-07-01');
    expect(unchanged.quantity).toBe(42);
  });
});
