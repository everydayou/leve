import { useEffect, useRef, useState } from 'react';
import { useLive } from '../../state/live';
import { repos } from '../../state/repos';
import { newId, todayISO } from '../../data/ids';
import { nutritionFor } from '../../domain/calc';
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
  Icon, Sheet, useSheetSetFooter, ListRow, ImageHero,
} from '../kit';
import type { ShowToast } from './Toaster';
import { findByName } from '../../domain/pantry';
import type { FoodItem, MealItem, NutritionSnapshot } from '../../domain/types';

const SCAN_ENABLED = !!(import.meta.env.VITE_FOOD_SCAN_API_URL as string | undefined);

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

function scanResultToBasket(
  r: { name: string; estimatedGrams: number; calories: number; protein: number; carbs: number; fiber: number; fat: number },
  sourceId: string,
): BasketItem {
  const grams = Math.max(Number(r.estimatedGrams) || 100, 1);
  const f = 100 / grams;
  return {
    id: newId(),
    name: r.name,
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

type OverlayKey = 'describe' | 'label' | 'manual' | 'edit';

function FoodForm({
  date, items, onDone, autoScan = false, initialScanPhoto, showToast,
}: {
  date: string;
  items: FoodItem[];
  onDone: () => void;
  autoScan?: boolean;
  initialScanPhoto?: string;
  showToast?: ShowToast;
}) {
  const [basket, setBasket]             = useState<BasketItem[]>([]);
  const [sources, setSources]           = useState<SourceGroup[]>([]);
  const [mealName, setMealName]         = useState('');
  const [saveToPantry, setSaveToPantry] = useState(false);
  const [editMode, setEditMode]         = useState(false);
  const [pickerOpen, setPickerOpen]     = useState(false);
  const [activeOverlay, setActiveOverlay] = useState<OverlayKey | null>(null);
  const [editingIdx, setEditingIdx]     = useState<number | null>(null);
  const [analyzing, setAnalyzing]       = useState(false);
  const [analyzeLabel, setAnalyzeLabel] = useState('Analysing…');
  const [servingModal, setServingModal] = useState<{
    item100: BasketItem; itemSrv: BasketItem; servingG: number;
  } | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

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
    return photos.slice(0, 3); // max 3 in collage
  })();

  // ── Sheet footer CTA ──────────────────────────────────────────────────────
  // Including `activeOverlay` in deps ensures the effect re-runs when an overlay
  // closes, restoring "Log it" after the overlay's cleanup sets footer to null.
  const logRef = useRef<() => Promise<void>>(() => Promise.resolve());
  useSheetSetFooter(
    !analyzing
      ? <Button size="lg" onClick={() => void logRef.current()}>Log it</Button>
      : null,
    [activeOverlay, analyzing],
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

  async function handleDescribeAnalyze(text: string) {
    setActiveOverlay(null);
    setAnalyzeLabel('Thinking about your meal…');
    setAnalyzing(true);
    const sourceId = newId();
    try {
      const foods = await describeFood(text);
      const newItems = foods.map((f) =>
        scanResultToBasket({
          name: f.name, estimatedGrams: f.estimatedGrams,
          calories: f.calories, protein: f.protein,
          carbs: f.carbs, fiber: f.fiber, fat: f.fat,
        }, sourceId),
      );
      // Describe has no photo, so no source group is added
      setBasket((prev) => [...prev, ...newItems]);
      setPickerOpen(false);
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleLabelScan(imageDataUrl: string) {
    setActiveOverlay(null);
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
        id: newId(), name: f.name, measurementType: 'per_100g', referenceAmount: 100,
        calories: (Number(f.calories) || 0) * factor,
        protein:  (Number(f.protein)  || 0) * factor,
        carbs:    (Number(f.carbs)    || 0) * factor,
        fiber:    (Number(f.fiber)    || 0) * factor,
        fat:      (Number(f.fat)      || 0) * factor,
        qty: 100, sourceId,
      };
      const itemSrv: BasketItem = {
        id: newId(), name: f.name, measurementType: 'per_serving', referenceAmount: servingG,
        calories: Number(f.calories) || 0,
        protein:  Number(f.protein)  || 0,
        carbs:    Number(f.carbs)    || 0,
        fiber:    Number(f.fiber)    || 0,
        fat:      Number(f.fat)      || 0,
        qty: 1, sourceId,
      };
      setSources((prev) => [...prev, { id: sourceId, photo: imageDataUrl }]);
      setServingModal({ item100, itemSrv, servingG });
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : 'Label scan failed');
    } finally {
      setAnalyzing(false);
    }
  }

  // ── Basket mutations ──────────────────────────────────────────────────────

  function addPantryItem(item: FoodItem) {
    hapticLight();
    const sourceId = item.photo ? newId() : undefined;
    if (sourceId && item.photo) {
      setSources((prev) => [...prev, { id: sourceId, photo: item.photo! }]);
    }
    setBasket((prev) => [...prev, pantryToBasket(item, sourceId)]);
    setPickerOpen(false);
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
    if (remaining.length === 0) setEditMode(false);
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
  }) {
    const newItem: BasketItem = {
      id: newId(), name: entry.name, measurementType: 'per_serving',
      referenceAmount: 1, calories: entry.calories, protein: entry.protein,
      carbs: entry.carbs, fiber: entry.fiber, fat: entry.fat, qty: 1,
    };
    if (entry.saveToPantry) {
      void repos.foodItems.put({
        id: newId(), name: entry.name, measurementType: 'per_serving', referenceAmount: 1,
        calories: entry.calories, protein: entry.protein, carbs: entry.carbs,
        fiber: entry.fiber, fat: entry.fat, isArchived: false,
      });
    }
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
      const name = mealName.trim() || 'Meal';
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
      const mealItems: MealItem[] = basket.map((item) => {
        const n = basketNutrition(item);
        return { name: item.name, estimatedGrams: item.qty, calories: n.calories,
          protein: n.protein, carbs: n.carbs, fiber: n.fiber, fat: n.fat,
          confidence: 'high' as const, selected: true };
      });
      const entryId = newId();

      if (saveToPantry) {
        const foodItemId = newId();
        await repos.foodItems.put({
          id: foodItemId, name, measurementType: 'per_serving', referenceAmount: 1,
          calories: totals.calories, protein: totals.protein, carbs: totals.carbs,
          fiber: totals.fiber, fat: totals.fat, photo: primaryPhoto, isArchived: false,
        });
        await repos.foodEntries.add({
          id: entryId, date, foodItemId, quantity: 1, isManual: false,
          snapshot: totals, createdAt: new Date().toISOString(),
          mealData: { name, photo: primaryPhoto, items: mealItems },
        });
      } else {
        await repos.foodEntries.add({
          id: entryId, date, manualName: name, isManual: true,
          snapshot: totals, createdAt: new Date().toISOString(),
          mealData: { name, photo: primaryPhoto, items: mealItems },
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

  const showPicker = basket.length === 0 || pickerOpen;

  // ── Analysing state ───────────────────────────────────────────────────────
  if (analyzing) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-border-subtle border-t-accent" />
        <p className="text-subhead text-content-secondary">{analyzeLabel}</p>
      </div>
    );
  }

  // ── Overlays (content-swap pattern: renders in place of basket content) ───

  if (activeOverlay === 'describe') {
    return (
      <DescribeOverlay
        onBack={overlayBack}
        onAnalyze={handleDescribeAnalyze}
      />
    );
  }

  if (activeOverlay === 'label') {
    return (
      <LabelOverlay
        onBack={overlayBack}
        onScan={handleLabelScan}
      />
    );
  }

  if (activeOverlay === 'manual') {
    return (
      <ManualOverlay
        items={items}
        onBack={overlayBack}
        onAdd={addManualItem}
      />
    );
  }

  if (activeOverlay === 'edit' && editingIdx !== null) {
    const editItem = basket[editingIdx];
    if (editItem) {
      return (
        <EditOverlay
          item={editItem}
          onBack={overlayBack}
          onSave={(patch) => {
            updateItem(editingIdx, patch);
            overlayBack();
          }}
        />
      );
    }
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

      {/* Photo collage */}
      {sourcePhotos.length > 0 && <ImageHero photos={sourcePhotos} />}

      {/* Meal header — shown whenever basket has items */}
      {basket.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-headline font-bold text-content">Meal</span>
          <button
            onClick={() => setEditMode((v) => !v)}
            className="text-callout font-semibold text-accent active:opacity-70"
          >
            {editMode ? 'Done' : 'Edit'}
          </button>
        </div>
      )}

      {/* Meal name + save to pantry (2+ items, not in editMode) */}
      {basket.length >= 2 && !editMode && (
        <>
          <LabeledInput
            label="Meal name"
            value={mealName}
            onChange={(e) => setMealName(e.target.value)}
            placeholder="Name this meal"
          />
          <label className="flex cursor-pointer select-none items-center gap-2 text-subhead text-content-secondary">
            <input
              type="checkbox"
              checked={saveToPantry}
              onChange={(e) => setSaveToPantry(e.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            Save to pantry
          </label>
        </>
      )}

      {/* Basket cards */}
      {basket.map((item, idx) => (
        <BasketCard
          key={item.id}
          item={item}
          nutrition={basketNutrition(item)}
          editMode={editMode}
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
            setPickerOpen(false);
          }}
          onPerServing={() => {
            setBasket((prev) => [...prev, { ...servingModal.itemSrv, id: newId() }]);
            setServingModal(null);
            setPickerOpen(false);
          }}
          onDismiss={() => setServingModal(null)}
        />
      )}

      {/* Food picker (always visible on empty basket; toggled by pickerOpen otherwise) */}
      {!editMode && showPicker && (
        <FoodPicker
          items={items}
          onPickItem={addPantryItem}
          onCamera={() => void handleCamera()}
          onPhoto={() => void handlePhoto()}
          onDescribe={() => { setPickerOpen(false); setActiveOverlay('describe'); }}
          onLabel={() => { setPickerOpen(false); setActiveOverlay('label'); }}
          onManual={() => { setPickerOpen(false); setActiveOverlay('manual'); }}
        />
      )}

      {/* Add another — shown when basket has items and picker is closed */}
      {!editMode && !showPicker && basket.length > 0 && (
        <button
          onClick={() => setPickerOpen(true)}
          className="w-full rounded-field border border-dashed border-border-field py-3.5 text-body font-semibold text-content-secondary transition-colors active:border-accent active:text-accent"
        >
          + Add another item
        </button>
      )}
    </div>
  );
}

// ── BasketStepper ─────────────────────────────────────────────────────────────

function BasketStepper({
  item, qty, onChange,
}: {
  item: BasketItem;
  qty: number;
  onChange: (v: number) => void;
}) {
  const isGrams = item.measurementType === 'per_100g';
  const step    = isGrams ? 10 : 0.5;
  const min     = isGrams ? 10 : 0.5;

  function adj(delta: number) {
    hapticLight();
    onChange(Math.max(min, Math.round((qty + delta) * 10) / 10));
  }

  const label = isGrams
    ? `${qty}g`
    : qty === 1
      ? '1 serving'
      : `${qty % 1 === 0 ? qty : qty.toFixed(1)} servings`;

  const btnCls =
    'flex h-8 w-8 items-center justify-center rounded-full border border-border-field bg-surface text-content transition-colors active:bg-surface-sunken';

  return (
    <div className="flex items-center gap-2">
      <button data-no-drag onClick={() => adj(-step)} className={btnCls} aria-label="Decrease">
        <Icon name="minus" size={14} strokeWidth={2} />
      </button>
      <span className="min-w-[68px] text-center text-subhead font-semibold text-content">
        {label}
      </span>
      <button data-no-drag onClick={() => adj(step)} className={btnCls} aria-label="Increase">
        <Icon name="plus" size={14} strokeWidth={2} />
      </button>
    </div>
  );
}

// ── BasketCard ────────────────────────────────────────────────────────────────

function BasketCard({
  item, nutrition, editMode, onQtyChange, onRemove, onEdit,
}: {
  item: BasketItem;
  nutrition: NutritionSnapshot;
  editMode: boolean;
  onQtyChange: (v: number) => void;
  onRemove: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[20px] bg-surface p-4 shadow-card">
      <div className="min-w-0 flex-1 space-y-2.5">
        <div className="flex items-center gap-2">
          <span className="flex-1 truncate text-body font-semibold text-content">{item.name}</span>
          <span className="shrink-0 text-subhead text-content-secondary">
            {nutrition.calories} kcal
          </span>
        </div>
        <BasketStepper item={item} qty={item.qty} onChange={onQtyChange} />
      </div>

      {editMode && (
        <div className="flex shrink-0 flex-col items-center gap-2 pl-1">
          <button
            onClick={onRemove}
            className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-border-field bg-surface-sunken text-content-secondary transition-colors active:text-danger"
            aria-label="Remove"
          >
            <Icon name="trash" size={14} strokeWidth={2.2} />
          </button>
          <button
            onClick={onEdit}
            className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-border-field bg-surface-sunken text-content-secondary transition-colors active:text-accent"
            aria-label="Edit nutrition"
          >
            <Icon name="edit" size={14} strokeWidth={2.2} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── FoodPicker ────────────────────────────────────────────────────────────────

function FoodPicker({
  items, onPickItem, onCamera, onPhoto, onDescribe, onLabel, onManual,
}: {
  items: FoodItem[];
  onPickItem: (item: FoodItem) => void;
  onCamera: () => void;
  onPhoto: () => void;
  onDescribe: () => void;
  onLabel: () => void;
  onManual: () => void;
}) {
  const [query, setQuery] = useState('');

  // Show 5 most-recently-added non-archived items as "recent"
  const recent   = items.filter((i) => !i.isArchived).slice(0, 4);
  const filtered = query.trim()
    ? items.filter((i) => !i.isArchived && i.name.toLowerCase().includes(query.toLowerCase()))
    : recent;

  return (
    <div className="space-y-1 rounded-[24px] bg-surface-sunken p-3">
      {/* Search */}
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-content-muted">
          <Icon name="search" size={16} strokeWidth={2} />
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search foods…"
          autoComplete="off"
          className="w-full rounded-full bg-surface py-3 pl-10 pr-4 text-body text-content placeholder:text-content-muted outline-none"
        />
      </div>

      {/* List */}
      {filtered.length > 0 && (
        <div>
          <p className="px-1 pt-3 pb-2 text-callout font-semibold text-content">{query.trim() ? 'Results' : 'Recent'}</p>
          <div className="overflow-hidden rounded-[16px] bg-surface divide-y divide-border-subtle">
            {filtered.map((item) => {
              const n = nutritionFor(item, item.referenceAmount);
              return (
                <ListRow
                  key={item.id}
                  leading={
                    item.photo ? (
                      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-[10px]">
                        <img src={item.photo} alt={item.name} className="h-full w-full object-cover" />
                      </div>
                    ) : (
                      <div className="h-11 w-11 shrink-0 rounded-[10px] bg-surface-sunken" />
                    )
                  }
                  title={item.name}
                  subtitle={item.measurementType === 'per_serving' ? 'Per serving' : 'Per 100g'}
                  trailing={
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-subhead font-semibold text-content">
                        {Math.round(n.calories)} kcal
                      </span>
                      <span className="text-caption text-content-secondary">
                        {n.protein.toFixed(0)}g P
                      </span>
                    </div>
                  }
                  onClick={() => onPickItem(item)}
                />
              );
            })}
          </div>
        </div>
      )}

      {filtered.length === 0 && query.trim() && (
        <p className="py-4 text-center text-subhead text-content-secondary">No results</p>
      )}

      {/* Method cards */}
      <div>
        <p className="px-1 pt-3 pb-2 text-callout font-semibold text-content">Other methods</p>
        <MethodCards
          onCamera={onCamera}
          onPhoto={onPhoto}
          onDescribe={onDescribe}
          onLabel={onLabel}
          onManual={onManual}
        />
      </div>
    </div>
  );
}

// ── Method cards + inline icons ───────────────────────────────────────────────

function MethodCards({
  onCamera, onPhoto, onDescribe, onLabel, onManual,
}: {
  onCamera: () => void; onPhoto: () => void; onDescribe: () => void;
  onLabel: () => void;  onManual: () => void;
}) {
  const methods = [
    { label: 'Camera',   onClick: onCamera,   icon: <CameraMethodIcon /> },
    { label: 'Photo',    onClick: onPhoto,    icon: <PhotoMethodIcon /> },
    { label: 'Describe', onClick: onDescribe, icon: <DescribeMethodIcon /> },
    { label: 'Label',    onClick: onLabel,    icon: <LabelMethodIcon /> },
    { label: 'Manual',   onClick: onManual,   icon: <ManualMethodIcon /> },
  ];

  return (
    // overflow-y visible lets card shadows bleed outside the sunken container
    // scrollbar-hide via inline style; py-2 -my-2 gives shadow breathing room
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 py-2 -my-1" style={{ scrollbarWidth: 'none', overflowY: 'visible' }}>
      {methods.map(({ label, onClick, icon }) => (
        <button
          key={label}
          onClick={onClick}
          className="flex h-[72px] w-[82px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-[14px] bg-surface text-subhead font-medium text-content shadow-card transition-colors active:bg-accent/5"
        >
          {icon}
          {label}
        </button>
      ))}
    </div>
  );
}

function CameraMethodIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2 7V2H7V4H4V7H2ZM20 7V4H17V2H22V7H20ZM2 22V17H4V20H7V22H2ZM17 22V20H20V17H22V22H17Z" />
      <path d="M12 14.75C12.625 14.75 13.1562 14.5312 13.5938 14.0938C14.0312 13.6562 14.25 13.125 14.25 12.5C14.25 11.875 14.0312 11.3438 13.5938 10.9062C13.1562 10.4688 12.625 10.25 12 10.25C11.375 10.25 10.8438 10.4688 10.4062 10.9062C9.96875 11.3438 9.75 11.875 9.75 12.5C9.75 13.125 9.96875 13.6562 10.4062 14.0938C10.8438 14.5312 11.375 14.75 12 14.75ZM8 16.5C7.725 16.5 7.48958 16.4021 7.29375 16.2063C7.09792 16.0104 7 15.775 7 15.5V9.5C7 9.225 7.09792 8.98958 7.29375 8.79375C7.48958 8.59792 7.725 8.5 8 8.5H9.575L10.5 7.5H13.5L14.425 8.5H16C16.275 8.5 16.5104 8.59792 16.7063 8.79375C16.9021 8.98958 17 9.225 17 9.5V15.5C17 15.775 16.9021 16.0104 16.7063 16.2063C16.5104 16.4021 16.275 16.5 16 16.5H8Z" />
    </svg>
  );
}

function PhotoMethodIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.99961 21.6496C4.26628 21.6496 3.64128 21.3913 3.12461 20.8746C2.60794 20.3579 2.34961 19.7329 2.34961 18.9996V4.99961C2.34961 4.26628 2.60794 3.64128 3.12461 3.12461C3.64128 2.60794 4.26628 2.34961 4.99961 2.34961H18.9996C19.7329 2.34961 20.3579 2.60794 20.8746 3.12461C21.3913 3.64128 21.6496 4.26628 21.6496 4.99961V18.9996C21.6496 19.7329 21.3913 20.3579 20.8746 20.8746C20.3579 21.3913 19.7329 21.6496 18.9996 21.6496H4.99961ZM4.99961 18.9996H18.9996V4.99961H4.99961V18.9996ZM6.87461 17.3996H17.1246C17.4079 17.3996 17.6079 17.2788 17.7246 17.0371C17.8413 16.7954 17.8163 16.5663 17.6496 16.3496L14.8246 12.5496C14.6913 12.3663 14.5163 12.2788 14.2996 12.2871C14.0829 12.2954 13.9079 12.3913 13.7746 12.5746L11.2496 15.9496L9.47461 13.5996C9.34128 13.4163 9.16628 13.3246 8.94961 13.3246C8.73294 13.3246 8.55794 13.4163 8.42461 13.5996L6.34961 16.3496C6.18294 16.5663 6.15794 16.7954 6.27461 17.0371C6.39128 17.2788 6.59128 17.3996 6.87461 17.3996Z" />
    </svg>
  );
}

function DescribeMethodIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M9.04787 18.0181H14.9584C15.2535 18.0181 15.501 17.9173 15.7006 17.7156C15.9003 17.514 16.0001 17.2655 16.0001 16.9704C16.0001 16.6752 15.9003 16.4277 15.7006 16.2279C15.501 16.0282 15.2535 15.9284 14.9584 15.9284H9.04188C8.74671 15.9284 8.49929 16.0282 8.29963 16.2279C8.09996 16.4277 8.00012 16.6752 8.00012 16.9704C8.00012 17.2655 8.10054 17.514 8.30137 17.7156C8.50221 17.9173 8.75104 18.0181 9.04787 18.0181ZM9.04787 14.0181H14.9584C15.2535 14.0181 15.501 13.9173 15.7006 13.7156C15.9003 13.514 16.0001 13.2655 16.0001 12.9704C16.0001 12.6752 15.9003 12.4277 15.7006 12.2279C15.501 12.0282 15.2535 11.9284 14.9584 11.9284H9.04188C8.74671 11.9284 8.49929 12.0282 8.29963 12.2279C8.09996 12.4277 8.00012 12.6752 8.00012 12.9704C8.00012 13.2655 8.10054 13.514 8.30137 13.7156C8.50221 13.9173 8.75104 14.0181 9.04787 14.0181ZM6.07187 22.2034C5.44221 22.2034 4.90562 21.9816 4.46212 21.5381C4.01863 21.0946 3.79688 20.558 3.79688 19.9284V4.07188C3.79688 3.44221 4.01863 2.90562 4.46212 2.46212C4.90562 2.01862 5.44221 1.79688 6.07187 1.79688H13.1451C13.4488 1.79688 13.7381 1.85388 14.0131 1.96788C14.2881 2.08171 14.5313 2.24429 14.7426 2.45562L19.5446 7.25762C19.756 7.46896 19.9185 7.71212 20.0324 7.98712C20.1464 8.26212 20.2034 8.55146 20.2034 8.85513V19.9284C20.2034 20.558 19.9816 21.0946 19.5381 21.5381C19.0946 21.9816 18.558 22.2034 17.9284 22.2034H6.07187ZM12.9284 7.93438V4.07188H6.07187V19.9284H17.9284V9.07188H14.0659C13.7467 9.07188 13.4773 8.96213 13.2576 8.74263C13.0381 8.52296 12.9284 8.25354 12.9284 7.93438Z" />
    </svg>
  );
}

function LabelMethodIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M5.07187 18.9284V5.07188V9.12238V8.74312V18.9284ZM8.03587 13.0001H11.5669C11.8502 13.0001 12.0877 12.9043 12.2794 12.7126C12.471 12.521 12.5669 12.2835 12.5669 12.0001C12.5669 11.7168 12.471 11.4793 12.2794 11.2876C12.0877 11.096 11.8502 11.0001 11.5669 11.0001H8.03587C7.75254 11.0001 7.51504 11.096 7.32338 11.2876C7.13171 11.4793 7.03587 11.7168 7.03587 12.0001C7.03587 12.2835 7.13171 12.521 7.32338 12.7126C7.51504 12.9043 7.75254 13.0001 8.03587 13.0001ZM8.03587 16.9644H11.5664C11.85 16.9644 12.0877 16.8685 12.2794 16.6769C12.471 16.4852 12.5669 16.2477 12.5669 15.9644C12.5669 15.681 12.471 15.4435 12.2794 15.2519C12.0877 15.0602 11.85 14.9644 11.5664 14.9644H8.03587C7.75254 14.9644 7.51504 15.0602 7.32338 15.2519C7.13171 15.4435 7.03587 15.681 7.03587 15.9644C7.03587 16.2477 7.13171 16.4852 7.32338 16.6769C7.51504 16.8685 7.75254 16.9644 8.03587 16.9644ZM8.03587 9.03587H15.9644C16.2477 9.03587 16.4852 8.94004 16.6769 8.74837C16.8685 8.55671 16.9644 8.31921 16.9644 8.03587C16.9644 7.75254 16.8685 7.51504 16.6769 7.32338C16.4852 7.13171 16.2477 7.03587 15.9644 7.03587H8.03587C7.75254 7.03587 7.51504 7.13171 7.32338 7.32338C7.13171 7.51504 7.03587 7.75254 7.03587 8.03587C7.03587 8.31921 7.13171 8.55671 7.32338 8.74837C7.51504 8.94004 7.75254 9.03587 8.03587 9.03587ZM5.07187 21.2034C4.44221 21.2034 3.90562 20.9816 3.46212 20.5381C3.01862 20.0946 2.79688 19.558 2.79688 18.9284V5.07188C2.79688 4.44221 3.01862 3.90562 3.46212 3.46212C3.90562 3.01862 4.44221 2.79688 5.07187 2.79688H18.9284C19.558 2.79688 20.0946 3.01862 20.5381 3.46212C20.9816 3.90562 21.2034 4.44221 21.2034 5.07188V10.5C21.2034 10.8192 21.0936 11.0886 20.8741 11.3083C20.6545 11.5278 20.385 11.6375 20.0659 11.6375C19.7467 11.6375 19.4773 11.5278 19.2576 11.3083C19.0381 11.0886 18.9284 10.8192 18.9284 10.5V5.07188H5.07187V18.9284H11.5C11.8193 18.9284 12.0887 19.0381 12.3082 19.2576C12.5277 19.4773 12.6375 19.7467 12.6375 20.0659C12.6375 20.385 12.5277 20.6545 12.3082 20.8741C12.0887 21.0936 11.8193 21.2034 11.5 21.2034H5.07187Z" />
      <path d="M19 20.25C19.625 20.25 20.1562 20.0312 20.5938 19.5938C21.0312 19.1562 21.25 18.625 21.25 18C21.25 17.375 21.0312 16.8438 20.5938 16.4062C20.1562 15.9688 19.625 15.75 19 15.75C18.375 15.75 17.8438 15.9688 17.4062 16.4062C16.9688 16.8438 16.75 17.375 16.75 18C16.75 18.625 16.9688 19.1562 17.4062 19.5938C17.8438 20.0312 18.375 20.25 19 20.25ZM15 22C14.725 22 14.4896 21.9021 14.2938 21.7063C14.0979 21.5104 14 21.275 14 21V15C14 14.725 14.0979 14.4896 14.2938 14.2938C14.4896 14.0979 14.725 14 15 14H16.575L17.5 13H20.5L21.425 14H23C23.275 14 23.5104 14.0979 23.7063 14.2938C23.9021 14.4896 24 14.725 24 15V21C24 21.275 23.9021 21.5104 23.7063 21.7063C23.5104 21.9021 23.275 22 23 22H15Z" />
    </svg>
  );
}

function ManualMethodIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M5.07187 21.2034C4.44221 21.2034 3.90562 20.9816 3.46212 20.5381C3.01862 20.0946 2.79688 19.558 2.79688 18.9284V5.07188C2.79688 4.44221 3.01862 3.90562 3.46212 3.46212C3.90562 3.01862 4.44221 2.79688 5.07187 2.79688H18.9284C19.558 2.79688 20.0946 3.01862 20.5381 3.46212C20.9816 3.90562 21.2034 4.44221 21.2034 5.07188V15.1451C21.2034 15.4488 21.1464 15.7381 21.0324 16.0131C20.9185 16.2881 20.756 16.5313 20.5446 16.7426L16.7426 20.5446C16.5313 20.756 16.2881 20.9185 16.0131 21.0324C15.7381 21.1464 15.4488 21.2034 15.1451 21.2034H5.07187ZM14.9284 18.9284V17.0001C14.9284 16.4305 15.1312 15.9427 15.5369 15.5369C15.9427 15.1312 16.4305 14.9284 17.0001 14.9284H18.9284V5.07188H5.07187V18.9284H14.9284ZM10.9524 10.0479V15.0001C10.9524 15.297 11.0531 15.5458 11.2546 15.7466C11.4563 15.9475 11.7048 16.0479 12.0001 16.0479C12.2955 16.0479 12.544 15.9475 12.7456 15.7466C12.9471 15.5458 13.0479 15.297 13.0479 15.0001V10.0479H15.0001C15.297 10.0479 15.5458 9.94713 15.7466 9.74563C15.9475 9.54396 16.0479 9.29546 16.0479 9.00013C16.0479 8.70479 15.9475 8.45629 15.7466 8.25463C15.5458 8.05313 15.297 7.95238 15.0001 7.95238H9.00013C8.70329 7.95238 8.45446 8.05313 8.25363 8.25463C8.05279 8.45629 7.95238 8.70479 7.95238 9.00013C7.95238 9.29546 8.05279 9.54396 8.25363 9.74563C8.45446 9.94713 8.70329 10.0479 9.00013 10.0479H10.9524Z" />
    </svg>
  );
}

