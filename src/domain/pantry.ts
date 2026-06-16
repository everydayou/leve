import type { FoodItem } from './types';

/** Case- and whitespace-insensitive lookup of a pantry item by name. Pure
 *  helper (no React/DOM) — lives in domain/ so component files can stay
 *  component-only (keeps React Fast Refresh / HMR working). */
export function findByName(items: FoodItem[], name: string, excludeId?: string): FoodItem | undefined {
  const key = name.trim().toLowerCase();
  if (!key) return undefined;
  return items.find((i) => i.id !== excludeId && i.name.trim().toLowerCase() === key);
}
