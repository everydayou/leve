// Camera / Photo / Describe / Nutri-scan capture mechanics — generalised
// away from the Day's-log basket's own BasketItem[]/sources state so any
// surface can plug in its own "what do I do with the resulting items"
// logic. The mechanics here (API calls, name clean-up, per-100g
// normalisation, error copy) are lifted VERBATIM from the Day's-log
// basket's FoodForm/LogEntryContent (AddEntrySheet.tsx) — that flow has
// been tweaked and battle-tested round after round on Marco's live
// daily-use app, so this reuses it exactly rather than re-deriving it.
// AddEntrySheet.tsx's own two internal copies are deliberately left
// untouched (same reasoning as round 122's BasketCard/PantryItemCard
// split: it's Marco's live daily-use surface, not something to risk a
// rushed refactor on) — this is the shared engine for every OTHER surface
// that wants the same capture flow, starting with the Pantry meal builder
// (PantryMealDetail/PantryFoodItemDetail), which only ever had Manual +
// Add-from-pantry wired up (see PROJECT-CONTEXT.txt Known Gaps).
//
// Kept in its own file (no component exports) — eslint-plugin-react-refresh's
// only-export-components rule flags a file that mixes a hook export with
// component exports, since Fast Refresh can no longer safely hot-swap it.
import { useRef, useState } from 'react';
import { newId } from '../../data/ids';
import { downscaleImage, MAX_SCAN_PX } from '../../lib/image';
import { captureFromCamera, captureFromLibrary, isNativeIOS } from '../../lib/camera';
import { scanFood, describeFood, SCAN_ENABLED } from '../../lib/foodScan';
import { cleanScanName, scanResultToBasket } from './basketHelpers';
import type { BasketItem } from './basketHelpers';
import type { ShowToast } from './Toaster';

export interface CapturedSource {
  id: string;
  photo: string;
}

export interface ServingChoice {
  item100: BasketItem;
  itemSrv: BasketItem;
  servingG: number;
}

export interface UseFoodCaptureOptions {
  showToast?: ShowToast;
  /** Fires whenever Camera/Photo/Nutri-scan produces new item(s) ready to
   *  add. `source` is included for Camera/Photo (contributes a collage
   *  photo, same as the Day's-log basket); omitted for Nutri-scan, which
   *  never contributes a collage photo there either. */
  onCaptured: (items: BasketItem[], source?: CapturedSource) => void;
}

/** Camera/Photo/Describe/Nutri-scan capture mechanics. Describe is
 *  intentionally NOT folded into `onCaptured` — its caller (a
 *  DescribeOverlay) needs the raw items back synchronously to support
 *  "Fix/Change" (replace one card) as well as "append", so
 *  `handleDescribeAnalyze` just returns them. */
export function useFoodCapture({ showToast, onCaptured }: UseFoodCaptureOptions) {
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeLabel, setAnalyzeLabel] = useState('Analysing…');
  const [servingModal, setServingModal] = useState<ServingChoice | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);

  async function runScan(imageDataUrl: string, label = 'Analysing your meal…') {
    setAnalyzeLabel(label);
    setAnalyzing(true);
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
      onCaptured(newItems, { id: sourceId, photo: imageDataUrl });
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleCamera() {
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
    if (isNativeIOS()) {
      const photo = await captureFromLibrary();
      if (photo) await runScan(photo, 'Analysing your photo…');
    } else if (SCAN_ENABLED) {
      scanInputRef.current?.click();
    } else {
      showToast?.('Food scan not configured');
    }
  }

  /** Throws on error / no-food-found — the caller (typically wiring a
   *  DescribeOverlay's onAnalyze) should catch and surface the message
   *  inline, same contract as the Day's-log basket's own handler. Returns
   *  the normalised item(s) rather than placing them itself, since callers
   *  differ on WHERE they land (append vs. replace-one-card "Fix" mode). */
  async function handleDescribeAnalyze(text: string): Promise<BasketItem[]> {
    const sourceId = newId();
    const foods = await describeFood(text);
    if (foods.length === 0) {
      throw new Error('no food — Please describe a food or meal (e.g. "a bowl of oats with banana").');
    }
    return foods.map((f) =>
      scanResultToBasket({
        name: f.name, estimatedGrams: f.estimatedGrams,
        calories: f.calories, protein: f.protein,
        carbs: f.carbs, fiber: f.fiber, fat: f.fat,
      }, sourceId),
    );
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
      // Label/Nutri-scan: no source photo added to the caller's collage.
      setServingModal({ item100, itemSrv, servingG });
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : 'Label scan failed');
    } finally {
      setAnalyzing(false);
    }
  }

  function resolveServingModal(choice: 'per100g' | 'perServing') {
    if (!servingModal) return;
    const chosen = choice === 'per100g' ? servingModal.item100 : servingModal.itemSrv;
    onCaptured([{ ...chosen, id: newId() }]);
    setServingModal(null);
  }

  function closeServingModal() {
    setServingModal(null);
  }

  /** Hidden file inputs — web fallback for Camera/Photo (gated by
   *  SCAN_ENABLED, same as the Day's-log basket), plus the always-available
   *  Nutri-scan input (opens the native Photo Library/Take Photo/Files
   *  sheet on iOS regardless of SCAN_ENABLED — same as today). Render once,
   *  anywhere in the tree. */
  const hiddenInputs = (
    <>
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
    </>
  );

  return {
    analyzing, analyzeLabel, servingModal,
    handleCamera, handlePhoto, handleDescribeAnalyze, handleLabelScan,
    resolveServingModal, closeServingModal,
    openLabelPicker: () => labelInputRef.current?.click(),
    hiddenInputs,
  };
}
