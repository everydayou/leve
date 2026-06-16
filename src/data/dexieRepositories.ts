import { db } from './db';
import type { Repositories, ExportBundle } from './repositories';

export const dexieRepositories: Repositories = {
  user: {
    get: () => db.users.toCollection().first(),
    save: async (u) => { await db.users.put(u); },
  },
  goals: {
    getActive: () => db.goals.where('status').equals('active').first(),
    getAll: () => db.goals.toArray(),
    put: async (g) => { await db.goals.put(g); },
  },
  foodItems: {
    all: async (includeArchived = false) => {
      const items = await db.foodItems.toArray();
      const visible = includeArchived ? items : items.filter((i) => !i.isArchived);
      return visible.sort((a, b) => a.name.localeCompare(b.name));
    },
    put: async (i) => { await db.foodItems.put(i); },
    remove: async (id) => { await db.foodItems.delete(id); },
  },
  foodEntries: {
    byDate: (date) => db.foodEntries.where('date').equals(date).toArray(),
    byDateRange: (start, end) => db.foodEntries.where('date').between(start, end, true, true).toArray(),
    add: async (e) => { await db.foodEntries.add(e); },
    update: async (e) => { await db.foodEntries.put(e); },
    remove: async (id) => { await db.foodEntries.delete(id); },
    frequentItemIds: async (limit, minCount = 1) => {
      const all = await db.foodEntries.toArray();
      const counts = new Map<string, number>();
      for (const e of all) {
        if (e.foodItemId) counts.set(e.foodItemId, (counts.get(e.foodItemId) ?? 0) + 1);
      }
      return [...counts.entries()]
        .filter(([, n]) => n >= minCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([id]) => id);
    },
  },
  activities: {
    byDate: (date) => db.activityEntries.where('date').equals(date).toArray(),
    byDateRange: (start, end) => db.activityEntries.where('date').between(start, end, true, true).toArray(),
    add: async (e) => { await db.activityEntries.add(e); },
    update: async (e) => { await db.activityEntries.put(e); },
    remove: async (id) => { await db.activityEntries.delete(id); },
  },
  weights: {
    all: () => db.weightEntries.toArray(),
    add: async (e) => { await db.weightEntries.add(e); },
    remove: async (id) => { await db.weightEntries.delete(id); },
    upsertForDate: (e) =>
      db.transaction('rw', db.weightEntries, async () => {
        await db.weightEntries.where('date').equals(e.date).delete();
        await db.weightEntries.add(e);
      }),
  },
  exportAll: async (): Promise<ExportBundle> => ({
    version: 1,
    exportedAt: new Date().toISOString(),
    user: await db.users.toCollection().first(),
    goals: await db.goals.toArray(),
    foodItems: await db.foodItems.toArray(),
    foodEntries: await db.foodEntries.toArray(),
    activityEntries: await db.activityEntries.toArray(),
    weightEntries: await db.weightEntries.toArray(),
  }),
};
