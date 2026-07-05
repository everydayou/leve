import { describe, it, expect, beforeEach } from 'vitest';
import { memoryRepositories, resetMemory } from './memoryRepositories';
import { runDefaultPantrySeed } from './defaultPantrySeed';
import { DEFAULT_PANTRY_FOODS } from './defaultPantry';
import { newId } from './ids';
import type { FoodItem } from '../domain/types';

describe('runDefaultPantrySeed', () => {
  beforeEach(() => resetMemory());

  it('seeds every default food into an empty pantry, tagged origin:app', async () => {
    await runDefaultPantrySeed(memoryRepositories);

    const items = await memoryRepositories.foodItems.all(true);
    expect(items).toHaveLength(DEFAULT_PANTRY_FOODS.length);
    expect(items.every((i) => i.origin === 'app')).toBe(true);
    expect(items.every((i) => i.isArchived === false)).toBe(true);
    expect(items.every((i) => i.measurementType === 'per_100g' && i.referenceAmount === 100)).toBe(true);

    const chicken = items.find((i) => i.id === 'app-chicken-breast-cooked');
    expect(chicken?.calories).toBe(165);
    expect(chicken?.protein).toBe(31);
  });

  it('skips a default whose name already exists as a user item, leaving it untouched', async () => {
    const userItem: FoodItem = {
      id: newId(), name: 'Chicken breast, cooked', measurementType: 'per_serving', referenceAmount: 1,
      calories: 999, protein: 1, carbs: 1, fiber: 1, fat: 1, isArchived: false,
    };
    await memoryRepositories.foodItems.put(userItem);

    await runDefaultPantrySeed(memoryRepositories);

    const items = await memoryRepositories.foodItems.all(true);
    // The user's own item survives exactly as-is...
    const mine = items.find((i) => i.id === userItem.id);
    expect(mine?.calories).toBe(999);
    expect(mine?.origin).toBeUndefined();
    // ...and no app-origin duplicate of the same name was seeded alongside it.
    expect(items.find((i) => i.id === 'app-chicken-breast-cooked')).toBeUndefined();
    expect(items.filter((i) => i.name.toLowerCase() === 'chicken breast, cooked')).toHaveLength(1);
    // Everything else still seeds normally.
    expect(items).toHaveLength(DEFAULT_PANTRY_FOODS.length); // one skipped, one pre-existing = same total
  });

  it('is idempotent — running twice never duplicates rows', async () => {
    await runDefaultPantrySeed(memoryRepositories);
    await runDefaultPantrySeed(memoryRepositories);

    const items = await memoryRepositories.foodItems.all(true);
    expect(items).toHaveLength(DEFAULT_PANTRY_FOODS.length);
  });
});
