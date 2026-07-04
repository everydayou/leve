// Pantry → "+ New food" → Camera/Photo/Describe/Nutri-scan.
//
// Unlike Manual (which needs a form — there's nothing to fill in for you),
// these methods already have the macros from AI, so there's no form to
// show: as soon as a result comes back, it commits immediately and this
// Sheet hands off to whatever it created — same one-tap-and-done shape as
// Manual's "Save & add to meal" / "Save food". Correcting a wrong AI read
// happens afterward, the same way as any other item: tap it to edit.
//
// Unlike the meal builder (PantryMealDetail/PantryFoodItemDetail), "+ New
// food" doesn't start from an existing Meal or Food item — it's genuinely
// ambiguous up front whether a scan will produce one item (a new Food item)
// or several (which doesn't fit "one new food," so it becomes a Meal
// instead — same 1-vs-2+ rule the Day's-log basket and PantryFoodItemDetail
// both already use).
import { useEffect, useRef, useState } from 'react';
import { repos } from '../../state/repos';
import { newId } from '../../data/ids';
import { Sheet, useSheetSetOverlay } from '../kit';
import { useFoodCapture } from './useFoodCapture';
import { AnalyzingIndicator, DescribeOverlay, ServingModal } from './FoodCapture';
import type { BasketItem } from './FoodCapture';
import type { ShowToast } from './Toaster';
import type { Meal } from '../../domain/types';

export type NewFoodScanMethod = 'camera' | 'photo' | 'describe' | 'label';

export function PantryNewFoodScan({
  method, onClose, onFoodCreated, onMealCreated, showToast,
}: {
  method: NewFoodScanMethod;
  onClose: () => void;
  onFoodCreated: (id: string) => void;
  onMealCreated: (meal: Meal) => void;
  showToast?: ShowToast;
}) {
  return (
    <Sheet title="New food" onClose={onClose} forceExpanded>
      <PantryNewFoodScanContent
        method={method} onClose={onClose}
        onFoodCreated={onFoodCreated} onMealCreated={onMealCreated} showToast={showToast}
      />
    </Sheet>
  );
}

function PantryNewFoodScanContent({
  method, onClose, onFoodCreated, onMealCreated, showToast,
}: {
  method: NewFoodScanMethod;
  onClose: () => void;
  onFoodCreated: (id: string) => void;
  onMealCreated: (meal: Meal) => void;
  showToast?: ShowToast;
}) {
  // Initialized directly from `method` (fixed for this component's
  // lifetime) rather than set inside the mount effect below, since a
  // direct setState call in an effect body triggers cascading renders.
  const [describing, setDescribing] = useState(method === 'describe');
  const [committing, setCommitting] = useState(false);

  const capture = useFoodCapture({
    showToast,
    onCaptured: (newItems, source) => { void commitCaptured(newItems, source?.photo); },
  });

  async function commitCaptured(newItems: BasketItem[], photo?: string) {
    if (newItems.length === 0) return;
    setCommitting(true);
    try {
      if (newItems.length === 1) {
        const bi = newItems[0];
        const id = newId();
        await repos.foodItems.put({
          id, name: bi.name, measurementType: bi.measurementType, referenceAmount: bi.referenceAmount,
          calories: bi.calories, protein: bi.protein, carbs: bi.carbs, fiber: bi.fiber, fat: bi.fat, photo,
          // "+ New food" always creates a real, visible pantry item — unlike
          // the meal builder's captured ingredients, there's no meal for
          // this one to hide inside.
          isArchived: false,
        });
        onFoodCreated(id);
      } else {
        const mealFoodItems: Meal['items'] = [];
        for (const bi of newItems) {
          const id = newId();
          await repos.foodItems.put({
            id, name: bi.name, measurementType: bi.measurementType, referenceAmount: bi.referenceAmount,
            calories: bi.calories, protein: bi.protein, carbs: bi.carbs, fiber: bi.fiber, fat: bi.fat, photo,
            // 2+ detected items become a Meal's ingredients instead — hidden
            // from the Pantry Food-items list by default (round 130/144),
            // opt in afterward by editing one and ticking "Save to pantry".
            isArchived: true,
          });
          mealFoodItems.push({ id: newId(), foodItemId: id, quantity: bi.qty });
        }
        const meal: Meal = { id: newId(), name: newItems[0].name, isArchived: false, items: mealFoodItems };
        await repos.meals.put(meal);
        showToast?.('Meal created');
        onMealCreated(meal);
      }
    } finally {
      setCommitting(false);
    }
  }

  async function handleDescribeAnalyzeForNewFood(text: string) {
    const newItems = await capture.handleDescribeAnalyze(text);
    setDescribing(false); // close the Describe overlay before showing the commit spinner
    await commitCaptured(newItems);
  }

  // Fire the tapped method the moment this screen mounts — it's only ever
  // opened by tapping Camera/Photo/Describe/Nutri-scan directly.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (method === 'camera') void capture.handleCamera();
    else if (method === 'photo') void capture.handlePhoto();
    else if (method === 'label') capture.openLabelPicker();
    // 'describe' needs no action here — `describing` was already
    // initialized to true above.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useSheetSetOverlay(
    describing ? (
      <DescribeOverlay onBack={onClose} onAnalyze={handleDescribeAnalyzeForNewFood} />
    ) : null,
    [describing],
  );

  return (
    <>
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
      {(capture.analyzing || committing) && (
        <AnalyzingIndicator label={committing ? 'Adding to pantry…' : capture.analyzeLabel} />
      )}
    </>
  );
}
