import { useLive } from './live';
import { repos } from './repos';
import { summarizeDay, itemsByIdMap, type DaySummary } from '../domain/calc';
import { bmrForDate } from '../domain/bmr';
import type { FoodEntry, ActivityEntry, FoodItem } from '../domain/types';

export interface DayData {
  foods: FoodEntry[];
  activities: ActivityEntry[];
  summary: DaySummary;
  bmr: number;
  /** Current pantry items keyed by id — pantry-backed entries are valued live
   *  from these, so editing a pantry food updates this day's totals. */
  itemsById: Map<string, FoodItem>;
}

/** Reactive day view: re-renders whenever the underlying tables change
 *  (including the pantry — so a macro edit recomputes the day live). */
export function useDay(date: string): DayData | undefined {
  return useLive(async () => {
    const [rawFoods, activities, user, items, weights] = await Promise.all([
      repos.foodEntries.byDate(date),
      repos.activities.byDate(date),
      repos.user.get(),
      repos.foodItems.all(),
      repos.weights.all(),
    ]);
    // Sort by createdAt ascending so that .reverse() in the UI gives newest-first.
    // Dexie returns entries in primary-key (UUID) order which is random, not insertion order.
    const foods = [...rawFoods].sort((a, b) =>
      (a.createdAt ?? '').localeCompare(b.createdAt ?? ''),
    );
    const bmr = user ? bmrForDate(date, weights, user) : 0;
    const itemsById = itemsByIdMap(items);
    return { foods, activities, bmr, itemsById, summary: summarizeDay(bmr, foods, activities, itemsById) };
  }, [date]);
}
