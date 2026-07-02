// Pantry → Food item detail (meals-in-pantry spec §2) + Pantry → Food item →
// Create a meal (spec §4). Stepper is always disabled here — Pantry defines
// a Food item's properties, it doesn't log a consumed quantity (spec §10).
//
// Edit uses the SAME right-to-left overlay mechanism as the Day's-log
// basket's EditOverlay (useSheetSetOverlay + OverlayNav) rather than
// stacking a second bottom Sheet — split into an outer Sheet wrapper and an
// inner content component so the content is a true child of Sheet's context
// (same split as AddEntrySheet's LogEntrySheet/LogEntryContent).
import { useRef, useState } from 'react';
import { repos } from '../../state/repos';
import { newId } from '../../data/ids';
import { Button, Sheet, OverlayNav, useSheetSetOverlay } from '../kit';
import { PantryItemCard } from './PantryItemCard';
import { AddAnotherSection, MethodCards } from './MethodCards';
import { DeleteIcon } from './icons';
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
  items: FoodItem[];
  onClose: () => void;
  onDeleted: () => void;
  onMealCreated: (meal: Meal) => void;
  showToast?: ShowToast;
}) {
  // The delete button lives in the Sheet header (outer), but the actual
  // confirm-delete flow lives in the content (inner, a child of Sheet) —
  // forward a stable ref so the header button can trigger it.
  const deleteRef = useRef<() => void>(() => undefined);

  return (
    <Sheet
      title="Food item"
      onClose={onClose}
      forceExpanded
      rightAction={
        <button data-no-drag onClick={() => deleteRef.current()} aria-label="Delete food item" className="-m-1 p-1 text-content-secondary active:text-danger">
          <DeleteIcon size={20} />
        </button>
      }
    >
      <PantryFoodItemDetailContent
        item={item} items={items} onClose={onClose} onDeleted={onDeleted}
        onMealCreated={onMealCreated} showToast={showToast} deleteRef={deleteRef}
      />
    </Sheet>
  );
}

function PantryFoodItemDetailContent({
  item, items, onClose, onDeleted, onMealCreated, showToast, deleteRef,
}: {
  item: FoodItem;
  items: FoodItem[];
  onClose: () => void;
  onDeleted: () => void;
  onMealCreated: (meal: Meal) => void;
  showToast?: ShowToast;
  deleteRef: React.MutableRefObject<() => void>;
}) {
  const [editing, setEditing] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<FoodItemFormValues | null>(null);
  const [updating, setUpdating] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [addingMealItem, setAddingMealItem] = useState(false);
  const [mealSectionOpen, setMealSectionOpen] = useState(false);

  const nutrition = {
    calories: item.calories, protein: item.protein, carbs: item.carbs, fiber: item.fiber, fat: item.fat,
  };

  // ── Right-to-left "Edit food item" overlay — covers this Sheet's header,
  //    same mechanism as the Day's-log basket's EditOverlay. ────────────────
  useSheetSetOverlay(
    editing ? (
      <div className="space-y-3 py-1">
        <OverlayNav title="Edit food item" onBack={() => setEditing(false)} />
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
      </div>
    ) : null,
    [editing, item, items],
  );

  deleteRef.current = () => setConfirmingDelete(true); // eslint-disable-line react-hooks/refs

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

        {/* Same collapsible module as the Day's-log basket's "+ Add another
            item" — just without the search bar / recents, since Pantry isn't
            picking an EXISTING logged item, it's building a new Meal. */}
        <AddAnotherSection
          label="Create a meal"
          open={mealSectionOpen}
          onToggle={() => setMealSectionOpen((o) => !o)}
          onClose={() => setMealSectionOpen(false)}
        >
          <div className="space-y-1">
            <p className="px-1 pt-2 pb-1 text-callout font-semibold text-content">Pantry</p>
            <MethodCards
              onCamera={() => showToast?.('Coming soon — camera for meals is next')}
              onPhoto={() => showToast?.('Coming soon — photo for meals is next')}
              onDescribe={() => showToast?.('Coming soon — describe for meals is next')}
              onManual={() => { setMealSectionOpen(false); setAddingMealItem(true); }}
            />
          </div>
        </AddAnotherSection>

        <Button size="lg" variant="outline" onClick={onClose}>Close</Button>
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
