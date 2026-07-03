// Pantry → Meal detail (meals-in-pantry spec §5). A Meal never stores its
// own macros — nutrition for every item is always computed live from the
// current Food items via mealNutritionFor(); its hero photo works the same
// way via mealPhotosFor() (round 126) — the Meal's own photo (if any) plus
// every ingredient's photo, shown as a single photo or ImageHero collage,
// same as the Day's-log basket's multi-photo scan results. No per-item
// thumbnails on the cards below — matches BasketCard, which has none either.
//
// Per-item edit / add-manual / add-from-pantry all slide in right-to-left
// over this Sheet's own header — one activeOverlay state + one
// useSheetSetOverlay ternary, same pattern as Food item detail and
// AddEntrySheet's FoodForm. Split into an outer Sheet wrapper + inner
// content component so the content is a true child of Sheet's context.
import { useEffect, useRef, useState } from 'react';
import { repos } from '../../state/repos';
import { newId } from '../../data/ids';
import { convertFoodItemReferences } from '../../data/quantityConversion';
import { itemsByIdMap, mealPhotosFor, nutritionFor } from '../../domain/calc';
import { findPantryNameConflict } from '../../domain/pantry';
import { Button, ImageHero, LabeledInput, Sheet, OverlayNav, useSheetSetOverlay } from '../kit';
import { PantryItemCard } from './PantryItemCard';
import { AddAnotherSection, MethodCards } from './MethodCards';
import { PantryPicker } from './PantryPicker';
import { DeleteIcon } from './icons';
import { FoodItemFormContent } from './FoodItemForm';
import type { FoodItemFormValues } from './FoodItemForm';
import type { ShowToast } from './Toaster';
import type { FoodItem, Meal } from '../../domain/types';

function servingLabelFor(item: FoodItem, quantity: number): string {
  return item.measurementType === 'per_100g' ? `${quantity}g` : `${quantity} Srv`;
}

type OverlayKey = 'edit' | 'add-manual' | 'add-pantry';

export function PantryMealDetail({
  mealId, meals, items, allItems, onClose, showToast,
}: {
  mealId: string;
  /** Live meals list from the parent — keeps this sheet in sync with edits. */
  meals: Meal[];
  /** VISIBLE Food items only — used for duplicate-name checks and the
   *  "Add from pantry" picker's own list. */
  items: FoodItem[];
  /** ALL Food items, including ones hidden from Pantry because they only
   *  exist to complete a meal (round 130). Needed to resolve THIS meal's own
   *  ingredients regardless of visibility — otherwise a meal-only item would
   *  silently drop out of its own Meal's nutrition/photo. */
  allItems: FoodItem[];
  onClose: () => void;
  showToast?: ShowToast;
}) {
  const meal = meals.find((m) => m.id === mealId);
  const deleteRef = useRef<() => void>(() => undefined);

  // Meal was deleted elsewhere (or from this sheet) — close automatically.
  useEffect(() => { if (!meal) onClose(); }, [meal, onClose]);
  if (!meal) return null;

  const itemsById = itemsByIdMap(allItems);

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
        meal={meal} items={items} allItems={allItems} meals={meals} photos={mealPhotosFor(meal, itemsById)}
        onClose={onClose} showToast={showToast} deleteRef={deleteRef}
      />
    </Sheet>
  );
}

