import { useEffect, useRef, useState } from 'react';
import { useLive } from '../../state/live';
import { repos } from '../../state/repos';
import { newId, todayISO } from '../../data/ids';
import { nutritionFor } from '../../domain/calc';
import { currentWeightKg } from '../../domain/goal';
import { kgToLbs, lbsToKg } from '../../domain/units';
import { mifflinStJeorBMR, canComputeBmr } from '../../domain/bmr';
import { onDecimalChange } from '../../lib/num';
import { fmtDiaryDate } from '../../lib/date';
import { PhotoPicker } from './PhotoPicker';
import { downscaleImage, MAX_SCAN_PX } from '../../lib/image';
import { captureFromCamera, captureFromLibrary, isNativeIOS } from '../../lib/camera';
import { scanFood } from '../../lib/foodScan';

const SCAN_ENABLED = !!(import.meta.env.VITE_FOOD_SCAN_API_URL as string | undefined);
import { SegmentedControl, Button, LabeledInput, NumberField, Icon, Sheet, MeasurementTypeSelector, ServingStepper, useSheetSetFooter } from '../kit';
import type { ShowToast } from './Toaster';
import { findByName } from '../../domain/pantry';
import type { FoodItem, MeasurementType, MealItem } from '../../domain/types';

/** Recalculate and persist the account BMR using the most recent weight entry
 *  on or before today. Editing a past entry should not change the account BMR
 *  to that old value — only the latest calendar weight drives the profile BMR. */
async function syncAccountBmr() {
  const today   = todayISO();
  const weights = await repos.weights.all();
  const latest  = weights
    .filter((w) => w.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!latest) return;
  const user = await repos.user.get();
  if (user && canComputeBmr({ weightKg: latest.weightKg, heightCm: user.heightCm, age: user.age, sex: user.sex })) {
    const newBmr = mifflinStJeorBMR({ weightKg: latest.weightKg, heightCm: user.heightCm, age: user.age!, sex: user.sex! });
    await repos.user.save({ ...user, bmr: newBmr });
  }
}



export type AddEntryTab = 'food' | 'activity' | 'weight';
type Tab = AddEntryTab;
type FoodMode = 'pantry' | 'new';

// ── Scan types ───────────────────────────────────────────────────────────────

type ScanState = 'idle' | 'source-picking' | 'confirming' | 'analyzing' | 'results';

export type ResultItem = MealItem;

export function AddEntrySheet({ date, onClose, initialTab = 'food', hideTabs = false, autoScan = false, initialScanPhoto, showToast }: {
  date: string;
  onClose: () => void;
  initialTab?: Tab;
  /** When true the Food/Activity/Weight tab bar is hidden — used when the
   *  caller already chose the entry type via the speed-dial FAB menu. */
  hideTabs?: boolean;
  /** When true the FoodForm immediately triggers the scan camera on mount.
   *  Only meaningful on web (native uses initialScanPhoto instead). */
  autoScan?: boolean;
  /** Pre-captured photo data URL to scan on mount (native path).
   *  When provided, FoodForm skips the camera step and goes straight to AI analysis. */
  initialScanPhoto?: string;
  showToast?: ShowToast;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  // Lifted scan state so AddEntrySheet can update the sheet height.
  const [foodScanState, setFoodScanState] = useState<ScanState>('idle');
  // Ref that FoodForm populates with its startScan fn so the header icon can call it.
  const foodScanTriggerRef = useRef<(() => void) | null>(null);

  // When any scan state is active on the food tab, the modal becomes "Scan food".
  const isScanActive = tab === 'food' && foodScanState !== 'idle';

  // Derive sheet title: scan state overrides everything; otherwise name by selected type.
  const sheetTitle = isScanActive
    ? 'Scan food'
    : hideTabs
      ? (tab === 'food' ? 'Add food' : tab === 'activity' ? 'Add activity' : 'Add weight')
      : 'Add entry';

  // Icon shown inline next to the title.
  const titleIcon = isScanActive
    ? <Icon name="scanFood" size={16} />
    : hideTabs
      ? (tab === 'food'
          ? <Icon name="foodIcon" size={16} />
          : tab === 'activity'
            ? <Icon name="activityIcon" size={16} />
            : <Icon name="weight" size={16} />)
      : undefined;

  // Right-side header action: scan icon when on Food tab and not already scanning.
  const sheetRightAction = (tab === 'food' && foodScanState === 'idle' && SCAN_ENABLED)
    ? (
      <button
        onClick={() => foodScanTriggerRef.current?.()}
        className="-m-1 p-1 text-accent-hover active:opacity-70 transition-colors"
        aria-label="Scan food"
      >
        <Icon name="scanFood" size={20} />
      </button>
    )
    : undefined;

  const items = useLive(() => repos.foodItems.all(), []) ?? [];
  const isNotToday = date !== todayISO();

  const tabCls = (t: Tab) =>
    `flex flex-1 items-center justify-center gap-2 pb-3 text-subhead font-normal transition-colors ${tab === t ? 'text-content border-b-2 border-accent -mb-0.5' : 'text-content-secondary'}`;

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
      title={sheetTitle}
      titleIcon={titleIcon}
      subtitle={dateSubtitle}
      rightAction={sheetRightAction}
      forceExpanded={tab !== 'food' || foodScanState !== 'source-picking'}
      scrollAreaPaddingBottom={foodScanState === 'results' ? '0px' : undefined}
    >
      {/* Full-width underline tab bar — hidden when caller pre-selected a type */}
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
          scanState={foodScanState}
          setScanState={setFoodScanState}
          scanTriggerRef={foodScanTriggerRef}
        />
      )}
      {tab === 'activity' && <ActivityForm date={date} onDone={onClose} showToast={showToast} />}
      {tab === 'weight' && <WeightForm date={date} onDone={onClose} />}
    </Sheet>
  );
}

