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
import { useFillToBottom } from '../../lib/useFillToBottom';
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
  // X / scrim / swipe-down — PantryMealDetailContent owns the actual
  // decision (plain close vs. "discard changes?" confirm), since it's the
  // one that knows whether anything changed this session. Same
  // ref-forwarding shape as deleteRef above.
  const closeRef = useRef<() => void>(() => undefined);

  // Meal was deleted elsewhere (or from this sheet) — close automatically.
  useEffect(() => { if (!meal) onClose(); }, [meal, onClose]);

  // `justCreatedItemIds` is only ever set (by the parent) right after a
  // scan/manual-add/add-from-pantry flow produced this exact Meal — its
  // presence doubles as "was this Meal just created" (round 157, extended
  // beyond scans in round 170).
  const justCreated = justCreatedItemIds !== undefined;

  if (!meal) return null;

  const itemsById = itemsByIdMap(allItems);

  return (
    <Sheet
      title="Meal"
      onClose={() => closeRef.current()}
      // Round 171 (v2): unconditional, not tied to justCreated/hasChanges.
      // The first version of this fix computed hasChanges in
      // PantryMealDetailContent and lifted it up to this prop via a
      // callback + useState -- but that lift always lags one render cycle
      // behind the live-query update that changes hasChanges (e.g. right
      // after picking an item from "Add from pantry"), so a fast X tap
      // could still land while this prop was momentarily still `false`,
      // reproducing the exact freeze this was meant to fix. Making it
      // always true removes that race entirely: X/scrim/swipe now always
      // hand off synchronously to closeRef.current() below, which is
      // reassigned fresh on every render and reads the CURRENT
      // justCreated/hasChanges directly -- no lift, no lag, no stale
      // value possible. The one trade-off is the plain "nothing changed"
      // close no longer gets Sheet's slide-down animation; closeRef calls
      // onClose directly instead. Worth it to never freeze the app again.
      closeImmediately
      forceExpanded
      scrollAreaPaddingBottom="0px"
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
        justCreatedItemIds={justCreatedItemIds} onClose={onClose} showToast={showToast} deleteRef={deleteRef} closeRef={closeRef}
      />
    </Sheet>
  );
}