function PantryMealDetailContent({
  meal, items, allItems, meals, photos, onClose, showToast, deleteRef,
}: {
  meal: Meal;
  items: FoodItem[];
  allItems: FoodItem[];
  meals: Meal[];
  /** Live hero photos (own photo + every ingredient's) — computed by the parent. */
  photos: string[];
  onClose: () => void;
  showToast?: ShowToast;
  deleteRef: React.MutableRefObject<() => void>;
}) {
  const [name, setName] = useState(meal.name);
  const [activeOverlay, setActiveOverlay] = useState<OverlayKey | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<FoodItemFormValues | null>(null);
  const [updating, setUpdating] = useState(false);
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [confirmingDeleteMeal, setConfirmingDeleteMeal] = useState(false);
  const [manualDirty, setManualDirty] = useState(false);
  const [confirmingDiscardManual, setConfirmingDiscardManual] = useState(false);

  // Resolve this Meal's OWN items from the full set (allItems) — some may be
  // hidden from Pantry (isArchived, meal-only). Everything else (duplicate
  // checks, Add-from-pantry) uses the visible-only `items`.
  const itemsById = new Map(allItems.map((i) => [i.id, i]));
  const editingItem = activeOverlay === 'edit' && editingItemId ? itemsById.get(editingItemId) : undefined;
  const memberItemIds = meal.items.map((mi) => mi.foodItemId);

  function closeManualOverlay() {
    if (manualDirty) setConfirmingDiscardManual(true);
    else setActiveOverlay(null);
  }

  async function handleAddItem(values: FoodItemFormValues) {
    const newItemId = newId();
    // Hidden from the Pantry's own Food-items list by default (round 130) —
    // unless the user ticked "Save to pantry" right here (round 133).
    await repos.foodItems.put({
      id: newItemId, name: values.name, measurementType: values.measurementType,
      referenceAmount: values.referenceAmount, calories: values.calories, protein: values.protein,
      carbs: values.carbs, fiber: values.fiber, fat: values.fat, photo: values.photo,
      isArchived: !values.saveToPantry,
    });
    await repos.meals.put({
      ...meal,
      items: [
        ...meal.items,
        { id: newId(), foodItemId: newItemId, quantity: values.measurementType === 'per_100g' ? values.referenceAmount : 1 },
      ],
    });
    setActiveOverlay(null);
    showToast?.('Added to meal');
  }

  async function handlePickExistingItem(picked: FoodItem) {
    await repos.meals.put({
      ...meal,
      items: [
        ...meal.items,
        { id: newId(), foodItemId: picked.id, quantity: picked.measurementType === 'per_100g' ? picked.referenceAmount : 1 },
      ],
    });
    setActiveOverlay(null);
    showToast?.('Added to meal');
  }

  async function handlePickExistingMeal(picked: Meal) {
    await repos.meals.put({
      ...meal,
      // Meals can be added to Meals, but only as their individual Food
      // items — never nested (spec §5/§18).
      items: [
        ...meal.items,
        ...picked.items.map((mi) => ({ id: newId(), foodItemId: mi.foodItemId, quantity: mi.quantity })),
      ],
    });
    setActiveOverlay(null);
    showToast?.(`Added ${picked.items.length} items from ${picked.name}`);
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

  async function saveName(next: string) {
    const trimmed = next.trim();
    if (trimmed === meal.name) return;
    const conflict = trimmed ? findPantryNameConflict(items, meals, trimmed, meal.id) : undefined;
    if (conflict) {
      setName(meal.name); // revert — this name is already taken
      showToast?.(conflict.type === 'meal' ? 'That name is already used by a meal' : 'That name is already used by a food item');
      return;
    }
    await repos.meals.put({ ...meal, name: trimmed || meal.name });
  }

  async function confirmUpdate() {
    if (!pendingUpdate || !editingItem) return;
    setUpdating(true);
    try {
      // A hidden (meal-only) item can only go hidden → visible here, via the
      // "Save to pantry" checkbox — never the other way around (that's what
      // deleting the item is for).
      const nowSavingToPantry = editingItem.isArchived && pendingUpdate.saveToPantry;
      const oldType = editingItem.measurementType, oldRef = editingItem.referenceAmount;
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
        isArchived: editingItem.isArchived ? !pendingUpdate.saveToPantry : editingItem.isArchived,
      });
      // Unit basis changed — every stored quantity referencing this item
      // (Day's-log entries, Meal items, including this very Meal) is in the
      // OLD unit and needs converting (round 133).
      if (oldType !== pendingUpdate.measurementType || oldRef !== pendingUpdate.referenceAmount) {
        await convertFoodItemReferences(repos, editingItem.id, oldType, oldRef, pendingUpdate.measurementType, pendingUpdate.referenceAmount);
      }
      setPendingUpdate(null);
      setActiveOverlay(null);
      showToast?.(nowSavingToPantry ? 'Saved to pantry' : 'Food item updated');
    } finally {
      setUpdating(false);
    }
  }

  // ── Right-to-left overlays — same mechanism as Food item detail / the
  //    Day's-log basket's EditOverlay/ManualOverlay. ────────────────────────
  useSheetSetOverlay(
    editingItem ? (
      <div className="space-y-3 py-1">
        <OverlayNav title="Edit food item" onBack={() => setActiveOverlay(null)} />
        <FoodItemFormContent
          mode="pantry-edit"
          initial={{
            name: editingItem.name, measurementType: editingItem.measurementType, referenceAmount: editingItem.referenceAmount,
            calories: editingItem.calories, protein: editingItem.protein, carbs: editingItem.carbs,
            fiber: editingItem.fiber, fat: editingItem.fat, photo: editingItem.photo,
            isArchived: editingItem.isArchived,
          }}
          existingItems={items}
          existingMeals={meals}
          existingItemId={editingItem.id}
          onSave={(values) => setPendingUpdate(values)}
          onCancel={() => setActiveOverlay(null)}
        />
      </div>
    ) : activeOverlay === 'add-manual' ? (
      <div className="space-y-3 py-1">
        <OverlayNav title="Add item to meal" onBack={closeManualOverlay} icon="close" />
        <FoodItemFormContent
          mode="meal-add-item"
          existingItems={items}
          existingMeals={meals}
          onSave={handleAddItem}
          onCancel={closeManualOverlay}
          onDirtyChange={setManualDirty}
        />
      </div>
    ) : activeOverlay === 'add-pantry' ? (
      <div className="space-y-3 py-1">
        <OverlayNav title="Add from pantry" onBack={() => setActiveOverlay(null)} icon="close" />
        <PantryPicker
          items={items}
          allItems={allItems}
          meals={meals}
          excludeItemIds={memberItemIds}
          excludeMealIds={[meal.id]}
          onPickItem={(picked) => void handlePickExistingItem(picked)}
          onPickMeal={(picked) => void handlePickExistingMeal(picked)}
        />
      </div>
    ) : null,
    [activeOverlay, editingItem, items, allItems, meals, memberItemIds, manualDirty],
  );

  deleteRef.current = () => setConfirmingDeleteMeal(true); // eslint-disable-line react-hooks/refs

  return (
    <>
      <div className="space-y-4 pb-2">
        <ImageHero photos={photos} />

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
              nutrition={nutritionFor(item, mi.quantity)}
              servingLabel={servingLabelFor(item, mi.quantity)}
              onEdit={() => { setEditingItemId(item.id); setActiveOverlay('edit'); }}
              onRemove={meal.items.length > 1 ? () => void handleRemoveItem(mi.id) : undefined}
            />
          );
        })}

        {/* Same collapsible module as Food item detail's "Create a meal" and
            the Day's-log basket's "+ Add another item". */}
        <AddAnotherSection
          label="Add a new food item"
          helperText="Add another item"
          open={addSectionOpen}
          onToggle={() => setAddSectionOpen((o) => !o)}
          onClose={() => setAddSectionOpen(false)}
        >
          <MethodCards
            onPantry={() => { setAddSectionOpen(false); setActiveOverlay('add-pantry'); }}
            onCamera={() => showToast?.('Coming soon — camera for meals is next')}
            onPhoto={() => showToast?.('Coming soon — photo for meals is next')}
            onDescribe={() => showToast?.('Coming soon — describe for meals is next')}
            onLabel={() => showToast?.('Coming soon — nutri-scan for meals is next')}
            onManual={() => { setAddSectionOpen(false); setActiveOverlay('add-manual'); }}
          />
        </AddAnotherSection>

        <Button size="lg" onClick={() => { void saveName(name); onClose(); }}>Save meal</Button>
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

      {confirmingDiscardManual && (
        <Sheet title="Discard this item?" onClose={() => setConfirmingDiscardManual(false)}>
          <div className="space-y-3 pb-2">
            <p className="text-subhead text-content-secondary">You haven't saved this food item yet. Discard your changes?</p>
            <Button variant="destructive" onClick={() => { setConfirmingDiscardManual(false); setActiveOverlay(null); }}>Discard</Button>
            <Button variant="outline" onClick={() => setConfirmingDiscardManual(false)}>Keep editing</Button>
          </div>
        </Sheet>
      )}
    </>
  );
}
