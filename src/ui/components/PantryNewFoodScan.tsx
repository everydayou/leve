// Pantry → "+ New food" → Camera/Photo/Describe/Nutri-scan/Manual.
//
// One persistent, compact Sheet (sized to its content, same as
// MethodPickerModal always was) that swaps what it shows as the flow
// progresses: method picker → loading spinner (or the Describe textarea) →
// hands off once a result commits. Earlier versions opened a SEPARATE,
// forceExpanded Sheet the moment a method was tapped — from the user's
// point of view that looked like a second, blank, full-screen sheet
// flashing open behind the method picker (and, for Nutri-scan, behind the
// native iOS photo-picker action sheet too). Keeping everything inside the
// one Sheet instance that was already open fixes both.
//
// Unlike Manual (which needs a form — there's nothing to fill in for you),
// Camera/Photo/Describe/Nutri-scan already have the macros from AI, so
// there's no form to show: as soon as a result comes back, it commits
// immediately and this Sheet hands off to whatever it created — same
// one-tap-and-done shape as Manual's "Save & add to meal" / "Save food".
// Correcting a wrong AI read happens afterward, the same way as any other
// item: tap it to edit.
//
// Round 189: Describe is the one method with an actual form to fill in
// (the textarea), so — unlike Camera/Photo/Nutri-scan, which jump straight
// to a full-screen spinner — it now slides in as a genuine side-panel
// overlay via Sheet's own useSheetSetOverlay/OverlayLayer, same mechanism
// FoodForm's basket flow already uses for its Describe/Edit panels. This
// is NOT the rejected "separate forceExpanded Sheet" from the comment
// above — OverlayLayer slides in WITHIN this same Sheet instance, so there
// is no second modal flashing open. Tapping Analyse keeps the overlay open
// during the fetch (so a failed analyse still shows its inline error and
// lets Marco edit + retry, matching FoodForm's handleDescribeAnalyze
// convention) and closes it only on success, at which point `committing`
// is already flipping true in the same tick — so the overlay's ~290ms
// slide-back reveals the "Adding to pantry…" spinner underneath instead of
// an abrupt cut, matching the back-then-loading motion Marco asked for.
//
// It's genuinely ambiguous up front whether a scan will produce one item (a
// new Food item) or several (which doesn't fit "one new food," so it
// becomes a Meal instead — same 1-vs-2+ rule the Day's-log basket and
// PantryFoodItemDetail both already use).
import { useState } from 'react';
import { repos } from '../../state/repos';
import { newId } from '../../data/ids';
import { uniquePantryName } from '../../domain/pantry';
import { Sheet, useSheetSetOverlay, useSheetSetOverlayBack } from '../kit';
import { MethodCards } from './MethodCards';
import { useFoodCapture } from './useFoodCapture';
import { AnalyzingIndicator, DescribeOverlay, ServingModal } from './FoodCapture';
import type { BasketItem } from './FoodCapture';
import type { ShowToast } from './Toaster';
import type { FoodItem, Meal } from '../../domain/types';

export function PantryNewFood({
  items, meals, onClose, onManual, onFoodCreated, onMealCreated, showToast,
}: {
  /** VISIBLE Food items / Meals — for the round-152 duplicate-name check
   *  against a freshly scanned name (Manual already blocks on this via its
   *  own form; the AI methods commit with no form to show that in, so they
   *  auto-disambiguate instead). */
  items: FoodItem[];
  meals: Meal[];
  onClose: () => void;
  /** Manual still hands off to its own separate (forceExpanded) form Sheet
   *  — the one case that genuinely needs a full screen to fill in macros. */
  onManual: () => void;
  onFoodCreated: (id: string) => void;
  onMealCreated: (meal: Meal) => void;
  showToast?: ShowToast;
}) {
  // Round 189 bugfix: useSheetSetOverlay/useSheetSetOverlayBack read a
  // context that <Sheet> provides to its OWN children — calling them here,
  // in the same component that renders <Sheet>, was reading the context
  // from ABOVE Sheet (its default/no-op value), so tapping Describe called
  // a setter that did nothing. All the state/hooks below now live in
  // PantryNewFoodBody, rendered AS A CHILD of <Sheet>, same as every other
  // useSheetSetOverlay call site in the app (they're always inside a child
  // of the Sheet whose overlay they're registering into, e.g. FoodForm).
  return (
    <Sheet title="New food" onClose={onClose}>
      <PantryNewFoodBody
        items={items} meals={meals} onManual={onManual}
        onFoodCreated={onFoodCreated} onMealCreated={onMealCreated} showToast={showToast}
      />
    </Sheet>
  );
}

function PantryNewFoodBody({
  items, meals, onManual, onFoodCreated, onMealCreated, showToast,
}: {
  items: FoodItem[];
  meals: Meal[];
  onManual: () => void;
  onFoodCreated: (id: string) => void;
  onMealCreated: (meal: Meal) => void;
  showToast?: ShowToast;
}) {
  const [describing, setDescribing] = useState(false);
  const [committing, setCommitting] = useState(false);

  // Describe slides in as a genuine side-panel overlay (round 189) instead
  // of swapping the Sheet's own content in place — see the file-header
  // comment for why this differs from Camera/Photo/Nutri-scan (which have
  // no form of their own to show mid-flight). Swipe-right also closes it,
  // same as every other overlay in the app.
  useSheetSetOverlay(
    describing ? (
      <DescribeOverlay onBack={() => setDescribing(false)} onAnalyze={handleDescribeAnalyzeForNewFood} />
    ) : null,
    [describing],
  );
  useSheetSetOverlayBack(() => setDescribing(false));

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
          id, name: uniquePantryName(bi.name, items, meals), measurementType: bi.measurementType, referenceAmount: bi.referenceAmount,
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
        // Round 152: same photo scanned repeatedly (deterministic AI naming)
        // was creating multiple Meals all named identically — disambiguate,
        // same as the single-item branch above.
        const meal: Meal = { id: newId(), name: uniquePantryName(newItems[0].name, items, meals), isArchived: false, items: mealFoodItems };
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
    setDescribing(false); // close the Describe view before showing the commit spinner
    await commitCaptured(newItems);
  }

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
      {/* Round 189: rather than padding the method-picker/Describe states
          up to match a tall loading screen, the loading screen itself was
          shrunk (AnalyzingIndicator's `compact` prop) so this stays a
          small, content-sized Sheet throughout — no artificial minHeight
          needed on any of the states any more. */}
      {capture.analyzing || committing ? (
        <AnalyzingIndicator compact label={committing ? 'Adding to pantry…' : capture.analyzeLabel} />
      ) : (
        <>
          {/* Cards moved up 16px (pb-6 -> pb-2) per Marco's request; the
              16px spacer below keeps the sheet's total height unchanged. */}
          <p className="pt-2 pb-2 text-center text-subhead text-content-secondary">Choose one way to add this food</p>
          <MethodCards
            onManual={onManual}
            onCamera={() => void capture.handleCamera()}
            onPhoto={() => void capture.handlePhoto()}
            onDescribe={() => setDescribing(true)}
            onLabel={() => capture.openLabelPicker()}
          />
          <div className="h-4" aria-hidden="true" />
        </>
      )}
    </>
  );
}
