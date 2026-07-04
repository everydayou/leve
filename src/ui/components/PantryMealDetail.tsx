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
import { itemsByIdMap, mealNutritionFor, mealPhotosFor, nutritionFor } from '../../domain/calc';
import { findPantryNameConflict } from '../../domain/pantry';
import { Button, ImageHero, LabeledInput, MacroSummaryLine, Sheet, OverlayNav, useSheetSetOverlay } from '../kit';
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

function servingLabelFor(item: FoodItem, quantity: number): string {
  return item.measurementType === 'per_100g' ? `${quantity}g` : `${quantity} Srv`;
}

type OverlayKey = 'edit' | 'add-manual' | 'add-pantry' | 'describe' | 'describe-correct';

export function PantryMealDetail({
  mealId, meals, items, allItems, justCreatedItemIds, onClose, showToast,
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
  /** FoodItem ids that were just scan-created together with this Meal
   *  (round 150) — e.g. from "+ New food" producing 2+ items. Seeds which
   *  ingredient cards show the "Change" button on open; cleared by the
   *  parent once this Sheet closes, same transient window as `justCreated`
   *  on PantryFoodItemDetail. */
  justCreatedItemIds?: string[];
  onClose: () => void;
  showToast?: ShowToast;
}) {
  const meal = meals.find((m) => m.id === mealId);
  const deleteRef = useRef<() => void>(() => undefined);

  // Meal was deleted elsewhere (or from this sheet) — close automatically.
  useEffect(() => { if (!meal) onClose(); }, [meal, onClose]);

  // Round 157: same reasoning as PantryFoodItemDetail's own discard-confirm
  // — closing (X / scrim / swipe-down) a freshly scan-created Meal without
  // tapping "Save meal" used to leave it in the Pantry anyway, since round
  // 149 commits scan results immediately. `justCreatedItemIds` is only ever
  // set (by the parent) right after a scan produced this exact Meal, so its
  // presence doubles as "was this Meal just created" — no separate flag
  // needed. Discarding removes the Meal itself; its ingredient Food items
  // are left in place (same "leave orphans" precedent as removing a single
  // item from a meal already does) rather than hunting down and deleting
  // each one.
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const justCreated = justCreatedItemIds !== undefined;

  async function discard() {
    if (!meal) return;
    await repos.meals.remove(meal.id);
    onClose();
  }

  if (!meal) return null;

  const itemsById = itemsByIdMap(allItems);

  return (
    <>
      <Sheet
        title="Meal"
        onClose={justCreated ? () => setConfirmingDiscard(true) : onClose}
        forceExpanded
        rightAction={
          justCreated ? undefined : (
            <button data-no-drag onClick={() => deleteRef.current()} aria-label="Delete meal" className="-m-1 p-1 text-content-secondary active:text-danger">
              <DeleteIcon size={20} />
            </button>
          )
        }
      >
        <PantryMealDetailContent
          meal={meal} items={items} allItems={allItems} meals={meals} photos={mealPhotosFor(meal, itemsById)}
          justCreatedItemIds={justCreatedItemIds} onClose={onClose} showToast={showToast} deleteRef={deleteRef}
        />
      </Sheet>

      {confirmingDiscard && (
        <Sheet title="Discard this meal?" onClose={() => setConfirmingDiscard(false)}>
          <div className="space-y-3 pb-2">
            <p className="text-subhead text-content-secondary">
              <span className="font-medium text-content">"{meal.name}"</span> won't be saved to your pantry.
            </p>
            <Button variant="destructive" onClick={() => void discard()}>Discard</Button>
            <Button variant="outline" onClick={() => setConfirmingDiscard(false)}>Keep editing</Button>
          </div>
        </Sheet>
      )}
    </>
  );
}

