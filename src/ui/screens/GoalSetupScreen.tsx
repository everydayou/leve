import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLive } from '../../state/live';
import { repos } from '../../state/repos';
import { newId, todayISO } from '../../data/ids';
import { goalIntensity, currentWeightKg } from '../../domain/goal';
import { onDecimalChange } from '../../lib/num';
import { kgToLbs, lbsToKg } from '../../domain/units';
import { Button, LabeledInput, Icon } from '../kit';
import { hapticLight } from '../../lib/haptics';
import type { Goal, GoalType, MacroStyle, Units } from '../../domain/types';

// ── Local types ───────────────────────────────────────────────────────────────
type GoalTypeOpt = { id: GoalType | 'maintain'; title: string; desc: string; enabled: boolean };
type Step = 'choose' | 'details' | 'tracking';
type EditTarget = 'protein' | 'fat' | 'carb' | null;

// ── Constants ─────────────────────────────────────────────────────────────────
const TYPES: GoalTypeOpt[] = [
  { id: 'lose_by_date', title: 'Lose weight',    desc: 'Target weight by a deadline. Tracks deficit + trend.', enabled: true  },
  { id: 'maintain',     title: 'Maintain weight', desc: 'Hold steady within a range.',                          enabled: false },
  { id: 'gain_by_date', title: 'Build muscle',    desc: 'Fuel muscle growth with a daily calorie surplus.',     enabled: true  },
];

const MACRO_STYLES: { id: MacroStyle; title: string; subtitle: string }[] = [
  { id: 'balanced',    title: 'Balanced',    subtitle: 'Good everyday default'       },
  { id: 'performance', title: 'Performance', subtitle: 'More carbs around activity'  },
  { id: 'lower_carb',  title: 'Lower carb',  subtitle: 'Lower carb, higher fat'      },
];

// ── Math helpers ──────────────────────────────────────────────────────────────
const r5 = (n: number) => Math.round(n / 5) * 5;

function defProtein(bwKg: number, fallback = 120): number {
  return bwKg > 0 ? Math.max(40, r5(bwKg * 1.8)) : fallback;
}
function defFatBalanced(cal: number):    number { return Math.max(20, r5(cal * 0.28 / 9)); }
function defFatPerformance(cal: number): number { return Math.max(20, r5(cal * 0.22 / 9)); }
function defCarbLimit(cal: number):      number { return Math.max(20, r5(cal * 0.25 / 4)); }

function proteinNote(g: number, bwKg: number): string | null {
  if (bwKg <= 0) return null;
  const r = g / bwKg;
  if (r < 1.4) return 'This may be low for building muscle.';
  if (r > 2.4) return 'This is high. More protein may not add much benefit.';
  return null;
}

function macroNote(
  style: MacroStyle,
  field: 'carb' | 'fat',
  grams: number,
  totalCal: number,
): string | null {
  if (totalCal <= 0 || grams < 0) return null;
  const pct = (grams * (field === 'fat' ? 9 : 4)) / totalCal * 100;
  if (style === 'balanced') {
    if (field === 'carb' && pct < 37.5) return 'This may feel low on active days.';
    if (field === 'carb' && pct > 62.5) return 'This may leave too little room for fat.';
    if (field === 'fat'  && pct < 20)   return 'This fat target is quite low.';
    if (field === 'fat'  && pct > 40)   return 'This may leave less room for carbs.';
  }
  if (style === 'performance') {
    if (field === 'carb' && pct < 40) return 'This may be low for performance and recovery.';
    if (field === 'carb' && pct > 65) return 'This is high. Make sure fat does not drop too low.';
    if (field === 'fat'  && pct < 20) return 'This fat baseline is quite low.';
    if (field === 'fat'  && pct > 35) return 'This may reduce carbs for training.';
  }
  if (style === 'lower_carb') {
    // No lower-bound warning on carbs — being very low carb is the intention.
    if (field === 'carb' && pct > 45) return 'This is no longer very low carb.';
    if (field === 'fat'  && pct < 25)   return 'This may be low for a lower-carb setup.';
    if (field === 'fat'  && pct > 50)   return 'This is high. Food quality becomes more important.';
  }
  return null;
}

// ── Data loader ───────────────────────────────────────────────────────────────
/** Full-screen flow (no tab bar). Opened from Account / Goal.
 *  Loads the active goal + latest weight first so editing pre-fills real
 *  values and saving stays in sync with the rest of the app. */
