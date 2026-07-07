import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useLive } from '../../state/live';
import { repos } from '../../state/repos';
import { newId } from '../../data/ids';
import { itemsByIdMap, mealNutritionFor, mealPhotoFor, nutritionFor } from '../../domain/calc';

import { Button, Sheet, EmptyState, Icon } from '../kit';
import { useKeyboardDoneBar } from '../kit/useKeyboardDoneBar';
import { Thumb } from '../components/PhotoPicker';
import { FoodItemFormContent } from '../components/FoodItemForm';
import type { FoodItemFormValues } from '../components/FoodItemForm';
import { PantryFoodItemDetail } from '../components/PantryFoodItemDetail';
import { PantryMealDetail } from '../components/PantryMealDetail';
import { PantryNewFood } from '../components/PantryNewFoodScan';

import { hapticLight } from '../../lib/haptics';
import type { DayContext } from '../AppShell';
import type { FoodItem, Meal, NutritionSnapshot } from '../../domain/types';

/* Round 177: replaced the old single-select All/Food items/Meals radio
   pills with 3 independent toggle pills — Food items / Meals / My own.
   None checked = no restriction (show everything); "Food items" and
   "Meals" union together when both are checked (same effect as neither);
   "My own" is a separate, independent restriction to origin:'user' items,
   layered on top of whichever type(s) are showing — not a 3-way OR across
   all three pills. Meals have no app-provided concept (only Food items get
   seeded), so "My own" is meaningless — and disabled — whenever the type
   selection resolves to Meals-only. */
type PantryRow =
  | { type: 'item'; id: string; name: string; photo?: string; nutrition: NutritionSnapshot; origin?: 'app' | 'user' }
  | { type: 'meal'; id: string; name: string; photo?: string; nutrition: NutritionSnapshot };

