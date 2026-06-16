// In-memory implementation of the SAME Repositories interface used by the app.
// Used only for the double-click preview build (no IndexedDB needed, so it
// runs from a file:// URL). Demonstrates the storage-agnostic design: the UI
// and domain don't change at all to swap this in.
//
// The app boots CLEAN (blank user, no goal, empty pantry). Sample data is
// opt-in via seedMemoryDemo() — used by tests, not by the shipped demo.
import type { Repositories, ExportBundle } from './repositories';
import type {
  User, Goal, FoodItem, FoodEntry, ActivityEntry, WeightEntry,
} from '../domain/types';
import { nutritionFor } from '../domain/calc';
import { newId, todayISO, addDays } from './ids';

// --- tiny change bus so the UI re-renders after writes ---
const listeners = new Set<() => void>();
export const memoryBus = {
  subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); },
  emit() { listeners.forEach((fn) => fn()); },
};

// --- store ---
interface Store {
  user: User | undefined;
  goals: Goal[];
  foodItems: FoodItem[];
  foodEntries: FoodEntry[];
  activities: ActivityEntry[];
  weights: WeightEntry[];
}

const store: Store = {
  user: undefined,
  goals: [],
  foodItems: [],
  foodEntries: [],
  activities: [],
  weights: [],
};

/** Clean boot: a blank user so screens render, nothing else. */
export function resetMemory(): void {
  store.user = { id: 'me', heightCm: 0, units: 'kg', bmr: 0 };
  store.goals = [];
  store.foodItems = [];
  store.foodEntries = [];
  store.activities = [];
  store.weights = [];
  memoryBus.emit();
}

function mk(name: string, mt: FoodItem['measurementType'], ref: number, cal: number, p: number, c: number, fi: number, fa: number): FoodItem {
  return { id: newId(), name, measurementType: mt, referenceAmount: ref, calories: cal, protein: p, carbs: c, fiber: fi, fat: fa, isArchived: false };
}

/** Opt-in sample dataset for tests/playgrounds. Not used by the shipped app. */
export function seedMemoryDemo(): void {
  const today = todayISO();
  store.user = { id: 'me', heightCm: 181, units: 'kg', bmr: 1650, age: 34, sex: 'male' };
  store.goals = [{
    id: newId(), name: 'Summer Cut', type: 'lose_by_date',
    startWeightKg: 85, targetWeightKg: 81,
    startDate: addDays(today, -28), targetDate: addDays(today, 56), status: 'active',
  }];
  store.foodItems = [
    mk('Greek yogurt 0%', 'per_100g', 100, 59, 10, 3.6, 0, 0.4),
    mk('Chicken breast', 'per_100g', 100, 165, 31, 0, 0, 3.6),
    mk('Jasmine rice (cooked)', 'per_100g', 100, 130, 2.7, 28, 0.4, 0.3),
    mk('Rolled oats', 'per_100g', 100, 389, 17, 66, 10, 7),
    mk('Protein bar', 'per_serving', 1, 210, 20, 24, 9, 7),
    mk('Banana', 'per_serving', 1, 105, 1.3, 27, 3, 0.4),
    mk('Olive oil (1 tbsp)', 'per_serving', 1, 119, 0, 0, 0, 14),
    mk('Almonds (28g)', 'per_serving', 1, 164, 6, 6, 3.5, 14),
  ];
  const [yog, chk, rice] = store.foodItems;
  const banana = store.foodItems[5];
  const e = (item: FoodItem, qty: number, date = today): FoodEntry => ({
    id: newId(), date, foodItemId: item.id, quantity: qty, isManual: false,
    snapshot: nutritionFor(item, qty), createdAt: new Date().toISOString(),
  });
  // Today's log + enough repeats over prior days that a "frequent" pattern exists.
  store.foodEntries = [
    e(chk, 250), e(rice, 600), e(yog, 200), e(banana, 1),
    e(chk, 200, addDays(today, -1)), e(rice, 500, addDays(today, -1)), e(yog, 150, addDays(today, -1)),
    e(chk, 220, addDays(today, -2)), e(rice, 550, addDays(today, -2)), e(yog, 180, addDays(today, -2)),
  ];
  store.activities = [{ id: newId(), date: today, name: 'Bouldering', activeCalories: 350, createdAt: new Date().toISOString() }];
  store.weights = [
    { id: newId(), date: addDays(today, -28), weightKg: 85.0, source: 'manual' },
    { id: newId(), date: addDays(today, -14), weightKg: 83.2, source: 'manual' },
    { id: newId(), date: addDays(today, -7), weightKg: 82.1, source: 'manual' },
    { id: newId(), date: today, weightKg: 81.4, source: 'manual' },
  ];
  memoryBus.emit();
}

