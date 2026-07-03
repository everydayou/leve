import { describe, it, expect } from 'vitest';
import { nutritionFor, effectiveNutrition, mealNutritionFor, mealPhotoFor, mealPhotosFor, convertQuantity, itemsByIdMap, summarizeDay, calcDigestionCalories, KCAL_PER_KG } from './calc';
import type { FoodItem, FoodEntry, ActivityEntry, Meal } from './types';

const chicken: FoodItem = {
  id: 'c', name: 'Chicken breast', measurementType: 'per_100g', referenceAmount: 100,
  calories: 165, protein: 31, carbs: 0, fiber: 0, fat: 3.6, isArchived: false,
};
const bar: FoodItem = {
  id: 'b', name: 'Protein bar', measurementType: 'per_serving', referenceAmount: 1,
  calories: 210, protein: 20, carbs: 24, fiber: 9, fat: 7, isArchived: false,
};

describe('nutritionFor', () => {
  it('scales per_100g by grams', () => {
    expect(nutritionFor(chicken, 200).calories).toBe(330);
    expect(nutritionFor(chicken, 200).protein).toBe(62);
  });
  it('scales per_serving by servings', () => {
    expect(nutritionFor(bar, 2).calories).toBe(420);
    expect(nutritionFor(bar, 0.5).protein).toBe(10);
  });
});

describe('summarizeDay', () => {
  it('computes burn and deficit including TEF (Total Burn = BMR + active + digestion)', () => {
    const foods: FoodEntry[] = [
      // protein=96g → digestion = (96*4)*0.25 = 96 kcal; carbs/fat=0
      { id: '1', date: '2026-06-03', isManual: false, createdAt: '', snapshot: { calories: 1480, protein: 96, carbs: 0, fiber: 0, fat: 0 } },
    ];
    const acts: ActivityEntry[] = [{ id: 'a', date: '2026-06-03', activeCalories: 350, createdAt: '' }];
    const d = summarizeDay(1650, foods, acts);
    expect(d.activeCalories).toBe(350);
    expect(d.digestionCalories).toBe(96);    // (96*4)*0.25
    expect(d.totalBurn).toBe(2096);          // 1650 + 350 + 96
    expect(d.consumed).toBe(1480);
    expect(d.deficit).toBe(616);             // 2096 - 1480
    expect(d.protein).toBe(96);
  });

  it('digestion is zero when no macro data is logged', () => {
    const foods: FoodEntry[] = [
      // calories only, all macros absent (zero)
      { id: '2', date: '2026-06-03', isManual: true, createdAt: '', snapshot: { calories: 500, protein: 0, carbs: 0, fiber: 0, fat: 0 } },
    ];
    const d = summarizeDay(1650, foods, []);
    expect(d.digestionCalories).toBe(0);
    expect(d.totalBurn).toBe(1650);
    expect(d.deficit).toBe(1150);
  });
});

describe('calcDigestionCalories', () => {
  it('applies correct TEF rates per macro', () => {
    // protein 50g → (50*4)*0.25 = 50; carbs 100g → (100*4)*0.075 = 30; fat 20g → (20*9)*0.02 = 3.6 → 4
    const foods: FoodEntry[] = [
      { id: '3', date: '2026-06-03', isManual: true, createdAt: '', snapshot: { calories: 800, protein: 50, carbs: 100, fiber: 5, fat: 20 } },
    ];
    const result = calcDigestionCalories(foods);
    // 50 + 30 + 3.6 = 83.6 → 84
    expect(result).toBe(84);
  });

  it('excludes fiber from carb TEF calculation', () => {
    // fiber stored separately; carbs field used, not carbs+fiber
    const foods: FoodEntry[] = [
      { id: '4', date: '2026-06-03', isManual: true, createdAt: '', snapshot: { calories: 200, protein: 0, carbs: 0, fiber: 50, fat: 0 } },
    ];
    expect(calcDigestionCalories(foods)).toBe(0);
  });

  it('returns zero for empty food list', () => {
    expect(calcDigestionCalories([])).toBe(0);
  });
});

it('KCAL_PER_KG is the 7700 constant', () => {
  expect(KCAL_PER_KG).toBe(7700);
});

describe('mealNutritionFor', () => {
  it('sums a Meal\'s current Food items live', () => {
    const items = itemsByIdMap([chicken, bar]);
    const meal: Meal = {
      id: 'm', name: 'Chicken + bar', isArchived: false,
      items: [
        { id: 'mi1', foodItemId: 'c', quantity: 200 }, // 330 kcal, 62g protein
        { id: 'mi2', foodItemId: 'b', quantity: 1 },   // 210 kcal, 20g protein
      ],
    };
    const n = mealNutritionFor(meal, items);
    expect(n.calories).toBe(540);
    expect(n.protein).toBe(82);
  });

  it('treats a missing (deleted) Food item as zero, not a crash', () => {
    const items = itemsByIdMap([chicken]);
    const meal: Meal = {
      id: 'm', name: 'Chicken + ???', isArchived: false,
      items: [
        { id: 'mi1', foodItemId: 'c', quantity: 100 },
        { id: 'mi2', foodItemId: 'missing', quantity: 1 },
      ],
    };
    expect(mealNutritionFor(meal, items).calories).toBe(165);
  });
});

