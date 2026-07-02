// Pantry → Meal detail (meals-in-pantry spec §5). A Meal never stores its
// own macros — nutrition for every item (and, later, the whole Meal) is
// always computed live from the current Food items via mealNutritionFor(),
// so editing an ingredient elsewhere instantly reflects here too.
//
// Per-item edit uses the same right-to-left overlay as Food item detail /
// the Day's-log basket's EditOverlay — split into an outer Sheet wrapper +
// inner content component so the content is a true child of Sheet's context.
import { useEffect, useRef, useState } from 'react';
import { repos } from '../../state/repos';
import { newId } from '../../data/ids';
import { nutritionFor } from '../../domain/calc';
import { Button, LabeledInput, Sheet, OverlayNav, useSheetSetOverlay } from '../kit';
import { PantryItemCard } from './PantryItemCard';
import { AddAnotherSection, MethodCards } from './MethodCards';
import { DeleteIcon } from './icons';
import { FoodItemFormContent } from './FoodItemForm';
import type { FoodItemFormValues } from './FoodItemForm';
import type { ShowToast } from './Toaster';
import type { FoodItem, Meal } from '../../domain/types';

function servingLabelFor(item: FoodItem, quantity: number): string {
  return item.measurementType === 'per_100g' ? `${quantity}g` : `${quantity} Srv`;
}

export function PantryMealDetail({
  mealId, meals, items, onClose, showToast,
}: {
  mealId: string;
  /** Live meals list from the parent — keeps this sheet in sync with edits. */
  meals: Meal[];
  items: FoodItem[];
  onClose: () => void;
  showToast?: ShowToast;
}) {
  const meal = meals.find((m) => m.id === mealId);
  const deleteRef = useRef<() => void>(() => undefined);

  // Meal was deleted elsewhere (or from this sheet) — close automatically.
  useEffect(() => { if (!meal) onClose(); }, [meal, onClose]);
  if (!meal) return null;

  return (
    <Sheet
      title="Meal"
      onClose={onClose}
      forceExpanded
      rightAction={
        <button data-no-drag onClick={() => deleteRef.current()} aria-label="Delete meal" className="-m-1 p-1 text-content-secondary active:text-danger">
          <DeleteIcon size={20} />
        </button>
      }
    >
      <PantryMealDetailContent
        meal={meal} items={items} onClose={onClose} showToast={showToast} deleteRef={deleteRef}
      />
    </Sheet>
  );
}