// ── DescribeOverlay ───────────────────────────────────────────────────────────

function DescribeOverlay({
  onBack, onAnalyze,
}: {
  onBack: () => void;
  onAnalyze: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const hasText = text.trim().length > 0;

  // Use ref so the button closure always calls the latest onAnalyze without
  // adding it to useSheetSetFooter deps (avoids re-running on every parent render).
  const onAnalyzeRef = useRef(onAnalyze);
  onAnalyzeRef.current = onAnalyze; // eslint-disable-line react-hooks/refs

  useSheetSetFooter(
    hasText
      ? <Button size="lg" onClick={() => onAnalyzeRef.current(text.trim())}>Analyse</Button>
      : null,
    [hasText, text],
  );

  return (
    <div className="space-y-3 py-1">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="-ml-1 p-1 text-content-secondary active:opacity-70">
          <Icon name="back" size={22} strokeWidth={2.25} />
        </button>
        <span className="text-headline font-semibold text-content">Describe</span>
      </div>
      <textarea
        autoFocus
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`What did you eat?\ne.g. "a bowl of oats with banana and honey"`}
        className="min-h-[130px] w-full resize-none rounded-[16px] bg-surface-sunken px-4 py-3.5 text-callout leading-relaxed text-content placeholder:text-content-muted outline-none focus:ring-2 focus:ring-accent/30"
      />
      <p className="text-caption text-content-secondary">
        Describe what you ate and AI will estimate the nutrition.
      </p>
    </div>
  );
}

