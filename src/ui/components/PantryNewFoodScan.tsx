// Pantry → "+ New food" → Camera/Photo/Describe/Nutri-scan.
//
// Unlike the meal builder (PantryMealDetail/PantryFoodItemDetail), "+ New
// food" doesn't start from an existing Meal or Food item — it's genuinely
// ambiguous up front whether a scan will produce one item (a new Food item)
// or several (which doesn't fit "one new food," so it becomes a Meal
// instead — same 1-vs-2+ rule the Day's-log basket and PantryFoodItemDetail
// both already use). Reuses the exact same capture engine, review UI, and
// per-item edit as the meal builder.
import { useEffect, useRef, useState } from 'react';
import { repos } from '../../state/repos';
import { newId } from '../../data/ids';
import { Button, Sheet, useSheetSetOverlay } from '../kit';
import { useFoodCapture } from './useFoodCapture';
import { AnalyzingIndicator, BasketCard, DescribeOverlay, EditOverlay, ServingModal } from './FoodCapture';
import type { BasketItem } from './FoodCapture';
import { basketNutrition } from './basketHelpers';
import type { ShowToast } from './Toaster';
import type { FoodItem, Meal } from '../../domain/types';

export type NewFoodScanMethod = 'camera' | 'photo' | 'describe' | 'label';

export function PantryNewFoodScan({
  method, items, meals, onClose, onFoodCreated, onMealCreated, showToast,
}: {
  method: NewFoodScanMethod;
  items: FoodItem[];
  meals: Meal[];
  onClose: () => void;
  onFoodCreated: (id: string) => void;
  onMealCreated: (meal: Meal) => void;
  showToast?: ShowToast;
}) {
  return (
    <Sheet title="New food" onClose={onClose} forceExpanded>
      <PantryNewFoodScanContent
        method={method} items={items} meals={meals} onClose={onClose}
        onFoodCreated={onFoodCreated} onMealCreated={onMealCreated} showToast={showToast}
      />
    </Sheet>
  );
}