function PantryMealDetailContent({
  meal, items, onClose, showToast, deleteRef,
}: {
  meal: Meal;
  items: FoodItem[];
  onClose: () => void;
  showToast?: ShowToast;
  deleteRef: React.MutableRefObject<() => void>;
}) {
  const [name, setName] = useState(meal.name);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<FoodItemFormValues | null>(null);
  const [updating, setUpdating] = useState(false);
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [confirmingDeleteMeal, setConfirmingDeleteMeal] = useState(false);

  const itemsById = new Map(items.map((i) => [i.id, i]));
  const editingItem = editingItemId ? itemsById.get(editingItemId) : undefined;

  // ── Right-to-left "Edit food item" overlay for whichever item card was
  //    tapped — same mechanism as Food item detail / the basket's EditOverlay. ─
  useSheetSetOverlay(
    editingItem ? (
      <div className="space-y-3 py-1">
        <OverlayNav title="Edit food item" onBack={() => setEditingItemId(null)} />
        <FoodItemFormContent
          mode="pantry-edit"
          initial={{
            name: editingItem.name, measurementType: editingItem.measurementType, referenceAmount: editingItem.referenceAmount,
            calories: editingItem.calories, protein: editingItem.protein, carbs: editingItem.carbs,
            fiber: editingItem.fiber, fat: editingItem.fat, photo: editingItem.photo,
          }}
          existingItems={items}
          existingItemId={editingItem.id}
          onSave={(values) => setPendingUpdate(values)}
          onCancel={() => setEditingItemId(null)}
        />
      </div>
    ) : null,
    [editingItem, items],
  );

  deleteRef.current = () => setConfirmingDeleteMeal(true); // eslint-disable-line react-hooks/refs

  async function saveName(next: string) {
    if (next.trim() === meal.name) return;
    await repos.meals.put({ ...meal, name: next.trim() || meal.name });
  }

  async function handleAddItem(values: FoodItemFormValues) {
    const newItemId = newId();
    await repos.foodItems.put({
      id: newItemId, name: values.name, measurementType: values.measurementType,
      referenceAmount: values.referenceAmount, calories: values.calories, protein: values.protein,
      carbs: values.carbs, fiber: values.fiber, fat: values.fat, photo: values.photo, isArchived: false,
    });
    await repos.meals.put({
      ...meal,
      items: [
        ...meal.items,
        { id: newId(), foodItemId: newItemId, quantity: values.measurementType === 'per_100g' ? values.referenceAmount : 1 },
      ],
    });
    setAddingItem(false);
    showToast?.('Added to meal');
  }

  async function handleRemoveItem(mealFoodItemId: string) {
    if (meal.items.length <= 1) return; // never leave a Meal with 0 items (spec §18)
    const removed = meal.items;
    await repos.meals.put({ ...meal, items: meal.items.filter((mi) => mi.id !== mealFoodItemId) });
    showToast?.('Removed from meal', async () => repos.meals.put({ ...meal, items: removed }));
  }

  async function handleDeleteMeal() {
    await repos.meals.remove(meal.id);
    showToast?.('Meal deleted', async () => repos.meals.put(meal));
    onClose();
  }

  async function confirmUpdate() {
    if (!pendingUpdate || !editingItem) return;
    setUpdating(true);
    try {
      await repos.foodItems.put({
        ...editingItem,
        name: pendingUpdate.name,
        measurementType: pendingUpdate.measurementType,
        referenceAmount: pendingUpdate.referenceAmount,
        calories: pendingUpdate.calories,
        protein: pendingUpdate.protein,
        carbs: pendingUpdate.carbs,
        fiber: pendingUpdate.fiber,
        fat: pendingUpdate.fat,
        photo: pendingUpdate.photo,
      });
      setPendingUpdate(null);
      setEditingItemId(null);
      showToast?.('Food item updated');
    } finally {
      setUpdating(false);
    }
  }

  return (
    <>
      <div className="space-y-4 pb-2">
        {meal.photo ? (
          <div className="flex justify-center">
            <div className="h-64 w-64 overflow-hidden rounded-[20px] shadow-card-lg">
              <img src={meal.photo} alt={meal.name} className="h-full w-full object-cover" />
            </div>
          </div>
        ) : null}

        <LabeledInput
          label="Meal name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void saveName(name)}
        />

        {meal.items.map((mi) => {
          const item = itemsById.get(mi.foodItemId);
          if (!item) return null;
          return (
            <PantryItemCard
              key={mi.id}
              name={item.name}
              photo={item.photo}
              nutrition={nutritionFor(item, mi.quantity)}
              servingLabel={servingLabelFor(item, mi.quantity)}
              onEdit={() => setEditingItemId(item.id)}
              onRemove={meal.items.length > 1 ? () => void handleRemoveItem(mi.id) : undefined}
            />
          );
        })}

        {/* Same collapsible module as Food item detail's "Create a meal" and
            the Day's-log basket's "+ Add another item" — just the Pantry
            methods card, no search/recents. */}
        <AddAnotherSection
          label="Add a new food item"
          open={addSectionOpen}
          onToggle={() => setAddSectionOpen((o) => !o)}
          onClose={() => setAddSectionOpen(false)}
        >
          <div className="space-y-1">
            <p className="px-1 pt-2 pb-1 text-callout font-semibold text-content">Pantry</p>
            <MethodCards
              onCamera={() => showToast?.('Coming soon — camera for meals is next')}
              onPhoto={() => showToast?.('Coming soon — photo for meals is next')}
              onDescribe={() => showToast?.('Coming soon — describe for meals is next')}
              onManual={() => { setAddSectionOpen(false); setAddingItem(true); }}
            />
          </div>
        </AddAnotherSection>

        <Button size="lg" variant="outline" onClick={() => { void saveName(name); onClose(); }}>Close</Button>
      </div>

      {pendingUpdate && (
        <Sheet title="Update food item?" onClose={() => setPendingUpdate(null)}>
          <div className="space-y-3 pb-2">
            <p className="text-subhead text-content-secondary">This will update all records using this food item.</p>
            <Button onClick={confirmUpdate} disabled={updating}>
              {updating ? 'Updating food item' : 'Update food item'}
            </Button>
            <Button variant="outline" onClick={() => setPendingUpdate(null)} disabled={updating}>Cancel</Button>
          </div>
        </Sheet>
      )}

      {addingItem && (
        <Sheet title="Add item to meal" onClose={() => setAddingItem(false)} forceExpanded>
          <FoodItemFormContent
            mode="meal-add-item"
            existingItems={items}
            onSave={handleAddItem}
            onCancel={() => setAddingItem(false)}
          />
        </Sheet>
      )}

      {confirmingDeleteMeal && (
        <Sheet title="Delete meal?" onClose={() => setConfirmingDeleteMeal(false)}>
          <div className="space-y-3 pb-2">
            <p className="text-subhead text-content-secondary">
              <span className="font-medium text-content">"{meal.name}"</span> will be removed from your pantry. Its Food items stay in your pantry; existing log entries won't be affected.
            </p>
            <Button variant="destructive" onClick={handleDeleteMeal}>Delete</Button>
            <Button variant="outline" onClick={() => setConfirmingDeleteMeal(false)}>Cancel</Button>
          </div>
        </Sheet>
      )}
    </>
  );
}
