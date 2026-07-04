// "Add from pantry" — search + All/Food items/Meal pills + row list for
// picking an EXISTING reusable Food item or Meal to add into a meal that's
// being built (round 124). Deliberately reuses the exact same row shape and
// filter pills as PantryScreen's own list — same visual language whether
// you're browsing the Pantry or picking from it mid-flow.
import { useState } from 'react';
import { itemsByIdMap, mealNutritionFor, mealPhotoFor, nutritionFor } from '../../domain/calc';
import { FilterPills, Icon } from '../kit';
import { Thumb } from './PhotoPicker';
import type { FoodItem, Meal, NutritionSnapshot } from '../../domain/types';

type PantryFilter = 'all' | 'items' | 'meals';
type PantryRow =
  | { type: 'item'; id: string; name: string; photo?: string; nutrition: NutritionSnapshot }
  | { type: 'meal'; id: string; name: string; photo?: string; nutrition: NutritionSnapshot };

export function PantryPicker({
  items, allItems, meals, excludeItemIds = [], excludeMealIds = [], onPickItem, onPickMeal,
}: {
  /** VISIBLE Food items — the ones offered as pickable rows. */
  items: FoodItem[];
  /** ALL Food items, including ones hidden from Pantry because they only
   *  exist to complete some other meal (round 130). A listed Meal's own
   *  nutrition/photo needs to resolve against this, or a hidden ingredient
   *  would silently drop out of that Meal's totals. Defaults to `items`. */
  allItems?: FoodItem[];
  meals: Meal[];
  /** Food items already in the meal being built — hidden to avoid confusing duplicates. */
  excludeItemIds?: string[];
  /** The meal currently being edited (if any) — hidden from its own picker. */
  excludeMealIds?: string[];
  onPickItem: (item: FoodItem) => void;
  onPickMeal: (meal: Meal) => void;
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<PantryFilter>('all');
  const itemsById = itemsByIdMap(allItems ?? items);

  const visibleItems = items.filter((i) => !excludeItemIds.includes(i.id));
  const visibleMeals = meals.filter((m) => !excludeMealIds.includes(m.id));

  const itemRows: PantryRow[] = visibleItems.map((i) => ({
    type: 'item', id: i.id, name: i.name, photo: i.photo,
    nutrition: nutritionFor(i, i.measurementType === 'per_100g' ? i.referenceAmount : 1),
  }));
  const mealRows: PantryRow[] = visibleMeals.map((m) => ({
    type: 'meal', id: m.id, name: m.name, photo: mealPhotoFor(m, itemsById), nutrition: mealNutritionFor(m, itemsById),
  }));
  const allRows = [...itemRows, ...mealRows].sort((a, b) => a.name.localeCompare(b.name));
  const rowsForFilter = filter === 'items' ? itemRows : filter === 'meals' ? mealRows : allRows;
  const rows = rowsForFilter.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));

  function pick(row: PantryRow) {
    if (row.type === 'item') {
      const item = visibleItems.find((i) => i.id === row.id);
      if (item) onPickItem(item);
    } else {
      const meal = visibleMeals.find((m) => m.id === row.id);
      if (meal) onPickMeal(meal);
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative rounded-full bg-surface-sunken overflow-hidden">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-content-muted">
          <Icon name="search" size={16} strokeWidth={2} />
        </span>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search foods…"
          autoComplete="off"
          style={{ WebkitAppearance: 'none', appearance: 'none' }}
          className="w-full py-3 pl-10 pr-4 text-body text-content placeholder:text-content-muted outline-none bg-transparent"
        />
      </div>

      <FilterPills<PantryFilter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All' },
          { value: 'items', label: 'Food items' },
          { value: 'meals', label: 'Meals' },
        ]}
      />

      <div className="overflow-hidden rounded-[16px] bg-surface divide-y divide-border-subtle">
        {rows.map((row) => (
          <button
            key={`${row.type}-${row.id}`}
            onClick={() => pick(row)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-sunken"
          >
            <Thumb photo={row.photo} radius="rounded-[10px]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-subhead font-bold leading-[1.2] text-content">{row.name}</p>
              <p className="mt-[4px] text-subhead leading-none text-content-secondary">{row.type === 'item' ? 'Food item' : 'Meal'}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-subhead leading-[1.2] text-content">{row.nutrition.calories} kcal</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); pick(row); }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-black active:opacity-80"
              aria-label={`Add ${row.name}`}
            >
              <Icon name="plus" size={16} strokeWidth={2.5} />
            </button>
          </button>
        ))}
        {rows.length === 0 && (
          <p className="py-6 text-center text-subhead text-content-secondary">No results</p>
        )}
      </div>
    </div>
  );
}