function PantryNewFoodScanContent({
  method, items, meals, onFoodCreated, onMealCreated, showToast,
}: {
  method: NewFoodScanMethod;
  items: FoodItem[];
  meals: Meal[];
  onClose: () => void;
  onFoodCreated: (id: string) => void;
  onMealCreated: (meal: Meal) => void;
  showToast?: ShowToast;
}) {
  // Initialized directly from `method` (fixed for this component's
  // lifetime) rather than set inside the mount effect below, since a
  // direct setState call in an effect body triggers cascading renders.
  const [activeOverlay, setActiveOverlay] = useState<'describe' | 'edit-item' | null>(
    method === 'describe' ? 'describe' : null,
  );
  const [scanBasket, setScanBasket] = useState<BasketItem[]>([]);
  const [scanSources, setScanSources] = useState<Record<string, string>>({});
  const [scanSaveToPantry, setScanSaveToPantry] = useState<Record<string, boolean>>({});
  const [scanPhotoOverrides, setScanPhotoOverrides] = useState<Record<string, string | undefined>>({});
  const [editingScanIdx, setEditingScanIdx] = useState<number | null>(null);
  const [correctingScanIdx, setCorrectingScanIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  function resolveScanPhoto(bi: BasketItem): string | undefined {
    if (bi.id in scanPhotoOverrides) return scanPhotoOverrides[bi.id];
    return bi.sourceId ? scanSources[bi.sourceId] : undefined;
  }

  const capture = useFoodCapture({
    showToast,
    onCaptured: (newItems, source) => {
      setScanBasket((prev) => [...prev, ...newItems]);
      if (source) setScanSources((prev) => ({ ...prev, [source.id]: source.photo }));
    },
  });

  async function handleDescribeAnalyzeForNewFood(text: string) {
    const newItems = await capture.handleDescribeAnalyze(text);
    if (correctingScanIdx !== null) {
      // "Change" on an existing card: replace just that card, don't append.
      setScanBasket((prev) => [
        ...prev.slice(0, correctingScanIdx),
        ...newItems,
        ...prev.slice(correctingScanIdx + 1),
      ]);
      setCorrectingScanIdx(null);
    } else {
      setScanBasket((prev) => [...prev, ...newItems]);
    }
    setActiveOverlay(null);
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
    // 'describe' needs no action here — activeOverlay was already
    // initialized to 'describe' above.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useSheetSetOverlay(
    activeOverlay === 'describe' ? (
      <DescribeOverlay onBack={() => { setCorrectingScanIdx(null); setActiveOverlay(null); }} onAnalyze={handleDescribeAnalyzeForNewFood} />
    ) : activeOverlay === 'edit-item' && editingScanIdx !== null && scanBasket[editingScanIdx] ? (
      <EditOverlay
        item={scanBasket[editingScanIdx]}
        currentPhoto={resolveScanPhoto(scanBasket[editingScanIdx])}
        existingItems={items}
        existingMeals={meals}
        onBack={() => setActiveOverlay(null)}
        onSave={(patch, saveToPantryChecked, photo) => {
          const scanId = scanBasket[editingScanIdx].id;
          setScanBasket((prev) => prev.map((it, i) => (i === editingScanIdx ? { ...it, ...patch } : it)));
          setScanSaveToPantry((prev) => ({ ...prev, [scanId]: saveToPantryChecked }));
          setScanPhotoOverrides((prev) => ({ ...prev, [scanId]: photo }));
          setEditingScanIdx(null);
          setActiveOverlay(null);
        }}
        onPhotoChange={(dataUrl) => {
          const scanId = scanBasket[editingScanIdx].id;
          setScanPhotoOverrides((prev) => ({ ...prev, [scanId]: dataUrl }));
        }}
      />
    ) : null,
    [activeOverlay, editingScanIdx, scanBasket, items, meals, scanPhotoOverrides],
  );

  if (capture.analyzing) {
    return <AnalyzingIndicator label={capture.analyzeLabel} />;
  }

  const isMeal = scanBasket.length >= 2;

  async function confirm() {
    if (scanBasket.length === 0) return;
    setSaving(true);
    try {
      if (!isMeal) {
        const bi = scanBasket[0];
        const id = newId();
        await repos.foodItems.put({
          id, name: bi.name, measurementType: bi.measurementType, referenceAmount: bi.referenceAmount,
          calories: bi.calories, protein: bi.protein, carbs: bi.carbs, fiber: bi.fiber, fat: bi.fat,
          photo: resolveScanPhoto(bi),
          // "+ New food" always creates a real, visible pantry item — unlike
          // the meal builder's captured ingredients, there's no meal for
          // this one to hide inside.
          isArchived: false,
        });
        onFoodCreated(id);
      } else {
        const mealFoodItems: Meal['items'] = [];
        for (const bi of scanBasket) {
          const id = newId();
          await repos.foodItems.put({
            id, name: bi.name, measurementType: bi.measurementType, referenceAmount: bi.referenceAmount,
            calories: bi.calories, protein: bi.protein, carbs: bi.carbs, fiber: bi.fiber, fat: bi.fat,
            photo: resolveScanPhoto(bi),
            // 2+ detected items become a Meal's ingredients instead — hidden
            // from the Pantry Food-items list by default (round 130/144),
            // opt out via "Save to pantry" while editing an item above.
            isArchived: !scanSaveToPantry[bi.id],
          });
          mealFoodItems.push({ id: newId(), foodItemId: id, quantity: bi.qty });
        }
        const meal: Meal = { id: newId(), name: scanBasket[0].name, isArchived: false, items: mealFoodItems };
        await repos.meals.put(meal);
        showToast?.('Meal created');
        onMealCreated(meal);
      }
    } finally {
      setSaving(false);
    }
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
      {scanBasket.length === 0 ? (
        <p className="py-8 text-center text-subhead text-content-secondary">No items yet.</p>
      ) : (
        <div className="space-y-3 pb-2">
          {scanBasket.map((item, idx) => (
            <BasketCard
              key={item.id}
              item={item}
              nutrition={basketNutrition(item)}
              onQtyChange={(qty) => setScanBasket((prev) => prev.map((it, i) => (i === idx ? { ...it, qty } : it)))}
              onRemove={() => setScanBasket((prev) => prev.filter((_, i) => i !== idx))}
              onEdit={() => { setEditingScanIdx(idx); setActiveOverlay('edit-item'); }}
              onCorrect={item.sourceId ? () => { setCorrectingScanIdx(idx); setActiveOverlay('describe'); } : undefined}
            />
          ))}
          <Button size="lg" onClick={() => void confirm()} disabled={saving}>
            {saving ? (isMeal ? 'Creating meal' : 'Saving food') : (isMeal ? 'Create meal' : 'Save food')}
          </Button>
        </div>
      )}
    </>
  );
}
