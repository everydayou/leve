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