export function PantryScreen() {
  const { showToast } = useOutletContext<DayContext>();
  const [q, setQ] = useState('');
  const searchDoneBar = useKeyboardDoneBar();
  const [showItems, setShowItems] = useState(false);
  const [showMeals, setShowMeals] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const mealsOnly = showMeals && !showItems;
  // Meals-only has no origin distinction to filter by (every Meal is
  // user-made) — auto-uncheck "My own" the moment that state is entered,
  // from either direction. Done inline in each toggle handler (not a
  // useEffect+setState, which reliably cascades an extra render for what
  // is really just one user action with two state updates).
  function toggleShowItems() {
    setShowItems((v) => {
      const next = !v;
      if (!next && showMeals) setMineOnly(false); // entering meals-only
      return next;
    });
  }
  function toggleShowMeals() {
    setShowMeals((v) => {
      const next = !v;
      if (next && !showItems) setMineOnly(false); // entering meals-only
      return next;
    });
  }
  const [newFoodOpen, setNewFoodOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  // Tracks whether `openItemId` was just created by a scan (vs. opened by
  // tapping an existing row) — drives PantryFoodItemDetail's CTA copy (round 150).
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);
  const [openMealId, setOpenMealId] = useState<string | null>(null);
  // Which of the freshly-opened Meal's own ingredients came from a scan
  // (vs. Manual/Add-from-pantry) — seeds PantryMealDetail's "Change" button
  // availability (round 150).
  const [justCreatedMealItemIds, setJustCreatedMealItemIds] = useState<string[] | undefined>(undefined);

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
    type: 'item', id: i.id, name: i.name, photo: i.photo, origin: i.origin,
    nutrition: nutritionFor(i, i.measurementType === 'per_100g' ? i.referenceAmount : 1),
  }));
  const mealRows: PantryRow[] = meals.map((m: Meal) => ({
    type: 'meal', id: m.id, name: m.name, photo: mealPhotoFor(m, itemsById), nutrition: mealNutritionFor(m, itemsById),
  }));
  const allRows = [...itemRows, ...mealRows].sort((a, b) => a.name.localeCompare(b.name));
  // Food items/Meals union together (checking both = same result as
  // checking neither); "My own" then independently narrows the result to
  // origin:'user' items, always passing Meal rows through untouched since
  // every Meal is inherently "my own".
  const typeRows = !showItems && !showMeals
    ? allRows
    : [...(showItems ? itemRows : []), ...(showMeals ? mealRows : [])].sort((a, b) => a.name.localeCompare(b.name));
  const originRows = mineOnly
    ? typeRows.filter((r) => r.type === 'meal' || (r.origin ?? 'user') === 'user')
    : typeRows;
  const rows = originRows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));

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
        <Button variant="ghost" size="sm" fullWidth={false} className="!font-normal !text-accent-hover -mr-3.5" onClick={() => setNewFoodOpen(true)}>+ New food</Button>
      </header>

      <div className="px-6">
        {/* Search — pill shape, sunken bg. Border is transparent at rest,
            accent on focus-within. Input itself has no outline. */}
        <div className="mt-3 flex items-center gap-2 rounded-pill border border-transparent bg-surface-sunken px-4 py-2.5 transition-colors focus-within:border-accent">
          <Icon name="search" size={18} className="shrink-0 text-content-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={searchDoneBar.bind.onFocus}
            onBlur={searchDoneBar.bind.onBlur}
            placeholder="Search foods…"
            className="w-full bg-transparent text-subhead text-content placeholder:text-content-muted"
            style={{ outline: 'none' }}
          />
          {q && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setQ('')}
              aria-label="Clear search"
              // 44x44 tap target (round 182) via pad + matching negative
              // margin, same technique as LabeledInput/Field — keeps the
              // pill's visual height unchanged.
              className="-m-[14px] flex shrink-0 items-center justify-center p-[14px] text-content-muted active:text-content"
            >
              <Icon name="close" size={16} strokeWidth={2.25} />
            </button>
          )}
        </div>
        {searchDoneBar.doneBar}
        {/* Food items / Meals / My own — round 177's 3 independent toggle
            pills, replacing the old single-select All/Food items/Meals
            radio (round 123 had replaced All/per100g/perServing with that).
            Same pill look as FilterPills' selected/unselected states
            (kept bespoke here rather than extending the shared component,
            since FilterPills' other 3 call sites are all single-select and
            shouldn't have to carry this toggle-plus-disabled behaviour). */}
        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              { key: 'items' as const, label: 'Food items', active: showItems, disabled: false, toggle: toggleShowItems },
              { key: 'meals' as const, label: 'Meals', active: showMeals, disabled: false, toggle: toggleShowMeals },
              { key: 'mine' as const, label: 'My own', active: mineOnly, disabled: mealsOnly, toggle: () => setMineOnly((v) => !v) },
            ]
          ).map((pill) => (
            <button
              key={pill.key}
              disabled={pill.disabled}
              onClick={() => { hapticLight(); pill.toggle(); }}
              aria-pressed={pill.active}
              className={`rounded-pill border px-3.5 py-1.5 text-subhead font-medium transition active:scale-95
                ${pill.disabled
                  ? 'border-transparent bg-surface-sunken text-content-muted opacity-50'
                  : pill.active
                  ? 'border-border-field bg-surface text-accent-hover shadow-card'
                  : 'border-transparent bg-surface-sunken text-content'}`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {!loading && (
        <>
          <p className="px-6 pt-4 text-callout font-bold text-content">{rows.length} {mealsOnly ? 'meals' : 'items'}</p>
          <div className="mx-6 mt-1 overflow-hidden rounded-card border border-border-subtle bg-surface">
            <ul className="divide-y divide-border-subtle">
              {rows.map((row) => (
                <li key={`${row.type}-${row.id}`}>
                  <button onClick={() => openRow(row)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-sunken">
                    <Thumb photo={row.photo} radius="rounded-[8px]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-callout font-bold leading-[1.2] text-content">{row.name}</p>
                      <p className="mt-[4px] text-subhead leading-none text-content-secondary">{row.type === 'item' ? 'Food item' : 'Meal'}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-callout leading-[1.2] text-content">{row.nutrition.calories} kcal</p>
                      <p className="mt-[4px] text-subhead leading-none text-content-secondary">{Math.round(row.nutrition.protein)}g Protein</p>
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
                      action={<Button icon="plus" onClick={() => setNewFoodOpen(true)}>New food</Button>}
                    />
                  ) : (
                    <p className="px-6 py-10 text-center text-subhead text-content-muted">No {mealsOnly ? 'meals' : showItems ? 'foods' : 'results'} match.</p>
                  )}
                </li>
              )}
            </ul>
          </div>
        </>
      )}

      {newFoodOpen && (
        <PantryNewFood
          items={items}
          meals={meals}
          onClose={() => setNewFoodOpen(false)}
          onManual={() => { setNewFoodOpen(false); setAdding(true); }}
          onFoodCreated={(id) => { setNewFoodOpen(false); setJustCreatedId(id); setOpenItemId(id); }}
          onMealCreated={(meal) => { setNewFoodOpen(false); setJustCreatedMealItemIds(meal.items.map((mi) => mi.foodItemId)); setOpenMealId(meal.id); }}
          showToast={showToast}
        />
      )}

      {adding && (
        <Sheet title="New food" onClose={() => setAdding(false)} forceExpanded>
          <FoodItemFormContent
            mode="pantry-new"
            existingItems={items}
            existingMeals={meals}
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
          justCreated={openItemId === justCreatedId}
          onClose={() => { setOpenItemId(null); setJustCreatedId(null); }}
          onDeleted={() => { setOpenItemId(null); setJustCreatedId(null); }}
          onMealCreated={(meal, newlyScannedItemIds) => { setOpenItemId(null); setJustCreatedId(null); setJustCreatedMealItemIds(newlyScannedItemIds); setOpenMealId(meal.id); }}
          showToast={showToast}
        />
      )}

      {openMealId && (
        <PantryMealDetail
          mealId={openMealId}
          meals={meals}
          items={items}
          allItems={allItems}
          justCreatedItemIds={justCreatedMealItemIds}
          onClose={() => { setOpenMealId(null); setJustCreatedMealItemIds(undefined); }}
          showToast={showToast}
        />
      )}
    </div>
  );
}
