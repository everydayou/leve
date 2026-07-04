// Pure basket types/helpers shared by the Day's-log basket (AddEntrySheet.tsx)
// and the Pantry meal builder's capture flow (useFoodCapture.tsx). Kept in
// their own plain (non-component) file — mixing these with component
// exports in one file trips eslint-plugin-react-refresh's
// only-export-components rule.
import { newId } from '../../data/ids';
import type { FoodItem, NutritionSnapshot } from '../../domain/types';

export type BasketItem = {
  id: string;
  name: string;
  /** Stored as literal union to avoid importing MeasurementType here. */
  measurementType: 'per_100g' | 'per_serving';
  /** 100 for per_100g; grams-per-serving for per_serving. */
  referenceAmount: number;
  /** Macros at referenceAmount (not at current qty). */
  calories: number;
  protein: number;
  carbs: number;
  fiber: number;
  fat: number;
  /** Current quantity: grams (per_100g) or servings (per_serving). */
  qty: number;
  /** Links to a SourceGroup photo (scan or pantry photo). */
  sourceId?: string;
  /** Set when item was added from the pantry. */
  pantryItemId?: string;
};

export type SourceGroup = { id: string; photo: string };

export function basketNutrition(item: BasketItem): NutritionSnapshot {
  const s = item.measurementType === 'per_100g' ? item.qty / 100 : item.qty;
  return {
    calories: Math.round(item.calories * s),
    protein:  Math.round(item.protein  * s * 10) / 10,
    carbs:    Math.round(item.carbs    * s * 10) / 10,
    fiber:    Math.round(item.fiber    * s * 10) / 10,
    fat:      Math.round(item.fat      * s * 10) / 10,
  };
}

export function pantryToBasket(item: FoodItem, sourceId?: string): BasketItem {
  return {
    id: newId(),
    name: item.name,
    measurementType: item.measurementType,
    referenceAmount: item.referenceAmount,
    calories: item.calories,
    protein:  item.protein,
    carbs:    item.carbs,
    fiber:    item.fiber,
    fat:      item.fat,
    qty: item.measurementType === 'per_100g' ? 100 : 1,
    sourceId,
    pantryItemId: item.id,
  };
}

/** Strip parenthetical descriptors and cap to 22 chars at a word boundary.
 *  Scan results often return verbose names like "Sourdough bread (toasted, partial slice)"
 *  — this normalises them to concise meal names. */
export function cleanScanName(raw: string): string {
  // Remove trailing parenthetical description: "Bread (with butter)" → "Bread"
  let name = raw.replace(/\s*\([^)]*\)$/, '').trim();
  // Also strip " - description" suffixes
  name = name.replace(/\s+[-–]\s+.+$/, '').trim();
  if (name.length <= 22) return name;
  // Truncate at last word boundary within 22 chars
  const truncated = name.slice(0, 22).replace(/\s+\S*$/, '').trim();
  return truncated || name.slice(0, 22).trim();
}

export function scanResultToBasket(
  r: { name: string; estimatedGrams: number; calories: number; protein: number; carbs: number; fiber: number; fat: number },
  sourceId: string,
): BasketItem {
  const grams = Math.max(Number(r.estimatedGrams) || 100, 1);
  const f = 100 / grams;
  return {
    id: newId(),
    name: cleanScanName(r.name),
    measurementType: 'per_100g',
    referenceAmount: 100,
    calories: (Number(r.calories) || 0) * f,
    protein:  (Number(r.protein)  || 0) * f,
    carbs:    (Number(r.carbs)    || 0) * f,
    fiber:    (Number(r.fiber)    || 0) * f,
    fat:      (Number(r.fat)      || 0) * f,
    qty: grams,
    sourceId,
  };
}
