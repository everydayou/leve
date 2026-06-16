import { describe, it, expect } from 'vitest';
import { nutritionFor, summarizeDay, calcDigestionCalories, KCAL_PER_KG } from './calc';
import type { FoodItem, FoodEntry, ActivityEntry } from './types';

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
