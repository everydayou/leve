// Round 133: when a Food item's measurementType or referenceAmount changes,
// every stored quantity that referenced it under the OLD unit basis becomes
// wrong under the new one — a stored "100" that meant grams suddenly means
// servings (or vice versa), silently multiplying/dividing totals by 100+.
// This walks every FoodEntry and Meal that references the item and converts
// its stored quantity to the same physical amount under the new unit, so
// changing a Food item's serving setup doesn't retroactively corrupt
// everything already logged or built from it.
import { convertQuantity } from '../domain/calc';
import type { Repositories } from './repositories';
import type { MeasurementType } from '../domain/types';

export async function convertFoodItemReferences(
  repositories: Repositories,
  foodItemId: string,
  oldType: MeasurementType, oldRefAmount: number,
  newType: MeasurementType, newRefAmount: number,
): Promise<void> {
  if (oldType === newType && oldRefAmount === newRefAmount) return;
  const convert = (q: number) => convertQuantity(q, oldType, oldRefAmount, newType, newRefAmount);

  // Every Food entry across every date — plain pantry-linked entries, and
  // Meal entries whose mealData carries a per-item link to this Food item.
  const entries = await repositories.foodEntries.byDateRange('1970-01-01', '2999-12-31');
  for (const e of entries) {
    let next = e;
    let changed = false;

    if (e.foodItemId === foodItemId && e.quantity != null) {
      next = { ...next, quantity: convert(e.quantity) };
      changed = true;
    }

    if (e.mealData) {
      let itemsChanged = false;
      const items = e.mealData.items.map((mi) => {
        if (mi.foodItemId !== foodItemId) return mi;
        itemsChanged = true;
        return { ...mi, qty: convert(mi.qty ?? 1) };
      });
      if (itemsChanged) {
        next = { ...next, mealData: { ...next.mealData!, items } };
        changed = true;
      }
    }

    if (changed) await repositories.foodEntries.update(next);
  }

  // Reusable Pantry Meals containing this Food item.
  const meals = await repositories.meals.all(true);
  for (const m of meals) {
    if (!m.items.some((mi) => mi.foodItemId === foodItemId)) continue;
    const items = m.items.map((mi) =>
      mi.foodItemId === foodItemId ? { ...mi, quantity: convert(mi.quantity) } : mi);
    await repositories.meals.put({ ...m, items });
  }
}