export function GoalSetupScreen() {
  const [searchParams] = useSearchParams();
  const forceNew = searchParams.get('new') === 'true';
  const skipType = searchParams.get('skip-type') === 'true';
  const data = useLive(async () => {
    const [goal, weights, user] = await Promise.all([
      repos.goals.getActive(), repos.weights.all(), repos.user.get(),
    ]);
    return {
      goal: goal ?? null,
      currentWeight: currentWeightKg(weights),
      proteinGoal: user?.proteinGoalG,
      userBmr: user?.bmr ?? 0,
      userUnits: (user?.units ?? 'kg') as Units,
    };
  }, []);

  if (data === undefined) return <FullScreen><p className="p-6 text-content-muted">Loading…</p></FullScreen>;
  return <GoalSetupForm
    activeGoal={forceNew ? null : data.goal}
    currentWeight={data.currentWeight}
    currentProteinGoal={data.proteinGoal}
    userBmr={data.userBmr}
    skipType={skipType}
    userUnits={data.userUnits}
  />;
}

// ── Main form ─────────────────────────────────────────────────────────────────
function GoalSetupForm({
  activeGoal,
  currentWeight,
  currentProteinGoal,
  userBmr,
  skipType = false,
  userUnits,
}: {
  activeGoal: Goal | null;
  currentWeight: number | null;
  currentProteinGoal?: number;
  userBmr: number;
  skipType?: boolean;
  userUnits?: Units;
}) {
  const nav = useNavigate();
  const units = userUnits ?? 'kg';
  const toDisplay = (kg: number) => units === 'lbs' ? parseFloat(kgToLbs(kg).toFixed(1)) : kg;
  const toKg = (v: number) => units === 'lbs' ? lbsToKg(v) : v;
  const editing = !!activeGoal;
  const [step, setStep] = useState<Step>((skipType || editing) ? 'details' : 'choose');
  const [exiting, setExiting] = useState(false);

  // Move focus to the first interactive element each time the step changes.
  const stepRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const firstFocusable = stepRef.current?.querySelector<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    firstFocusable?.focus({ preventScroll: true });
  }, [step]);

  // ── Your plan fields ────────────────────────────────────────────────────────
  const [type, setType] = useState<GoalTypeOpt['id']>(activeGoal?.type ?? 'lose_by_date');
  const [name, setName] = useState(activeGoal?.name ?? '');
  const [start, setStart] = useState(() => {
    const kg = activeGoal ? activeGoal.startWeightKg : currentWeight;
    return kg != null ? String(toDisplay(kg)) : '';
  });
  const [target, setTarget] = useState(() => {
    const kg = activeGoal ? activeGoal.targetWeightKg : null;
    return kg != null ? String(toDisplay(kg)) : '';
  });
  const [date, setDate] = useState(activeGoal?.targetDate ?? '');
  const [startDate, setStartDate] = useState(activeGoal?.startDate ?? todayISO());
  // Protein for lose goals (existing pattern)
  const [protein, setProtein] = useState(currentProteinGoal ? String(currentProteinGoal) : '');
  const [proteinEnabled, setProteinEnabled] = useState((currentProteinGoal ?? 0) > 0);
  const [deficitOverride, setDeficitOverride] = useState<number | null>(
    activeGoal?.dailyDeficitKcalOverride ?? null,
  );
  // Field-level errors — set on attempted submit when fields are invalid
  const [fieldErrors, setFieldErrors] = useState<{
    start?: string; target?: string; date?: string; startDate?: string;
  }>({});

  // ── Derived plan values ─────────────────────────────────────────────────────
  const sNum = +start || 0;
  const tNum = +target || 0;
  const isGain = type === 'gain_by_date';
  const weightValid = isGain
    ? sNum > 0 && tNum > 0 && tNum > sNum
    : sNum > 0 && tNum > 0 && sNum > tNum;
  const valid = weightValid && !!startDate && !!date && startDate < date;
  const intensity = valid ? goalIntensity(toKg(sNum), toKg(tNum), startDate, date) : null;
  const computedMagnitude = intensity?.kcalPerDay ?? 0;
  const sliderMin = Math.max(200, computedMagnitude - 500);
  const sliderMax = computedMagnitude + 500;
  const effectiveMagnitude = deficitOverride ?? computedMagnitude;
  const goalHasStarted = editing && !!activeGoal && activeGoal.startDate <= todayISO();
  const showDeficitWarning = goalHasStarted && deficitOverride !== null && deficitOverride !== computedMagnitude;

  // Total daily calorie target — drives macro defaults on tracking step
  const safeBmr = userBmr > 0 ? userBmr : 2000;
  const totalCal = Math.max(500, safeBmr + (isGain ? effectiveMagnitude : -effectiveMagnitude));

  // ── Tracking step fields ────────────────────────────────────────────────────

  const [macroStyle, setMacroStyle] = useState<MacroStyle | null>(
    activeGoal?.macroStyle ?? null,
  );
  const [editingRow, setEditingRow] = useState<EditTarget>(null);
  // Protein for gain goals
  const [proteinG, setProteinG] = useState<number>(
    currentProteinGoal ?? defProtein(activeGoal ? activeGoal.startWeightKg : toKg(sNum)),
  );
  // Single fat anchor — represents fat target (balanced) or fat baseline (performance)
  const [fatG, setFatG] = useState<number>(
    activeGoal?.fatTargetG ?? defFatBalanced(safeBmr),
  );
  const [carbLimitG, setCarbLimitG] = useState<number>(
    activeGoal?.carbLimitG ?? defCarbLimit(safeBmr),
  );

  // Sync form fields when editing an existing goal (async data arrives)
  useEffect(() => {
    if (activeGoal) {
      /* eslint-disable react-hooks/set-state-in-effect -- populates edit form when async goal data first resolves */
      setType(activeGoal.type);
      setName(activeGoal.name);
      setStart(String(toDisplay(activeGoal.startWeightKg)));
      setTarget(String(toDisplay(activeGoal.targetWeightKg)));
      setDate(activeGoal.targetDate);
      setStartDate(activeGoal.startDate);
      setDeficitOverride(activeGoal.dailyDeficitKcalOverride ?? null);
      setMacroStyle(activeGoal.macroStyle ?? null);
      if (activeGoal.fatTargetG)   setFatG(activeGoal.fatTargetG);
      if (activeGoal.carbLimitG)   setCarbLimitG(activeGoal.carbLimitG);
      if (currentProteinGoal) {
        setProtein(String(currentProteinGoal));
        setProteinEnabled(true);
        setProteinG(currentProteinGoal);
      }
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on id only
  }, [activeGoal?.id]);

  // ── Navigation ──────────────────────────────────────────────────────────────
  const close = () => nav(-1);

  function goBackFromDetails() {
    if (skipType || editing) {
      setExiting(true);
      setTimeout(() => nav(-1), 320);
    } else {
      setStep('choose');
    }
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  async function create() {
    if (!valid) return;
    const startWeightKg = toKg(+start || 0);
    const goalType = (type === 'maintain' ? 'lose_by_date' : type) as GoalType;

    await repos.goals.put({
      id: activeGoal?.id ?? newId(),
      name: name.trim() || 'New goal',
      type: goalType,
      startWeightKg,
      targetWeightKg: toKg(+target || 0),
      startDate,
      targetDate: date,
      status: 'active',
      dailyDeficitKcalOverride: deficitOverride ?? undefined,
      // Tracking (gain goals only) — macroStyle null = simple/skip
      trackingMode:  goalType === 'gain_by_date' ? (macroStyle ? 'detailed' : 'simple') : undefined,
      macroStyle:    (goalType === 'gain_by_date' && macroStyle) ? macroStyle : undefined,
      fatTargetG:    (goalType === 'gain_by_date' && macroStyle) ? fatG : undefined,
      carbLimitG:    (goalType === 'gain_by_date' && macroStyle === 'lower_carb')
        ? carbLimitG
        : undefined,
    });

    const user = await repos.user.get();
    if (user) {
      const proteinGoalG = goalType === 'gain_by_date'
        ? proteinG
        : (proteinEnabled && protein ? (Number(protein) || undefined) : undefined);
      await repos.user.save({ ...user, proteinGoalG });
    }
    nav(-1);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <FullScreen slideUp={skipType} exiting={exiting}>
      <div ref={stepRef}>

        {/* ── Step 1: Choose goal type ── */}
        {step === 'choose' && (
          <>
            <FlowHeader title={editing ? 'Edit goal' : 'New goal'} onClose={close} />
            <div className="px-6 pb-6">
              <div className="mt-5 space-y-3">
                {TYPES.map((t) => (
                  <button
                    key={t.id}
                    disabled={!t.enabled}
                    onClick={() => setType(t.id)}
                    className={`flex w-full items-center gap-3 rounded-card text-left shadow-card ${
                      type === t.id
                        ? 'border-2 border-accent p-[15px]'
                        : 'border border-border-subtle p-4'
                    } ${!t.enabled ? 'opacity-40' : ''}`}
                  >
                    <GoalIcon type={t.id} size={32} />
                    <span className="flex-1">
                      <span className="block text-callout font-semibold">{t.title}</span>
                      <span className="block text-subhead text-content-secondary">{t.desc}</span>
                    </span>
                    {!t.enabled && (
                      <span className="rounded-pill bg-surface-sunken px-2 py-0.5 text-micro font-medium text-content-secondary">
                        Later
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="mt-6">
                <Button size="lg" onClick={() => setStep('details')}>Continue</Button>
              </div>
            </div>
          </>
        )}

        {/* ── Step 2: Your plan ── */}
        {step === 'details' && (
          <>
            <div className="sticky top-0 z-20 bg-surface flex items-center justify-between px-4 pt-5 pb-4">
              <div
                className="pointer-events-none absolute left-0 right-0 bg-surface"
                style={{ bottom: '100%', height: 'env(safe-area-inset-top, 0px)' }}
              />
              <button
                onClick={goBackFromDetails}
                aria-label={skipType ? 'Close' : 'Back'}
                className="-ml-2 flex h-10 w-10 items-center justify-center text-content-muted"
              >
                <Icon name={skipType ? 'close' : 'chevronLeft'} size={skipType ? 18 : 20} strokeWidth={skipType ? 2 : 2.5} />
              </button>
              <span className="text-headline font-semibold text-content">{editing ? 'Edit plan' : 'Your plan'}</span>
              <span className="w-10" />
            </div>
            <div className="px-6 pb-6">
              {/* Goal name */}
              <p className="mb-2 text-headline font-semibold text-content">Goal name</p>
              <LabeledInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Summer Cut"
                className="!bg-surface-sunken !border-transparent focus:!border-transparent"
              />

              {/* Grouped card: Weight / Dates / Protein (lose only) */}
              <div className="mt-2 overflow-hidden border border-border-subtle bg-surface" style={{ borderRadius: 24 }}>
                {/* Weight */}
                <div className="p-4 pb-5">
                  <div className="mb-3 flex items-center gap-2">
                    <Icon name="weight" size={18} className="text-content" />
                    <span className="text-subhead font-semibold text-content">Weight</span>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 min-w-0">
                      <LabeledInput
                        wrapClassName="w-full"
                        label={`Start (${units})`}
                        labelClassName="text-subhead text-content-secondary"
                        value={start}
                        onChange={(e) => { onDecimalChange(setStart)(e); setFieldErrors((p) => ({ ...p, start: undefined })); }}
                        inputMode="decimal"
                        invalid={!!fieldErrors.start}
                        className="!bg-surface-sunken !border-transparent focus:!border-transparent"
                      />
                      {fieldErrors.start && <p className="mt-1 text-footnote text-danger">{fieldErrors.start}</p>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <LabeledInput
                        wrapClassName="w-full"
                        label={`Target (${units})`}
                        labelClassName="text-subhead text-content-secondary"
                        value={target}
                        onChange={(e) => { onDecimalChange(setTarget)(e); setFieldErrors((p) => ({ ...p, target: undefined })); }}
                        inputMode="decimal"
                        invalid={!!fieldErrors.target}
                        className="!bg-surface-sunken !border-transparent focus:!border-transparent"
                      />
                      {fieldErrors.target && <p className="mt-1 text-footnote text-danger">{fieldErrors.target}</p>}
                    </div>
                  </div>
                </div>
                {/* Dates */}
                <div className="p-4 pb-5">
                  <div className="mb-3 flex items-center gap-2">
                    <Icon name="calendar" size={18} className="text-content" />
                    <span className="text-subhead font-semibold text-content">Dates</span>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="block text-subhead text-content-secondary">Start</span>
                      <div className="mt-1 overflow-hidden rounded-field">
                        <input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="w-full bg-surface-sunken px-3 py-2.5 text-subhead font-semibold text-content outline-none border-0"
                          style={{ minWidth: 0 }}
                        />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="block text-subhead text-content-secondary">Target</span>
                      <div className={`mt-1 overflow-hidden rounded-field ${fieldErrors.date ? 'outline outline-1 outline-danger' : ''}`}>
                        <input
                          type="date"
                          value={date}
                          onChange={(e) => { setDate(e.target.value); setFieldErrors((p) => ({ ...p, date: undefined })); }}
                          className="w-full bg-surface-sunken px-3 py-2.5 text-subhead font-semibold text-content outline-none border-0"
                          style={{ minWidth: 0 }}
                        />
                      </div>
                      {fieldErrors.date && <p className="mt-1 text-footnote text-danger">{fieldErrors.date}</p>}
                    </div>
                  </div>
                </div>
                {/* Protein — lose goals only (gain goals handle protein in the Tracking step) */}
                {!isGain && (
                  <div className="p-4">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-subhead font-semibold text-content">
                        Daily protein target <span className="font-normal">(g)</span>
                      </span>
                      <ProteinToggle enabled={proteinEnabled} onChange={setProteinEnabled} />
                    </div>
                    {proteinEnabled && (
                      <LabeledInput
                        value={protein}
                        onChange={(e) => setProtein(e.target.value)}
                        inputMode="numeric"
                        placeholder="e.g. 120"
                        className="!bg-surface-sunken !border-transparent focus:!border-transparent"
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Review section */}
              <div className="mt-6">
                <p className="mb-3 text-headline font-semibold text-content">Review your goal</p>
                <div className="overflow-hidden border border-border-subtle bg-surface p-5 shadow-card" style={{ borderRadius: 24 }}>
                  {intensity ? (
                    <>
                      <p className="text-display font-bold text-center">{units === 'lbs' ? `${kgToLbs(intensity.kgToLose).toFixed(1)} lbs` : `${intensity.kgToLose.toFixed(1)} kg`}</p>
                      <p className="text-center text-subhead text-content-secondary">
                        {Math.round(intensity.weeks)} weeks{'  ·  '}≈ {units === 'lbs' ? `${kgToLbs(intensity.kgPerWeek).toFixed(2)} lbs/week` : `${intensity.kgPerWeek} kg/week`}
                      </p>
                      <div className="mt-3 rounded-field bg-surface-sunken px-3 py-2.5 flex items-center justify-between">
                        <p className="text-subhead text-content-secondary">
                          {isGain ? `≈ +${effectiveMagnitude} kcal/day surplus` : `≈ –${effectiveMagnitude} kcal/day`}
                        </p>
                        {deficitOverride !== null && (
                          <button
                            type="button"
                            onClick={() => setDeficitOverride(null)}
                            className="ml-2 shrink-0 text-subhead font-semibold text-accent active:opacity-70"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                      <input
                        type="range"
                        aria-label={isGain ? 'Daily calorie surplus' : 'Daily calorie deficit'}
                        min={sliderMin}
                        max={sliderMax}
                        step={10}
                        value={effectiveMagnitude}
                        onChange={(e) => setDeficitOverride(Number(e.target.value))}
                        className="mt-[2px] w-full accent-accent"
                        style={{ touchAction: 'pan-x' }}
                      />
                      <div className="mt-3 mb-5 -mx-5 border-t border-border-subtle" />
                      <PaceMeter level={intensity.level} />
                    </>
                  ) : (
                    <p className="text-subhead text-content-muted">Fill in your details to preview your goal pace.</p>
                  )}
                </div>
                {showDeficitWarning && (
                  <div className="mt-3 flex items-start gap-2.5 rounded-control border border-border-subtle bg-surface-sunken p-3">
                    <Icon name="info" size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-content-secondary" />
                    <div className="flex-1">
                      <p className="text-subhead text-content-secondary">
                        Changing the daily {isGain ? 'surplus' : 'deficit'} will affect how your remaining days are budgeted. Past entries are not changed.
                      </p>
                      <button
                        onClick={() => setDeficitOverride(null)}
                        className="mt-1.5 text-subhead font-semibold text-content active:opacity-70"
                      >
                        Reset to calculated ({computedMagnitude} kcal)
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-5">
                <Button
                  size="lg"
                  onClick={() => {
                    // Validate and surface errors before proceeding
                    const errs: typeof fieldErrors = {};
                    if (!start || +start <= 0) errs.start = 'Enter a start weight';
                    else if (!target || +target <= 0) errs.target = 'Enter a target weight';
                    else if (isGain && +target <= +start) errs.target = 'Target must be higher than start weight';
                    else if (!isGain && +target >= +start) errs.target = 'Target must be lower than start weight';
                    if (!startDate) errs.startDate = 'Enter a start date';
                    if (!date) errs.date = 'Enter a target date';
                    else if (startDate && date <= startDate) errs.date = 'Target date must be after start date';
                    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
                    setFieldErrors({});
                    if (isGain) setStep('tracking'); else void create();
                  }}
                >
                  {isGain ? 'Continue' : (editing ? 'Confirm' : 'Create goal')}
                </Button>
              </div>
            </div>
          </>
        )}

        {/* ── Step 3: Tracking (gain goals only) ── */}
        {step === 'tracking' && (
          <>
            {/* Sticky header */}
            <div className="sticky top-0 z-20 bg-surface">
              <div
                className="pointer-events-none absolute left-0 right-0 bg-surface"
                style={{ bottom: '100%', height: 'env(safe-area-inset-top, 0px)' }}
              />
              <div className="flex items-center justify-between px-4 pt-5 pb-4">
                <button
                  onClick={() => setStep('details')}
                  aria-label="Back"
                  className="-ml-2 flex h-10 w-10 items-center justify-center text-content-muted"
                >
                  <Icon name="chevronLeft" size={20} strokeWidth={2.5} />
                </button>
                <span className="text-headline font-semibold text-content">Tracking</span>
                <button
                  onClick={() => { setMacroStyle(null); void create(); }}
                  className="flex h-10 items-center pr-1 text-subhead font-medium text-content"
                >
                  Skip
                </button>
              </div>
            </div>

            <div className="px-6 pb-6">
              {/* Info text — free text, no container, no icon */}
              <p className="text-callout text-content-secondary mb-5">
                Choose how carbs and fat are distributed across your day. You can adjust this later as your routine changes.
              </p>

              {/* Macro style cards — tap to select, tap again to deselect */}
              <div className="space-y-2">
                {MACRO_STYLES.map((s) => (
                  <MacroStyleCard
                    key={s.id}
                    style={s}
                    selected={macroStyle === s.id}
                    onSelect={() => {
                      hapticLight();
                      setMacroStyle(macroStyle === s.id ? null : s.id);
                      setEditingRow(null);
                    }}
                  />
                ))}
              </div>

              {/* Macro targets — only visible when a card is selected */}
              {macroStyle && (
                <>
                  <p className="mt-5 mb-3 text-headline font-semibold text-content">Macro targets</p>
                  <div className="overflow-hidden border border-border-subtle bg-surface" style={{ borderRadius: 24 }}>

                    {/* Protein row — always present */}
                    <MacroRow
                      label="Protein target (g)"
                      displayValue={`${proteinG} per day`}
                      editable
                      isEditing={editingRow === 'protein'}
                      value={proteinG}
                      min={Math.max(40, r5(sNum * 0.8))}
                      max={r5(Math.max(sNum, 50) * 3.0)}
                      onEditToggle={() => setEditingRow(editingRow === 'protein' ? null : 'protein')}
                      onReset={() => { setProteinG(defProtein(sNum)); setEditingRow(null); }}
                      onChange={setProteinG}
                      note={proteinNote(proteinG, sNum)}
                    />

                    {/* Balanced rows */}
                    {macroStyle === 'balanced' && (() => {
                      const impliedCarb = Math.max(0, Math.round((totalCal - proteinG * 4 - fatG * 9) / 4));
                      return (
                        <>
                          <MacroRow
                            label="Carb target (g)"
                            displayValue="Adjusts with activity"
                            note={macroNote('balanced', 'carb', impliedCarb, totalCal)}
                          />
                          <MacroRow
                            label="Fat target (g)"
                            displayValue={`${fatG} per day`}
                            editable
                            isEditing={editingRow === 'fat'}
                            value={fatG}
                            min={10}
                            max={r5(totalCal * 0.55 / 9)}
                            onEditToggle={() => setEditingRow(editingRow === 'fat' ? null : 'fat')}
                            onReset={() => { setFatG(defFatBalanced(totalCal)); setEditingRow(null); }}
                            onChange={setFatG}
                            note={macroNote('balanced', 'fat', fatG, totalCal)}
                          />
                        </>
                      );
                    })()}

                    {/* Performance rows */}
                    {macroStyle === 'performance' && (() => {
                      const carbG = Math.max(0, Math.round((totalCal - proteinG * 4 - fatG * 9) / 4));
                      return (
                        <>
                          <MacroRow
                            label="Carb target (g)"
                            displayValue={`Base ${carbG} g · adjusts with activity`}
                            note={macroNote('performance', 'carb', carbG, totalCal)}
                          />
                          <MacroRow
                            label="Fat baseline (g)"
                            displayValue={`${fatG} per day`}
                            editable
                            isEditing={editingRow === 'fat'}
                            value={fatG}
                            min={10}
                            max={r5(totalCal * 0.45 / 9)}
                            onEditToggle={() => setEditingRow(editingRow === 'fat' ? null : 'fat')}
                            onReset={() => { setFatG(defFatPerformance(totalCal)); setEditingRow(null); }}
                            onChange={setFatG}
                            note={macroNote('performance', 'fat', fatG, totalCal)}
                          />
                        </>
                      );
                    })()}

                    {/* Lower carb rows */}
                    {macroStyle === 'lower_carb' && (() => {
                      const impliedFat = Math.max(0, Math.round((totalCal - proteinG * 4 - carbLimitG * 4) / 9));
                      return (
                        <>
                          <MacroRow
                            label="Carb limit (g)"
                            displayValue={`${carbLimitG} per day`}
                            editable
                            isEditing={editingRow === 'carb'}
                            value={carbLimitG}
                            min={20}
                            max={r5(totalCal * 0.55 / 4)}
                            onEditToggle={() => setEditingRow(editingRow === 'carb' ? null : 'carb')}
                            onReset={() => { setCarbLimitG(defCarbLimit(totalCal)); setEditingRow(null); }}
                            onChange={setCarbLimitG}
                            note={macroNote('lower_carb', 'carb', carbLimitG, totalCal)}
                          />
                          <MacroRow
                            label="Fat target (g)"
                            displayValue="Adjusts with activity"
                            note={macroNote('lower_carb', 'fat', impliedFat, totalCal)}
                          />
                        </>
                      );
                    })()}
                  </div>
                </>
              )}

              {/* Done CTA */}
              <div className="mt-5">
                <Button size="lg" onClick={() => void create()}>Done</Button>
              </div>
            </div>
          </>
        )}

      </div>
    </FullScreen>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MacroRow({
  label,
  displayValue,
  editable = false,
  isEditing = false,
  value,
  min = 10,
  max = 300,
  step = 5,
  onEditToggle,
  onReset,
  onChange,
  note,
}: {
  label: string;
  displayValue: string;
  editable?: boolean;
  isEditing?: boolean;
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  onEditToggle?: () => void;
  onReset?: () => void;
  onChange?: (v: number) => void;
  note?: string | null;
}) {
  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-subhead font-semibold text-content">{label}</span>
        {editable && (
          <button
            type="button"
            onClick={isEditing ? onReset : onEditToggle}
            className="text-subhead font-semibold text-accent"
          >
            {isEditing ? 'Reset' : 'Edit'}
          </button>
        )}
      </div>
      <div className="mt-1.5 rounded-field bg-surface-sunken px-3 py-2.5">
        <span className="text-subhead text-content">{displayValue}</span>
      </div>
      {isEditing && value !== undefined && onChange && (
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="mt-[2px] w-full accent-accent"
          style={{ touchAction: 'pan-x' }}
        />
      )}
      {note && (
        <div className="mt-[2px] flex items-start gap-1.5">
          <Icon name="info" size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-content-secondary" />
          <span className="text-footnote text-content-secondary">{note}</span>
        </div>
      )}
    </div>
  );
}

function MacroStyleCard({
  style,
  selected,
  onSelect,
}: {
  style: { id: MacroStyle; title: string; subtitle: string };
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full flex-col rounded-card text-left shadow-card transition-colors ${
        selected
          ? 'border-2 border-accent bg-surface p-[15px]'
          : 'border border-border-subtle bg-surface p-4'
      }`}
    >
      <span className="text-callout font-semibold text-content">{style.title}</span>
      <span className="mt-0.5 text-subhead text-content-secondary">{style.subtitle}</span>
    </button>
  );
}

function FullScreen({
  children,
  slideUp,
  exiting,
}: {
  children: React.ReactNode;
  slideUp?: boolean;
  exiting?: boolean;
}) {
  const animClass = exiting ? 'slide-down-out' : slideUp ? 'slide-up-in' : '';
  return (
    <div
      className={`fixed inset-0 flex justify-center overflow-hidden bg-surface-sunken sm:items-center sm:py-[max(1.5rem,2dvh)] ${animClass}`}
      style={{ touchAction: 'manipulation' }}
    >
      <div
        className="safe-top safe-bottom flex h-[100dvh] w-full max-w-[26.25rem] flex-col overflow-x-hidden overflow-y-auto bg-surface sm:h-[min(880px,94dvh)] sm:rounded-[2rem] sm:border sm:border-border-subtle sm:shadow-xl"
        style={{ touchAction: 'pan-y' }}
      >
        {children}
      </div>
    </div>
  );
}

function FlowHeader({
  title,
  onClose,
  onBack,
}: {
  title: string;
  onClose?: () => void;
  onBack?: () => void;
}) {
  const left = onBack ? (
    <button onClick={onBack} aria-label="Back" className="-ml-2 flex h-10 w-10 items-center justify-center text-content-muted">
      <Icon name="chevronLeft" size={20} strokeWidth={2.5} />
    </button>
  ) : onClose ? (
    <button onClick={onClose} aria-label="Close" className="-ml-2 flex h-10 w-10 items-center justify-center text-content-muted">
      <Icon name="close" size={20} strokeWidth={2.5} />
    </button>
  ) : (
    <span className="w-10" />
  );
  return (
    <div className="flex items-center justify-between px-4 pt-5 pb-4">
      {left}
      <span className="text-headline font-semibold text-content">{title}</span>
      <span className="w-10" />
    </div>
  );
}

function PaceMeter({ level }: { level: 'gentle' | 'moderate' | 'aggressive' }) {
  const pos = level === 'gentle' ? '16%' : level === 'moderate' ? '50%' : '84%';
  return (
    <div>
      <div className="relative h-2 rounded-pill bg-surface-sunken">
        <div
          className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-accent"
          style={{ left: pos }}
        />
      </div>
      <div className="mt-1.5 grid grid-cols-3 text-footnote">
        <span className={`text-left ${level === 'gentle' ? 'font-semibold text-content' : 'text-content-muted'}`}>Gentle</span>
        <span className={`text-center ${level === 'moderate' ? 'font-semibold text-content' : 'text-content-muted'}`}>Moderate</span>
        <span className={`text-right ${level === 'aggressive' ? 'font-semibold text-content' : 'text-content-muted'}`}>Aggressive</span>
      </div>
    </div>
  );
}

function ProteinToggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className="flex shrink-0 h-7 w-12 items-center rounded-pill p-0.5 transition-colors duration-200"
      style={{ background: enabled ? 'var(--color-accent)' : 'var(--color-border-strong)' }}
    >
      <span
        className="block h-6 w-6 shrink-0 rounded-full shadow"
        style={{
          background: 'white',
          transform: enabled ? 'translateX(20px)' : 'translateX(0)',
          transition: 'transform 200ms ease',
        }}
      />
    </button>
  );
}

const GOAL_ICON_BODY = "M8.7704 4.44851C8.42901 4.10768 8.25831 3.69789 8.25831 3.21914C8.25831 2.74052 8.4288 2.33052 8.76977 1.98913C9.11061 1.64775 9.5204 1.47705 9.99915 1.47705C10.4778 1.47705 10.8878 1.64754 11.2291 1.98851C11.5705 2.32934 11.7412 2.73913 11.7412 3.21788C11.7412 3.6965 11.5707 4.1065 11.2298 4.44789C10.8889 4.78927 10.4791 4.95997 10.0004 4.95997C9.52179 4.95997 9.11179 4.78948 8.7704 4.44851ZM7.41019 17.4798V7.58851C6.74283 7.53351 6.07026 7.45907 5.39248 7.36518C4.71456 7.27129 4.04727 7.14962 3.39061 7.00018C3.13463 6.94129 2.9304 6.79941 2.7779 6.57455C2.6254 6.34955 2.58554 6.10907 2.65831 5.85309C2.73109 5.59698 2.88686 5.4092 3.12561 5.28976C3.36449 5.17045 3.6172 5.14025 3.88373 5.19914C4.85929 5.40747 5.86894 5.55858 6.91269 5.65247C7.9563 5.74636 8.98533 5.7933 9.99977 5.7933C11.0142 5.7933 12.0441 5.74636 13.0894 5.65247C14.1348 5.55858 15.1469 5.40747 16.1256 5.19914C16.3923 5.14025 16.6439 5.17073 16.8804 5.29059C17.1171 5.41059 17.2723 5.59809 17.3462 5.85309C17.419 6.10907 17.3783 6.34872 17.2241 6.57205C17.07 6.79525 16.8649 6.93629 16.6089 6.99518C15.9523 7.14462 15.285 7.26712 14.6071 7.36268C13.9293 7.45823 13.2567 7.53351 12.5894 7.58851V17.4798C12.5894 17.7371 12.5023 17.9528 12.3283 18.1268C12.1543 18.3009 11.9387 18.3879 11.6814 18.3879C11.4241 18.3879 11.2084 18.3009 11.0344 18.1268C10.8603 17.9528 10.7733 17.7371 10.7733 17.4798V13.3331H9.22623V17.4798C9.22623 17.7371 9.13922 17.9528 8.96519 18.1268C8.79116 18.3009 8.57547 18.3879 8.31811 18.3879C8.06088 18.3879 7.84526 18.3009 7.67123 18.1268C7.4972 17.9528 7.41019 17.7371 7.41019 17.4798Z";
const GOAL_ICON_ARROWS: Record<GoalTypeOpt['id'], string> = {
  lose_by_date: "M15 17.5L12.5 15.1348L13.3088 14.3696L14.421 15.4217V12.5H15.579V15.4217L16.6912 14.3696L17.5 15.1348L15 17.5Z",
  maintain:     "M17.5 15L15.1348 17.5L14.3696 16.6912L15.4217 15.579L12.5 15.579L12.5 14.421L15.4217 14.421L14.3696 13.3088L15.1348 12.5L17.5 15Z",
  gain_by_date: "M15 12.5L17.5 14.8652L16.6912 15.6304L15.579 14.5783L15.579 17.5L14.421 17.5L14.421 14.5783L13.3088 15.6304L12.5 14.8652L15 12.5Z",
};
function GoalIcon({ type, size = 20 }: { type: GoalTypeOpt['id']; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" className="shrink-0">
      <path d={GOAL_ICON_BODY} fill="currentColor" />
      <circle cx="15" cy="15" r="5" fill="var(--color-accent)" />
      <path d={GOAL_ICON_ARROWS[type]} fill="currentColor" />
    </svg>
  );
}
