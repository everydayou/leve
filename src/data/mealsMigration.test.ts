import { describe, it, expect, beforeEach } from 'vitest';
import { memoryRepositories, resetMemory } from './memoryRepositories';
import { runMealsMigration } from './mealsMigration';
import { newId } from './ids';
import type { FoodItem, FoodEntry } from '../domain/types';

describe('runMealsMigration', () => {
  beforeEach(() => resetMemory());

  it('converts a collapsed meal-as-food-item into a real Meal with linked Food items', async () => {
    const collapsedId = newId();
    const collapsed: FoodItem = {
      id: collapsedId, name: 'Couscous salad', measurementType: 'per_serving', referenceAmount: 1,
      calories: 195, protein: 7, carbs: 38, fiber: 4, fat: 6, isArchived: false,
    };
    await memoryRepositories.foodItems.put(collapsed);

    const entry: FoodEntry = {
      id: newId(), date: '2026-06-15', foodItemId: collapsedId, quantity: 1, isManual: false,
      snapshot: { calories: 195, protein: 7, carbs: 38, fiber: 4, fat: 6 }, createdAt: '2026-06-15T12:00:00Z',
      mealData: {
        name: 'Couscous salad',
        items: [
          { name: 'Couscous', estimatedGrams: 150, calories: 130, protein: 4, carbs: 30, fiber: 2, fat: 1, confidence: 'high', selected: true },
          { name: 'Salad', estimatedGrams: 100, calories: 65, protein: 3, carbs: 8, fiber: 2, fat: 5, confidence: 'high', selected: true },
        ],
      },
    };
    await memoryRepositories.foodEntries.add(entry);

    await runMealsMigration(memoryRepositories);

    const meals = await memoryRepositories.meals.all();
    expect(meals).toHaveLength(1);
    expect(meals[0].name).toBe('Couscous salad');
    expect(meals[0].items).toHaveLength(2);

    const items = await memoryRepositories.foodItems.all(true);
    const couscous = items.find((i) => i.name === 'Couscous');
    const salad = items.find((i) => i.name === 'Salad');
    expect(couscous?.calories).toBe(130);
    expect(salad?.calories).toBe(65);

    // Old collapsed item archived, not deleted.
    const stillThere = items.find((i) => i.id === collapsedId);
    expect(stillThere?.isArchived).toBe(true);

    // Entry re-pointed at the new Meal and its items are now linked.
    const [updatedEntry] = await memoryRepositories.foodEntries.byDate('2026-06-15');
    expect(updatedEntry.mealId).toBe(meals[0].id);
    expect(updatedEntry.foodItemId).toBeUndefined();
    expect(updatedEntry.mealData?.items.every((mi) => !!mi.foodItemId)).toBe(true);
  });

  it('leaves an ordinary per-serving Food item alone when it has no multi-item mealData', async () => {
    const item: FoodItem = {
      id: newId(), name: 'Protein bar', measurementType: 'per_serving', referenceAmount: 1,
      calories: 210, protein: 20, carbs: 24, fiber: 9, fat: 7, isArchived: false,
    };
    await memoryRepositories.foodItems.put(item);
    await memoryRepositories.foodEntries.add({
      id: newId(), date: '2026-06-15', foodItemId: item.id, quantity: 1, isManual: false,
      snapshot: { calories: 210, protein: 20, carbs: 24, fiber: 9, fat: 7 }, createdAt: '2026-06-15T12:00:00Z',
    });

    await runMealsMigration(memoryRepositories);

    expect(await memoryRepositories.meals.all()).toHaveLength(0);
    const items = await memoryRepositories.foodItems.all();
    expect(items.find((i) => i.id === item.id)?.isArchived).toBe(false);
  });
});
