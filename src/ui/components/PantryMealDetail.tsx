// Pantry → Meal detail (meals-in-pantry spec §5). A Meal never stores its
// own macros — nutrition for every item (and, later, the whole Meal) is
// always computed live from the current Food items via mealNutritionFor(),
// so editing an ingredient elsewhere instantly reflects here too.
import { useEffect, useState } from 'react';
import { repos } from '../../state/repos';
import { newId } from '../../data/ids';
import { nutritionFor } from '../../domain/calc';
import { Button, Icon, LabeledInput, Sheet } from '../kit';
import { PantryItemCard } from './PantryItemCard';
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
  const [name, setName] = useState(meal?.name ?? '');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<FoodItemFormValues | null>(null);
  const [updating, setUpdating] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [confirmingDeleteMeal, setConfirmingDeleteMeal] = useState(false);

  // Meal was deleted elsewhere (or from this sheet) — close automatically.
  useEffect(() => { if (!meal) onClose(); }, [meal, onClose]);
  if (!meal) return null;

  const itemsById = new Map(items.map((i) => [i.id, i]));
  const editingItem = editingItemId ? itemsById.get(editingItemId) : undefined;

  async function saveName(next: string) {
    if (!meal || next.trim() === meal.name) return;
    await repos.meals.put({ ...meal, name: next.trim() || meal.name });
  }

  async function handleAddItem(values: FoodItemFormValues) {
    if (!meal) return;
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
    if (!meal || meal.items.length <= 1) return; // never leave a Meal with 0 items (spec §18)
    const removed = meal.items;
    await repos.meals.put({ ...meal, items: meal.items.filter((mi) => mi.id !== mealFoodItemId) });
    showToast?.('Removed from meal', async () => { if (meal) await repos.meals.put({ ...meal, items: removed }); });
  }

  async function handleDeleteMeal() {
    if (!meal) return;
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
      <Sheet
        title="Meal"
        onClose={onClose}
        forceExpanded
        rightAction={
          <button onClick={() => setConfirmingDeleteMeal(true)} aria-label="Delete meal" className="text-content active:opacity-60">
            <Icon name="trash" size={20} />
          </button>
        }
      >
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

          <button
            onClick={() => setAddingItem(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-[16px] border border-border-field py-3 text-subhead font-medium text-content-secondary active:bg-surface-sunken"
          >
            <Icon name="plus" size={16} />
            Add a new food item
          </button>

          <Button size="lg" variant="outline" onClick={() => { void saveName(name); onClose(); }}>Close</Button>
        </div>
      </Sheet>

      {editingItem && (
        <Sheet title="Edit food item" onClose={() => setEditingItemId(null)} forceExpanded>
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
        </Sheet>
      )}

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
