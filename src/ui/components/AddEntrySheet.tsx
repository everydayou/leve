import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLive } from '../../state/live';
import { repos } from '../../state/repos';
import { newId, todayISO } from '../../data/ids';
import { nutritionFor, mealNutritionFor, mealPhotoFor, itemsByIdMap } from '../../domain/calc';
import { currentWeightKg } from '../../domain/goal';
import { kgToLbs, lbsToKg } from '../../domain/units';
import { mifflinStJeorBMR, canComputeBmr } from '../../domain/bmr';
import { fmtDiaryDate } from '../../lib/date';
import { downscaleImage, MAX_SCAN_PX } from '../../lib/image';
import { captureFromCamera, captureFromLibrary, isNativeIOS } from '../../lib/camera';
import { scanFood, describeFood } from '../../lib/foodScan';
import { hapticLight } from '../../lib/haptics';
import {
  SegmentedControl, Button, LabeledInput, NumberField, WheelPicker,
  Icon, Sheet, useSheetSetFooter, useSheetSetOverlay, useOverlaySetFooter,
  useSheetSetOverlayBack, OverlayNav, ImageHero, MacroSummaryLine,
} from '../kit';
import type { ShowToast } from './Toaster';
import type { FoodItem, FoodEntry, Meal, MealFoodItem, MealItem, NutritionSnapshot } from '../../domain/types';
import { FoodItemFormContent } from './FoodItemForm';
import type { FoodItemFormValues } from './FoodItemForm';
import { DeleteIcon, EditIcon } from './icons';
import { AddAnotherSection, MethodCards } from './MethodCards';

const SCAN_ENABLED = !!(import.meta.env.VITE_FOOD_SCAN_API_URL as string | undefined);

function timeMealName(): string {
  const h = new Date().getHours();
  if (h >= 5  && h < 10) return 'Breakfast';
  if (h >= 10 && h < 12) return 'Morning snack';
  if (h >= 12 && h < 14) return 'Lunch';
  if (h >= 14 && h < 17) return 'Afternoon snack';
  if (h >= 17 && h < 21) return 'Dinner';
  return 'Evening snack';
}

// ── Account BMR sync ──────────────────────────────────────────────────────────

async function syncAccountBmr() {
  const today   = todayISO();
  const weights = await repos.weights.all();
  const latest  = weights
    .filter((w) => w.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!latest) return;
  const user = await repos.user.get();
  if (
    user &&
    canComputeBmr({ weightKg: latest.weightKg, heightCm: user.heightCm, age: user.age, sex: user.sex })
  ) {
    const newBmr = mifflinStJeorBMR({
      weightKg: latest.weightKg, heightCm: user.heightCm,
      age: user.age!, sex: user.sex!,
    });
    await repos.user.save({ ...user, bmr: newBmr });
  }
}

// ── Internal basket types ─────────────────────────────────────────────────────

type BasketItem = {
  id: string;
  name: string;
  /** Stored as literal union to avoid importing MeasurementType here. */
  measurementType: 'per_100g' | 'per_serving';
  /** 100 for per_100g; grams-per-serving for per_serving. */
  referenceAmount: number;
  /** Macros at referenceAmount (not at current qty). */
  calories: number;
  protein: number;
  carbs: number;
  fiber: number;
  fat: number;
  /** Current quantity: grams (per_100g) or servings (per_serving). */
  qty: number;
  /** Links to a SourceGroup photo (scan or pantry photo). */
  sourceId?: string;
  /** Set when item was added from the pantry. */
  pantryItemId?: string;
};

type SourceGroup = { id: string; photo: string };

// ── Basket helpers ────────────────────────────────────────────────────────────

function basketNutrition(item: BasketItem): NutritionSnapshot {
  const s = item.measurementType === 'per_100g' ? item.qty / 100 : item.qty;
  return {
    calories: Math.round(item.calories * s),
    protein:  Math.round(item.protein  * s * 10) / 10,
    carbs:    Math.round(item.carbs    * s * 10) / 10,
    fiber:    Math.round(item.fiber    * s * 10) / 10,
    fat:      Math.round(item.fat      * s * 10) / 10,
  };
}

function pantryToBasket(item: FoodItem, sourceId?: string): BasketItem {
  return {
    id: newId(),
    name: item.name,
    measurementType: item.measurementType,
    referenceAmount: item.referenceAmount,
    calories: item.calories,
    protein:  item.protein,
    carbs:    item.carbs,
    fiber:    item.fiber,
    fat:      item.fat,
    qty: item.measurementType === 'per_100g' ? 100 : 1,
    sourceId,
    pantryItemId: item.id,
  };
}

/** Strip parenthetical descriptors and cap to 22 chars at a word boundary.
 *  Scan results often return verbose names like "Sourdough bread (toasted, partial slice)"
 *  — this normalises them to concise meal names. */
function cleanScanName(raw: string): string {
  // Remove trailing parenthetical description: "Bread (with butter)" → "Bread"
  let name = raw.replace(/\s*\([^)]*\)$/, '').trim();
  // Also strip " - description" suffixes
  name = name.replace(/\s+[-–]\s+.+$/, '').trim();
  if (name.length <= 22) return name;
  // Truncate at last word boundary within 22 chars
  const truncated = name.slice(0, 22).replace(/\s+\S*$/, '').trim();
  return truncated || name.slice(0, 22).trim();
}

function scanResultToBasket(
  r: { name: string; estimatedGrams: number; calories: number; protein: number; carbs: number; fiber: number; fat: number },
  sourceId: string,
): BasketItem {
  const grams = Math.max(Number(r.estimatedGrams) || 100, 1);
  const f = 100 / grams;
  return {
    id: newId(),
    name: cleanScanName(r.name),
    measurementType: 'per_100g',
    referenceAmount: 100,
    calories: (Number(r.calories) || 0) * f,
    protein:  (Number(r.protein)  || 0) * f,
    carbs:    (Number(r.carbs)    || 0) * f,
    fiber:    (Number(r.fiber)    || 0) * f,
    fat:      (Number(r.fat)      || 0) * f,
    qty: grams,
    sourceId,
  };
}

// ── AddEntrySheet ─────────────────────────────────────────────────────────────

export type AddEntryTab = 'food' | 'activity' | 'weight';
type Tab = AddEntryTab;

