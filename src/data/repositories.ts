// Storage-agnostic repository contracts. The UI/domain depend ONLY on these.
// Today: Dexie (IndexedDB). Later: Capacitor SQLite / Withings / HealthKit
// can implement the same interfaces with zero changes to logic or screens.
import type {
  User, Goal, FoodItem, FoodEntry, ActivityEntry, WeightEntry,
} from '../domain/types';

export interface UserRepo {
  get(): Promise<User | undefined>;
  save(user: User): Promise<void>;
}
export interface GoalRepo {
  getActive(): Promise<Goal | undefined>;
  getAll(): Promise<Goal[]>;
  put(goal: Goal): Promise<void>;
}
export interface FoodItemRepo {
  all(includeArchived?: boolean): Promise<FoodItem[]>;
  put(item: FoodItem): Promise<void>;
  remove(id: string): Promise<void>;
}
export interface FoodEntryRepo {
  byDate(date: string): Promise<FoodEntry[]>;
  /** Fetch all entries in an inclusive ISO date range [start, end]. */
  byDateRange(start: string, end: string): Promise<FoodEntry[]>;
  add(entry: FoodEntry): Promise<void>;
  /** In-place update — preserves the entry's id and createdAt. */
  update(entry: FoodEntry): Promise<void>;
  remove(id: string): Promise<void>;
  /** Most-logged item ids for the "frequent foods" row, most-logged first.
   *  Only items logged at least `minCount` times are returned, so the row
   *  stays hidden until a real pattern emerges. */
  frequentItemIds(limit: number, minCount?: number): Promise<string[]>;
}
export interface ActivityEntryRepo {
  byDate(date: string): Promise<ActivityEntry[]>;
  /** Fetch all entries in an inclusive ISO date range [start, end]. */
  byDateRange(start: string, end: string): Promise<ActivityEntry[]>;
  add(entry: ActivityEntry): Promise<void>;
  /** In-place update — preserves the entry's id and createdAt. */
  update(entry: ActivityEntry): Promise<void>;
  remove(id: string): Promise<void>;
}
export interface WeightEntryRepo {
  all(): Promise<WeightEntry[]>;
  add(entry: WeightEntry): Promise<void>;
  /** One weigh-in per day: replaces any existing entry on entry.date.
   *  This is what makes "Update weight" actually change today's value. */
  upsertForDate(entry: WeightEntry): Promise<void>;
  /** Delete a specific weigh-in (used by the weight history edit sheet). */
  remove(id: string): Promise<void>;
}

export interface Repositories {
  user: UserRepo;
  goals: GoalRepo;
  foodItems: FoodItemRepo;
  foodEntries: FoodEntryRepo;
  activities: ActivityEntryRepo;
  weights: WeightEntryRepo;
  exportAll(): Promise<ExportBundle>;
}

export interface ExportBundle {
  version: 1;
  exportedAt: string;
  user: User | undefined;
  goals: Goal[];
  foodItems: FoodItem[];
  foodEntries: FoodEntry[];
  activityEntries: ActivityEntry[];
  weightEntries: WeightEntry[];
}