// ── LabelOverlay ──────────────────────────────────────────────────────────────

function LabelOverlay({
  onBack, onScan,
}: {
  onBack: () => void;
  onScan: (imageDataUrl: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // No footer button — "Scan label" lives inline as a primary action button
  useSheetSetFooter(null, []);

  const onScanRef = useRef(onScan);
  onScanRef.current = onScan; // eslint-disable-line react-hooks/refs

  async function handleCapture() {
    if (isNativeIOS()) {
      const photo = await captureFromCamera();
      if (photo) onScanRef.current(photo);
    } else if (SCAN_ENABLED) {
      inputRef.current?.click();
    } else {
      // Dev fallback without SCAN_ENABLED: just trigger file picker anyway
      inputRef.current?.click();
    }
  }

  return (
    <div className="space-y-4 py-1">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          e.target.value = '';
          const small = await downscaleImage(f, MAX_SCAN_PX);
          onScanRef.current(small);
        }}
      />
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="-ml-1 p-1 text-content-secondary active:opacity-70">
          <Icon name="back" size={22} strokeWidth={2.25} />
        </button>
        <span className="text-headline font-semibold text-content">Scan label</span>
      </div>
      {/* Viewfinder placeholder */}
      <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-[20px] bg-black">
        <div className="h-[35%] w-4/5 rounded-[10px] border-2 border-accent" />
        <p className="text-caption text-white/50">Point at the nutrition label</p>
      </div>
      <Button size="lg" onClick={handleCapture}>Scan label</Button>
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
  return (
    <div className="fixed inset-0 z-[300] flex items-end bg-black/40" onClick={onDismiss}>
      <div
        className="w-full space-y-3 rounded-t-[28px] bg-surface px-5 pt-6"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
        onClick={(e) => e.stopPropagation()}
      >
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
    </div>
  );
}

// ── ManualOverlay ─────────────────────────────────────────────────────────────

function ManualOverlay({
  items, onBack, onAdd,
}: {
  items: FoodItem[];
  onBack: () => void;
  onAdd: (entry: { name: string; calories: number; protein: number; carbs: number; fiber: number; fat: number; saveToPantry: boolean }) => void;
}) {
  const [name, setName] = useState('');
  const [cal, setCal]   = useState('');
  const [pro, setPro]   = useState('');
  const [carb, setCarb] = useState('');
  const [fib, setFib]   = useState('');
  const [fat, setFat]   = useState('');
  const [save, setSave] = useState(false);

  const duplicate = findByName(items, name);
  const blocked   = save && !!duplicate;
  const canAdd    = name.trim().length > 0 && !blocked;

  const addRef = useRef<() => void>(() => undefined);
  addRef.current = () => { // eslint-disable-line react-hooks/refs
    if (!canAdd) return;
    onAdd({
      name: name.trim(),
      calories: +cal || 0, protein: +pro || 0, carbs: +carb || 0,
      fiber: +fib || 0, fat: +fat || 0, saveToPantry: save,
    });
  };

  useSheetSetFooter(
    <Button size="lg" onClick={() => addRef.current()} disabled={!canAdd}>
      Add to meal
    </Button>,
    [canAdd],
  );

  return (
    <div className="space-y-3 py-1">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="-ml-1 p-1 text-content-secondary active:opacity-70">
          <Icon name="back" size={22} strokeWidth={2.25} />
        </button>
        <span className="text-headline font-semibold text-content">Add manually</span>
      </div>

      <LabeledInput
        label="Food name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Homemade granola"
        invalid={blocked}
      />
      {blocked && (
        <p className="text-caption text-danger">This name already exists in your pantry</p>
      )}

      <label className="flex cursor-pointer select-none items-center gap-2 text-subhead text-content-secondary">
        <input
          type="checkbox"
          checked={save}
          onChange={(e) => setSave(e.target.checked)}
          className="h-4 w-4 accent-accent"
        />
        Save to pantry for next time
      </label>

      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Calories" value={cal} set={setCal} max={5000} step={1} centerAt={350} />
        <NumberField label="Protein (g)" value={pro} set={setPro} max={500} step={1} centerAt={25} />
        <NumberField label="Carbs (g)" value={carb} set={setCarb} max={800} step={1} centerAt={30} />
        <NumberField label="Fiber (g)" value={fib} set={setFib} max={200} step={1} centerAt={5} />
        <NumberField label="Fat (g)" value={fat} set={setFat} max={400} step={1} centerAt={12} />
      </div>
    </div>
  );
}

// ── EditOverlay ───────────────────────────────────────────────────────────────

function EditOverlay({
  item, onBack, onSave,
}: {
  item: BasketItem;
  onBack: () => void;
  onSave: (patch: Partial<BasketItem>) => void;
}) {
  const isSrv  = item.measurementType === 'per_serving';
  const [name, setName] = useState(item.name);
  const [cal, setCal]   = useState(String(Math.round(item.calories)));
  const [pro, setPro]   = useState(String(item.protein));
  const [carb, setCarb] = useState(String(item.carbs));
  const [fib, setFib]   = useState(String(item.fiber));
  const [fat, setFat]   = useState(String(item.fat));
  const [srvG, setSrvG] = useState(isSrv ? String(item.referenceAmount) : '');

  const saveRef = useRef<() => void>(() => undefined);
  saveRef.current = () => { // eslint-disable-line react-hooks/refs
    const patch: Partial<BasketItem> = {
      name: name.trim() || item.name,
      calories: +cal || item.calories,
      protein:  +pro  || item.protein,
      carbs:    +carb || item.carbs,
      fiber:    +fib  || item.fiber,
      fat:      +fat  || item.fat,
    };
    if (isSrv && srvG) patch.referenceAmount = +srvG || item.referenceAmount;
    onSave(patch);
  };

  useSheetSetFooter(
    <Button size="lg" onClick={() => saveRef.current()}>Save</Button>,
    [],
  );

  return (
    <div className="space-y-3 py-1">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="-ml-1 p-1 text-content-secondary active:opacity-70">
          <Icon name="back" size={22} strokeWidth={2.25} />
        </button>
        <span className="text-headline font-semibold text-content">Edit nutrition</span>
      </div>

      <LabeledInput label="Name" value={name} onChange={(e) => setName(e.target.value)} />

      <div className="h-px bg-border-subtle" />

      {isSrv ? (
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Serving size (g)" value={srvG} set={setSrvG} centerAt={100} />
          <NumberField label="Calories (kcal)" value={cal} set={setCal} centerAt={350} />
        </div>
      ) : (
        <NumberField label="Calories (kcal · per 100g)" value={cal} set={setCal} centerAt={350} />
      )}

      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Protein (g)" value={pro} set={setPro} centerAt={25} />
        <NumberField label="Carbs (g)" value={carb} set={setCarb} centerAt={30} />
        <NumberField label="Fat (g)" value={fat} set={setFat} centerAt={12} />
        <NumberField label="Fiber (g)" value={fib} set={setFib} centerAt={5} />
      </div>

      <p className="text-caption text-content-secondary">
        {isSrv
          ? 'Values are per serving. Adjust quantity in the basket.'
          : 'Values are per 100g. Adjust grams in the basket.'}
      </p>
    </div>
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
          placeholder="Name this meal"
        />
      )}

      {isMeal && items.length > 0 && (
        <div className="rounded-[16px] bg-surface-sunken px-4 py-3">
          <p className="mb-2 text-caption font-semibold uppercase text-content-secondary">Total nutrition</p>
          <div className="flex gap-4">
            <div className="flex-1">
              <p className="text-subhead text-content-secondary">≈{totalGrams}g total</p>
              <p className="text-subhead text-content-secondary">{totalCalories} kcal</p>
              <p className="text-subhead text-content-secondary">{totalProtein.toFixed(1)}g protein</p>
            </div>
            <div className="flex-1">
              <p className="text-subhead text-content-secondary">{totalCarbs.toFixed(1)}g carbs</p>
              <p className="text-subhead text-content-secondary">{totalFiber.toFixed(1)}g fiber</p>
              <p className="text-subhead text-content-secondary">{totalFat.toFixed(1)}g fat</p>
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
                  <span className="flex-1 truncate text-body font-semibold text-content">{item.name}</span>
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