function PantryMealDetailContent({
  meal, items, allItems, meals, photos, justCreatedItemIds, onClose, showToast, deleteRef,
}: {
  meal: Meal;
  items: FoodItem[];
  allItems: FoodItem[];
  meals: Meal[];
  /** Live hero photos (own photo + every ingredient's) — computed by the parent. */
  photos: string[];
  justCreatedItemIds?: string[];
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

  // ── Camera/Photo/Describe/Nutri-scan — the macros already come from AI,
  //    so (unlike Manual) there's no form to fill in: each capture commits
  //    straight to the meal and this Sheet lands back on the item list,
  //    same one-tap-and-done shape as Manual/Add-from-pantry. Correcting a
  //    wrong AI read happens afterward, the same way as any other item:
  //    tap it to edit. ─────────────────────────────────────────────────────
  const [committingScan, setCommittingScan] = useState(false);
  // "Change" (round 150) — which ingredient FoodItem ids can still be
  // re-described in place, same transient this-session-only window the
  // Day's-log basket's Change button has always had. Seeded from
  // `justCreatedItemIds` (the whole meal just arrived from a "+ New food"
  // scan) and grown as more items get scanned in via "Add another item"
  // while this Sheet stays open; a fresh open (new component instance)
  // resets it, same as every other "just did this" flag in the app.
  const [scannedItemIds, setScannedItemIds] = useState<Set<string>>(() => new Set(justCreatedItemIds));
  const [correctingItemId, setCorrectingItemId] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState(false);

  const capture = useFoodCapture({
    showToast,
    onCaptured: (newItems, source) => { void commitScannedItems(newItems, source?.photo); },
  });

  async function commitScannedItems(newItems: BasketItem[], photo?: string) {
    setCommittingScan(true);
    try {
      const newMealFoodItems: Meal['items'] = [];
      const newIds: string[] = [];
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
        newMealFoodItems.push({ id: newId(), foodItemId: newItemId, quantity: bi.qty });
        newIds.push(newItemId);
      }
      await repos.meals.put({ ...meal, items: [...meal.items, ...newMealFoodItems] });
      setScannedItemIds((prev) => new Set([...prev, ...newIds]));
      showToast?.('Added to meal');
    } finally {
      setCommittingScan(false);
    }
  }

  async function handleDescribeAnalyzeForMeal(text: string) {
    const newItems = await capture.handleDescribeAnalyze(text);
    setActiveOverlay(null); // close the Describe overlay before showing the commit spinner
    await commitScannedItems(newItems);
  }

  // "Change" — re-describe ONE existing ingredient in place, splicing
  // whatever comes back (could be more than one food, e.g. "actually it's
  // toast AND eggs") into meal.items where that ingredient was. The old
  // FoodItem row is left orphaned rather than deleted, same as removing an
  // item from a meal already does — it might still be a valid standalone
  // pantry definition even though this meal no longer points at it.
  async function handleDescribeAnalyzeForCorrection(text: string) {
    const newItems = await capture.handleDescribeAnalyze(text); // throws on error, shown inline by DescribeOverlay
    setActiveOverlay(null); // close the Describe view before showing the commit spinner
    const targetId = correctingItemId;
    setCorrectingItemId(null);
    if (!targetId) return;
    setCorrecting(true);
    try {
      const newFoodItemIds: string[] = [];
      const replacementMealItems: Meal['items'] = [];
      for (const bi of newItems) {
        const id = newId();
        await repos.foodItems.put({
          id, name: bi.name, measurementType: bi.measurementType, referenceAmount: bi.referenceAmount,
          calories: bi.calories, protein: bi.protein, carbs: bi.carbs, fiber: bi.fiber, fat: bi.fat,
          isArchived: true,
        });
        replacementMealItems.push({ id: newId(), foodItemId: id, quantity: bi.qty });
        newFoodItemIds.push(id);
      }
      const mealItemIdx = meal.items.findIndex((mi) => mi.foodItemId === targetId);
      const nextItems = mealItemIdx === -1
        ? [...meal.items, ...replacementMealItems]
        : [...meal.items.slice(0, mealItemIdx), ...replacementMealItems, ...meal.items.slice(mealItemIdx + 1)];
      await repos.meals.put({ ...meal, items: nextItems });
      setScannedItemIds((prev) => {
        const next = new Set(prev);
        next.delete(targetId);
        for (const id of newFoodItemIds) next.add(id);
        return next;
      });
      showToast?.('Food item updated');
    } finally {
      setCorrecting(false);
    }
  }

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
    ) : activeOverlay === 'describe' ? (
      <DescribeOverlay
        onBack={() => setActiveOverlay(null)}
        onAnalyze={handleDescribeAnalyzeForMeal}
      />
    ) : activeOverlay === 'describe-correct' ? (
      <DescribeOverlay
        onBack={() => { setActiveOverlay(null); setCorrectingItemId(null); }}
        onAnalyze={handleDescribeAnalyzeForCorrection}
      />
    ) : null,
    [activeOverlay, editingItem, correctingItemId, items, allItems, meals, memberItemIds, manualDirty],
  );

  // ── Analysing / committing — same early-return spinner shape as the
  //    Day's-log basket, extended to cover the brief write-to-DB moment
  //    right after a scan/describe/label result comes back, so there's no
  //    flash of the old item list before the new one lands. ──────────────
  if (capture.analyzing || committingScan || correcting) {
    return <AnalyzingIndicator label={committingScan ? 'Adding to meal…' : correcting ? 'Updating…' : capture.analyzeLabel} />;
  }

  deleteRef.current = () => setConfirmingDeleteMeal(true); // eslint-disable-line react-hooks/refs

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
        <ImageHero photos={photos} />

        {/* Meal summary (round 152) — same treatment as the Day's-log's own
            Meal view: name + total kcal + macro breakdown in one card. No
            "Save to pantry" checkbox here — this Meal already IS a pantry
            object, unlike a Day's-log entry that's only optionally saved
            into it. Outlined (border-card-no-shadow, round 154), not
            shadowed, per Marco's follow-up. The 24px marginTop is set
            inline rather than via the outer space-y utility — deliberately
            overrides it so the gap from the photo above is exactly 24px
            regardless of any other spacing in play (round 154: Marco asked
            for the literal rendered gap, not just "whatever the space-y
            scale gives us"). */}
        <div
          style={{ marginTop: '24px' }}
          className="rounded-[20px] border border-border-card-no-shadow bg-surface p-4"
        >
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <LabeledInput
                label="Meal name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => void saveName(name)}
              />
            </div>
            {/* border-transparent (round 155): LabeledInput's own input has a
                1px border (transparent at rest) baked into its box height —
                matching it here keeps this badge exactly the same height as
                the name field beside it. */}
            <span className="shrink-0 rounded-field border border-transparent bg-surface-sunken px-3 py-2.5 text-subhead font-semibold text-content-secondary">
              {mealNutritionFor(meal, itemsById).calories} kcal
            </span>
          </div>
          {/* Round 156: 8px to the name row above, meal-summary-card only
              (Basket/Pantry item cards stay at 4px per round 155). */}
          <MacroSummaryLine nutrition={mealNutritionFor(meal, itemsById)} className="mt-2" />
        </div>

        {/* "Food items" + its list, in their own wrapper so the 24px-top /
            8px-bottom spacing around the heading (round 154) is exact and
            immune to the outer space-y-4's own margin — the inner space-y-4
            below reproduces the SAME gap the item cards always had between
            each other, unrelated to this change. */}
        <div style={{ marginTop: '24px' }}>
          <p style={{ marginBottom: '8px' }} className="text-headline font-bold text-content">Food items</p>
          <div className="space-y-4">
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
                  onCorrect={scannedItemIds.has(item.id) ? () => { setCorrectingItemId(item.id); setActiveOverlay('describe-correct'); } : undefined}
                />
              );
            })}
          </div>
        </div>

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
            onCamera={() => { setAddSectionOpen(false); void capture.handleCamera(); }}
            onPhoto={() => { setAddSectionOpen(false); void capture.handlePhoto(); }}
            onDescribe={() => { setAddSectionOpen(false); setActiveOverlay('describe'); }}
            onLabel={() => { setAddSectionOpen(false); capture.openLabelPicker(); }}
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
