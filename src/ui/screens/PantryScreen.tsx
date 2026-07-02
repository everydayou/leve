import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useLive } from '../../state/live';
import { repos } from '../../state/repos';
import { newId } from '../../data/ids';
import { itemsByIdMap, mealNutritionFor, mealPhotoFor, nutritionFor } from '../../domain/calc';

import { Button, FilterPills, Sheet, EmptyState, Icon } from '../kit';
import { Thumb } from '../components/PhotoPicker';
import { FoodItemFormContent } from '../components/FoodItemForm';
import type { FoodItemFormValues } from '../components/FoodItemForm';
import { PantryFoodItemDetail } from '../components/PantryFoodItemDetail';
import { PantryMealDetail } from '../components/PantryMealDetail';

import { hapticLight } from '../../lib/haptics';
import type { DayContext } from '../AppShell';
import type { FoodItem, Meal, NutritionSnapshot } from '../../domain/types';

type PantryFilter = 'all' | 'items' | 'meals';
type PantryRow =
  | { type: 'item'; id: string; name: string; photo?: string; nutrition: NutritionSnapshot }
  | { type: 'meal'; id: string; name: string; photo?: string; nutrition: NutritionSnapshot };

export function PantryScreen() {
  const { showToast } = useOutletContext<DayContext>();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<PantryFilter>('all');
  const [adding, setAdding] = useState(false);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [openMealId, setOpenMealId] = useState<string | null>(null);

  // rawItems/rawMeals are null while IndexedDB is still loading; [] means truly empty.
  // Keep them separate so we never flash the EmptyState before data arrives.
  //
  // rawItems is the FULL set (includeArchived) — a Meal's ingredients can
  // include Food items created purely to complete that meal (round 130:
  // these default to isArchived:true, hidden from the Pantry list until the
  // user explicitly opts them in from their own edit view). Nutrition/photo
  // lookups for Meals must resolve against the full set, or a meal-only
  // ingredient would silently vanish from its own Meal's totals. The visible
  // Food-items list, and everything downstream that lets the user pick an
  // "existing pantry item" (new-food duplicate check, Add-from-pantry),
  // filters archived ones back out.
  const rawItems = useLive(() => repos.foodItems.all(true), []);
  const rawMeals = useLive(() => repos.meals.all(), []);
  const allItems = rawItems ?? [];
  const items = allItems.filter((i) => !i.isArchived);
  const meals = rawMeals ?? [];
  const itemsById = itemsByIdMap(allItems);
  const loading = rawItems == null || rawMeals == null;

  const itemRows: PantryRow[] = items.map((i: FoodItem) => ({
    type: 'item', id: i.id, name: i.name, photo: i.photo,
    nutrition: nutritionFor(i, i.measurementType === 'per_100g' ? i.referenceAmount : 1),
  }));
  const mealRows: PantryRow[] = meals.map((m: Meal) => ({
    type: 'meal', id: m.id, name: m.name, photo: mealPhotoFor(m, itemsById), nutrition: mealNutritionFor(m, itemsById),
  }));
  const allRows = [...itemRows, ...mealRows].sort((a, b) => a.name.localeCompare(b.name));
  const rowsForFilter = filter === 'items' ? itemRows : filter === 'meals' ? mealRows : allRows;
  const rows = rowsForFilter.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));

  const openItem = openItemId ? items.find((i) => i.id === openItemId) : undefined;
  const isEmpty = items.length === 0 && meals.length === 0;

  async function handleCreateFood(values: FoodItemFormValues) {
    const id = newId();
    await repos.foodItems.put({
      id, name: values.name, measurementType: values.measurementType, referenceAmount: values.referenceAmount,
      calories: values.calories, protein: values.protein, carbs: values.carbs, fiber: values.fiber, fat: values.fat,
      photo: values.photo, isArchived: false,
    });
    setAdding(false);
    setOpenItemId(id); // land on Food item detail (spec §3)
  }

  function openRow(row: PantryRow) {
    hapticLight();
    if (row.type === 'item') setOpenItemId(row.id);
    else setOpenMealId(row.id);
  }

  return (
    <div className="pb-6">
      <header className="flex items-start justify-between px-6 pt-4">
        <h1 className="text-title font-semibold">Pantry</h1>
        <Button variant="ghost" size="sm" fullWidth={false} className="!font-normal !text-accent-hover -mr-3.5" onClick={() => setAdding(true)}>+ New food</Button>
      </header>

      <div className="px-6">
        {/* Search — pill shape, sunken bg. Border is transparent at rest,
            accent on focus-within. Input itself has no outline. */}
        <div className="mt-3 flex items-center gap-2 rounded-pill border border-transparent bg-surface-sunken px-4 py-2.5 transition-colors focus-within:border-accent">
          <Icon name="search" size={18} className="shrink-0 text-content-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search foods…"
            className="w-full bg-transparent text-subhead text-content placeholder:text-content-muted"
            style={{ outline: 'none' }}
          />
          {q && (
            <button
              onClick={() => setQ('')}
              aria-label="Clear search"
              className="shrink-0 text-content-muted active:text-content"
            >
              <Icon name="close" size={16} strokeWidth={2.25} />
            </button>
          )}
        </div>
        {/* All / Food items / Meals — replaces the old All/per100g/perServing
            pills (round 123): the meaningful split in Pantry is now what KIND
            of reusable object something is, not its serving-unit setup. */}
        <FilterPills<PantryFilter>
          className="mt-3"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'items', label: 'Food items' },
            { value: 'meals', label: 'Meals' },
          ]}
        />
      </div>

      {!loading && (
        <>
          <p className="px-6 pt-4 text-callout font-bold text-content">{rows.length} {filter === 'meals' ? 'meals' : 'items'}</p>
          <div className="mx-6 mt-1 overflow-hidden rounded-card border border-border-subtle bg-surface">
            <ul className="divide-y divide-border-subtle">
              {rows.map((row) => (
                <li key={`${row.type}-${row.id}`}>
                  <button onClick={() => openRow(row)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-sunken">
                    <Thumb photo={row.photo} radius="rounded-[8px]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-callout font-normal leading-[1.2] text-content">{row.name}</p>
                      <p className="mt-[4px] text-subhead leading-none text-content-secondary">{row.type === 'item' ? 'Food item' : 'Meal'}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-callout font-bold leading-[1.2] text-content">{row.nutrition.calories} kcal</p>
                      <p className="mt-[4px] text-subhead leading-none text-content-secondary">{row.nutrition.protein}g Protein</p>
                    </div>
                  </button>
                </li>
              ))}
              {rows.length === 0 && (
                <li>
                  {isEmpty ? (
                    <EmptyState
                      icon="foodIcon"
                      title="Your pantry is empty"
                      description="Add foods you eat often so you can log them in one tap."
                      action={<Button icon="plus" onClick={() => setAdding(true)}>New food</Button>}
                    />
                  ) : (
                    <p className="px-6 py-10 text-center text-subhead text-content-muted">No {filter === 'meals' ? 'meals' : filter === 'items' ? 'foods' : 'results'} match.</p>
                  )}
                </li>
              )}
            </ul>
          </div>
        </>
      )}

      {adding && (
        <Sheet title="New food" onClose={() => setAdding(false)} forceExpanded>
          <FoodItemFormContent
            mode="pantry-new"
            existingItems={items}
            onSave={handleCreateFood}
            onCancel={() => setAdding(false)}
          />
        </Sheet>
      )}

      {openItem && (
        <PantryFoodItemDetail
          item={openItem}
          items={items}
          allItems={allItems}
          meals={meals}
          onClose={() => setOpenItemId(null)}
          onDeleted={() => setOpenItemId(null)}
          onMealCreated={(meal) => { setOpenItemId(null); setOpenMealId(meal.id); }}
          showToast={showToast}
        />
      )}

      {openMealId && (
        <PantryMealDetail
          mealId={openMealId}
          meals={meals}
          items={items}
          allItems={allItems}
          onClose={() => setOpenMealId(null)}
          showToast={showToast}
        />
      )}
    </div>
  );
}
