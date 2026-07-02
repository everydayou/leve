// Pantry → Food item detail (meals-in-pantry spec §2) + Pantry → Food item →
// Create a meal (spec §4). Stepper is always disabled here — Pantry defines
// a Food item's properties, it doesn't log a consumed quantity (spec §10).
import { useState } from 'react';
import { repos } from '../../state/repos';
import { newId } from '../../data/ids';
import { Button, Icon, Sheet } from '../kit';
import { PantryItemCard } from './PantryItemCard';
import { FoodItemFormContent } from './FoodItemForm';
import type { FoodItemFormValues } from './FoodItemForm';
import type { ShowToast } from './Toaster';
import type { FoodItem, Meal } from '../../domain/types';

function servingLabelFor(item: FoodItem): string {
  return item.measurementType === 'per_100g' ? `${item.referenceAmount}g` : '1 Srv';
}

export function PantryFoodItemDetail({
  item, items, onClose, onDeleted, onMealCreated, showToast,
}: {
  item: FoodItem;
  /** All pantry Food items — used for duplicate-name checks in the edit/add-item forms. */
  items: FoodItem[];
  onClose: () => void;
  onDeleted: () => void;
  /** Called once the "Create a meal" flow produces a real Meal — parent
   *  swaps this detail sheet for the new Meal's detail sheet. */
  onMealCreated: (meal: Meal) => void;
  showToast?: ShowToast;
}) {
  const [editing, setEditing] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<FoodItemFormValues | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [addingMealItem, setAddingMealItem] = useState(false);
  const [updating, setUpdating] = useState(false);

  const nutrition = {
    calories: item.calories, protein: item.protein, carbs: item.carbs, fiber: item.fiber, fat: item.fat,
  };

  async function handleDelete() {
    await repos.foodItems.remove(item.id);
    showToast?.('Food deleted', async () => repos.foodItems.put(item));
    onDeleted();
  }

  async function confirmUpdate() {
    if (!pendingUpdate) return;
    setUpdating(true);
    try {
      await repos.foodItems.put({
        ...item,
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
      setEditing(false);
      showToast?.('Food item updated');
    } finally {
      setUpdating(false);
    }
  }

  async function handleAddMealItem(values: FoodItemFormValues) {
    const newItemId = newId();
    await repos.foodItems.put({
      id: newItemId, name: values.name, measurementType: values.measurementType,
      referenceAmount: values.referenceAmount, calories: values.calories, protein: values.protein,
      carbs: values.carbs, fiber: values.fiber, fat: values.fat, photo: values.photo, isArchived: false,
    });
    const meal: Meal = {
      id: newId(),
      name: item.name,
      photo: item.photo,
      items: [
        { id: newId(), foodItemId: item.id, quantity: item.measurementType === 'per_100g' ? item.referenceAmount : 1 },
        { id: newId(), foodItemId: newItemId, quantity: values.measurementType === 'per_100g' ? values.referenceAmount : 1 },
      ],
      isArchived: false,
    };
    await repos.meals.put(meal);
    setAddingMealItem(false);
    showToast?.('Meal created');
    onMealCreated(meal);
  }

  return (
    <>
      <Sheet
        title="Food item"
        onClose={onClose}
        forceExpanded
        rightAction={
          <button onClick={() => setConfirmingDelete(true)} aria-label="Delete food item" className="text-content active:opacity-60">
            <Icon name="trash" size={20} />
          </button>
        }
      >
        <div className="space-y-4 pb-2">
          {item.photo ? (
            <div className="flex justify-center">
              <div className="h-64 w-64 overflow-hidden rounded-[20px] shadow-card-lg">
                <img src={item.photo} alt={item.name} className="h-full w-full object-cover" />
              </div>
            </div>
          ) : null}

          <PantryItemCard
            name={item.name}
            nutrition={nutrition}
            servingLabel={servingLabelFor(item)}
            onEdit={() => setEditing(true)}
          />

          <div className="rounded-[20px] border border-border-subtle bg-surface p-4">
            <p className="text-callout font-semibold text-content">Create a meal</p>
            <p className="mt-0.5 text-subhead text-content-secondary">Add another food item to turn this into a meal</p>
            <div className="mt-3 grid grid-cols-4 gap-2">
              <button
                onClick={() => setAddingMealItem(true)}
                className="flex flex-col items-center gap-1.5 rounded-[14px] border border-border-field py-3 text-caption font-medium text-content-secondary active:bg-surface-sunken"
              >
                <Icon name="edit" size={18} />
                Manual
              </button>
              <button
                onClick={() => showToast?.('Coming soon — camera/photo/describe for meals are next')}
                className="flex flex-col items-center gap-1.5 rounded-[14px] border border-border-field py-3 text-caption font-medium text-content-muted active:bg-surface-sunken"
              >
                <Icon name="camera" size={18} />
                Camera
              </button>
              <button
                onClick={() => showToast?.('Coming soon — camera/photo/describe for meals are next')}
                className="flex flex-col items-center gap-1.5 rounded-[14px] border border-border-field py-3 text-caption font-medium text-content-muted active:bg-surface-sunken"
              >
                <Icon name="search" size={18} />
                Photo
              </button>
              <button
                onClick={() => showToast?.('Coming soon — camera/photo/describe for meals are next')}
                className="flex flex-col items-center gap-1.5 rounded-[14px] border border-border-field py-3 text-caption font-medium text-content-muted active:bg-surface-sunken"
              >
                <Icon name="check" size={18} />
                Describe
              </button>
            </div>
          </div>

          <Button size="lg" variant="outline" onClick={onClose}>Close</Button>
        </div>
      </Sheet>

      {editing && (
        <Sheet title="Edit food item" onClose={() => setEditing(false)} forceExpanded>
          <FoodItemFormContent
            mode="pantry-edit"
            initial={{
              name: item.name, measurementType: item.measurementType, referenceAmount: item.referenceAmount,
              calories: item.calories, protein: item.protein, carbs: item.carbs, fiber: item.fiber, fat: item.fat,
              photo: item.photo,
            }}
            existingItems={items}
            existingItemId={item.id}
            onSave={(values) => setPendingUpdate(values)}
            onCancel={() => setEditing(false)}
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

      {confirmingDelete && (
        <Sheet title="Delete food?" onClose={() => setConfirmingDelete(false)}>
          <div className="space-y-3 pb-2">
            <p className="text-subhead text-content-secondary">
              <span className="font-medium text-content">"{item.name}"</span> will be removed from your pantry. Existing log entries won't be affected.
            </p>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
            <Button variant="outline" onClick={() => setConfirmingDelete(false)}>Cancel</Button>
          </div>
        </Sheet>
      )}

      {addingMealItem && (
        <Sheet title="Add item to meal" onClose={() => setAddingMealItem(false)} forceExpanded>
          <FoodItemFormContent
            mode="meal-add-item"
            existingItems={items}
            onSave={handleAddMealItem}
            onCancel={() => setAddingMealItem(false)}
          />
        </Sheet>
      )}
    </>
  );
}
