import { newId } from './ids';
import type { FoodItem } from '../domain/types';
import type { FoodItemRepo } from './repositories';

/** A starter-pantry row. Macros are PER SERVING (the sheet's unit column was 1
 *  for every food); any amount is encoded in the name, e.g. "rice 100g". */
type SeedFood = Pick<FoodItem, 'name' | 'calories' | 'protein' | 'carbs' | 'fiber' | 'fat'>;

/** Marco's foods, transcribed from the two spreadsheet screenshots (emojis
 *  stripped). Sheet column order was kcal · carbs · protein · fiber · fat;
 *  mapped here to calories/protein/carbs/fiber/fat. Blank cells → 0. */
export const STARTER_PANTRY: SeedFood[] = [
  { name: 'avocado (150g)',        calories: 240,   carbs: 2,    protein: 3,     fiber: 10,   fat: 22 },
  { name: 'bacon',                 calories: 344,   carbs: 1,    protein: 13,    fiber: 0,    fat: 42 },
  { name: 'banana',                calories: 105,   carbs: 27,   protein: 1.3,   fiber: 3.1,  fat: 0.3 },
  { name: 'bread potato',          calories: 196,   carbs: 39,   protein: 6.7,   fiber: 2.6,  fat: 0.2 },
  { name: 'bread volkorn',         calories: 272,   carbs: 26,   protein: 14,    fiber: 8.5,  fat: 11 },
  { name: 'brioche butter',        calories: 510,   carbs: 64,   protein: 11,    fiber: 3.8,  fat: 0 },
  { name: 'blueberries (13)',      calories: 11,    carbs: 2.9,  protein: 0.15,  fiber: 0.5,  fat: 0.1 },
  { name: 'bockwurst',             calories: 248,   carbs: 0.9,  protein: 12.6,  fiber: 0,    fat: 0 },
  { name: 'bolacha',               calories: 53,    carbs: 6.4,  protein: 0.6,   fiber: 0,    fat: 2.7 },
  { name: 'boulette',              calories: 250,   carbs: 3,    protein: 20,    fiber: 0,    fat: 18 },
  { name: 'butter cookie',         calories: 118,   carbs: 14,   protein: 1.5,   fiber: 0,    fat: 6.2 },
  { name: 'cashews',               calories: 9,     carbs: 0.8,  protein: 0.2,   fiber: 0,    fat: 0.6 },
  { name: 'cereal bar',            calories: 134,   carbs: 17,   protein: 3.4,   fiber: 4.7,  fat: 5.7 },
  { name: 'cheesecake basque',     calories: 170,   carbs: 13,   protein: 6.27,  fiber: 0.5,  fat: 26 },
  { name: 'chestnuts',             calories: 160,   carbs: 31,   protein: 2.9,   fiber: 6.4,  fat: 1.1 },
  { name: 'cherry tomatos',        calories: 3,     carbs: 0.6,  protein: 0.1,   fiber: 0.2,  fat: 0 },
  { name: 'chia seeds',            calories: 486,   carbs: 8.6,  protein: 16.5,  fiber: 34.4, fat: 30.7 },
  { name: 'chicken 100g',          calories: 165,   carbs: 0,    protein: 31,    fiber: 0,    fat: 3.6 },
  { name: 'chicken* 150g',         calories: 200,   carbs: 1.5,  protein: 34,    fiber: 0,    fat: 6 },
  { name: 'coconut 100g',          calories: 354,   carbs: 6.2,  protein: 3.3,   fiber: 9,    fat: 33.5 },
  { name: 'coconut dry (25g)',     calories: 175,   carbs: 3,    protein: 1.8,   fiber: 0,    fat: 17 },
  { name: 'cookie digestive',      calories: 70,    carbs: 10,   protein: 1,     fiber: 0.5,  fat: 3 },
  { name: 'couscous 60g',          calories: 65,    carbs: 14,   protein: 2.5,   fiber: 0.9,  fat: 3 },
  { name: 'cream cheese inge 100g',calories: 94,    carbs: 4.7,  protein: 11,    fiber: 1.6,  fat: 2.6 },
  { name: 'crepe',                 calories: 201,   carbs: 14,   protein: 4.7,   fiber: 0,    fat: 9 },
  { name: 'egg',                   calories: 63,    carbs: 0.6,  protein: 5.5,   fiber: 0,    fat: 4.8 },
  { name: 'egg cream',             calories: 191,   carbs: 1.8,  protein: 10.3,  fiber: 0.4,  fat: 16.6 },
  { name: 'esparregado 100g',      calories: 55,    carbs: 3.4,  protein: 3.5,   fiber: 1.8,  fat: 2.6 },
  { name: 'fili / creme / ham',    calories: 40,    carbs: 4.4,  protein: 4.3,   fiber: 0,    fat: 0 },
  { name: 'filinchen',             calories: 20,    carbs: 3.8,  protein: 0.6,   fiber: 0.2,  fat: 0.3 },
  { name: 'ginger shot',           calories: 16,    carbs: 3,    protein: 0.1,   fiber: 0,    fat: 0 },
  { name: 'guacamole',             calories: 164,   carbs: 9.5,  protein: 2,     fiber: 7,    fat: 15 },
  { name: 'gut boltenhof kuchen',  calories: 377,   carbs: 34,   protein: 5,     fiber: 0,    fat: 26 },
  { name: 'lasanha rewe',          calories: 795,   carbs: 65,   protein: 32,    fiber: 7.5,  fat: 43 },
  { name: 'peanut butter 1/2',     calories: 19,    carbs: 0.5,  protein: 0.8,   fiber: 0,    fat: 0 },
  { name: 'peanut butter 1tbsp',   calories: 99,    carbs: 2.5,  protein: 4,     fiber: 0,    fat: 8 },
  { name: 'pizza',                 calories: 907,   carbs: 79,   protein: 33,    fiber: 7.9,  fat: 46.8 },
  { name: 'potatos 100g',          calories: 77,    carbs: 15,   protein: 2,     fiber: 2.2,  fat: 0.1 },
  { name: 'quark bowl',            calories: 353,   carbs: 33,   protein: 34.6,  fiber: 4.4,  fat: 8.6 },
  { name: 'queijinho de azeitão',  calories: 213,   carbs: 26,   protein: 4.2,   fiber: 0,    fat: 9.2 },
  { name: 'rice 100g',             calories: 130,   carbs: 28,   protein: 2.7,   fiber: 0.4,  fat: 0.3 },
  { name: 'salad',                 calories: 78.8,  carbs: 3.5,  protein: 5.2,   fiber: 0.6,  fat: 5 },
  { name: 'salad chia',            calories: 136.8, carbs: 5.5,  protein: 7.2,   fiber: 4.6,  fat: 8.6 },
  { name: 'salad +',               calories: 360,   carbs: 18,   protein: 18,    fiber: 0,    fat: 0 },
  { name: 'salmon',                calories: 208,   carbs: 0,    protein: 20,    fiber: 0,    fat: 13 },
  { name: 'shake',                 calories: 113,   carbs: 1.7,  protein: 24,    fiber: 0,    fat: 0.4 },
  { name: 'spinach 75g',           calories: 17,    carbs: 2.7,  protein: 2.1,   fiber: 0,    fat: 0.3 },
  { name: 'toast + cheese',        calories: 150,   carbs: 2.6,  protein: 6,     fiber: 0,    fat: 10 },
  { name: 'toast butter',          calories: 155,   carbs: 15,   protein: 3.3,   fiber: 2.3,  fat: 2.3 },
  { name: 'tosta mista',           calories: 345,   carbs: 30,   protein: 16.6,  fiber: 5,    fat: 14.6 },
  { name: 'tremoços 60g',          calories: 65,    carbs: 5.5,  protein: 8,     fiber: 3.5,  fat: 2 },
  { name: 'veggies',               calories: 101,   carbs: 8.1,  protein: 2.7,   fiber: 3.7,  fat: 0.87 },
  { name: 'waffle',                calories: 513,   carbs: 63,   protein: 7,     fiber: 2,    fat: 25 },
  { name: 'walnut',                calories: 13,    carbs: 0.2,  protein: 0.3,   fiber: 0.14, fat: 1.3 },
];

const FLAG = 'starterPantryImported.v1';

/** One-time, idempotent import of the starter pantry into the live store.
 *  - Adds only foods whose name isn't already present (case/space-insensitive),
 *    so it never duplicates and never clobbers an item you've edited.
 *  - Guarded by a localStorage flag so it runs once and a food you later delete
 *    doesn't reappear on the next launch.
 *  Stored per-serving (unit = 1), matching the sheet. */
export async function importStarterPantry(foodItems: FoodItemRepo): Promise<void> {
  try { if (localStorage.getItem(FLAG)) return; } catch { /* storage may be unavailable */ }

  const existing = await foodItems.all(true);
  const have = new Set(existing.map((i) => i.name.trim().toLowerCase()));

  for (const f of STARTER_PANTRY) {
    if (have.has(f.name.trim().toLowerCase())) continue;
    await foodItems.put({
      id: newId(),
      name: f.name,
      measurementType: 'per_serving',
      referenceAmount: 1,
      calories: f.calories,
      protein: f.protein,
      carbs: f.carbs,
      fiber: f.fiber,
      fat: f.fat,
      isArchived: false,
    });
  }

  try { localStorage.setItem(FLAG, '1'); } catch { /* ignore */ }
}