// ── FoodForm ─────────────────────────────────────────────────────────────────

function FoodForm({ date, items, onDone, autoScan = false, initialScanPhoto, showToast, scanState, setScanState, scanTriggerRef }: {
  date: string; items: FoodItem[]; onDone: () => void; autoScan?: boolean; initialScanPhoto?: string; showToast?: ShowToast;
  /** Scan state lifted to AddEntrySheet so the sheet height can respond. */
  scanState: ScanState;
  setScanState: (state: ScanState) => void;
  /** Ref populated with startScan so the parent header icon can trigger scanning. */
  scanTriggerRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const [mode, setMode] = useState<FoodMode>('pantry');
  const [scanResults, setScanResults] = useState<ResultItem[]>([]);
  const [mealName, setMealName] = useState('');
  const [scanError, setScanError] = useState<string | null>(null);
  const [currentScanPhoto, setCurrentScanPhoto] = useState<string | null>(null);
  // Holds a photo waiting for the user to confirm before analysis starts.
  // 'web'  — file from the file-picker (needs downscaling + a revokable blob URL).
  // 'native' — already-downscaled dataUrl from capturePhoto() / initialScanPhoto.
  type PendingPhoto =
    | { kind: 'web'; file: File; previewUrl: string; source: 'library' }
    | { kind: 'native'; dataUrl: string; source: 'library' };
  const [pendingScanPhoto, setPendingScanPhoto] = useState<PendingPhoto | null>(null);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);

  // On mount: if a pre-captured photo was passed in (native path), show the
  // confirm screen so the user can verify before analysis starts.
  // If autoScan is set (web fallback), open the file picker.
  useEffect(() => {
    if (initialScanPhoto) {
      // Camera path: go straight to analysis — no custom confirmation screen.
      void runScan(initialScanPhoto);
    } else if (autoScan) {
      void startScan();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Expose startScan to the parent header icon via ref.
  useEffect(() => {
    if (scanTriggerRef) scanTriggerRef.current = startScan;
    return () => { if (scanTriggerRef) scanTriggerRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function runScan(imageDataUrl: string) {
    setCurrentScanPhoto(imageDataUrl);
    setScanState('analyzing');
    setScanError(null);
    try {
      const foods = await scanFood(imageDataUrl);
      // Strip parenthetical qualifiers from names — the AI sometimes appends
      // extra detail in brackets (e.g. "Avocado Toast (with poached egg)").
      // All such info belongs in the description field instead.
      const cleaned = foods.map((f) => {
        const match = f.name.match(/^(.+?)\s*\((.+?)\)$/);
        if (match) {
          const extraInfo = match[2].trim();
          return { ...f, name: match[1].trim(), description: f.description ? `${extraInfo}. ${f.description}` : extraInfo };
        }
        return f;
      });
      // Coerce all numeric fields — the AI API sometimes returns strings.
      const resultItems = cleaned.map((f) => ({
        ...f,
        selected: true,
        calories: Number(f.calories) || 0,
        protein: Number(f.protein) || 0,
        carbs: Number(f.carbs) || 0,
        fiber: Number(f.fiber) || 0,
        fat: Number(f.fat) || 0,
        estimatedGrams: Number(f.estimatedGrams) || 0,
      }));
      setScanResults(resultItems);
      // Auto-generate meal name for multi-item scans based on total calories.
      if (resultItems.length > 1) {
        const totalCals = resultItems.reduce((s, f) => s + f.calories, 0);
        setMealName(totalCals < 400 ? 'Small meal' : totalCals <= 700 ? 'Medium meal' : 'Large meal');
      }
      setScanState('results');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Scan failed';
      setScanError(msg);
      setScanState('idle');
    }
  }

  async function startScan() {
    setScanError(null);
    if (isNativeIOS()) {
      // Show our own source picker so we know which path the user took.
      setShowSourcePicker(true);
      setScanState('source-picking');
    } else {
      scanInputRef.current?.click();
    }
  }

  async function scanFromCamera() {
    setScanError(null);
    try {
      // Keep the source picker visible while the native camera UI is open so there's
      // no flash of the default form between button tap and the camera taking over.
      const photo = await captureFromCamera();
      if (photo) {
        setShowSourcePicker(false);
        await runScan(photo);
      }
      // On cancel: leave source picker visible so they can retry or tap X to dismiss.
    } catch {
      setScanError('Could not get photo. Please try again.');
    }
  }

  async function scanFromLibrary() {
    setScanError(null);
    try {
      // Keep the source picker visible while the native photo library is open.
      const photo = await captureFromLibrary();
      if (photo) {
        setShowSourcePicker(false);
        // Library: show our confirmation screen so the user can verify before scanning.
        setPendingScanPhoto({ kind: 'native', dataUrl: photo, source: 'library' });
        setScanState('confirming');
      }
      // On cancel: leave source picker visible so they can retry or tap X to dismiss.
    } catch {
      setScanError('Could not open photo library. Please try again.');
    }
  }

  async function handleScanFile(file: File) {
    const small = await downscaleImage(file, MAX_SCAN_PX);
    await runScan(small);
  }

  function pickScanFile(file: File) {
    // Show confirm preview so the user can verify the photo before analysis.
    const previewUrl = URL.createObjectURL(file);
    setPendingScanPhoto({ kind: 'web', file, previewUrl, source: 'library' });
    setScanState('confirming');
  }

  async function chooseAnotherPhoto() {
    if (!pendingScanPhoto) return;
    // Always library source — re-open the appropriate picker.
    cancelScan();
    if (isNativeIOS()) {
      void scanFromLibrary();
    } else {
      scanInputRef.current?.click();
    }
  }

  async function confirmScan() {
    if (!pendingScanPhoto) return;
    if (pendingScanPhoto.kind === 'web') {
      const { file, previewUrl } = pendingScanPhoto;
      URL.revokeObjectURL(previewUrl);
      setPendingScanPhoto(null);
      await handleScanFile(file);
    } else {
      const { dataUrl } = pendingScanPhoto;
      setPendingScanPhoto(null);
      await runScan(dataUrl);
    }
  }

  function cancelScan() {
    if (pendingScanPhoto?.kind === 'web') URL.revokeObjectURL(pendingScanPhoto.previewUrl);
    setPendingScanPhoto(null);
    setShowSourcePicker(false);
    setScanState('idle');
    if (scanInputRef.current) scanInputRef.current.value = '';
  }

  async function logSelected() {
    const selected = scanResults.filter((i) => i.selected);
    if (scanResults.length > 1) {
      // Multi-item scan → log as a single meal entry.
      const snapshot = {
        calories: selected.reduce((s, i) => s + i.calories, 0),
        protein:  selected.reduce((s, i) => s + i.protein, 0),
        carbs:    selected.reduce((s, i) => s + i.carbs, 0),
        fiber:    selected.reduce((s, i) => s + i.fiber, 0),
        fat:      selected.reduce((s, i) => s + i.fat, 0),
      };
      const entryName = mealName.trim() || 'Meal';
      await repos.foodEntries.add({
        id: newId(), date,
        manualName: entryName,
        isManual: true,
        snapshot,
        createdAt: new Date().toISOString(),
        mealData: {
          name: entryName,
          photo: currentScanPhoto ?? undefined,
          items: scanResults,
        },
      });
      showToast?.(`${entryName} logged`);
    } else {
      // Single item → log individually.
      for (const item of selected) {
        await repos.foodEntries.add({
          id: newId(), date,
          manualName: item.name,
          isManual: true,
          snapshot: {
            calories: item.calories, protein: item.protein,
            carbs: item.carbs, fiber: item.fiber, fat: item.fat,
          },
          createdAt: new Date().toISOString(),
        });
      }
      const label = selected.length === 1 ? selected[0].name : `${selected.length} foods`;
      showToast?.(`${label} logged`);
    }
    onDone();
  }

  // ── Source picker (native only) ───────────────────────────────────────────
  if (showSourcePicker) {
    return (
      <div className="flex flex-col gap-3 py-6">
        <Button size="lg" onClick={scanFromCamera}>Take photo</Button>
        <Button size="lg" variant="outline" onClick={scanFromLibrary}>Choose from library</Button>
      </div>
    );
  }

  // ── Confirm scan photo ────────────────────────────────────────────────────
  if (pendingScanPhoto) {
    const previewSrc = pendingScanPhoto.kind === 'web'
      ? pendingScanPhoto.previewUrl
      : pendingScanPhoto.dataUrl;
    return (
      <div className="flex flex-col items-stretch pt-2" style={{ minHeight: '100%' }}>
        <div className="flex justify-center flex-shrink-0">
          <div className="w-64 h-64 overflow-hidden rounded-[24px] shadow-card-lg">
            <img src={previewSrc} alt="Photo to scan" className="w-full h-full object-cover" />
          </div>
        </div>
        {/* Spacer pushes buttons to the bottom */}
        <div className="flex-1" />
        <div
          className="sticky bottom-0 pt-6 flex flex-col gap-2"
          style={{ background: 'linear-gradient(to bottom, transparent 0px, var(--color-surface) 1.5rem)', paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
        >
          <Button variant="outline" size="lg" onClick={chooseAnotherPhoto}>
            Choose another photo
          </Button>
          <Button size="lg" onClick={confirmScan}>Scan this photo</Button>
        </div>
      </div>
    );
  }

  // ── Analysing state ───────────────────────────────────────────────────────
  if (scanState === 'analyzing') {
    return (
      <div className="flex flex-col items-center pt-2" style={{ minHeight: '100%' }}>
        {/* Photo always shown at top during analyzing */}
        {currentScanPhoto && (
          <div className="w-64 h-64 overflow-hidden rounded-[24px] shadow-card-lg flex-shrink-0">
            <img src={currentScanPhoto} alt="Photo being scanned" className="w-full h-full object-cover" />
          </div>
        )}
        {/* Spinner vertically centered in remaining space */}
        <div className="flex flex-col items-center gap-3 flex-1 justify-center">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-border-subtle border-t-accent" />
          <p className="text-subhead text-content-secondary">Analysing food…</p>
        </div>
      </div>
    );
  }

  // ── Scan results view ─────────────────────────────────────────────────────
  if (scanState === 'results') {
    return (
      <ScanResults
        items={scanResults}
        onChange={setScanResults}
        onLog={logSelected}
        scanPhoto={currentScanPhoto}
        mealName={mealName}
        onMealNameChange={setMealName}
      />
    );
  }

  // ── Normal (pantry / new food) view ───────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <SegmentedControl<FoodMode>
          value={mode}
          onChange={setMode}
          options={[{ value: 'pantry', label: 'Pantry' }, { value: 'new', label: 'New food' }]}
        />
      </div>

      {scanError && <p className="text-caption text-danger">{scanError}</p>}

      {/* Hidden file input for web scan (triggered via the header scan button) */}
      {SCAN_ENABLED && (
        <input
          ref={scanInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) pickScanFile(f); }}
        />
      )}

      {mode === 'pantry'
        ? <PantryPick date={date} items={items} onDone={onDone} showToast={showToast} />
        : <NewFood date={date} items={items} onDone={onDone} showToast={showToast} />}
    </div>
  );
}

// ── ScanResults ───────────────────────────────────────────────────────────────

export function ScanResults({ items, onChange, onLog, scanPhoto, mealName, onMealNameChange, logLabel, extraSection }: {
  items: ResultItem[];
  onChange: (items: ResultItem[]) => void;
  onLog: () => Promise<void>;
  scanPhoto: string | null;
  /** Present when items.length > 1 — editable name for the whole meal. */
  mealName?: string;
  onMealNameChange?: (name: string) => void;
  /** Override the primary action button label (default: 'Log meal' / 'Log N items'). */
  logLabel?: string;
  /** Optional content rendered between the items list and the sticky CTA. */
  extraSection?: React.ReactNode;
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [logging, setLogging] = useState(false);
  const isMeal = items.length > 1;
  const selectedCount = items.filter((i) => i.selected).length;
  const selectedItems = items.filter((i) => i.selected);

  // Calculate totals for selected items only — Number() guards against API strings.
  const totalCalories = selectedItems.reduce((sum, item) => sum + (Number(item.calories) || 0), 0);
  const totalProtein  = selectedItems.reduce((sum, item) => sum + (Number(item.protein)  || 0), 0);
  const totalCarbs    = selectedItems.reduce((sum, item) => sum + (Number(item.carbs)    || 0), 0);
  const totalFiber    = selectedItems.reduce((sum, item) => sum + (Number(item.fiber)    || 0), 0);
  const totalFat      = selectedItems.reduce((sum, item) => sum + (Number(item.fat)      || 0), 0);
  const totalGrams    = selectedItems.reduce((sum, item) => sum + (Number(item.estimatedGrams) || 0), 0);

  // Capture original AI-estimated values per item the first time the edit panel
  // is opened, so that changing grams always scales from the original baseline.
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

  /** Change grams and proportionally rescale all macros from the original AI values. */
  function updateGrams(idx: number, newGrams: number) {
    const orig = originalsRef.current[idx];
    if (!orig || orig.g === 0) { update(idx, { estimatedGrams: newGrams }); return; }
    const s = newGrams / orig.g;
    update(idx, {
      estimatedGrams: newGrams,
      calories: Math.round(orig.cal * s),
      protein:  Math.round(orig.pro    * s * 10) / 10,
      carbs:    Math.round(orig.carbs  * s * 10) / 10,
      fiber:    Math.round(orig.fib    * s * 10) / 10,
      fat:      Math.round(orig.fat    * s * 10) / 10,
    });
  }

  return (
    <div className="space-y-3 mt-2 flex flex-col">
      {/* [1] Scanned photo at top — always shown and consistent size */}
      {scanPhoto && (
        <div className="flex justify-center pb-1 flex-shrink-0">
          <div className="w-64 h-64 overflow-hidden rounded-[24px] shadow-card-lg">
            <img src={scanPhoto} alt="Scanned meal" className="w-full h-full object-cover" />
          </div>
        </div>
      )}

      {/* [2] Meal name input — shown only for multi-item scans */}
      {isMeal && onMealNameChange && (
        <LabeledInput
          label="Meal name"
          value={mealName ?? ''}
          onChange={(e) => onMealNameChange(e.target.value)}
          placeholder="Name this meal"
        />
      )}

      {/* [3] Total meal nutrition summary — shown only for multi-item scans, read-only */}
      {isMeal && items.length > 0 && (
        <div className="rounded-[16px] bg-surface-sunken px-4 py-3">
          <p className="text-caption text-content-secondary font-semibold uppercase mb-2">Total nutrition</p>
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

      {/* [4] Item count badge — mt-3 adds extra gap above space-y-3's 12px = 24px total */}
      <div className="flex items-center justify-between px-0.5 mt-3">
        <span className="text-subhead font-semibold text-content">
          {items.length} item{items.length !== 1 ? 's' : ''} detected
        </span>
      </div>

      {/* Items list and no-food placeholder */}
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
                {/* Low confidence badge — inline at top of card, part of normal flow */}
                {item.confidence === 'low' && (
                  <div className="self-start rounded-pill bg-content px-2.5 py-1 text-subhead font-medium text-content-inverse">
                    low confidence
                  </div>
                )}
                {/* Name row: checkbox + title (truncated) + edit */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={(e) => update(idx, { selected: e.target.checked })}
                    className="h-5 w-5 shrink-0 accent-accent"
                    aria-label={`Include ${item.name}`}
                  />
                  <span className="flex-1 truncate text-body font-semibold text-content">
                    {item.name}
                  </span>
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

                {/* Description — shown when the scan API returns one */}
                {item.description && (
                  <p className="text-subhead text-content">{item.description}</p>
                )}

                {/* Nutrition facts container — hidden when edit form is open */}
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

                {/* Expanded edit form */}
                {expandedIdx === idx && (
                  <div className="border-t border-border-subtle pt-3">
                    <div className="grid grid-cols-2 gap-2">
                      <NumberField label="Calories" value={String(item.calories)} set={(v) => update(idx, { calories: +v || 0 })} />
                      <NumberField label="Protein (g)" value={String(item.protein)} set={(v) => update(idx, { protein: +v || 0 })} />
                      <NumberField label="Carbs (g)" value={String(item.carbs)} set={(v) => update(idx, { carbs: +v || 0 })} />
                      <NumberField label="Fiber (g)" value={String(item.fiber)} set={(v) => update(idx, { fiber: +v || 0 })} />
                      <NumberField label="Fat (g)" value={String(item.fat)} set={(v) => update(idx, { fat: +v || 0 })} />
                      <NumberField label="Est. weight (g)" value={String(item.estimatedGrams)} set={(v) => updateGrams(idx, +v || 0)} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Accuracy disclaimer — scrolls with content, below all items */}
      <p className="text-caption text-content-secondary text-center px-1 pb-2">
        AI-generated results may be inaccurate.
      </p>

      {extraSection}

      {/* Sticky Log button — -mx-5 px-5 breaks out of the scroll area's px-5
          padding so the gradient fills the full panel width edge-to-edge.
          (The div fills exactly the scroll container's padding-box width, so
          there is no horizontal overflow and overflow-x clipping is not triggered.) */}
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
          disabled={selectedCount === 0 || logging}
        >
          {logging
            ? 'Logging…'
            : logLabel
              ? logLabel
              : isMeal
                ? 'Log meal'
                : `Log ${selectedCount} item${selectedCount !== 1 ? 's' : ''}`}
        </Button>
      </div>
    </div>
  );
}

type PickedItem = { item: FoodItem; qty: string };

function PantryPick({ date, items, onDone, showToast }: {
  date: string; items: FoodItem[]; onDone: () => void; showToast?: ShowToast;
}) {
  const [picked, setPicked] = useState<PickedItem[]>([]);
  const [mealName, setMealName] = useState('');

  const isMeal = picked.length >= 2;

  function addItem(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const qty = item.measurementType === 'per_100g' ? '100' : '1';
    setPicked((prev) => [...prev, { item, qty }]);
  }

  function removeItem(idx: number) {
    setPicked((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateQty(idx: number, qty: string) {
    setPicked((prev) => prev.map((p, i) => i === idx ? { ...p, qty } : p));
  }

  // Register log CTA in Sheet's pinned footer slot.
  // Passes null when nothing is picked (hides footer), updates label as items change.
  const logRef = useRef<() => Promise<void>>(() => Promise.resolve());
  // logRef.current is updated BELOW after `log` is defined; the hook call is placed
  // here so hook call order is stable across renders (hooks must not be conditional).
  const hasPicked = picked.length > 0;
  const logButtonLabel = isMeal ? 'Log meal' : hasPicked ? `Log ${picked[0].item.name}` : '';
  useSheetSetFooter(
    hasPicked
      ? <Button size="lg" onClick={() => void logRef.current()}>{logButtonLabel}</Button>
      : null,
    [hasPicked, logButtonLabel],
  );

  async function log() {
    if (picked.length === 0) return;

    if (isMeal) {
      const entries = picked.map((p) => {
        const quantity = Number(p.qty) || 0;
        const n = nutritionFor(p.item, quantity);
        return { item: p.item, quantity, n };
      });
      const snapshot = {
        calories: entries.reduce((s, e) => s + e.n.calories, 0),
        protein:  entries.reduce((s, e) => s + e.n.protein, 0),
        carbs:    entries.reduce((s, e) => s + e.n.carbs, 0),
        fiber:    entries.reduce((s, e) => s + e.n.fiber, 0),
        fat:      entries.reduce((s, e) => s + e.n.fat, 0),
      };
      const name = mealName.trim() || 'Meal';
      await repos.foodEntries.add({
        id: newId(), date,
        manualName: name,
        isManual: true,
        snapshot,
        createdAt: new Date().toISOString(),
        mealData: {
          name,
          items: entries.map((e) => ({
            name: e.item.name,
            selected: true,
            confidence: 'high' as const,
            calories: e.n.calories,
            protein: e.n.protein,
            carbs: e.n.carbs,
            fiber: e.n.fiber,
            fat: e.n.fat,
            estimatedGrams: e.quantity,
          })),
        },
      });
      showToast?.(`${name} logged`);
    } else {
      const { item, qty } = picked[0];
      const quantity = Number(qty) || 0;
      const id = newId();
      await repos.foodEntries.add({
        id, date, foodItemId: item.id, quantity, isManual: false,
        snapshot: nutritionFor(item, quantity), createdAt: new Date().toISOString(),
      });
      showToast?.(`${item.name} logged`, async () => repos.foodEntries.remove(id));
    }
    onDone();
  }
  logRef.current = log; // eslint-disable-line react-hooks/refs -- keep ref current after `log` is defined; safe because onClick reads ref at call time

  return (
    <div className="flex flex-col space-y-3">
      {/* Meal name — only when 2+ items */}
      {isMeal && (
        <LabeledInput
          label="Meal name"
          value={mealName}
          onChange={(e) => setMealName(e.target.value)}
          placeholder="Name this meal"
        />
      )}

      {/* Picked item cards */}
      {picked.map((p, idx) => {
        const quantity = Number(p.qty) || 0;
        const n = nutritionFor(p.item, quantity);
        const isServing = p.item.measurementType === 'per_serving';
        return (
          <div key={idx} className="rounded-[20px] bg-surface shadow-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate text-body font-semibold text-content">{p.item.name}</span>
              <button
                onClick={() => removeItem(idx)}
                className="-m-1 p-1 text-content-muted active:text-danger transition-colors"
                aria-label={`Remove ${p.item.name}`}
              >
                <Icon name="trash" size={18} strokeWidth={2} />
              </button>
            </div>
            {isServing
              ? <ServingStepper qty={p.qty} setQty={(q) => updateQty(idx, q)} />
              : <LabeledInput label="Quantity (g)" value={p.qty} onChange={onDecimalChange((v) => updateQty(idx, v))} inputMode="decimal" />
            }
            <div className="rounded-[12px] bg-surface-sunken px-3 py-2">
              <span className="text-subhead text-content-secondary">
                {Math.round(n.calories)} kcal · {n.protein.toFixed(1)}g protein
              </span>
            </div>
          </div>
        );
      })}

      {/* Item picker — label changes based on whether items already picked */}
      <label className="block">
        <span className="text-micro font-medium uppercase text-content-secondary">
          {picked.length === 0 ? 'Pick an item' : 'Add another item'}
        </span>
        <div className="relative mt-1">
          <select
            value=""
            onChange={(e) => { if (e.target.value) addItem(e.target.value); }}
            className="w-full appearance-none rounded-field border border-border-field bg-surface pl-3 pr-10 py-3 text-body font-medium text-content"
          >
            <option value="">Pick an item</option>
            {items
              .filter((i) => !picked.some((p) => p.item.id === i.id))
              .map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
            <Icon name="chevronDown" size={16} strokeWidth={2} className="text-content-muted" />
          </div>
        </div>
      </label>

    </div>
  );
}

function NewFood({ date, items, onDone, showToast }: {
  date: string; items: FoodItem[]; onDone: () => void; showToast?: ShowToast;
}) {
  const [name, setName] = useState('');
  const [mt, setMt] = useState<MeasurementType>('per_100g');
  const [cal, setCal] = useState(''); const [pro, setPro] = useState('');
  const [carb, setCarb] = useState(''); const [fib, setFib] = useState(''); const [fat, setFat] = useState('');
  const [qty, setQty] = useState('100'); const [photo, setPhoto] = useState<string | undefined>();
  const [saveToPantry, setSaveToPantry] = useState(true);

  const ref = mt === 'per_100g' ? 100 : 1;
  const item: FoodItem = { id: 'tmp', name, measurementType: mt, referenceAmount: ref, calories: +cal || 0, protein: +pro || 0, carbs: +carb || 0, fiber: +fib || 0, fat: +fat || 0, photo, isArchived: false };
  const quantity = Number(qty) || 0;

  // Duplicate guard: only matters when saving to the pantry (a one-off manual
  // log can repeat a name freely). Case/space-insensitive match.
  const duplicate = findByName(items, name);
  const blocked = saveToPantry && !!duplicate;

  // eslint-disable-next-line react-hooks/set-state-in-effect -- reset qty to sensible default when measurement type changes
  useEffect(() => { setQty(mt === 'per_100g' ? '100' : '1'); }, [mt]);

  async function save() {
    if (!name.trim() || blocked) return;
    const snapshot = nutritionFor(item, quantity);
    const entryId = newId();
    if (saveToPantry) {
      const itemId = newId();
      await repos.foodItems.put({ ...item, id: itemId });
      await repos.foodEntries.add({ id: entryId, date, foodItemId: itemId, quantity, isManual: false, snapshot, createdAt: new Date().toISOString() });
    } else {
      await repos.foodEntries.add({ id: entryId, date, manualName: name.trim(), isManual: true, snapshot, createdAt: new Date().toISOString() });
    }
    showToast?.('Food logged', async () => repos.foodEntries.remove(entryId));
    onDone();
  }

  // Register "Log it" in Sheet's pinned footer slot so it stays at the panel
  // bottom even when the keyboard is open (avoids floating mid-form).
  const saveRef = useRef<() => Promise<void>>(() => Promise.resolve());
  saveRef.current = save; // eslint-disable-line react-hooks/refs -- keep ref current; onClick reads it at call time, not during render
  useSheetSetFooter(
    <Button size="lg" onClick={() => void saveRef.current()} disabled={!name.trim() || blocked}>Log it</Button>,
    [!name.trim(), blocked],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <PhotoPicker photo={photo} onChange={setPhoto} />
        <LabeledInput wrapClassName="flex-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Food name" invalid={blocked} />
      </div>
      {blocked && (
        <p className="text-caption text-danger">This name already exists in your pantry</p>
      )}
      <label className="flex items-center gap-2 text-subhead text-content-secondary pb-2">
        <input type="checkbox" checked={saveToPantry} onChange={(e) => setSaveToPantry(e.target.checked)} /> Save to pantry
      </label>
      <MeasurementTypeSelector value={mt} onChange={setMt} />
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Calories" value={cal} set={setCal} />
        <NumberField label="Protein (g)" value={pro} set={setPro} />
        <NumberField label="Carbs (g)" value={carb} set={setCarb} />
        <NumberField label="Fiber (g)" value={fib} set={setFib} />
        <NumberField label="Fat (g)" value={fat} set={setFat} />
        <NumberField label={mt === 'per_100g' ? 'Quantity (g)' : 'Servings'} value={qty} set={setQty} />
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
  { value: '30',  label: '30 min', minutes: 30 },
  { value: '45',  label: '45 min', minutes: 45 },
  { value: '60',  label: '1 hour', minutes: 60 },
  { value: '90',  label: '1.5 hrs', minutes: 90 },
];

type ActivityMode = 'manual' | 'estimate';
const ACTIVITY_MODE_KEY = 'ngt-activity-mode';

function ActivityForm({ date, onDone, showToast }: {
  date: string; onDone: () => void; showToast?: ShowToast;
}) {
  const activities = useLive(() => repos.activities.byDate(date), [date]) ?? [];
  const existing = activities[0];

  const [mode, setMode] = useState<ActivityMode>(
    () => (localStorage.getItem(ACTIVITY_MODE_KEY) === 'estimate' ? 'estimate' : 'manual')
  );
  const [kcal, setKcal] = useState('');
  const [intensity, setIntensity] = useState<string | null>(null);
  const [duration,  setDuration]  = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- populate field when async activity data resolves
    if (existing != null) setKcal(String(existing.activeCalories));
  }, [existing?.activeCalories]); // eslint-disable-line react-hooks/exhaustive-deps

  function changeMode(m: ActivityMode) {
    setMode(m);
    localStorage.setItem(ACTIVITY_MODE_KEY, m);
  }

  // Recalculate whenever either picker changes
  function handleIntensity(val: string | null) {
    setIntensity(val);
    const i = INTENSITY_OPTIONS.find((o) => o.value === val);
    const d = DURATION_OPTIONS.find((o) => o.value === duration);
    if (i && d) setKcal(String(Math.round(i.kcalPerMin * d.minutes)));
  }
  function handleDuration(val: string | null) {
    setDuration(val);
    const i = INTENSITY_OPTIONS.find((o) => o.value === intensity);
    const d = DURATION_OPTIONS.find((o) => o.value === val);
    if (i && d) setKcal(String(Math.round(i.kcalPerMin * d.minutes)));
  }

  async function save() {
    const v = Number(kcal);
    if (!v) return;
    if (existing) await repos.activities.remove(existing.id);
    await repos.activities.add({ id: newId(), date, activeCalories: v, createdAt: new Date().toISOString() });
    showToast?.('Activity saved');
    onDone();
  }

  // Register "Save activity" in Sheet's pinned footer slot.
  const saveRef = useRef<() => Promise<void>>(() => Promise.resolve());
  saveRef.current = save; // eslint-disable-line react-hooks/refs -- keep ref current; onClick reads it at call time, not during render
  useSheetSetFooter(
    <Button size="lg" onClick={() => void saveRef.current()} disabled={!Number(kcal)}>Save activity</Button>,
    [!Number(kcal)],
  );

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
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
        /* ── Manual: free-text field ──────────────────────────────────── */
        <LabeledInput
          label="Active calories"
          value={kcal}
          onChange={(e) => setKcal(e.target.value)}
          inputMode="numeric"
          placeholder="e.g. 300"
          autoFocus
          onFocus={(e) => e.target.select()}
        />
      ) : (
        /* ── Estimate: two native pickers → auto-fills kcal ───────────── */
        <div className="space-y-3">
          {/* Intensity picker */}
          <div className="flex flex-col gap-1">
            <span className="text-caption text-content-secondary">Intensity</span>
            <div className="relative">
              <select
                value={intensity ?? ''}
                onChange={(e) => handleIntensity(e.target.value || null)}
                className="w-full appearance-none rounded-control border border-border-subtle bg-surface px-4 py-3 text-subhead text-content pr-10 focus:outline-none"
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

          {/* Duration picker */}
          <div className="flex flex-col gap-1">
            <span className="text-caption text-content-secondary">Duration</span>
            <div className="relative">
              <select
                value={duration ?? ''}
                onChange={(e) => handleDuration(e.target.value || null)}
                className="w-full appearance-none rounded-control border border-border-subtle bg-surface px-4 py-3 text-subhead text-content pr-10 focus:outline-none"
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

          {/* Computed result */}
          {kcal ? (
            <p className="text-center text-subhead text-content-secondary">
              ≈ <span className="font-semibold text-content">{kcal} kcal</span> estimated
            </p>
          ) : null}
        </div>
      )}

      {existing && (
        <p className="text-caption text-content-secondary">
          Previously {existing.activeCalories} kcal — saving will update it.
        </p>
      )}
    </div>
  );
}

function WeightForm({ date, onDone }: { date: string; onDone: () => void }) {
  const weights = useLive(() => repos.weights.all(), []) ?? [];
  const user = useLive(() => repos.user.get(), []);
  const units = user?.units ?? 'kg';
  const existing = weights.find((w) => w.date === date);
  const prefill = existing?.weightKg ?? currentWeightKg(weights);
  const [val, setVal] = useState('');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- populate field when async prefill resolves
    if (prefill != null) setVal(units === 'lbs' ? String(parseFloat(kgToLbs(prefill).toFixed(1))) : String(prefill));
  }, [prefill, units]);

  async function save() {
    const display = Number(val);
    if (!display) return;
    const v = units === 'lbs' ? lbsToKg(display) : display;
    await repos.weights.upsertForDate({ id: newId(), date, weightKg: v, source: 'manual' });
    // Recalculate account BMR from the most-recent weight ≤ today (not always the
    // just-saved one — editing a past entry shouldn't overwrite the current BMR).
    await syncAccountBmr();
    onDone();
  }

  // Register "Save weight" in Sheet's pinned footer slot.
  const saveRef = useRef<() => Promise<void>>(() => Promise.resolve());
  saveRef.current = save; // eslint-disable-line react-hooks/refs -- keep ref current; onClick reads it at call time, not during render
  useSheetSetFooter(
    <Button size="lg" onClick={() => void saveRef.current()} disabled={!Number(val)}>Save weight</Button>,
    [!Number(val)],
  );

  const prevDisplay = existing
    ? (units === 'lbs' ? `${kgToLbs(existing.weightKg).toFixed(1)} lbs` : `${existing.weightKg.toFixed(1)} kg`)
    : null;

  return (
    <div className="space-y-3">
      <LabeledInput
        label={`Weight (${units})`}
        value={val}
        onChange={onDecimalChange(setVal)}
        inputMode="decimal"
        autoFocus
        onFocus={(e) => e.target.select()}
      />
      {existing && (
        <p className="text-caption text-content-secondary">
          Previously {prevDisplay} — saving will update it.
        </p>
      )}
    </div>
  );
}

