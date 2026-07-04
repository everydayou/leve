// Pantry → Food item detail (meals-in-pantry spec §2) + Pantry → Food item →
// Create a meal (spec §4). Stepper is always disabled here — Pantry defines
// a Food item's properties, it doesn't log a consumed quantity (spec §10).
//
// All three sub-flows (edit this item, add a new item manually, add an
// existing item/meal from the pantry) slide in right-to-left over this
// Sheet's own header — one activeOverlay state + one useSheetSetOverlay
// ternary, same pattern as AddEntrySheet's FoodForm. Split into an outer
// Sheet wrapper + inner content component so the content is a true child of
// Sheet's context (same split as LogEntrySheet/LogEntryContent).
import { useRef, useState } from 'react';
import { repos } from '../../state/repos';
import { newId } from '../../data/ids';
import { convertFoodItemReferences } from '../../data/quantityConversion';
import { Button, ImageHero, Sheet, OverlayNav, useSheetSetOverlay } from '../kit';
import { PantryItemCard } from './PantryItemCard';
import { AddAnotherSection, MethodCards } from './MethodCards';
import { PantryPicker } from './PantryPicker';
import { DeleteIcon } from './icons';
import { FoodItemFormContent } from './FoodItemForm';
import type { FoodItemFormValues } from './FoodItemForm';
import { useFoodCapture } from './useFoodCapture';
import { AnalyzingIndicator, DescribeOverlay, ServingModal } from './FoodCapture';
import type { BasketItem } from './FoodCapture';
import type { ShowToast } from './Toaster';
import type { FoodItem, Meal } from '../../domain/types';

function servingLabelFor(item: FoodItem): string {
  return item.measurementType === 'per_100g' ? `${item.referenceAmount}g` : '1 Srv';
}

type OverlayKey = 'edit' | 'add-manual' | 'add-pantry' | 'describe';

export function PantryFoodItemDetail({
  item, items, allItems, meals, justCreated, onClose, onDeleted, onMealCreated, showToast,
}: {
  item: FoodItem;
  /** VISIBLE Food items — for duplicate-name checks and the "Add from
   *  pantry" picker's own list. */
  items: FoodItem[];
  /** ALL Food items, including ones hidden from Pantry (round 130) — needed
   *  so the "Add from pantry" picker can correctly total a listed Meal's
   *  nutrition/photo even when some of its ingredients are hidden. */
  allItems: FoodItem[];
  meals: Meal[];
  /** True when this item was just committed by a Camera/Photo/Describe/
   *  Nutri-scan capture (round 150) — there was no prior explicit "Save
   *  food" tap (unlike Manual, which already saved before landing here), so
   *  the primary CTA reads "Save food" instead of "Close" to match. */
  justCreated?: boolean;
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
        item={item} items={items} allItems={allItems} meals={meals} justCreated={justCreated} onClose={onClose} onDeleted={onDeleted}
        onMealCreated={onMealCreated} showToast={showToast} deleteRef={deleteRef}
      />
    </Sheet>
  );
}