// Boot clean by default.
resetMemory();

const done = () => { memoryBus.emit(); return Promise.resolve(); };

export const memoryRepositories: Repositories = {
  user: {
    get: () => Promise.resolve(store.user),
    save: (u) => { store.user = u; return done(); },
  },
  goals: {
    getActive: () => Promise.resolve(store.goals.find((g) => g.status === 'active')),
    getAll: () => Promise.resolve([...store.goals]),
    put: (g) => { store.goals = [...store.goals.filter((x) => x.id !== g.id), g]; return done(); },
  },
  foodItems: {
    all: (inc = false) => Promise.resolve(
      store.foodItems.filter((i) => inc || !i.isArchived).sort((a, b) => a.name.localeCompare(b.name)),
    ),
    put: (i) => { store.foodItems = [...store.foodItems.filter((x) => x.id !== i.id), i]; return done(); },
    remove: (id) => { store.foodItems = store.foodItems.filter((x) => x.id !== id); return done(); },
  },
  foodEntries: {
    byDate: (d) => Promise.resolve(store.foodEntries.filter((e) => e.date === d)),
    byDateRange: (start, end) => Promise.resolve(store.foodEntries.filter((e) => e.date >= start && e.date <= end)),
    add: (e) => { store.foodEntries.push(e); return done(); },
    update: (e) => { store.foodEntries = store.foodEntries.map((x) => x.id === e.id ? e : x); return done(); },
    remove: (id) => { store.foodEntries = store.foodEntries.filter((e) => e.id !== id); return done(); },
    frequentItemIds: (limit, minCount = 1) => {
      const counts = new Map<string, number>();
      for (const e of store.foodEntries) if (e.foodItemId) counts.set(e.foodItemId, (counts.get(e.foodItemId) ?? 0) + 1);
      return Promise.resolve(
        [...counts.entries()]
          .filter(([, n]) => n >= minCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, limit)
          .map(([id]) => id),
      );
    },
  },
  activities: {
    byDate: (d) => Promise.resolve(store.activities.filter((a) => a.date === d)),
    byDateRange: (start, end) => Promise.resolve(store.activities.filter((a) => a.date >= start && a.date <= end)),
    add: (a) => { store.activities.push(a); return done(); },
    update: (a) => { store.activities = store.activities.map((x) => x.id === a.id ? a : x); return done(); },
    remove: (id) => { store.activities = store.activities.filter((a) => a.id !== id); return done(); },
  },
  weights: {
    all: () => Promise.resolve([...store.weights]),
    add: (w) => { store.weights.push(w); return done(); },
    remove: (id) => { store.weights = store.weights.filter((w) => w.id !== id); return done(); },
    upsertForDate: (w) => {
      store.weights = [...store.weights.filter((x) => x.date !== w.date), w];
      return done();
    },
  },
  exportAll: (): Promise<ExportBundle> => Promise.resolve({
    version: 1, exportedAt: new Date().toISOString(),
    user: store.user, goals: store.goals, foodItems: store.foodItems,
    foodEntries: store.foodEntries, activityEntries: store.activities, weightEntries: store.weights,
  }),
};