describe('effectiveNutrition — Meal entries (round 123)', () => {
  it('recomputes a linked Meal item live from the current Food item', () => {
    const items = itemsByIdMap([chicken, bar]);
    const entry: FoodEntry = {
      id: 'e1', date: '2026-07-02', isManual: false, createdAt: '',
      snapshot: { calories: 999, protein: 999, carbs: 999, fiber: 999, fat: 999 }, // stale on purpose
      mealId: 'm',
      mealData: {
        name: 'Chicken + bar',
        items: [
          { name: 'Chicken breast', estimatedGrams: 200, calories: 330, protein: 62, carbs: 0, fiber: 0, fat: 7.2, confidence: 'high', selected: true, foodItemId: 'c', qty: 200 },
          { name: 'Protein bar', estimatedGrams: 1, calories: 210, protein: 20, carbs: 24, fiber: 9, fat: 7, confidence: 'high', selected: true, foodItemId: 'b', qty: 1 },
        ],
      },
    };
    const n = effectiveNutrition(entry, items);
    // Recomputed from current pantry macros, NOT the stale stored snapshot.
    expect(n.calories).toBe(540);
    expect(n.protein).toBe(82);
  });

  it('falls back to each item\'s own stored macros when unlinked (local Meal item)', () => {
    const entry: FoodEntry = {
      id: 'e2', date: '2026-07-02', isManual: true, createdAt: '',
      snapshot: { calories: 100, protein: 1, carbs: 1, fiber: 1, fat: 1 },
      mealData: {
        name: 'One-off combo',
        items: [
          { name: 'Homemade thing', estimatedGrams: 1, calories: 250, protein: 10, carbs: 20, fiber: 2, fat: 8, confidence: 'high', selected: true },
        ],
      },
    };
    const n = effectiveNutrition(entry, itemsByIdMap([]));
    expect(n.calories).toBe(250);
    expect(n.protein).toBe(10);
  });
});

describe('mealPhotoFor', () => {
  it('uses the Meal\'s own photo when set', () => {
    const items = itemsByIdMap([{ ...chicken, photo: 'chicken.jpg' }]);
    const meal: Meal = { id: 'm', name: 'M', photo: 'meal.jpg', isArchived: false, items: [{ id: 'mi', foodItemId: 'c', quantity: 100 }] };
    expect(mealPhotoFor(meal, items)).toBe('meal.jpg');
  });

  it('falls back to the first ingredient with a photo when the Meal has none', () => {
    const items = itemsByIdMap([bar, { ...chicken, photo: 'chicken.jpg' }]);
    const meal: Meal = {
      id: 'm', name: 'M', isArchived: false,
      items: [{ id: 'mi1', foodItemId: 'b', quantity: 1 }, { id: 'mi2', foodItemId: 'c', quantity: 100 }],
    };
    expect(mealPhotoFor(meal, items)).toBe('chicken.jpg');
  });

  it('returns undefined when neither the Meal nor any item has a photo', () => {
    const items = itemsByIdMap([bar]);
    const meal: Meal = { id: 'm', name: 'M', isArchived: false, items: [{ id: 'mi', foodItemId: 'b', quantity: 1 }] };
    expect(mealPhotoFor(meal, items)).toBeUndefined();
  });
});

describe('mealPhotosFor', () => {
  it('collects the meal photo plus every distinct ingredient photo, capped at 4', () => {
    const items = itemsByIdMap([
      { ...chicken, id: 'c1', photo: 'a.jpg' },
      { ...chicken, id: 'c2', photo: 'b.jpg' },
      { ...chicken, id: 'c3', photo: 'a.jpg' }, // duplicate of c1's photo
      { ...chicken, id: 'c4', photo: undefined },
      { ...chicken, id: 'c5', photo: 'c.jpg' },
    ]);
    const meal: Meal = {
      id: 'm', name: 'M', isArchived: false,
      items: [1, 2, 3, 4, 5].map((n) => ({ id: `mi${n}`, foodItemId: `c${n}`, quantity: 100 })),
    };
    expect(mealPhotosFor(meal, items)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
  });

  it('returns an empty array when nothing has a photo', () => {
    const items = itemsByIdMap([bar]);
    const meal: Meal = { id: 'm', name: 'M', isArchived: false, items: [{ id: 'mi', foodItemId: 'b', quantity: 1 }] };
    expect(mealPhotosFor(meal, items)).toEqual([]);
  });
});

describe('convertQuantity', () => {
  it('converts per_100g grams to per_serving servings, preserving the actual amount', () => {
    // 100g of a food where 1 serving = 50g -> 2 servings
    expect(convertQuantity(100, 'per_100g', 100, 'per_serving', 50)).toBe(2);
  });

  it('converts per_serving servings to per_100g grams', () => {
    // 2 servings @ 50g each -> 100g
    expect(convertQuantity(2, 'per_serving', 50, 'per_100g', 100)).toBe(100);
  });

  it('is a no-op when the unit basis is unchanged', () => {
    expect(convertQuantity(37, 'per_100g', 100, 'per_100g', 100)).toBe(37);
    expect(convertQuantity(3, 'per_serving', 20, 'per_serving', 20)).toBe(3);
  });

  it('reproduces the exact round-133 bug scenario if NOT converted', () => {
    // The bug: a stored quantity of 100 (grams, per_100g) reinterpreted
    // directly as 100 servings would multiply nutrition by 100x. Converting
    // first avoids that — 100g at 1 serving = referenceAmount grams (say the
    // user left it at the default of 1g/serving) becomes 100 servings,
    // which is mathematically correct for that (odd) serving size, and
    // very different from 1 serving with no conversion at all.
    expect(convertQuantity(100, 'per_100g', 100, 'per_serving', 1)).toBe(100);
    expect(convertQuantity(100, 'per_100g', 100, 'per_serving', 100)).toBe(1);
  });
});