function PantryFoodItemDetailContent({
  item, items, allItems, meals, justCreated, onClose, onDeleted, onMealCreated, showToast, deleteRef,
}: {
  item: FoodItem;
  items: FoodItem[];
  allItems: FoodItem[];
  meals: Meal[];
  justCreated?: boolean;
  onClose: () => void;
  onDeleted: () => void;
  onMealCreated: (meal: Meal) => void;
  showToast?: ShowToast;
  deleteRef: React.MutableRefObject<() => void>;
}) {
  const [activeOverlay, setActiveOverlay] = useState<OverlayKey | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<FoodItemFormValues | null>(null);
  const [updating, setUpdating] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [mealSectionOpen, setMealSectionOpen] = useState(false);
  const [manualDirty, setManualDirty] = useState(false);
  const [confirmingDiscardManual, setConfirmingDiscardManual] = useState(false);

  // ── Camera/Photo/Describe/Nutri-scan — the macros already come from AI,
  //    so (unlike Manual) there's no form to fill in: each capture commits
  //    straight into a brand-new Meal (combined with this existing item)
  //    and this Sheet hands off to that Meal, same one-tap-and-done shape
  //    as Manual's "Save & add to meal". Correcting a wrong AI read happens
  //    afterward, the same way as any other item: tap it to edit. ────────
  const [committingScan, setCommittingScan] = useState(false);

  const capture = useFoodCapture({
    showToast,
    onCaptured: (newItems, source) => { void commitScannedItems(newItems, source?.photo); },
  });

  async function commitScannedItems(newItems: BasketItem[], photo?: string) {
    setCommittingScan(true);
    try {
      const newMealItems = [newMealItem(item.id, item)];
      for (const bi of newItems) {
        const newItemId = newId();
        // Hidden from the Pantry's own Food-items list by default (round
        // 130/144) — same as every other meal-builder add path; opt in by
        // editing the item afterward and ticking "Save to pantry".
        await repos.foodItems.put({
          id: newItemId, name: bi.name, measurementType: bi.measurementType,
          referenceAmount: bi.referenceAmount, calories: bi.calories, protein: bi.protein,
          carbs: bi.carbs, fiber: bi.fiber, fat: bi.fat, photo,
          isArchived: true,
        });
        newMealItems.push({ id: newId(), foodItemId: newItemId, quantity: bi.qty });
      }
      const meal: Meal = { id: newId(), name: item.name, isArchived: false, items: newMealItems };
      await repos.meals.put(meal);
      showToast?.('Meal created');
      onMealCreated(meal);
    } finally {
      setCommittingScan(false);
    }
  }

  async function handleDescribeAnalyzeForMeal(text: string) {
    const newItems = await capture.handleDescribeAnalyze(text);
    setActiveOverlay(null); // close the Describe overlay before showing the commit spinner
    await commitScannedItems(newItems);
  }

  const nutrition = {
    calories: item.calories, protein: item.protein, carbs: item.carbs, fiber: item.fiber, fat: item.fat,
  };

  function newMealItem(foodItemId: string, forItem: FoodItem) {
    return { id: newId(), foodItemId, quantity: forItem.measurementType === 'per_100g' ? forItem.referenceAmount : 1 };
  }

  function closeManualOverlay() {
    // X on a fresh "add item" form: if the user typed anything, confirm
    // before discarding it instead of losing it silently.
    if (manualDirty) setConfirmingDiscardManual(true);
    else setActiveOverlay(null);
  }

  async function handleAddMealItem(values: FoodItemFormValues) {
    const newItemId = newId();
    // Hidden from the Pantry's own Food-items list by default (round 130) —
    // unless the user ticked "Save to pantry" right here (round 133), in
    // which case it's a real, visible pantry item from the start.
    await repos.foodItems.put({
      id: newItemId, name: values.name, measurementType: values.measurementType,
      referenceAmount: values.referenceAmount, calories: values.calories, protein: values.protein,
      carbs: values.carbs, fiber: values.fiber, fat: values.fat, photo: values.photo,
      isArchived: !values.saveToPantry,
    });
    const meal: Meal = {
      id: newId(), name: item.name, isArchived: false,
      items: [
        newMealItem(item.id, item),
        { id: newId(), foodItemId: newItemId, quantity: values.measurementType === 'per_100g' ? values.referenceAmount : 1 },
      ],
    };
    await repos.meals.put(meal);
    setActiveOverlay(null);
    showToast?.('Meal created');
    onMealCreated(meal);
  }

  async function handlePickExistingItem(picked: FoodItem) {
    const meal: Meal = {
      id: newId(), name: item.name, isArchived: false,
      items: [newMealItem(item.id, item), newMealItem(picked.id, picked)],
    };
    await repos.meals.put(meal);
    setActiveOverlay(null);
    showToast?.('Meal created');
    onMealCreated(meal);
  }

  async function handlePickExistingMeal(picked: Meal) {
    const meal: Meal = {
      id: newId(), name: item.name, isArchived: false,
      items: [
        newMealItem(item.id, item),
        // Meals can be added to Meals, but only as their individual Food
        // items — never nested (spec §5/§18).
        ...picked.items.map((mi) => ({ id: newId(), foodItemId: mi.foodItemId, quantity: mi.quantity })),
      ],
    };
    await repos.meals.put(meal);
    setActiveOverlay(null);
    showToast?.(`Added ${picked.items.length} items from ${picked.name}`);
    onMealCreated(meal);
  }

  // ── Right-to-left overlays — cover this Sheet's header, same mechanism as
  //    the Day's-log basket's EditOverlay/ManualOverlay. ────────────────────
  useSheetSetOverlay(
    activeOverlay === 'edit' ? (
      <div className="space-y-3 py-1">
        <OverlayNav title="Edit food item" onBack={() => setActiveOverlay(null)} />
        <FoodItemFormContent
          mode="pantry-edit"
          initial={{
            name: item.name, measurementType: item.measurementType, referenceAmount: item.referenceAmount,
            calories: item.calories, protein: item.protein, carbs: item.carbs, fiber: item.fiber, fat: item.fat,
            photo: item.photo,
          }}
          existingItems={items}
          existingMeals={meals}
          existingItemId={item.id}
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
          onSave={handleAddMealItem}
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
          excludeItemIds={[item.id]}
          onPickItem={(picked) => void handlePickExistingItem(picked)}
          onPickMeal={(picked) => void handlePickExistingMeal(picked)}
        />
      </div>
    ) : activeOverlay === 'describe' ? (
      <DescribeOverlay
        onBack={() => setActiveOverlay(null)}
        onAnalyze={handleDescribeAnalyzeForMeal}
      />
    ) : null,
    [activeOverlay, item, items, allItems, meals, manualDirty],
  );

  // ── Analysing / committing — same early-return spinner shape as the
  //    Day's-log basket, extended to cover the brief write-to-DB moment
  //    right after a scan/describe/label result comes back. ─────────────
  if (capture.analyzing || committingScan) {
    return <AnalyzingIndicator label={committingScan ? 'Creating meal…' : capture.analyzeLabel} />;
  }

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
      const oldType = item.measurementType, oldRef = item.referenceAmount;
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
      // Unit basis changed — every stored quantity referencing this item
      // (Day's-log entries, Meal items) is in the OLD unit and needs
      // converting, or it silently means something else now (round 133).
      if (oldType !== pendingUpdate.measurementType || oldRef !== pendingUpdate.referenceAmount) {
        await convertFoodItemReferences(repos, item.id, oldType, oldRef, pendingUpdate.measurementType, pendingUpdate.referenceAmount);
      }
      setPendingUpdate(null);
      setActiveOverlay(null);
      showToast?.('Food item updated');
    } finally {
      setUpdating(false);
    }
  }

  return (
    <>
      <div className="space-y-4 pb-2">
        {capture.hiddenInputs}
        {capture.servingModal && (
          <ServingModal
            name={capture.servingModal.item100.name}
            servingG={capture.servingModal.servingG}
            onPer100g={() => capture.resolveServingModal('per100g')}
            onPerServing={() => capture.resolveServingModal('perServing')}
            onDismiss={capture.closeServingModal}
          />
        )}
        <ImageHero photos={item.photo ? [item.photo] : []} />

        <PantryItemCard
          name={item.name}
          nutrition={nutrition}
          servingLabel={servingLabelFor(item)}
          onEdit={() => setActiveOverlay('edit')}
        />

        {/* Same collapsible module as the Day's-log basket's "+ Add another
            item" — "Pantry" is now a real card in the method row (pick an
            existing item/meal), not just a label. */}
        <AddAnotherSection
          label="Create a meal"
          helperText="Add another item"
          open={mealSectionOpen}
          onToggle={() => setMealSectionOpen((o) => !o)}
          onClose={() => setMealSectionOpen(false)}
        >
          <MethodCards
            onPantry={() => { setMealSectionOpen(false); setActiveOverlay('add-pantry'); }}
            onCamera={() => { setMealSectionOpen(false); void capture.handleCamera(); }}
            onPhoto={() => { setMealSectionOpen(false); void capture.handlePhoto(); }}
            onDescribe={() => { setMealSectionOpen(false); setActiveOverlay('describe'); }}
            onLabel={() => { setMealSectionOpen(false); capture.openLabelPicker(); }}
            onManual={() => { setMealSectionOpen(false); setActiveOverlay('add-manual'); }}
          />
        </AddAnotherSection>

        {justCreated ? (
          <Button size="lg" onClick={onClose}>Save food</Button>
        ) : (
          <Button size="lg" variant="outline" onClick={onClose}>Close</Button>
        )}
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
