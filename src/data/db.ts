import Dexie, { type Table } from 'dexie';
import type {
  User, Goal, FoodItem, FoodEntry, ActivityEntry, WeightEntry,
} from '../domain/types';

export const PROFILE_KEY = 'ngt-active-profile';
export const TEST_PROFILE = 'test';
export const REAL_PROFILE = 'real';
export const DB_NAMES: Record<string, string> = {
  [REAL_PROFILE]: 'nutrition-goal-tracker',
  [TEST_PROFILE]: 'nutrition-goal-tracker-test',
};

/** Which profile is currently active — read once at module init. */
export const activeProfile =
  (typeof localStorage !== 'undefined' && localStorage.getItem(PROFILE_KEY)) === TEST_PROFILE
    ? TEST_PROFILE
    : REAL_PROFILE;

export class NgtDatabase extends Dexie {
  users!: Table<User, string>;
  goals!: Table<Goal, string>;
  foodItems!: Table<FoodItem, string>;
  foodEntries!: Table<FoodEntry, string>;
  activityEntries!: Table<ActivityEntry, string>;
  weightEntries!: Table<WeightEntry, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      users: 'id',
      goals: 'id, status',
      foodItems: 'id, isArchived, name',
      foodEntries: 'id, date, foodItemId',
      activityEntries: 'id, date',
      weightEntries: 'id, date',
    });
  }
}

export const db = new NgtDatabase(DB_NAMES[activeProfile]);