export function AddEntrySheet({
  date, onClose, initialTab = 'food', hideTabs = false,
  autoScan = false, initialScanPhoto, showToast, noCloseAnimation = false,
}: {
  date: string;
  onClose: () => void;
  initialTab?: Tab;
  /** When true, the Food/Activity/Weight tab bar is hidden — used when the
   *  caller already chose the entry type via the speed-dial FAB menu. */
  hideTabs?: boolean;
  /** When true FoodForm immediately triggers the camera on web (native uses
   *  initialScanPhoto instead). */
  autoScan?: boolean;
  /** Pre-captured photo data URL (native path) — scanned immediately on mount. */
  initialScanPhoto?: string;
  showToast?: ShowToast;
  /** Pass true when the caller handles the dismiss animation (FAB morph reverse).
   *  Makes the × button call onClose() immediately with no sheet slide-down. */
  noCloseAnimation?: boolean;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const items = useLive(() => repos.foodItems.all(), []) ?? [];
  const meals = useLive(() => repos.meals.all(), []) ?? [];
  const freqIds = useLive(() => repos.foodEntries.frequentItemIds(4, 3), []) ?? [];
  const frequentItems = freqIds
    .map((id) => items.find((i) => i.id === id))
    .filter((i): i is FoodItem => !!i && !i.isArchived);

  const isNotToday = date !== todayISO();
  const dateSubtitle = isNotToday ? (
    <span className="inline-flex items-center gap-1.5 rounded-pill bg-danger-soft px-2.5 py-1 text-subhead font-semibold text-danger">
      <Icon name="calendar" size={14} />
      {fmtDiaryDate(date)}
    </span>
  ) : (
    <div className="flex items-center gap-1.5">
      <Icon name="calendar" size={14} className="text-content-secondary" />
      <span className="text-subhead text-content-secondary">{fmtDiaryDate(date)}</span>
    </div>
  );

  const tabOptions = [
    { value: 'food'     as Tab, label: 'Food'     },
    { value: 'activity' as Tab, label: 'Activity' },
    { value: 'weight'   as Tab, label: 'Weight'   },
  ];

  return (
    <Sheet
      onClose={onClose}
      title="Add"
      subtitle={dateSubtitle}
      forceExpanded={tab !== 'weight'}
      closeImmediately={noCloseAnimation}
      stickyHeader={
        !hideTabs ? (
          <div className="flex justify-center pb-4">
            <SegmentedControl
              options={tabOptions}
              value={tab}
              onChange={setTab}
              optionClassName="w-[90px]"
            />
          </div>
        ) : undefined
      }
    >
      {tab === 'food' && (
        <FoodForm
          date={date}
          items={items}
          meals={meals}
          frequentItems={frequentItems}
          onDone={onClose}
          autoScan={autoScan}
          initialScanPhoto={initialScanPhoto}
          showToast={showToast}
        />
      )}
      {tab === 'activity' && <ActivityForm date={date} onDone={onClose} showToast={showToast} />}
      {tab === 'weight' && <WeightForm date={date} onDone={onClose} />}
    </Sheet>
  );
}

// ── FoodForm ──────────────────────────────────────────────────────────────────

type OverlayKey = 'describe' | 'manual' | 'edit';

function FoodForm({
  date, items, meals = [], frequentItems = [], onDone, autoScan = false, initialScanPhoto, showToast,
}: {
  date: string;
  items: FoodItem[];
  meals?: Meal[];
  frequentItems?: FoodItem[];
  onDone: () => void;
  autoScan?: boolean;
  initialScanPhoto?: string;
  showToast?: ShowToast;
}) {
  // Full set (includeArchived) — needed to resolve a picked Meal's own
  // ingredients even when some are hidden from Pantry (round 130: Food
  // items created purely to complete a meal default to hidden).
  const allItems = useLive(() => repos.foodItems.all(true), []) ?? [];
  const [basket, setBasket]             = useState<BasketItem[]>([]);
  const [sources, setSources]           = useState<SourceGroup[]>([]);
  const [mealName, setMealName]         = useState('');
  const [saveToPantry, setSaveToPantry] = useState(false);
  // Set when the basket was fast-populated by picking an EXISTING pantry
  // Meal directly (round 129) — lets logBasket() update that same Meal
  // instead of spawning a duplicate when "Save to pantry" is checked.
  const [loggingExistingMealId, setLoggingExistingMealId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen]     = useState(false);
  const [activeOverlay, setActiveOverlay] = useState<OverlayKey | null>(null);
  const [editingIdx, setEditingIdx]     = useState<number | null>(null);
  const [correctingIdx, setCorrectingIdx] = useState<number | null>(null);
  const [analyzing, setAnalyzing]       = useState(false);
  const [analyzeLabel, setAnalyzeLabel] = useState('Analysing…');
  const [servingModal, setServingModal] = useState<{
    item100: BasketItem; itemSrv: BasketItem; servingG: number;
  } | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);

  // ── Derived: which source photos to show in the collage ──────────────────
  const sourcePhotos = (() => {
    const seen = new Set<string>();
    const photos: string[] = [];
    for (const b of basket) {
      if (b.sourceId && !seen.has(b.sourceId)) {
        const src = sources.find((s) => s.id === b.sourceId);
        if (src) { seen.add(b.sourceId); photos.push(src.photo); }
      }
    }
    // Also show pantry-item photos not attached to a scan source group
    for (const b of basket) {
      if (!b.sourceId && b.pantryItemId) {
        const pi = items.find((i) => i.id === b.pantryItemId);
        if (pi?.photo && !photos.includes(pi.photo)) photos.push(pi.photo);
      }
    }
    return photos.slice(0, 4); // max 4 in collage
  })();

  // ── Log CTA ref (called by inline button in main basket view) ────────────
  const logRef = useRef<() => Promise<void>>(() => Promise.resolve());
  // Footer is null — Log food/Log meal is rendered inline (non-sticky) after basket content
  useSheetSetFooter(null, []);

  // Register overlayBack so swipe-right on any overlay dismisses it.
  // Use a stable ref so the effect doesn't re-run every render.
  const overlayBackRef = useRef<() => void>(() => undefined);
  useSheetSetOverlayBack(() => overlayBackRef.current());

  // ── Full-panel overlays (slide in from right, cover the entire sheet) ────
  // Replaces the old early-return content-swap pattern. Each overlay receives
  // its own pinned CTA via useOverlaySetFooter inside OverlayLayer.
  const editItem = activeOverlay === 'edit' && editingIdx !== null
    ? (basket[editingIdx] ?? null)
    : null;
  useSheetSetOverlay(
    activeOverlay === 'describe' ? (
      <DescribeOverlay onBack={overlayBack} onAnalyze={handleDescribeAnalyze} />
    ) : activeOverlay === 'manual' ? (
      <ManualOverlay items={items} onBack={overlayBack} onAdd={addManualItem} soleItem={basket.length === 0} />
    ) : editItem ? (
      <EditOverlay
        item={editItem}
        currentPhoto={sources.find((s) => s.id === editItem.sourceId)?.photo}
        onBack={overlayBack}
        existingItems={items}
        onSave={(patch, saveToPantry, photo) => {
          const pantryItemId = saveToPantry && editItem ? newId() : undefined;
          updateItem(editingIdx!, { ...patch, ...(pantryItemId ? { pantryItemId } : {}) });
          if (pantryItemId && editItem) {
            void repos.foodItems.put({
              id: pantryItemId, name: patch.name ?? editItem.name,
              measurementType: patch.measurementType ?? editItem.measurementType,
              referenceAmount: patch.referenceAmount ?? editItem.referenceAmount,
              calories: patch.calories ?? editItem.calories,
              protein:  patch.protein  ?? editItem.protein,
              carbs:    patch.carbs    ?? editItem.carbs,
              fiber:    patch.fiber    ?? editItem.fiber,
              fat:      patch.fat      ?? editItem.fat,
              photo, isArchived: false,
            });
          }
          overlayBack();
        }}
        onPhotoChange={(dataUrl) => {
          if (!dataUrl) return; // photo removed — source stays (cleared via basket remove)
          const srcId = newId();
          setSources((prev) => [...prev, { id: srcId, photo: dataUrl }]);
          updateItem(editingIdx!, { sourceId: srcId });
        }}
      />
    ) : null,
    [activeOverlay, editingIdx, editItem],
  );

  // ── Auto-scan on mount ────────────────────────────────────────────────────
  useEffect(() => {
    if (initialScanPhoto) {
      void runScan(initialScanPhoto, 'Analysing your meal…');
    } else if (autoScan) {
      void handleCamera();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scan ─────────────────────────────────────────────────────────────────

  async function runScan(imageDataUrl: string, label = 'Analysing your meal…') {
    setAnalyzeLabel(label);
    setAnalyzing(true);
    setActiveOverlay(null);
    const sourceId = newId();
    try {
      const rawFoods = await scanFood(imageDataUrl);
      const foods = rawFoods.map((f) => {
        const match = f.name.match(/^(.+?)\s*\((.+?)\)$/);
        if (match) {
          const extra = match[2].trim();
          return { ...f, name: match[1].trim(), description: f.description ? `${extra}. ${f.description}` : extra };
        }
        return f;
      });
      const newItems = foods.map((f) =>
        scanResultToBasket({
          name: f.name, estimatedGrams: f.estimatedGrams,
          calories: f.calories, protein: f.protein,
          carbs: f.carbs, fiber: f.fiber, fat: f.fat,
        }, sourceId),
      );
      setSources((prev) => [...prev, { id: sourceId, photo: imageDataUrl }]);
      setBasket((prev) => [...prev, ...newItems]);
      setPickerOpen(false);
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleCamera() {
    setPickerOpen(false);
    if (isNativeIOS()) {
      const photo = await captureFromCamera();
      if (photo) await runScan(photo, 'Analysing your photo…');
    } else if (SCAN_ENABLED) {
      scanInputRef.current?.click();
    } else {
      showToast?.('Food scan not configured');
    }
  }

  async function handlePhoto() {
    setPickerOpen(false);
    if (isNativeIOS()) {
      const photo = await captureFromLibrary();
      if (photo) await runScan(photo, 'Analysing your photo…');
    } else if (SCAN_ENABLED) {
      scanInputRef.current?.click();
    } else {
      showToast?.('Food scan not configured');
    }
  }

  async function handleDescribeAnalyze(text: string): Promise<void> {
    // Keep the overlay open during the async call — close it only on success.
    const sourceId = newId();
    const foods = await describeFood(text);
    if (foods.length === 0) {
      // Throw so DescribeOverlay can show the inline error
      throw new Error('no food — Please describe a food or meal (e.g. "a bowl of oats with banana").');
    }
    const newItems = foods.map((f) =>
      scanResultToBasket({
        name: f.name, estimatedGrams: f.estimatedGrams,
        calories: f.calories, protein: f.protein,
        carbs: f.carbs, fiber: f.fiber, fat: f.fat,
      }, sourceId),
    );

    if (correctingIdx !== null) {
      // "Fix" mode: replace the specific basket card at correctingIdx with Describe result
      setBasket((prev) => [
        ...prev.slice(0, correctingIdx),
        ...newItems,
        ...prev.slice(correctingIdx + 1),
      ]);
      setCorrectingIdx(null);
    } else {
      // Normal mode: append new items
      setBasket((prev) => [...prev, ...newItems]);
      setPickerOpen(false);
    }
    setActiveOverlay(null);
  }

  async function handleLabelScan(imageDataUrl: string) {
    setAnalyzeLabel('Reading the label…');
    setAnalyzing(true);
    try {
      const foods = await scanFood(imageDataUrl);
      if (foods.length === 0) throw new Error('No nutrition label detected');
      const f = foods[0];
      const sourceId = newId();
      const servingG = Math.max(Number(f.estimatedGrams) || 100, 1);
      const factor   = 100 / servingG;
      const item100: BasketItem = {
        id: newId(), name: cleanScanName(f.name), measurementType: 'per_100g', referenceAmount: 100,
        calories: (Number(f.calories) || 0) * factor,
        protein:  (Number(f.protein)  || 0) * factor,
        carbs:    (Number(f.carbs)    || 0) * factor,
        fiber:    (Number(f.fiber)    || 0) * factor,
        fat:      (Number(f.fat)      || 0) * factor,
        qty: 100, sourceId,
      };
      const itemSrv: BasketItem = {
        id: newId(), name: cleanScanName(f.name), measurementType: 'per_serving', referenceAmount: servingG,
        calories: Number(f.calories) || 0,
        protein:  Number(f.protein)  || 0,
        carbs:    Number(f.carbs)    || 0,
        fiber:    Number(f.fiber)    || 0,
        fat:      Number(f.fat)      || 0,
        qty: 1, sourceId,
      };
      // Label scan: no source photo added to the basket collage
      setServingModal({ item100, itemSrv, servingG });
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : 'Label scan failed');
    } finally {
      setAnalyzing(false);
    }
  }

  // ── Basket mutations ──────────────────────────────────────────────────────

  function addPantryItem(item: FoodItem, fromSearch?: boolean) {
    hapticLight();
    // Fast log: basket empty → log directly without going through basket (skip if user searched)
    if (basket.length === 0 && !fromSearch) {
      const bi = pantryToBasket(item);
      const n = basketNutrition(bi);
      const entryId = newId();
      void repos.foodEntries.add({
        id: entryId, date,
        foodItemId: item.id,
        quantity: bi.qty,
        isManual: false,
        snapshot: n,
        createdAt: new Date().toISOString(),
      });
      showToast?.(`${item.name} logged`, async () => repos.foodEntries.remove(entryId));
      onDone();
      return;
    }
    // If the same pantry item is already in the basket, increment its quantity
    const existingIdx = basket.findIndex((b) => b.pantryItemId === item.id);
    if (existingIdx !== -1) {
      const existing = basket[existingIdx];
      const step = existing.measurementType === 'per_100g' ? 10 : 1;
      updateQty(existingIdx, existing.qty + step);
      setPickerOpen(false);
      return;
    }
    const sourceId = item.photo ? newId() : undefined;
    if (sourceId && item.photo) {
      setSources((prev) => [...prev, { id: sourceId, photo: item.photo! }]);
    }
    setBasket((prev) => [...prev, pantryToBasket(item, sourceId)]);
    setPickerOpen(false);
  }

  function addPantryMeal(meal: Meal, fromSearch?: boolean) {
    hapticLight();
    const mealBasketItems: BasketItem[] = meal.items
      .map((mi) => {
        const item = allItems.find((i) => i.id === mi.foodItemId);
        if (!item) return null;
        const sourceId = item.photo ? newId() : undefined;
        if (sourceId && item.photo) setSources((prev) => [...prev, { id: sourceId, photo: item.photo! }]);
        return { ...pantryToBasket(item, sourceId), qty: mi.quantity };
      })
      .filter((b): b is BasketItem => b != null);
    if (mealBasketItems.length === 0) {
      showToast?.('Could not load that meal — its food items may have been removed');
      return;
    }
    // Fast path: basket empty and not searching → populate directly from
    // this Meal's own items/quantities, ready to review and log. Remember
    // its id so logBasket() updates the SAME Meal rather than duplicating it.
    if (basket.length === 0 && !fromSearch) {
      setBasket(mealBasketItems);
      setMealName(meal.name);
      setSaveToPantry(true); // it's already in Pantry — default to keeping it linked
      setLoggingExistingMealId(meal.id);
      setPickerOpen(false);
      return;
    }
    // Already building something — flatten this Meal's items in rather than
    // nesting one meal inside another (spec §5/§18).
    setBasket((prev) => [...prev, ...mealBasketItems]);
    setPickerOpen(false);
    showToast?.(`Added ${mealBasketItems.length} items from ${meal.name}`);
  }

  function removeItem(idx: number) {
    hapticLight();
    const item = basket[idx];
    const remaining = basket.filter((_, i) => i !== idx);
    setBasket(remaining);
    // Remove orphaned source group when no remaining items reference it
    if (item.sourceId && !remaining.some((b) => b.sourceId === item.sourceId)) {
      setSources((prev) => prev.filter((s) => s.id !== item.sourceId));
    }
    // Basket emptied out — no longer "logging that existing Meal", starting fresh.
    if (remaining.length === 0) setLoggingExistingMealId(null);
  }

  function updateQty(idx: number, qty: number) {
    setBasket((prev) => prev.map((b, i) => (i === idx ? { ...b, qty } : b)));
  }

  function updateItem(idx: number, patch: Partial<BasketItem>) {
    setBasket((prev) => prev.map((b, i) => (i === idx ? { ...b, ...patch } : b)));
  }

  function addManualItem(entry: {
    name: string; calories: number; protein: number; carbs: number;
    fiber: number; fat: number; saveToPantry: boolean;
    measurementType: 'per_100g' | 'per_serving'; referenceAmount: number;
    photo?: string;
  }) {
    const sourceId = entry.photo ? newId() : undefined;
    if (sourceId && entry.photo) {
      setSources((prev) => [...prev, { id: sourceId, photo: entry.photo! }]);
    }
    const pantryId = entry.saveToPantry ? newId() : undefined;
    if (pantryId) {
      void repos.foodItems.put({
        id: pantryId, name: entry.name,
        measurementType: entry.measurementType,
        referenceAmount: entry.referenceAmount,
        calories: entry.calories, protein: entry.protein, carbs: entry.carbs,
        fiber: entry.fiber, fat: entry.fat, photo: entry.photo, isArchived: false,
      });
    }
    const newItem: BasketItem = {
      id: newId(), name: entry.name,
      measurementType: entry.measurementType,
      referenceAmount: entry.referenceAmount,
      calories: entry.calories, protein: entry.protein,
      carbs: entry.carbs, fiber: entry.fiber, fat: entry.fat,
      qty: entry.measurementType === 'per_100g' ? 100 : 1,
      sourceId,
      ...(pantryId ? { pantryItemId: pantryId } : {}),
    };
    setBasket((prev) => [...prev, newItem]);
    setActiveOverlay(null);
    setPickerOpen(false);
  }

  // ── Log basket ────────────────────────────────────────────────────────────

  async function logBasket() {
    if (basket.length === 0) {
      showToast?.('Add something first');
      return;
    }
    const primaryPhoto = sourcePhotos[0]; // first captured photo = day's-log thumbnail

    if (basket.length === 1) {
      const item = basket[0];
      const n = basketNutrition(item);
      const entryId = newId();
      await repos.foodEntries.add({
        id: entryId, date,
        foodItemId: item.pantryItemId,
        quantity: item.qty,
        manualName: item.pantryItemId ? undefined : item.name,
        isManual: !item.pantryItemId,
        snapshot: n,
        createdAt: new Date().toISOString(),
      });
      showToast?.(
        `${item.name} logged`,
        item.pantryItemId ? async () => repos.foodEntries.remove(entryId) : undefined,
      );
    } else {
      const name = mealName.trim() || timeMealName();
      const totals = basket.reduce(
        (acc, item) => {
          const n = basketNutrition(item);
          return {
            calories: acc.calories + n.calories,
            protein:  acc.protein  + n.protein,
            carbs:    acc.carbs    + n.carbs,
            fiber:    acc.fiber    + n.fiber,
            fat:      acc.fat      + n.fat,
          };
        },
        { calories: 0, protein: 0, carbs: 0, fiber: 0, fat: 0 } as NutritionSnapshot,
      );
      // Resolve each basket item to a real Pantry Food item id where possible:
      // items already pantry-linked keep that link regardless of the "Save to
      // pantry" checkbox below (this is what lets even a LOCAL meal entry
      // live-recompute its pantry-linked items); brand-new items only get a
      // real Food item created for them when the whole Meal is being saved
      // (spec §4: unsaved items inside a saved Meal get saved internally too —
      // we don't want to silently pollute the Pantry with items the user
      // never asked to save).
      const resolvedFoodItemIds: (string | undefined)[] = [];
      for (const item of basket) {
        if (item.pantryItemId) {
          resolvedFoodItemIds.push(item.pantryItemId);
        } else if (saveToPantry) {
          const newFoodItemId = newId();
          await repos.foodItems.put({
            id: newFoodItemId, name: item.name,
            measurementType: item.measurementType, referenceAmount: item.referenceAmount,
            calories: item.calories, protein: item.protein, carbs: item.carbs,
            fiber: item.fiber, fat: item.fat, isArchived: false,
          });
          resolvedFoodItemIds.push(newFoodItemId);
        } else {
          resolvedFoodItemIds.push(undefined);
        }
      }

      const mealItems: MealItem[] = basket.map((item, i) => {
        const n = basketNutrition(item);
        return { name: item.name, estimatedGrams: item.qty, calories: n.calories,
          protein: n.protein, carbs: n.carbs, fiber: n.fiber, fat: n.fat,
          confidence: 'high' as const, selected: true, foodItemId: resolvedFoodItemIds[i] };
      });
      const entryId = newId();

      if (saveToPantry) {
        const mealFoodItems: MealFoodItem[] = basket.map((item, i) => ({
          id: newId(), foodItemId: resolvedFoodItemIds[i]!, quantity: item.qty,
        }));
        // Reuse the same Meal (update, not duplicate) when this basket was
        // fast-populated by picking an existing pantry Meal directly.
        const mealId = loggingExistingMealId ?? newId();
        const existingMeal = loggingExistingMealId ? meals.find((m) => m.id === loggingExistingMealId) : undefined;
        const meal: Meal = {
          id: mealId, name, photo: primaryPhoto ?? existingMeal?.photo,
          items: mealFoodItems, isArchived: false,
        };
        await repos.meals.put(meal);
        await repos.foodEntries.add({
          id: entryId, date, mealId, isManual: false,
          snapshot: totals, createdAt: new Date().toISOString(),
          mealData: { name, photo: primaryPhoto, photos: sourcePhotos.slice(0, 4), items: mealItems },
        });
      } else {
        await repos.foodEntries.add({
          id: entryId, date, manualName: name, isManual: true,
          snapshot: totals, createdAt: new Date().toISOString(),
          mealData: { name, photo: primaryPhoto, photos: sourcePhotos.slice(0, 4), items: mealItems },
        });
      }
      showToast?.(`${name} logged`);
    }
    onDone();
  }

  logRef.current = logBasket;

  // ── Overlay back helper ───────────────────────────────────────────────────
  function overlayBack() {
    setActiveOverlay(null);
    setEditingIdx(null);
    // Re-open picker when returning to a non-empty basket so user can pick another method
    if (basket.length > 0) setPickerOpen(true);
  }
  overlayBackRef.current = overlayBack; // intentional ref update mid-render so swipe handler always calls latest overlayBack

  // ── Analysing state ───────────────────────────────────────────────────────
  if (analyzing) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-border-subtle border-t-accent" />
        <p className="text-subhead text-content-secondary">{analyzeLabel}</p>
      </div>
    );
  }

  // ── Main basket view ──────────────────────────────────────────────────────
  return (
    <div className="space-y-3 pb-2">
      {/* Hidden file input for web Camera/Photo (both use same picker) */}
      {SCAN_ENABLED && (
        <input
          ref={scanInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            e.target.value = '';
            const small = await downscaleImage(f, MAX_SCAN_PX);
            await runScan(small, 'Analysing your photo…');
          }}
        />
      )}
      {/* Label scan — native iOS picker (Photo Library / Take Photo / Files) */}
      <input
        ref={labelInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          e.target.value = '';
          const small = await downscaleImage(f, MAX_SCAN_PX);
          await handleLabelScan(small);
        }}
      />

      {/* Photo collage */}
      {sourcePhotos.length > 0 && <ImageHero photos={sourcePhotos} />}

      {/* Meal name + save to pantry (2+ items) */}
      {basket.length >= 2 && (
        <div>
          <LabeledInput
            label="Meal name"
            value={mealName}
            onChange={(e) => setMealName(e.target.value)}
            placeholder={timeMealName()}
          />
          <label className="flex cursor-pointer select-none items-center gap-2 text-subhead text-content-secondary mt-2">
            <input
              type="checkbox"
              checked={saveToPantry}
              onChange={(e) => setSaveToPantry(e.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            Save to pantry
          </label>
        </div>
      )}

      {/* Basket cards */}
      {basket.map((item, idx) => (
        <BasketCard
          key={item.id}
          item={item}
          nutrition={basketNutrition(item)}
          onQtyChange={(qty) => updateQty(idx, qty)}
          onRemove={() => removeItem(idx)}
          onEdit={() => { setEditingIdx(idx); setActiveOverlay('edit'); }}
        />
      ))}

      {/* Serving size modal (Label scan — shown over the basket) */}
      {servingModal && (
        <ServingModal
          name={servingModal.item100.name}
          servingG={servingModal.servingG}
          onPer100g={() => {
            setBasket((prev) => [...prev, { ...servingModal.item100, id: newId() }]);
            setServingModal(null);
          }}
          onPerServing={() => {
            setBasket((prev) => [...prev, { ...servingModal.itemSrv, id: newId() }]);
            setServingModal(null);
          }}
          onDismiss={() => setServingModal(null)}
        />
      )}

      {/* ── Empty basket: full picker with no heading ──────────────────── */}
      {basket.length === 0 && (
        <FoodPicker
          items={items}
          allItems={allItems}
          meals={meals}
          frequentItems={frequentItems}
          onPickItem={addPantryItem}
          onPickMeal={addPantryMeal}
          onCamera={() => void handleCamera()}
          onPhoto={() => void handlePhoto()}
          onDescribe={() => setActiveOverlay('describe')}
          onLabel={() => { labelInputRef.current?.click(); }}
          onManual={() => setActiveOverlay('manual')}
        />
      )}

      {/* ── Non-empty basket: "Add another item" anchor + picker ──────── */}
      {/* Copy matches Pantry's own module: "Create a meal" while this is
          still a single item (about to become one), "Add a new food item"
          once it already is one (spec §6/§12). */}
      {basket.length > 0 && (
        <AddAnotherSection
          label={basket.length >= 2 ? 'Add a new food item' : 'Create a meal'}
          helperText={basket.length >= 2 ? undefined : 'Add another item'}
          open={pickerOpen}
          onToggle={() => setPickerOpen((v) => !v)}
          onClose={() => setPickerOpen(false)}
        >
          <FoodPicker
            bare
            items={items}
            allItems={allItems}
            meals={meals}
            frequentItems={frequentItems}
            onPickItem={addPantryItem}
            onPickMeal={addPantryMeal}
            onCamera={() => void handleCamera()}
            onPhoto={() => void handlePhoto()}
            onDescribe={() => { setPickerOpen(false); setActiveOverlay('describe'); }}
            onLabel={() => { labelInputRef.current?.click(); }}
            onManual={() => { setPickerOpen(false); setActiveOverlay('manual'); }}
          />
        </AddAnotherSection>
      )}

      {/* ── Log CTA — always last, 24px above it ─────────────────────── */}
      {basket.length > 0 && !activeOverlay && !analyzing && (
        <div style={{ paddingTop: '24px' }}>
          <Button size="lg" onClick={() => void logRef.current()}>
            {basket.length >= 2 ? 'Log meal' : 'Log food'}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── AddAnotherSection ─────────────────────────────────────────────────────────
// Single rounded container: heading row always visible, picker content expands
// downward inside the same surface. Heading Y position never jumps.

// ── BasketStepper ─────────────────────────────────────────────────────────────

function BasketStepper({
  item, qty, onChange, onRemove,
}: {
  item: BasketItem;
  qty: number;
  onChange: (v: number) => void;
  onRemove: () => void;
}) {
  const isGrams = item.measurementType === 'per_100g';
  const step    = isGrams ? 10 : 0.5;
  // Show trash icon on the minus button when one more decrement would remove the item
  const atThreshold = qty <= step;

  function adj(delta: number) {
    hapticLight();
    const next = Math.round((qty + delta) * 10) / 10;
    if (next <= 0) {
      onRemove();
    } else {
      onChange(next);
    }
  }

  const label = isGrams
    ? `${qty}g`
    : `${qty % 1 === 0 ? qty : qty.toFixed(1)} srv`;

  const btnCls =
    'flex h-8 w-8 items-center justify-center rounded-full bg-surface text-content border border-border-field transition-colors active:opacity-70';

  return (
    // stopPropagation so tapping stepper inside a card doesn't trigger card's onEdit
    <div
      className="inline-flex items-center gap-0 rounded-full bg-surface-sunken px-1 py-1"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        data-no-drag
        onClick={() => atThreshold ? (hapticLight(), onRemove()) : adj(-step)}
        className={`${btnCls}${atThreshold ? ' text-accent-hover' : ''}`}
        aria-label={atThreshold ? 'Remove item' : 'Decrease'}
      >
        {atThreshold ? (
          <DeleteIcon />
        ) : (
          <Icon name="minus" size={20} strokeWidth={2} />
        )}
      </button>
      <span className="min-w-[54px] text-center text-subhead font-normal text-content">
        {label}
      </span>
      <button data-no-drag onClick={() => adj(step)} className={btnCls} aria-label="Increase">
        <Icon name="plus" size={20} strokeWidth={2} />
      </button>
    </div>
  );
}

/** Delete icon from design spec — uses currentColor; defaults to 20×20 */
// ── BasketCard ────────────────────────────────────────────────────────────────

function BasketCard({
  item, nutrition, onQtyChange, onRemove, onEdit, onCorrect,
}: {
  item: BasketItem;
  nutrition: NutritionSnapshot;
  onQtyChange: (v: number) => void;
  onRemove: () => void;
  onEdit: () => void;
  /** When provided, shows a "Change" button (scanned items). */
  onCorrect?: () => void;
}) {
  return (
    <div
      className="rounded-[20px] border border-border-subtle bg-surface p-4 shadow-card"
      onClick={onEdit}
      style={{ cursor: 'pointer' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="flex-1 truncate text-callout text-content">{item.name}</span>
        <span className="shrink-0 text-callout font-bold text-content">{nutrition.calories} kcal</span>
      </div>
      <MacroSummaryLine nutrition={nutrition} className="mb-2.5" />
      {/* Bottom row: stepper (left) + action buttons (right) */}
      <div className="flex items-center justify-between">
        <BasketStepper item={item} qty={item.qty} onChange={onQtyChange} onRemove={onRemove} />
        <div className="flex items-center gap-1.5">
          {onCorrect && (
            <button
              onClick={(e) => { e.stopPropagation(); onCorrect(); }}
              className="flex h-10 items-center rounded-full border border-border-field px-3 text-subhead font-medium text-content-secondary active:bg-surface-sunken"
            >
              Change
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border-field bg-surface text-content active:opacity-60"
            aria-label="Edit"
          >
            <EditIcon size={20} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border-field bg-surface text-content active:opacity-60"
            aria-label="Remove"
          >
            <DeleteIcon size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── FoodPicker ────────────────────────────────────────────────────────────────

type PickerRow =
  | { type: 'item'; id: string; name: string; photo?: string; calories: number; protein: number }
  | { type: 'meal'; id: string; name: string; photo?: string; calories: number; protein: number };

function FoodPicker({
  items, allItems, meals = [], frequentItems = [], onPickItem, onPickMeal, onCamera, onPhoto, onDescribe, onLabel, onManual,
  bare = false,
}: {
  /** VISIBLE Food items — the ones offered as pickable rows. */
  items: FoodItem[];
  /** ALL Food items, including ones hidden from Pantry because they only
   *  exist to complete some other meal (round 130). Needed to correctly
   *  compute a listed Meal's own nutrition/photo, whose ingredients might
   *  include hidden ones. Defaults to `items` if not given. */
  allItems?: FoodItem[];
  /** Reusable Pantry Meals — searchable alongside Food items (round 129).
   *  Recent stays Food-item-only (no "recently logged meal" tracking yet). */
  meals?: Meal[];
  /** Pre-computed frequent items (most logged) to show in the Recent list. */
  frequentItems?: FoodItem[];
  onPickItem: (item: FoodItem, fromSearch?: boolean) => void;
  onPickMeal?: (meal: Meal, fromSearch?: boolean) => void;
  onCamera: () => void;
  onPhoto: () => void;
  onDescribe: () => void;
  onLabel: () => void;
  onManual: () => void;
  /** When true, skips the outer rounded container (use when parent already provides one). */
  bare?: boolean;
}) {
  const [query, setQuery] = useState('');
  const itemsById = itemsByIdMap(allItems ?? items);

  // Recent = frequently logged items; fall back to newest pantry items if none logged yet
  const recent = frequentItems.length > 0
    ? frequentItems
    : items.filter((i) => !i.isArchived).slice(0, 4);
  const q = query.trim().toLowerCase();

  const rows: PickerRow[] = q
    ? [
        ...items.filter((i) => !i.isArchived && i.name.toLowerCase().includes(q)).map((item): PickerRow => {
          const n = nutritionFor(item, item.referenceAmount);
          return { type: 'item', id: item.id, name: item.name, photo: item.photo, calories: Math.round(n.calories), protein: Math.round(n.protein * 10) / 10 };
        }),
        ...meals.filter((m) => !m.isArchived && m.name.toLowerCase().includes(q)).map((meal): PickerRow => {
          const n = mealNutritionFor(meal, itemsById);
          return { type: 'meal', id: meal.id, name: meal.name, photo: mealPhotoFor(meal, itemsById), calories: Math.round(n.calories), protein: Math.round(n.protein * 10) / 10 };
        }),
      ].sort((a, b) => a.name.localeCompare(b.name))
    : recent.map((item): PickerRow => {
        const n = nutritionFor(item, item.referenceAmount);
        return { type: 'item', id: item.id, name: item.name, photo: item.photo, calories: Math.round(n.calories), protein: Math.round(n.protein * 10) / 10 };
      });

  function pickRow(row: PickerRow) {
    const fromSearch = q.length > 0;
    if (row.type === 'item') {
      const item = items.find((i) => i.id === row.id);
      if (item) onPickItem(item, fromSearch);
    } else {
      const meal = meals.find((m) => m.id === row.id);
      if (meal) onPickMeal?.(meal, fromSearch);
    }
  }

  const inner = (
    <>
      {/* Search — pill shape guaranteed via overflow-hidden on wrapper (iOS focus resets border-radius on input) */}
      <div className="relative rounded-full bg-surface overflow-hidden">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-content-muted">
            <Icon name="search" size={16} strokeWidth={2} />
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search foods…"
            autoComplete="off"
            style={{ WebkitAppearance: 'none', appearance: 'none' }}
            className="w-full py-3 pl-10 pr-4 text-body text-content placeholder:text-content-muted outline-none bg-transparent"
          />
        </div>

        {/* List */}
        {rows.length > 0 && (
          <div>
            <p className="px-1 pt-3 pb-2 text-callout font-semibold text-content">{q ? 'Results' : 'Recent'}</p>
            <div className="overflow-hidden rounded-[16px] bg-surface divide-y divide-border-subtle">
              {rows.map((row) => (
                <button
                  key={`${row.type}-${row.id}`}
                  onClick={() => pickRow(row)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-sunken"
                >
                  {row.photo ? (
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-[10px]">
                      <img src={row.photo} alt={row.name} className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="h-11 w-11 shrink-0 rounded-[10px] bg-surface-sunken" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-subhead leading-[1.2] text-content">{row.name}</p>
                    <p className="mt-[4px] text-subhead leading-none text-content-secondary">
                      {row.type === 'item' ? 'Food item' : 'Meal'}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-subhead font-bold leading-[1.2] text-content">{row.calories} kcal</p>
                    <p className="mt-[4px] text-subhead leading-none text-content-secondary">{row.protein}g Protein</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); pickRow(row); }}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-black active:opacity-80"
                    aria-label={`Add ${row.name}`}
                  >
                    <Icon name="plus" size={16} strokeWidth={2.5} />
                  </button>
                </button>
              ))}
            </div>
          </div>
        )}

        {rows.length === 0 && q && (
          <p className="py-4 text-center text-subhead text-content-secondary">No results</p>
        )}

      {/* Method cards */}
      <div className={bare ? '' : 'mt-1'}>
        <p className="px-1 pt-2 pb-1 text-callout font-semibold text-content">Other methods</p>
        <MethodCards
          onCamera={onCamera}
          onPhoto={onPhoto}
          onDescribe={onDescribe}
          onLabel={onLabel}
          onManual={onManual}
        />
      </div>
    </>
  );

  if (bare) return <div className="space-y-1">{inner}</div>;
  return (
    <div className="space-y-1">
      <div className="rounded-[24px] bg-surface-sunken p-3">{inner}</div>
    </div>
  );
}

// ── DescribeOverlay ───────────────────────────────────────────────────────────

function DescribeOverlay({
  onBack, onAnalyze,
}: {
  onBack: () => void;
  /** Async — throws on error or when no food found. Overlay closes on success. */
  onAnalyze: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const hasText = text.trim().length > 0;

  // No sticky footer — Analyse button is inline below the textarea
  useOverlaySetFooter(null, []);

  async function handleAnalyse() {
    if (!hasText || loading) return;
    setLoading(true);
    setError('');
    try {
      await onAnalyze(text.trim());
      // onAnalyze closes the overlay on success
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      const isNetworkErr = /load failed|network|fetch/i.test(raw);
      setError(
        isNetworkErr
          ? 'Could not reach the AI service. Please check your connection and try again.'
          : raw || 'Could not estimate nutrition. Try being more specific.',
      );
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3 py-1">
      <OverlayNav title="Describe" onBack={onBack} />
      <textarea
        rows={5}
        value={text}
        onChange={(e) => { setText(e.target.value); if (error) setError(''); }}
        placeholder={`What did you eat?\ne.g. "a bowl of oats with banana and honey"`}
        className="min-h-[130px] w-full resize-none rounded-[16px] bg-surface-sunken px-4 py-3.5 text-callout leading-relaxed text-content placeholder:text-content-muted outline-none focus:ring-2 focus:ring-accent/30"
      />
      {error && <p className="text-caption text-danger">{error}</p>}
      <p className="text-caption text-content-secondary">
        Describe what you ate and AI will estimate the nutrition.
      </p>
      {/* Inline Analyse button — directly below content, not sticky */}
      {hasText && (
        <Button size="lg" onClick={() => void handleAnalyse()} disabled={loading}>
          {loading ? 'Analysing…' : 'Analyse'}
        </Button>
      )}
    </div>
  );
}


// ── ServingModal ──────────────────────────────────────────────────────────────

function ServingModal({
  name, servingG, onPer100g, onPerServing, onDismiss,
}: {
  name: string; servingG: number;
  onPer100g: () => void; onPerServing: () => void; onDismiss: () => void;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-end bg-black/40" onClick={onDismiss}>
      <div
        className="w-full space-y-3 rounded-t-[28px] bg-surface px-5 pt-6"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 34px) + 24px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grab handle */}
        <div className="mx-auto -mt-2 mb-1 h-1.5 w-11 rounded-pill bg-border-strong" />
        <p className="text-headline font-bold text-content">How to track {name}?</p>
        <p className="text-subhead text-content-secondary">
          Choose the measurement from the nutrition label.
        </p>
        <button
          onClick={onPer100g}
          className="w-full rounded-full border border-border-field bg-surface-sunken py-4 text-body font-semibold text-content transition-colors active:border-accent"
        >
          Per 100g
        </button>
        <button
          onClick={onPerServing}
          className="w-full rounded-full border border-border-field bg-surface-sunken py-4 text-body font-semibold text-content transition-colors active:border-accent"
        >
          Per serving ({servingG}g)
        </button>
      </div>
    </div>,
    document.body,
  );
}

// ── ManualOverlay ─────────────────────────────────────────────────────────────

function ManualOverlay({
  items, onBack, onAdd, soleItem = false,
}: {
  items: FoodItem[];
  onBack: () => void;
  onAdd: (entry: {
    name: string; calories: number; protein: number; carbs: number;
    fiber: number; fat: number; saveToPantry: boolean;
    measurementType: 'per_100g' | 'per_serving'; referenceAmount: number;
    photo?: string;
  }) => void;
  /** True when the basket is currently empty — this manual entry will be
   *  the ONLY food item, not one of several in a meal, so the CTA reads
   *  "Save food" rather than "Add to meal". */
  soleItem?: boolean;
}) {
  useOverlaySetFooter(null, []);

  return (
    <div className="space-y-3 py-1">
      <OverlayNav title="Add manually" onBack={onBack} />
      <FoodItemFormContent
        mode="basket-manual"
        soleItem={soleItem}
        existingItems={items}
        onSave={(values: FoodItemFormValues) => onAdd({
          name:            values.name,
          calories:        values.calories,
          protein:         values.protein,
          carbs:           values.carbs,
          fiber:           values.fiber,
          fat:             values.fat,
          saveToPantry:    values.saveToPantry,
          measurementType: values.measurementType,
          referenceAmount: values.referenceAmount,
          photo:           values.photo,
        })}
        onCancel={onBack}
      />
    </div>
  );
}

// ── EditOverlay ───────────────────────────────────────────────────────────────

function EditOverlay({
  item, currentPhoto, onBack, onSave, onPhotoChange, existingItems,
}: {
  item: BasketItem;
  currentPhoto?: string;
  onBack: () => void;
  onSave: (patch: Partial<BasketItem>, saveToPantry: boolean, photo: string | undefined) => void;
  onPhotoChange?: (dataUrl: string | undefined) => void;
  existingItems?: FoodItem[];
}) {
  return (
    <div className="space-y-3 py-1">
      <OverlayNav title="Edit" onBack={onBack} />
      <FoodItemFormContent
        mode="basket-edit"
        initial={{
          name:            item.name,
          measurementType: item.measurementType,
          referenceAmount: item.referenceAmount,
          calories:        item.calories,
          protein:         item.protein,
          carbs:           item.carbs,
          fiber:           item.fiber,
          fat:             item.fat,
          photo:           currentPhoto,
          pantryItemId:    item.pantryItemId,
        }}
        existingItems={existingItems}
        onSave={(values: FoodItemFormValues) => onSave({
          name:            values.name,
          calories:        values.calories,
          protein:         values.protein,
          carbs:           values.carbs,
          fiber:           values.fiber,
          fat:             values.fat,
          measurementType: values.measurementType,
          referenceAmount: values.referenceAmount,
        }, values.saveToPantry, values.photo)}
        onCancel={onBack}
        onPhotoChange={onPhotoChange}
      />
    </div>
  );
}


// ── LogEntrySheet (exported) ──────────────────────────────────────────────────
// Unified basket-style editor for a previously-logged FoodEntry.
// All three cases (pantry / manual / meal) look exactly like the basket.

function entryToBasket(entry: FoodEntry, pantryItems: FoodItem[]): BasketItem[] {
  const pantryItem = pantryItems.find((i) => i.id === entry.foodItemId);

  if (pantryItem) {
    // Pantry-linked entry — use stored qty
    const qty = entry.quantity ?? (pantryItem.measurementType === 'per_100g' ? 100 : 1);
    return [{
      id: newId(),
      name: pantryItem.name,
      measurementType: pantryItem.measurementType,
      referenceAmount: pantryItem.referenceAmount,
      calories: pantryItem.calories,
      protein:  pantryItem.protein,
      carbs:    pantryItem.carbs,
      fiber:    pantryItem.fiber,
      fat:      pantryItem.fat,
      qty,
      pantryItemId: pantryItem.id,
    }];
  }

  if (entry.mealData) {
    // Meal entry — each MealItem becomes a per_serving BasketItem
    return entry.mealData.items.map((item) => ({
      id: newId(),
      name: item.name,
      measurementType: 'per_serving' as const,
      referenceAmount: 1,
      calories: item.calories,
      protein:  item.protein,
      carbs:    item.carbs,
      fiber:    item.fiber,
      fat:      item.fat,
      qty: item.qty ?? 1,
    }));
  }

  // Manual entry — single basket item from snapshot
  return [{
    id: newId(),
    name: entry.manualName ?? 'Food',
    measurementType: 'per_serving' as const,
    referenceAmount: 1,
    calories: entry.snapshot.calories,
    protein:  entry.snapshot.protein,
    carbs:    entry.snapshot.carbs,
    fiber:    entry.snapshot.fiber,
    fat:      entry.snapshot.fat,
    qty: 1,
  }];
}

export function LogEntrySheet({
  entry, pantryItems, onClose, showToast,
}: {
  entry: FoodEntry;
  pantryItems: FoodItem[];
  onClose: () => void;
  showToast?: ShowToast;
}) {
  const pantryItem = pantryItems.find((i) => i.id === entry.foodItemId);
  const title = entry.mealData?.name ?? entry.manualName ?? pantryItem?.name ?? 'Food';

  // del() is defined inside LogEntryContent (which lives in Sheet's context);
  // we forward a stable ref so the trash button in the Sheet header can call it.
  const delRef = useRef<() => void>(() => undefined);

  const trashBtn = (
    <button data-no-drag onClick={() => void delRef.current()} aria-label="Delete"
      className="-m-1 p-1 text-content-secondary active:text-danger">
      <DeleteIcon size={20} />
    </button>
  );

  return (
    <Sheet title={title} onClose={onClose} forceExpanded rightAction={trashBtn}>
      {/* LogEntryContent is a child of Sheet so Sheet's context (overlay, footer, etc.) is available */}
      <LogEntryContent
        entry={entry}
        pantryItems={pantryItems}
        pantryItem={pantryItem ?? null}
        onClose={onClose}
        showToast={showToast}
        delRef={delRef}
      />
    </Sheet>
  );
}

function LogEntryContent({
  entry, pantryItems, pantryItem, onClose, showToast, delRef,
}: {
  entry: FoodEntry;
  pantryItems: FoodItem[];
  pantryItem: FoodItem | null;
  onClose: () => void;
  showToast?: ShowToast;
  delRef: React.MutableRefObject<() => void>;
}) {
  const meals = useLive(() => repos.meals.all(), []) ?? [];
  // Full set (includeArchived) — same reasoning as FoodForm's allItems:
  // resolves a picked Meal's ingredients even when some are hidden from
  // Pantry (round 130).
  const allItems = useLive(() => repos.foodItems.all(true), []) ?? [];

  // ── Basket — initialized once so hasChanges comparison IDs stay stable ─
  const initialBasketRef = useRef<BasketItem[]>([]);
  // eslint-disable-next-line react-hooks/refs -- write inside initializer runs once at mount
  const [basket, setBasket] = useState<BasketItem[]>(() => {
    const b = entryToBasket(entry, pantryItems);
    initialBasketRef.current = b;
    return b;
  });

  // ── Photos — prefer stored photos array, fall back to single photo string ─
  const [localPhotos, setLocalPhotos] = useState<string[]>(() => {
    if (entry.mealData?.photos?.length) return entry.mealData.photos;
    if (entry.mealData?.photo) return [entry.mealData.photo];
    if (pantryItem?.photo) return [pantryItem.photo];
    return [];
  });

  // ── Meal name — editable when basket has 2+ items ──────────────────────
  const [localMealName, setLocalMealName] = useState(entry.mealData?.name ?? '');
  // Pre-checked when this entry is already linked to a real Pantry Meal.
  const [saveToPantry, setSaveToPantry] = useState(!!entry.mealId);

  const _freqIds = useLive(() => repos.foodEntries.frequentItemIds(4, 3), []) ?? [];
  const frequentItems = _freqIds
    .map((id) => pantryItems.find((p) => p.id === id))
    .filter((p): p is FoodItem => p != null && !p.isArchived);

  // ── UI state ───────────────────────────────────────────────────────────
  const [editingIdx, setEditingIdx]       = useState<number | null>(null);
  const [correctingIdx, setCorrectingIdx] = useState<number | null>(null);
  const [activeOverlay, setActiveOverlay] = useState<'describe' | 'manual' | 'edit' | null>(null);
  const [pickerOpen, setPickerOpen]       = useState(false);
  const [analyzing, setAnalyzing]         = useState(false);
  const [analyzeLabel, setAnalyzeLabel]   = useState('Analysing…');
  const [servingModal, setServingModal]   = useState<{
    item100: BasketItem; itemSrv: BasketItem; servingG: number;
  } | null>(null);
  const scanInputRef  = useRef<HTMLInputElement>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // ── Change detection — strip volatile IDs before comparing ─────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function stripIds(b: BasketItem[]) { return JSON.stringify(b.map(({ id: _, ...r }) => r)); }
  const initialPhotos = entry.mealData?.photos ?? (entry.mealData?.photo ? [entry.mealData.photo] : (pantryItem?.photo ? [pantryItem.photo] : []));
  // eslint-disable-next-line react-hooks/refs
  const hasChanges = stripIds(basket) !== stripIds(initialBasketRef.current)
    || localPhotos.join() !== initialPhotos.join()
    || localMealName !== (entry.mealData?.name ?? '')
    || saveToPantry !== !!entry.mealId;

  // ── Overlay back ────────────────────────────────────────────────────────
  function overlayBack() {
    setActiveOverlay(null);
    setEditingIdx(null);
    setCorrectingIdx(null);
  }
  const overlayBackRef = useRef(overlayBack);
  overlayBackRef.current = overlayBack; // eslint-disable-line react-hooks/refs
  useSheetSetOverlayBack(() => overlayBackRef.current());

  // ── Overlay content ─────────────────────────────────────────────────────
  const editItem = activeOverlay === 'edit' && editingIdx !== null ? basket[editingIdx] ?? null : null;
  useSheetSetOverlay(
    activeOverlay === 'describe' ? (
      <DescribeOverlay onBack={overlayBack} onAnalyze={handleDescribeAnalyze} />
    ) : activeOverlay === 'manual' ? (
      <ManualOverlay items={pantryItems} onBack={overlayBack} onAdd={addManualItem} soleItem={basket.length === 0} />
    ) : editItem ? (
      <EditOverlay
        item={editItem}
        currentPhoto={localPhotos[0]}
        onBack={overlayBack}
        existingItems={pantryItems}
        onSave={(patch, saveToPantry, photo) => {
          const pantryItemId = saveToPantry && editItem ? newId() : undefined;
          setBasket((prev) => prev.map((b, i) =>
            i === editingIdx ? { ...b, ...patch, ...(pantryItemId ? { pantryItemId } : {}) } : b));
          if (pantryItemId && editItem) {
            void repos.foodItems.put({
              id: pantryItemId, name: patch.name ?? editItem.name,
              measurementType: patch.measurementType ?? editItem.measurementType,
              referenceAmount: patch.referenceAmount ?? editItem.referenceAmount,
              calories: patch.calories ?? editItem.calories,
              protein:  patch.protein  ?? editItem.protein,
              carbs:    patch.carbs    ?? editItem.carbs,
              fiber:    patch.fiber    ?? editItem.fiber,
              fat:      patch.fat      ?? editItem.fat,
              photo, isArchived: false,
            });
            // Persist the pantry link so re-opening the sheet reflects the new state
            void repos.foodEntries.update({
              ...entry,
              foodItemId: pantryItemId,
              isManual: false,
              manualName: undefined,
            });
          }
          overlayBack();
        }}
        onPhotoChange={(dataUrl) => {
          if (dataUrl) setLocalPhotos((prev) => [dataUrl, ...prev.filter((p) => p !== localPhotos[0])].slice(0, 4));
          else setLocalPhotos((prev) => prev.filter((p) => p !== localPhotos[0]));
        }}
      />
    ) : null,
    [activeOverlay, editingIdx, editItem],
  );

  // ── Scan ────────────────────────────────────────────────────────────────
  async function runScan(imageDataUrl: string, label = 'Analysing your meal…') {
    setAnalyzeLabel(label);
    setAnalyzing(true);
    setActiveOverlay(null);
    try {
      const rawFoods = await scanFood(imageDataUrl);
      const newItems = rawFoods.map((f) =>
        scanResultToBasket({ ...f, name: cleanScanName(f.name) }, newId()),
      );
      setBasket((prev) => [...prev, ...newItems]);
      setLocalPhotos((prev) => [...prev, imageDataUrl].slice(0, 4));
      setPickerOpen(false);
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleCamera() {
    setPickerOpen(false);
    if (isNativeIOS()) {
      const photo = await captureFromCamera();
      if (photo) await runScan(photo, 'Analysing your photo…');
    } else if (SCAN_ENABLED) {
      scanInputRef.current?.click();
    } else {
      showToast?.('Food scan not configured');
    }
  }

  async function handlePhoto() {
    setPickerOpen(false);
    if (isNativeIOS()) {
      const photo = await captureFromLibrary();
      if (photo) await runScan(photo, 'Analysing your photo…');
    } else if (SCAN_ENABLED) {
      scanInputRef.current?.click();
    } else {
      showToast?.('Food scan not configured');
    }
  }

  async function handleDescribeAnalyze(text: string): Promise<void> {
    const foods = await describeFood(text);
    if (foods.length === 0) {
      throw new Error('no food — Please describe a food or meal (e.g. "a bowl of oats with banana").');
    }
    const newItems = foods.map((f) =>
      scanResultToBasket({
        name: f.name, estimatedGrams: f.estimatedGrams,
        calories: f.calories, protein: f.protein,
        carbs: f.carbs, fiber: f.fiber, fat: f.fat,
      }, newId()),
    );
    if (correctingIdx !== null) {
      // Replace just the item being corrected
      setBasket((prev) => [
        ...prev.slice(0, correctingIdx),
        ...newItems,
        ...prev.slice(correctingIdx + 1),
      ]);
      setCorrectingIdx(null);
    } else {
      setBasket((prev) => [...prev, ...newItems]);
      setPickerOpen(false);
    }
    setActiveOverlay(null);
  }

  async function handleLabelScan(imageDataUrl: string) {
    setAnalyzeLabel('Reading the label…');
    setAnalyzing(true);
    try {
      const foods = await scanFood(imageDataUrl);
      if (foods.length === 0) throw new Error('No nutrition label detected');
      const f = foods[0];
      const servingG = Math.max(Number(f.estimatedGrams) || 100, 1);
      const factor = 100 / servingG;
      const sourceId = newId();
      const item100: BasketItem = {
        id: newId(), name: cleanScanName(f.name), measurementType: 'per_100g', referenceAmount: 100,
        calories: (Number(f.calories) || 0) * factor,
        protein:  (Number(f.protein)  || 0) * factor,
        carbs:    (Number(f.carbs)    || 0) * factor,
        fiber:    (Number(f.fiber)    || 0) * factor,
        fat:      (Number(f.fat)      || 0) * factor,
        qty: 100, sourceId,
      };
      const itemSrv: BasketItem = {
        id: newId(), name: cleanScanName(f.name), measurementType: 'per_serving', referenceAmount: servingG,
        calories: Number(f.calories) || 0, protein: Number(f.protein) || 0,
        carbs: Number(f.carbs) || 0, fiber: Number(f.fiber) || 0, fat: Number(f.fat) || 0,
        qty: 1, sourceId,
      };
      setServingModal({ item100, itemSrv, servingG });
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : 'Label scan failed');
    } finally {
      setAnalyzing(false);
    }
  }

  // ── Basket mutations ─────────────────────────────────────────────────────
  function addPantryItem(item: FoodItem) {
    hapticLight();
    const existingIdx = basket.findIndex((b) => b.pantryItemId === item.id);
    if (existingIdx !== -1) {
      const existing = basket[existingIdx];
      const step = existing.measurementType === 'per_100g' ? 10 : 1;
      setBasket((prev) => prev.map((b, i) => i === existingIdx ? { ...b, qty: b.qty + step } : b));
      setPickerOpen(false);
      return;
    }
    setBasket((prev) => [...prev, pantryToBasket(item)]);
    if (item.photo) setLocalPhotos((prev) => [...prev, item.photo!].slice(0, 4));
    setPickerOpen(false);
  }

  function addPantryMeal(meal: Meal) {
    hapticLight();
    const photos: string[] = [];
    const mealBasketItems: BasketItem[] = meal.items
      .map((mi) => {
        const item = allItems.find((i) => i.id === mi.foodItemId);
        if (!item) return null;
        if (item.photo) photos.push(item.photo);
        return { ...pantryToBasket(item), qty: mi.quantity };
      })
      .filter((b): b is BasketItem => b != null);
    if (mealBasketItems.length === 0) {
      showToast?.('Could not load that meal — its food items may have been removed');
      return;
    }
    // Always flattens into the existing basket here (never a "fast path" —
    // this entry already exists) — no nesting one meal inside another
    // (spec §5/§18).
    setBasket((prev) => [...prev, ...mealBasketItems]);
    if (photos.length > 0) setLocalPhotos((prev) => Array.from(new Set([...prev, ...photos])).slice(0, 4));
    setPickerOpen(false);
    showToast?.(`Added ${mealBasketItems.length} items from ${meal.name}`);
  }

  function addManualItem(e: {
    name: string; calories: number; protein: number; carbs: number;
    fiber: number; fat: number; saveToPantry: boolean;
    measurementType: 'per_100g' | 'per_serving'; referenceAmount: number;
    photo?: string;
  }) {
    const pantryId = e.saveToPantry ? newId() : undefined;
    if (pantryId) {
      void repos.foodItems.put({
        id: pantryId, name: e.name, measurementType: e.measurementType,
        referenceAmount: e.referenceAmount, calories: e.calories,
        protein: e.protein, carbs: e.carbs, fiber: e.fiber, fat: e.fat,
        photo: e.photo, isArchived: false,
      });
    }
    const newItem: BasketItem = {
      id: newId(), name: e.name, measurementType: e.measurementType,
      referenceAmount: e.referenceAmount, calories: e.calories,
      protein: e.protein, carbs: e.carbs, fiber: e.fiber, fat: e.fat,
      qty: e.measurementType === 'per_100g' ? 100 : 1,
      ...(pantryId ? { pantryItemId: pantryId } : {}),
    };
    if (e.photo) setLocalPhotos((prev) => [...prev, e.photo!].slice(0, 4));
    setBasket((prev) => [...prev, newItem]);
    setPickerOpen(false);
    setActiveOverlay(null);
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  function roundSnap(n: NutritionSnapshot): NutritionSnapshot {
    return {
      calories: Math.round(n.calories),
      protein:  Math.round(n.protein * 10) / 10,
      carbs:    Math.round(n.carbs   * 10) / 10,
      fiber:    Math.round(n.fiber   * 10) / 10,
      fat:      Math.round(n.fat     * 10) / 10,
    };
  }

  async function save() {
    const photo  = localPhotos[0];
    const photos = localPhotos.slice(0, 4);
    if (basket.length === 1 && pantryItem && basket[0].pantryItemId === pantryItem.id) {
      const b = basket[0];
      // Shrunk back to a single pantry-linked item — no longer a Meal (the
      // Meal object, if one existed, is left alone in Pantry, not deleted).
      await repos.foodEntries.update({
        ...entry, quantity: b.qty, snapshot: roundSnap(basketNutrition(b)),
        mealId: undefined, mealData: undefined,
      });
    } else if (basket.length > 1 || entry.mealData) {
      const mealName = localMealName.trim() || timeMealName();

      // Resolve each basket item to a real Pantry Food item id where
      // possible — same rule as fresh logging (logBasket): already-linked
      // items keep their link regardless of the checkbox below; brand-new
      // items only get a real Food item created when the whole Meal is
      // being saved to Pantry.
      const resolvedFoodItemIds: (string | undefined)[] = [];
      for (const b of basket) {
        if (b.pantryItemId) {
          resolvedFoodItemIds.push(b.pantryItemId);
        } else if (saveToPantry) {
          const newFoodItemId = newId();
          await repos.foodItems.put({
            id: newFoodItemId, name: b.name,
            measurementType: b.measurementType, referenceAmount: b.referenceAmount,
            calories: b.calories, protein: b.protein, carbs: b.carbs,
            fiber: b.fiber, fat: b.fat, isArchived: false,
          });
          resolvedFoodItemIds.push(newFoodItemId);
        } else {
          resolvedFoodItemIds.push(undefined);
        }
      }

      const items: MealItem[] = basket.map((b, i) => {
        const orig = entry.mealData?.items[i];
        return {
          name: b.name,
          description: orig?.description ?? '',
          estimatedGrams: orig?.estimatedGrams
            ?? (b.measurementType === 'per_100g' ? Math.round(b.qty) : b.referenceAmount),
          calories: b.calories, protein: b.protein, carbs: b.carbs,
          fiber: b.fiber, fat: b.fat,
          confidence: orig?.confidence ?? 'high',
          selected: orig?.selected ?? true,
          qty: b.qty,
          foodItemId: resolvedFoodItemIds[i],
        };
      });
      const snapshot: NutritionSnapshot = {
        calories: Math.round(items.reduce((s, it) => s + it.calories * (it.qty ?? 1), 0)),
        protein:  Math.round(items.reduce((s, it) => s + it.protein  * (it.qty ?? 1), 0) * 10) / 10,
        carbs:    Math.round(items.reduce((s, it) => s + it.carbs    * (it.qty ?? 1), 0) * 10) / 10,
        fiber:    Math.round(items.reduce((s, it) => s + it.fiber    * (it.qty ?? 1), 0) * 10) / 10,
        fat:      Math.round(items.reduce((s, it) => s + it.fat      * (it.qty ?? 1), 0) * 10) / 10,
      };

      // Create (first time) or update (already linked) the real Meal when
      // saved to pantry; unchecking just un-links this entry — the Meal
      // object, if one already existed, is left alone in Pantry, never
      // deleted as a side effect of editing a Day's-log entry.
      let mealId: string | undefined;
      if (saveToPantry) {
        const mealFoodItems: MealFoodItem[] = basket.map((b, i) => ({
          id: newId(), foodItemId: resolvedFoodItemIds[i]!, quantity: b.qty,
        }));
        mealId = entry.mealId ?? newId();
        await repos.meals.put({ id: mealId, name: mealName, photo, items: mealFoodItems, isArchived: false });
      }

      await repos.foodEntries.update({ ...entry, mealId, snapshot, mealData: { name: mealName, photo, photos, items } });
    } else {
      const b = basket[0];
      // Shrunk back to a single manual item — same as above, no longer a Meal.
      await repos.foodEntries.update({
        ...entry, manualName: b.name, snapshot: roundSnap(basketNutrition(b)),
        mealId: undefined, mealData: undefined,
      });
    }
    showToast?.('Saved');
    onClose();
  }

  // ── Delete — also registered on parent's delRef for the trash button ────
  async function del() {
    await repos.foodEntries.remove(entry.id);
    showToast?.('Removed', async () => repos.foodEntries.add(entry));
    onClose();
  }
  delRef.current = del; // eslint-disable-line react-hooks/refs

  return (
    <>
      {/* Hidden file inputs */}
      <input
        ref={scanInputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]; e.target.value = '';
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => void runScan(reader.result as string, 'Analysing your photo…');
          reader.readAsDataURL(file);
        }}
      />
      <input
        ref={labelInputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]; e.target.value = '';
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => void handleLabelScan(reader.result as string);
          reader.readAsDataURL(file);
        }}
      />
      {/* Photo picker — no scan, just attach image */}
      <input
        ref={photoInputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]; e.target.value = '';
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const url = reader.result as string;
            setLocalPhotos((prev) => [url, ...prev].slice(0, 4));
          };
          reader.readAsDataURL(file);
        }}
      />

      {/* Scan spinner */}
      {analyzing && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-[28px] bg-surface/80">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent/20 border-t-accent" />
          <p className="text-callout font-semibold text-content">{analyzeLabel}</p>
        </div>
      )}

      <div className="space-y-3 pb-4">

        {/* Photos — multi-photo collage */}
        {localPhotos.length > 0 && (
          <ImageHero photos={localPhotos} className="mb-1" />
        )}

        {/* Editable meal name — shown when 2+ items */}
        {basket.length >= 2 && (
          <div>
            <LabeledInput
              label="Meal name"
              value={localMealName}
              onChange={(e) => setLocalMealName(e.target.value)}
              placeholder={timeMealName()}
            />
            <label className="flex cursor-pointer select-none items-center gap-2 text-subhead text-content-secondary mt-2">
              <input
                type="checkbox"
                checked={saveToPantry}
                onChange={(e) => setSaveToPantry(e.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              Save to pantry
            </label>
          </div>
        )}

        {/* Basket cards */}
        {basket.map((item, idx) => (
          <BasketCard
            key={item.id}
            item={item}
            nutrition={basketNutrition(item)}
            onQtyChange={(v) => setBasket((prev) => prev.map((b, i) => i === idx ? { ...b, qty: v } : b))}
            onRemove={() => {
              if (basket.length === 1) { void del(); return; }
              const removedItem = basket[idx];
              setBasket((prev) => prev.filter((_, i) => i !== idx));
              // Remove photo from localPhotos if no other basket item uses the same pantry photo
              if (removedItem.pantryItemId) {
                const pantryPhoto = pantryItems.find((p) => p.id === removedItem.pantryItemId)?.photo;
                if (pantryPhoto) {
                  const stillReferenced = basket
                    .filter((_, i) => i !== idx)
                    .some((b) => pantryItems.find((p) => p.id === b.pantryItemId)?.photo === pantryPhoto);
                  if (!stillReferenced) {
                    setLocalPhotos((prev) => prev.filter((p) => p !== pantryPhoto));
                  }
                }
              }
            }}
            onEdit={() => { setEditingIdx(idx); setActiveOverlay('edit'); }}
            onCorrect={item.sourceId ? () => { setCorrectingIdx(idx); setActiveOverlay('describe'); } : undefined}
          />
        ))}

        {/* Inline add-another with full FoodPicker — same copy rule as
            FoodForm: "Create a meal" while still a single item, "Add a new
            food item" once it already is one. */}
        <AddAnotherSection
          label={basket.length >= 2 ? 'Add a new food item' : 'Create a meal'}
          helperText={basket.length >= 2 ? undefined : 'Add another item'}
          open={pickerOpen}
          onToggle={() => setPickerOpen((v) => !v)}
          onClose={() => setPickerOpen(false)}
        >
          <FoodPicker
            items={pantryItems}
            allItems={allItems}
            meals={meals}
            frequentItems={frequentItems}
            onPickItem={addPantryItem}
            onPickMeal={addPantryMeal}
            onCamera={() => void handleCamera()}
            onPhoto={() => void handlePhoto()}
            onDescribe={() => setActiveOverlay('describe')}
            onLabel={() => labelInputRef.current?.click()}
            onManual={() => setActiveOverlay('manual')}
            bare
          />
        </AddAnotherSection>

        {/* Save CTA — 24px gap above (space-y-3=12px + pt-3=12px) */}
        {hasChanges && (
          <div className="pt-3">
            <Button size="lg" onClick={() => void save()}>Save changes</Button>
          </div>
        )}
      </div>

      {/* Label-scan serving modal */}
      {servingModal && (
        <ServingModal
          name={servingModal.item100.name}
          servingG={servingModal.servingG}
          onPer100g={() => {
            setBasket((prev) => [...prev, servingModal.item100]);
            setServingModal(null);
            setPickerOpen(false);
          }}
          onPerServing={() => {
            setBasket((prev) => [...prev, servingModal.itemSrv]);
            setServingModal(null);
            setPickerOpen(false);
          }}
          onDismiss={() => setServingModal(null)}
        />
      )}
    </>
  );
}

// ── ScanResults (exported — used by TodayScreen + DevMenu) ───────────────────

export type ResultItem = import('../../domain/types').MealItem;

export function ScanResults({ items, onChange, onLog, scanPhoto, mealName, onMealNameChange, logLabel, extraSection }: {
  items: ResultItem[];
  onChange: (items: ResultItem[]) => void;
  onLog: () => Promise<void>;
  scanPhoto: string | null;
  mealName?: string;
  onMealNameChange?: (name: string) => void;
  logLabel?: string;
  extraSection?: React.ReactNode;
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [logging, setLogging] = useState(false);
  const isMeal = items.length > 1;
  const selectedItems = items.filter((i) => i.selected);

  const totalCalories = selectedItems.reduce((s, i) => s + (Number(i.calories) || 0), 0);
  const totalProtein  = selectedItems.reduce((s, i) => s + (Number(i.protein)  || 0), 0);
  const totalCarbs    = selectedItems.reduce((s, i) => s + (Number(i.carbs)    || 0), 0);
  const totalFiber    = selectedItems.reduce((s, i) => s + (Number(i.fiber)    || 0), 0);
  const totalFat      = selectedItems.reduce((s, i) => s + (Number(i.fat)      || 0), 0);
  const totalGrams    = selectedItems.reduce((s, i) => s + (Number(i.estimatedGrams) || 0), 0);

  const originalsRef = useRef<Record<number, { g: number; cal: number; pro: number; carbs: number; fib: number; fat: number }>>({});

  function expand(idx: number) {
    const next = expandedIdx === idx ? null : idx;
    if (next !== null && !(next in originalsRef.current)) {
      const item = items[next];
      originalsRef.current[next] = {
        g: item.estimatedGrams, cal: item.calories, pro: item.protein,
        carbs: item.carbs, fib: item.fiber, fat: item.fat,
      };
    }
    setExpandedIdx(next);
  }

  function update(idx: number, patch: Partial<ResultItem>) {
    onChange(items.map((item, i) => i === idx ? { ...item, ...patch } : item));
  }

  function updateGrams(idx: number, newGrams: number) {
    const orig = originalsRef.current[idx];
    if (!orig || orig.g === 0) { update(idx, { estimatedGrams: newGrams }); return; }
    const s = newGrams / orig.g;
    update(idx, {
      estimatedGrams: newGrams,
      calories: Math.round(orig.cal * s),
      protein:  Math.round(orig.pro   * s * 10) / 10,
      carbs:    Math.round(orig.carbs * s * 10) / 10,
      fiber:    Math.round(orig.fib   * s * 10) / 10,
      fat:      Math.round(orig.fat   * s * 10) / 10,
    });
  }

  return (
    <div className="mt-2 flex flex-col space-y-3">
      {scanPhoto && (
        <div className="flex shrink-0 justify-center pb-1">
          <div className="h-64 w-64 overflow-hidden rounded-[24px] shadow-card-lg">
            <img src={scanPhoto} alt="Scanned meal" className="h-full w-full object-cover" />
          </div>
        </div>
      )}

      {isMeal && onMealNameChange && (
        <LabeledInput
          label="Meal name"
          value={mealName ?? ''}
          onChange={(e) => onMealNameChange(e.target.value)}
          placeholder={timeMealName()}
        />
      )}

      {isMeal && items.length > 0 && (
        <div className="rounded-[16px] bg-surface-sunken px-4 py-3">
          <p className="mb-2 text-caption font-semibold uppercase text-content-secondary">Total nutrition</p>
          <div className="flex gap-4">
            <div className="flex-1">
              <p className="text-subhead text-content-secondary">≈{totalGrams}g total</p>
              <p className="text-subhead text-content-secondary">{totalCalories} kcal</p>
              <p className="text-subhead text-content-secondary">{parseFloat(totalProtein.toFixed(1))}g protein</p>
            </div>
            <div className="flex-1">
              <p className="text-subhead text-content-secondary">{parseFloat(totalCarbs.toFixed(1))}g carbs</p>
              <p className="text-subhead text-content-secondary">{parseFloat(totalFiber.toFixed(1))}g fiber</p>
              <p className="text-subhead text-content-secondary">{parseFloat(totalFat.toFixed(1))}g fat</p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between px-0.5">
        <span className="text-subhead font-semibold text-content">
          {items.length} item{items.length !== 1 ? 's' : ''} detected
        </span>
      </div>

      {items.length === 0 ? (
        <p className="py-8 text-center text-subhead text-content-secondary">
          No food detected. Try again with better lighting or a clearer angle.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div
              key={idx}
              className={`rounded-[20px] bg-surface shadow-card transition-opacity ${item.selected ? '' : 'opacity-40'}`}
            >
              <div className="flex flex-col gap-2 p-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={(e) => update(idx, { selected: e.target.checked })}
                    className="h-5 w-5 shrink-0 accent-accent"
                    aria-label={`Include ${item.name}`}
                  />
                  <span className="flex-1 truncate text-callout text-content">{item.name}</span>
                  <button
                    type="button"
                    onClick={() => expand(idx)}
                    className="shrink-0 text-content-secondary"
                    aria-label={expandedIdx === idx ? 'Collapse' : 'Edit values'}
                  >
                    <Icon
                      name={expandedIdx === idx ? 'chevronDown' : 'edit'}
                      size={18}
                      className={expandedIdx === idx ? 'rotate-180' : undefined}
                    />
                  </button>
                </div>

                {item.description && (
                  <p className="text-subhead text-content">{item.description}</p>
                )}

                {expandedIdx !== idx && (
                  <div className="rounded-[16px] bg-surface-sunken px-4 py-3">
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <p className="text-subhead text-content-secondary">≈{item.estimatedGrams}g</p>
                        <p className="text-subhead text-content-secondary">{item.calories} kcal</p>
                        <p className="text-subhead text-content-secondary">{item.protein}g protein</p>
                      </div>
                      <div className="flex-1">
                        <p className="text-subhead text-content-secondary">{item.carbs}g carbs</p>
                        <p className="text-subhead text-content-secondary">{item.fiber}g fiber</p>
                        <p className="text-subhead text-content-secondary">{item.fat}g fat</p>
                      </div>
                    </div>
                  </div>
                )}

                {expandedIdx === idx && (
                  <div className="border-t border-border-subtle pt-3">
                    <div className="grid grid-cols-2 gap-2">
                      <NumberField label="Calories" value={String(item.calories)} set={(v) => update(idx, { calories: +v || 0 })} centerAt={350} />
                      <NumberField label="Protein (g)" value={String(item.protein)} set={(v) => update(idx, { protein: +v || 0 })} centerAt={25} />
                      <NumberField label="Carbs (g)" value={String(item.carbs)} set={(v) => update(idx, { carbs: +v || 0 })} centerAt={30} />
                      <NumberField label="Fiber (g)" value={String(item.fiber)} set={(v) => update(idx, { fiber: +v || 0 })} centerAt={5} />
                      <NumberField label="Fat (g)" value={String(item.fat)} set={(v) => update(idx, { fat: +v || 0 })} centerAt={12} />
                      <NumberField label="Est. weight (g)" value={String(item.estimatedGrams)} set={(v) => updateGrams(idx, +v || 0)} max={2000} step={5} centerAt={150} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="px-1 pb-2 text-center text-caption text-content-secondary">
        AI-generated results may be inaccurate.
      </p>

      {extraSection}

      <div
        className="sticky bottom-0 -mx-5 px-5"
        style={{
          paddingTop: '5rem',
          background: 'linear-gradient(to bottom, transparent 0%, var(--color-surface) 5rem)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)',
        }}
      >
        <Button
          size="lg"
          onClick={async () => { setLogging(true); await onLog(); }}
          disabled={selectedItems.length === 0 || logging}
        >
          {logging
            ? 'Logging…'
            : logLabel
              ? logLabel
              : isMeal
                ? 'Log meal'
                : `Log ${selectedItems.length} item${selectedItems.length !== 1 ? 's' : ''}`}
        </Button>
      </div>
    </div>
  );
}

// ── Activity form constants ───────────────────────────────────────────────────

const INTENSITY_OPTIONS = [
  { value: 'light',    label: 'Light',    kcalPerMin: 4  },
  { value: 'moderate', label: 'Moderate', kcalPerMin: 7  },
  { value: 'intense',  label: 'Intense',  kcalPerMin: 11 },
];
const DURATION_OPTIONS = [
  { value: '30',  label: '30 min',  minutes: 30 },
  { value: '45',  label: '45 min',  minutes: 45 },
  { value: '60',  label: '1 hour',  minutes: 60 },
  { value: '90',  label: '1.5 hrs', minutes: 90 },
];

type ActivityMode = 'manual' | 'estimate';
const ACTIVITY_MODE_KEY = 'ngt-activity-mode';

function ActivityForm({ date, onDone, showToast }: {
  date: string; onDone: () => void; showToast?: ShowToast;
}) {
  const [mode, setMode] = useState<ActivityMode>(
    () => (localStorage.getItem(ACTIVITY_MODE_KEY) === 'estimate' ? 'estimate' : 'manual')
  );
  const [name, setName]           = useState('');
  const [kcal, setKcal]           = useState('');
  const [intensity, setIntensity] = useState<string | null>(null);
  const [duration, setDuration]   = useState<string | null>(null);

  function changeMode(m: ActivityMode) {
    setMode(m);
    localStorage.setItem(ACTIVITY_MODE_KEY, m);
    setKcal('');
    setIntensity(null);
    setDuration(null);
  }

  function handleIntensity(val: string | null) {
    setIntensity(val);
    const i = INTENSITY_OPTIONS.find((o) => o.value === val);
    const d = DURATION_OPTIONS.find((o) => o.value === duration);
    if (i && d) setKcal(String(Math.round(i.kcalPerMin * d.minutes)));
    else setKcal('');
  }

  function handleDuration(val: string | null) {
    setDuration(val);
    const i = INTENSITY_OPTIONS.find((o) => o.value === intensity);
    const d = DURATION_OPTIONS.find((o) => o.value === val);
    if (i && d) setKcal(String(Math.round(i.kcalPerMin * d.minutes)));
    else setKcal('');
  }

  function estimateName() {
    const i = INTENSITY_OPTIONS.find((o) => o.value === intensity);
    const d = DURATION_OPTIONS.find((o) => o.value === duration);
    return i && d ? `${i.label} · ${d.label}` : '';
  }

  const canSave = mode === 'manual' ? !!Number(kcal) : !!(intensity && duration && Number(kcal));

  async function save() {
    if (!canSave) return;
    const entryId = newId();
    await repos.activities.add({
      id: entryId, date,
      name: mode === 'manual' ? (name.trim() || undefined) : (estimateName() || undefined),
      activeCalories: Number(kcal),
      createdAt: new Date().toISOString(),
    });
    showToast?.('Activity logged', async () => repos.activities.remove(entryId));
    onDone();
  }

  const saveRef = useRef<() => Promise<void>>(() => Promise.resolve());
  saveRef.current = save; // eslint-disable-line react-hooks/refs
  useSheetSetFooter(
    <Button size="lg" onClick={() => void saveRef.current()} disabled={!canSave}>Log activity</Button>,
    [canSave],
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <SegmentedControl<ActivityMode>
          value={mode}
          onChange={changeMode}
          options={[
            { value: 'manual',   label: 'Manual'   },
            { value: 'estimate', label: 'Estimate' },
          ]}
        />
      </div>

      {mode === 'manual' ? (
        <div className="space-y-3">
          <LabeledInput
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Morning run"
          />
          <LabeledInput
            label="Calories (kcal)"
            value={kcal}
            onChange={(e) => setKcal(e.target.value)}
            type="number"
            inputMode="decimal"
            min={0}
            max={3000}
            step={5}
            placeholder="e.g. 300"
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col gap-1">
            <span className="text-subhead font-normal text-content-secondary">Intensity</span>
            <div className="relative mt-1">
              <select
                value={intensity ?? ''}
                onChange={(e) => handleIntensity(e.target.value || null)}
                className="w-full appearance-none rounded-field border border-transparent bg-surface-sunken px-3 py-2.5 pr-10 text-subhead font-semibold text-content focus:outline-none"
              >
                <option value="">Select intensity</option>
                {INTENSITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-content-muted">
                <Icon name="chevronDown" size={16} strokeWidth={2} />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-subhead font-normal text-content-secondary">Duration</span>
            <div className="relative mt-1">
              <select
                value={duration ?? ''}
                onChange={(e) => handleDuration(e.target.value || null)}
                className="w-full appearance-none rounded-field border border-transparent bg-surface-sunken px-3 py-2.5 pr-10 text-subhead font-semibold text-content focus:outline-none"
              >
                <option value="">Select duration</option>
                {DURATION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-content-muted">
                <Icon name="chevronDown" size={16} strokeWidth={2} />
              </div>
            </div>
          </div>

          {kcal ? (
            <p className="text-center text-subhead text-content-secondary">
              ≈ <span className="font-semibold text-content">{kcal} kcal</span> estimated
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ── WeightForm ────────────────────────────────────────────────────────────────

function WeightForm({ date, onDone }: { date: string; onDone: () => void }) {
  const weights = useLive(() => repos.weights.all(), []) ?? [];
  const user    = useLive(() => repos.user.get(), []);
  const units   = user?.units ?? 'kg';
  const existing = weights.find((w) => w.date === date);
  const prefill  = existing?.weightKg ?? currentWeightKg(weights);
  const [val, setVal] = useState('');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (prefill != null) setVal(units === 'lbs' ? String(parseFloat(kgToLbs(prefill).toFixed(1))) : String(prefill));
  }, [prefill, units]);

  async function save() {
    const display = Number(val);
    if (!display) return;
    const v = units === 'lbs' ? lbsToKg(display) : display;
    await repos.weights.upsertForDate({ id: newId(), date, weightKg: v, source: 'manual' });
    await syncAccountBmr();
    onDone();
  }

  const saveRef = useRef<() => Promise<void>>(() => Promise.resolve());
  saveRef.current = save; // eslint-disable-line react-hooks/refs
  useSheetSetFooter(
    <Button size="lg" onClick={() => void saveRef.current()} disabled={!Number(val)}>Save weight</Button>,
    [!Number(val)],
  );

  const prevDisplay = existing
    ? (units === 'lbs' ? `${kgToLbs(existing.weightKg).toFixed(1)} lbs` : `${existing.weightKg.toFixed(1)} kg`)
    : null;

  const weightMin = units === 'lbs' ? 66  : 30;
  const weightMax = units === 'lbs' ? 660 : 300;

  return (
    <div className="space-y-3">
      <WheelPicker
        label={`Weight (${units})`}
        value={val}
        onChange={setVal}
        min={weightMin}
        max={weightMax}
        step={0.1}
        unit={units}
      />
      {existing && (
        <p className="text-caption text-content-secondary">
          Previously {prevDisplay} — saving will update it.
        </p>
      )}
    </div>
  );
}
