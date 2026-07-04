import type { FoodItem, Meal } from './types';

/** Case- and whitespace-insensitive lookup of a pantry item by name. Pure
 *  helper (no React/DOM) — lives in domain/ so component files can stay
 *  component-only (keeps React Fast Refresh / HMR working). */
export function findByName(items: FoodItem[], name: string, excludeId?: string): FoodItem | undefined {
  const key = name.trim().toLowerCase();
  if (!key) return undefined;
  return items.find((i) => i.id !== excludeId && i.name.trim().toLowerCase() === key);
}

/** Pantry names must be unique across BOTH Food items and Meals (round 133)
 *  — the "All" list combines them, and a Food item named the same as a Meal
 *  is just as confusing as a duplicate within either list alone. excludeId
 *  lets the object being renamed exclude itself from the check. */
export function findPantryNameConflict(
  items: FoodItem[], meals: Meal[], name: string, excludeId?: string,
): { type: 'item' | 'meal'; name: string } | undefined {
  const key = name.trim().toLowerCase();
  if (!key) return undefined;
  const item = items.find((i) => i.id !== excludeId && i.name.trim().toLowerCase() === key);
  if (item) return { type: 'item', name: item.name };
  const meal = meals.find((m) => m.id !== excludeId && m.name.trim().toLowerCase() === key);
  if (meal) return { type: 'meal', name: meal.name };
  return undefined;
}

/** Auto-disambiguates a candidate Pantry name against existing Food items
 *  and Meals — "Couscous" -> "Couscous (2)" -> "Couscous (3)"... Used by the
 *  scan/AI-capture commit paths (round 152), which create a Food item or
 *  Meal straight from an AI-suggested name with no form step to show an
 *  inline "name already exists" error in (unlike Manual, which blocks Save
 *  via findPantryNameConflict instead of renaming around it). */
export function uniquePantryName(name: string, items: FoodItem[], meals: Meal[], excludeId?: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  if (!findPantryNameConflict(items, meals, trimmed, excludeId)) return trimmed;
  let n = 2;
  while (findPantryNameConflict(items, meals, `${trimmed} (${n})`, excludeId)) n++;
  return `${trimmed} (${n})`;
}
