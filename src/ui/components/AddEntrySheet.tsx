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
  Icon, Sheet, useSheetSetFooter, SectionLabel, ListRow, ImageHero,
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
  autoScan = false, initialScanPhoto, showToast,
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
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const items = useLive(() => repos.foodItems.all(), []) ?? [];

  const isNotToday = date !== todayISO();
  const tabCls = (t: Tab) =>
    `flex flex-1 items-center justify-center gap-2 pb-3 text-subhead font-normal transition-colors ${
      tab === t ? 'text-content border-b-2 border-accent -mb-0.5' : 'text-content-secondary'
    }`;

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

  return (
    <Sheet
      onClose={onClose}
      title="Add"
      subtitle={dateSubtitle}
      forceExpanded={tab !== 'weight'}
    >
      {!hideTabs && (
        <div className="-mx-5 mb-4 flex border-b border-border-subtle px-5 shadow-card">
          <button onClick={() => setTab('food')} className={tabCls('food')}>
            <Icon name="foodIcon" size={18} />
            Food
          </button>
          <button onClick={() => setTab('activity')} className={tabCls('activity')}>
            <Icon name="activityIcon" size={18} />
            Activity
          </button>
          <button onClick={() => setTab('weight')} className={tabCls('weight')}>
            <Icon name="weight" size={18} />
            Weight
          </button>
        </div>
      )}
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
  const hasItems = basket.length > 0;
  const logLabel =
    basket.length === 0 ? 'Log it'
    : basket.length === 1 ? `Log ${basket[0].name}`
    : 'Log meal';
  const logRef = useRef<() => Promise<void>>(() => Promise.resolve());
  useSheetSetFooter(
    hasItems && !analyzing
      ? <Button size="lg" onClick={() => void logRef.current()}>{logLabel}</Button>
      : null,
    [hasItems, logLabel, activeOverlay, analyzing],
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
    if (basket.length === 0) return;
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
  const recent   = items.filter((i) => !i.isArchived).slice(0, 5);
  const filtered = query.trim()
    ? items.filter((i) => !i.isArchived && i.name.toLowerCase().includes(query.toLowerCase()))
    : recent;

  return (
    <div className="space-y-1 rounded-[16px] bg-surface-sunken p-3">
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
          <SectionLabel>{query.trim() ? 'Results' : 'Recent'}</SectionLabel>
          <div className="overflow-hidden rounded-[12px] bg-surface divide-y divide-border-subtle">
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
        <SectionLabel>Other methods</SectionLabel>
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
    { label: 'Camera',   onClick: onCamera,   icon: <Icon name="camera" size={22} strokeWidth={1.8} /> },
    { label: 'Photo',    onClick: onPhoto,    icon: <PhotoMethodIcon /> },
    { label: 'Describe', onClick: onDescribe, icon: <DescribeMethodIcon /> },
    { label: 'Label',    onClick: onLabel,    icon: <LabelMethodIcon /> },
    { label: 'Manual',   onClick: onManual,   icon: <Icon name="plus" size={22} strokeWidth={1.8} /> },
  ];

  return (
    // -mx-1 / px-1 keeps scroll shadow visible; scrollbar-hide via inline style
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" style={{ scrollbarWidth: 'none' }}>
      {methods.map(({ label, onClick, icon }) => (
        <button
          key={label}
          onClick={onClick}
          className="flex min-w-[68px] shrink-0 flex-col items-center gap-1.5 rounded-[14px] border border-border-field bg-surface p-2.5 text-caption font-medium text-content-secondary shadow-card transition-colors active:border-accent active:bg-accent/5"
        >
          <span className="text-content-muted">{icon}</span>
          {label}
        </button>
      ))}
    </div>
  );
}

function PhotoMethodIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

function DescribeMethodIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function LabelMethodIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12h6M9 16h4" />
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