function PantryMealDetailContent({
  meal, items, allItems, meals, photos, justCreatedItemIds, onClose, showToast, deleteRef, closeRef,
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
  closeRef: React.MutableRefObject<() => void>;
}) {
  const justCreated = justCreatedItemIds !== undefined;
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
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

  // Snapshot this meal's saved name/items and its ingredients' own fields
  // the moment this view opens. Item add/remove/edit-macros/"Change" all
  // still persist immediately as they happen elsewhere in this file
  // (unchanged) -- this snapshot only exists so X can offer to silently
  // revert everything back to it if the user backs out without tapping
  // Save meal, instead of leaving mid-session edits stuck in the pantry.
  // Lazy useRef init (not useState) so it's captured once on the first
  // render and never recomputed as meal/allItems update live afterward --
  // same one-time-snapshot shape as Sheet.tsx's own scrollSnapshot.
  const originalRef = useRef<{ name: string; items: Meal['items']; foodItems: Map<string, FoodItem> } | null>(null);
  if (originalRef.current === null) {
    const foodItemsSnapshot = new Map<string, FoodItem>();
    for (const mi of meal.items) {
      const fi = allItems.find((i) => i.id === mi.foodItemId);
      if (fi) foodItemsSnapshot.set(fi.id, fi);
    }
    originalRef.current = { name: meal.name, items: meal.items, foodItems: foodItemsSnapshot };
  }
  const original = originalRef.current;

  // Round 167 — measures actual remaining viewport space for the grey
  // Food-items panel below (see useFillToBottom's own doc comment). Must
  // be called unconditionally, before the analysing/committing early
  // return further down.
  const greyFill = useFillToBottom<HTMLDivElement>(36);

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

  function itemsEqual(a: Meal['items'], b: Meal['items']): boolean {
    if (a.length !== b.length) return false;
    return a.every((mi, i) => mi.foodItemId === b[i].foodItemId && mi.quantity === b[i].quantity);
  }

  function foodItemFieldsChanged(a: FoodItem, b: FoodItem): boolean {
    return a.name !== b.name || a.calories !== b.calories || a.protein !== b.protein
      || a.carbs !== b.carbs || a.fiber !== b.fiber || a.fat !== b.fat || a.photo !== b.photo
      || a.measurementType !== b.measurementType || a.referenceAmount !== b.referenceAmount;
  }

  // eslint-disable-next-line react-hooks/refs -- original (== originalRef.current) is written exactly once on first render (see the lazy-init block above) and never mutated again for this component's lifetime; safe despite the analyzer's conservative can't-prove-it ref-taint check.
  const nameChanged = name.trim() !== '' && name.trim() !== original.name;
  const itemsChanged = !itemsEqual(meal.items, original.items); // eslint-disable-line react-hooks/refs
  const foodItemsChanged = [...original.foodItems.values()].some((orig) => { // eslint-disable-line react-hooks/refs
    const current = allItems.find((i) => i.id === orig.id);
    return !!current && foodItemFieldsChanged(orig, current);
  });
  const hasChanges = nameChanged || itemsChanged || foodItemsChanged;

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
            isArchived: editingItem.isArchived, origin: editingItem.origin,
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

  // X / scrim / swipe-down: a brand-new meal (justCreated) or a session
  // with any unsaved change asks for confirmation first; otherwise it's a
  // no-op close, same as always.
  closeRef.current = () => { // eslint-disable-line react-hooks/refs
    if (justCreated || hasChanges) setConfirmingDiscard(true);
    else onClose();
  };

  async function discardSessionChanges() {
    if (justCreated) {
      // Brand new meal (round 157's original case, now also reached from
      // Food item -> add-from-pantry/add-manual/pick-existing-meal, round
      // 170) -- discard the whole thing. Its ingredient Food items are
      // left in place (same "leave orphans" precedent as removing a
      // single item from a meal already does) rather than hunting down
      // and deleting each one.
      await repos.meals.remove(meal.id);
    } else {
      // Pre-existing meal with session edits -- restore its ingredients'
      // own fields where they were changed. Skipped when the measurement
      // basis itself changed (measurementType/referenceAmount): that
      // already triggered a one-way unit conversion across every log
      // entry/meal referencing this item (convertFoodItemReferences), so
      // reverting just this field would leave those already-converted
      // quantities silently wrong.
      for (const orig of original.foodItems.values()) {
        const current = allItems.find((i) => i.id === orig.id);
        if (
          current
          && current.measurementType === orig.measurementType
          && current.referenceAmount === orig.referenceAmount
          && foodItemFieldsChanged(orig, current)
        ) {
          await repos.foodItems.put(orig);
        }
      }
      await repos.meals.put({ ...meal, name: original.name, items: original.items });
    }
    onClose();
  }

  return (
    <>
      <div className="space-y-4">
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
{/* Round 165 — two more fixes from Marco's on-device review:
            (1) both the white card and the grey panel need to bleed all
            the way to the screen edges, ignoring the Sheet's own 20px
            side padding — negative side margins cancel it, then each
            piece re-applies 20px as its own content padding so text/
            inputs/cards still line up where they always have.
            (2) "the grey background needs to be completely under the
            white card, otherwise you see the gap" — round 164's white
            card and grey panel were SIBLINGS, so the white card's rounded
            bottom corners cut away to reveal the Sheet's plain white
            background behind them, not grey. Nesting the white card
            INSIDE the grey panel (as its first child, same full-bled
            width) fixes this: grey is always directly behind the white
            card, so the rounded-corner cutouts reveal grey correctly. */}
        <div ref={greyFill.ref} style={{ marginLeft: '-20px', marginRight: '-20px', minHeight: greyFill.minHeight }} className="bg-surface-sunken"> {/* eslint-disable-line react-hooks/refs -- greyFill.ref/.minHeight are plain values from useFillToBottom, not a raw ref read; this file already has a during-render ref write above (deleteRef) that trips the analyzer's conservative ref-taint tracking for the rest of the render. */}
          <div
            className="relative bg-surface shadow-card-lg rounded-b-main"
            style={{ paddingLeft: '20px', paddingRight: '20px', paddingBottom: '20px' }}
          >
            <ImageHero photos={photos} />
            <div style={{ marginTop: '24px' }}>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <LabeledInput
                    label="Meal name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
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
          </div>

          <div style={{ padding: '24px 20px 24px 20px' }}>
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

            {/* Same collapsible module as Food item detail's "Create a meal"
                and the Day's-log basket's "+ Add another item". */}
            <div style={{ marginTop: '16px' }}>
              <AddAnotherSection
                label="Add a new food item"
                open={addSectionOpen}
                onToggle={() => setAddSectionOpen((o) => !o)}
                onClose={() => setAddSectionOpen(false)}
                bordered
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
            </div>

            {hasChanges && (
              <div style={{ marginTop: '24px' }}>
                <Button size="lg" onClick={() => { void saveName(name); onClose(); }}>Save meal</Button>
              </div>
            )}
          </div>
        </div>
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

      {confirmingDiscard && (
        <Sheet title={justCreated ? 'Discard this meal?' : 'Discard changes?'} onClose={() => setConfirmingDiscard(false)}>
          <div className="space-y-3 pb-2">
            <p className="text-subhead text-content-secondary">
              {justCreated ? (
                <><span className="font-medium text-content">"{meal.name}"</span> won't be saved to your pantry.</>
              ) : (
                <>Your changes to <span className="font-medium text-content">"{original.name}"</span> won't be saved.</> // eslint-disable-line react-hooks/refs
              )}
            </p>
            <Button variant="destructive" onClick={() => void discardSessionChanges()}>Discard</Button>
            <Button variant="outline" onClick={() => setConfirmingDiscard(false)}>Keep editing</Button>
          </div>
        </Sheet>
      )}
    </>
  );
}
