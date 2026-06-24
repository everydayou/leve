import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLive } from '../../state/live';
import { repos } from '../../state/repos';
import { newId, todayISO } from '../../data/ids';
import {
  goalIntensity, currentWeightKg,
  LOSE_PACES, GAIN_PACES,
  dateFromLosePace, dateFromGainPace,
  type LosePaceId, type GainPaceId,
} from '../../domain/goal';
import { mifflinStJeorBMR, canComputeBmr } from '../../domain/bmr';
import { kgToLbs, lbsToKg } from '../../domain/units';
import { fmtDerivedDate, fmtMonthYear } from '../../lib/date';
import { markOnboardingSeen } from '../../lib/onboarding';
import { Button, LabeledInput, WheelPicker, Icon, SegmentedControl, FilterPills } from '../kit';
import type { Goal, GoalType, MacroStyle, Units, Sex } from '../../domain/types';

// ── Local types ───────────────────────────────────────────────────────────────
type GoalTypeOpt = { id: GoalType | 'maintain'; title: string; desc: string; enabled: boolean };
type Step = 'choose' | 'details';
type EditTarget = 'protein' | 'fat' | 'carb' | null;
type SetupMode = 'simple' | 'custom';

// ── Constants ─────────────────────────────────────────────────────────────────
const TYPES: GoalTypeOpt[] = [
  { id: 'lose_by_date', title: 'Lose weight',    desc: 'Target weight by a deadline. Tracks deficit + trend.', enabled: true  },
  { id: 'maintain',     title: 'Maintain weight', desc: 'Hold steady within a range.',                          enabled: false },
  { id: 'gain_by_date', title: 'Build muscle',    desc: 'Fuel muscle growth with a daily calorie surplus.',     enabled: true  },
];

const GOAL_TYPE_LABEL: Record<string, string> = {
  lose_by_date: 'Lose weight',
  gain_by_date: 'Build muscle',
  maintain:     'Maintain weight',
};

const MACRO_STYLES: { id: MacroStyle; title: string; subtitle: string }[] = [
  { id: 'balanced',    title: 'Balanced',    subtitle: 'Good everyday default'       },
  { id: 'performance', title: 'Performance', subtitle: 'More carbs around activity'  },
  { id: 'lower_carb',  title: 'Lower carb',  subtitle: 'Lower carb, higher fat'      },
];

const HEIGHT_OPTIONS: number[] = Array.from({ length: 81 }, (_, i) => 140 + i);
const AGE_OPTIONS:    number[] = Array.from({ length: 81 }, (_, i) => 10  + i);

// ── Macro helpers ─────────────────────────────────────────────────────────────
function r5(n: number): number { return Math.round(n / 5) * 5; }
function defProtein(weightKg: number): number { return r5(Math.round(Math.max(40, Math.min(200, weightKg)) * 1.8)); }
function defFatBalanced(totalCal: number): number    { return r5(Math.round(totalCal * 0.28 / 9)); }
function defFatPerformance(totalCal: number): number { return r5(Math.round(totalCal * 0.22 / 9)); }
function defCarbLimit(totalCal: number): number      { return r5(Math.round(totalCal * 0.35 / 4)); }

function proteinNote(g: number, weightKg: number): string | null {
  if (weightKg <= 0) return null;
  if (g / weightKg < 1.2) return 'This is below typical muscle-building targets.';
  if (g / weightKg > 2.5) return 'This is on the high end — plenty of protein.';
  return null;
}

function macroNote(style: MacroStyle, field: 'fat' | 'carb', value: number, totalCal: number): string | null {
  const pct = field === 'fat' ? (value * 9 / totalCal) * 100 : (value * 4 / totalCal) * 100;
  if (style === 'balanced') {
    if (field === 'fat' && pct < 20) return 'This fat target is quite low.';
    if (field === 'fat' && pct > 35) return 'This may crowd out carbs for training.';
  }
  if (style === 'performance') {
    if (field === 'fat' && pct < 20) return 'This fat baseline is quite low.';
    if (field === 'fat' && pct > 35) return 'This may reduce carbs for training.';
  }
  if (style === 'lower_carb') {
    if (field === 'carb' && pct > 45) return 'This is no longer very low carb.';
    if (field === 'fat'  && pct < 25) return 'This may be low for a lower-carb setup.';
    if (field === 'fat'  && pct > 50) return 'This is high. Food quality becomes more important.';
  }
  return null;
}

// ── Data loader ───────────────────────────────────────────────────────────────
export function GoalSetupScreen() {
  const [searchParams] = useSearchParams();
  const forceNew    = searchParams.get('new') === 'true';
  const isFirstOpen = searchParams.get('first-open') === 'true';
  const skipType    = searchParams.get('skip-type') === 'true';
  const data = useLive(async () => {
    const [goal, weights, user] = await Promise.all([
      repos.goals.getActive(), repos.weights.all(), repos.user.get(),
    ]);
    return {
      goal:          goal ?? null,
      currentWeight: currentWeightKg(weights),
      proteinGoal:   user?.proteinGoalG,
      userBmr:       user?.bmr ?? 0,
      userUnits:     (user?.units ?? 'kg') as Units,
      userHeightCm:  user?.heightCm ?? null,
      userAge:       user?.age ?? null,
      userSex:       user?.sex ?? null,
    };
  }, []);

  if (data === undefined) return <FullScreen><p className="p-6 text-content-muted">Loading…</p></FullScreen>;
  return <GoalSetupForm
    activeGoal={forceNew || isFirstOpen ? null : data.goal}
    currentWeight={data.currentWeight}
    currentProteinGoal={data.proteinGoal}
    userBmr={data.userBmr}
    skipType={skipType}
    userUnits={data.userUnits}
    userHeightCm={data.userHeightCm}
    userAge={data.userAge}
    userSex={data.userSex}
  />;
}

// ── Main form ─────────────────────────────────────────────────────────────────
export function GoalSetupForm({
  activeGoal, currentWeight, currentProteinGoal, userBmr,
  skipType = false, userUnits, userHeightCm, userAge, userSex, onClose,
}: {
  activeGoal: Goal | null;
  currentWeight: number | null;
  currentProteinGoal?: number;
  userBmr: number;
  skipType?: boolean;
  userUnits?: Units;
  userHeightCm?: number | null;
  userAge?: number | null;
  userSex?: Sex | null;
  onClose?: () => void;
}) {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const typeParam   = searchParams.get('type') as GoalType | null;
  const isFirstOpen = searchParams.get('first-open') === 'true';

  const units   = userUnits ?? 'kg';
  const toDisp  = (kg: number) => units === 'lbs' ? parseFloat(kgToLbs(kg).toFixed(1)) : kg;
  const toKg    = (v: number)  => units === 'lbs' ? lbsToKg(v) : v;
  const editing  = !!activeGoal;
  const isModal  = !!(skipType || onClose);
  const fromFork = !!typeParam && !editing;

  const prevUnitsRef = useRef<Units>(units);

  const [step,      setStep]      = useState<Step>((typeParam || skipType || editing) ? 'details' : 'choose');
  const [isExiting, setIsExiting] = useState(false);
  const [stepAnim,  setStepAnim]  = useState<'slide-in-right' | 'slide-out-right' | ''>('');
  const [setupMode, setSetupMode] = useState<SetupMode>(
    editing ? (activeGoal?.setupMode ?? 'custom') : (typeParam ? 'simple' : 'custom'),
  );

  // ── Pace ──────────────────────────────────────────────────────────────────
  const [losePace, setLosePace] = useState<LosePaceId>('steady');
  const [gainPace, setGainPace] = useState<GainPaceId>('steady');

  // ── Goal fields ───────────────────────────────────────────────────────────
  const [type, setType] = useState<GoalTypeOpt['id']>(typeParam ?? activeGoal?.type ?? 'lose_by_date');
  const [name, setName] = useState(activeGoal?.name ?? '');
  const [start, setStart] = useState(() => {
    const kg = activeGoal ? activeGoal.startWeightKg : currentWeight;
    return kg != null ? String(toDisp(kg)) : '';
  });
  const [target, setTarget] = useState(() => {
    const kg = activeGoal ? activeGoal.targetWeightKg : null;
    return kg != null ? String(toDisp(kg)) : '';
  });
  const [date,      setDate]      = useState(activeGoal?.targetDate ?? '');
  const [startDate, setStartDate] = useState(activeGoal?.startDate ?? todayISO());
  const [deficitOverride, setDeficitOverride] = useState<number | null>(activeGoal?.dailyDeficitKcalOverride ?? null);
  const [sessionTouched,  setSessionTouched]  = useState(false);
  const [navScrolled,     setNavScrolled]     = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    start?: string; target?: string; date?: string; startDate?: string;
  }>({});

  // ── h/a/s ─────────────────────────────────────────────────────────────────
  const [offerHeight, setOfferHeight] = useState<number | null>(userHeightCm ?? null);
  const [offerAge,    setOfferAge]    = useState<number | null>(userAge ?? null);
  const [offerSex,    setOfferSex]    = useState<Sex | null>(userSex ?? null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (userHeightCm && !offerHeight) setOfferHeight(userHeightCm);
    if (userAge    && !offerAge)    setOfferAge(userAge);
    if (userSex    && !offerSex)    setOfferSex(userSex);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userHeightCm, userAge, userSex]);

  // ── Macro style ───────────────────────────────────────────────────────────
  const [macroStyle,      setMacroStyle]      = useState<MacroStyle | null>(activeGoal?.macroStyle ?? null);
  const [editingRow,      setEditingRow]      = useState<EditTarget>(null);
  const [proteinGState,   setProteinGState]   = useState<number | null>(currentProteinGoal ?? null);
  const [fatGState,       setFatGState]       = useState<number | null>(activeGoal?.fatTargetG ?? null);
  const [carbLimitGState, setCarbLimitGState] = useState<number | null>(activeGoal?.carbLimitG ?? null);

  // ── Derived ───────────────────────────────────────────────────────────────
  const sNum   = +start  || 0;
  const tNum   = +target || 0;
  const isGain = type === 'gain_by_date';

  const weightValid        = isGain ? sNum > 0 && tNum > 0 && tNum > sNum : sNum > 0 && tNum > 0 && sNum > tNum;
  const valid              = weightValid && !!startDate && !!date && startDate < date;
  const intensity          = valid ? goalIntensity(toKg(sNum), toKg(tNum), startDate, date) : null;
  const computedMagnitude  = intensity?.kcalPerDay ?? 0;
  const sliderMin          = Math.max(200, computedMagnitude - 500);
  const sliderMax          = computedMagnitude + 500;
  const effectiveMagnitude = deficitOverride ?? computedMagnitude;
  const goalHasStarted     = editing && !!activeGoal && activeGoal.startDate < todayISO();
  const showDeficitWarning = goalHasStarted && sessionTouched;

  const localBmr = useMemo(() => {
    const weightKg = toKg(sNum);
    if (offerHeight && offerAge && offerSex &&
      canComputeBmr({ weightKg, heightCm: offerHeight, age: offerAge, sex: offerSex })) {
      return mifflinStJeorBMR({ weightKg, heightCm: offerHeight, age: offerAge, sex: offerSex });
    }
    return userBmr;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerHeight, offerAge, offerSex, sNum, userBmr]);

  const safeBmr    = localBmr > 0 ? localBmr : userBmr > 0 ? userBmr : 2000;
  const totalCal   = Math.max(500, safeBmr + (isGain ? effectiveMagnitude : -effectiveMagnitude));
  const proteinG   = proteinGState   ?? defProtein(activeGoal ? activeGoal.startWeightKg : toKg(sNum));
  const fatG       = fatGState       ?? (macroStyle === 'performance' ? defFatPerformance(totalCal) : defFatBalanced(totalCal));
  const carbLimitG = carbLimitGState ?? defCarbLimit(totalCal);

  const derivedDate = useMemo<string | null>(() => {
    if (!weightValid) return null;
    const sk = toKg(sNum), tk = toKg(tNum), today = todayISO();
    if (isGain) { const p = GAIN_PACES.find(p => p.id === gainPace)!; return dateFromGainPace(sk, tk, p.kgPerMonth, today); }
    const p = LOSE_PACES.find(p => p.id === losePace)!;
    return dateFromLosePace(sk, tk, p.kgPerWeek, today);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weightValid, sNum, tNum, losePace, gainPace, isGain, units]);

  const derivedDateText: string | null = (() => {
    if (!derivedDate) return null;
    if (isGain) { const p = GAIN_PACES.find(p => p.id === gainPace)!; return `≈ +${p.surplusFloor}–${p.surplusCeiling} kcal/day · ${fmtMonthYear(derivedDate)}`; }
    return `≈ ${fmtDerivedDate(derivedDate)}`;
  })();

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeGoal) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setType(activeGoal.type); setName(activeGoal.name);
      setStart(String(toDisp(activeGoal.startWeightKg)));
      setTarget(String(toDisp(activeGoal.targetWeightKg)));
      setDate(activeGoal.targetDate); setStartDate(activeGoal.startDate);
      setDeficitOverride(activeGoal.dailyDeficitKcalOverride ?? null);
      setMacroStyle(activeGoal.macroStyle ?? null);
      if (activeGoal.fatTargetG) setFatGState(activeGoal.fatTargetG);
      if (activeGoal.carbLimitG) setCarbLimitGState(activeGoal.carbLimitG);
      if (currentProteinGoal)    setProteinGState(currentProteinGoal);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGoal?.id]);

  useEffect(() => {
    if (!activeGoal && currentWeight != null && start === '') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStart(String(toDisp(currentWeight)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWeight]);

  useEffect(() => {
    const prev = prevUnitsRef.current;
    if (prev === units) return;
    prevUnitsRef.current = units;
    if (start) {
      const kg = prev === 'lbs' ? lbsToKg(parseFloat(start)) : parseFloat(start);
      setStart(String(units === 'lbs' ? parseFloat(kgToLbs(kg).toFixed(1)) : Math.round(kg * 10) / 10));
    }
    if (target) {
      const kg = prev === 'lbs' ? lbsToKg(parseFloat(target)) : parseFloat(target);
      setTarget(String(units === 'lbs' ? parseFloat(kgToLbs(kg).toFixed(1)) : Math.round(kg * 10) / 10));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNavScrolled(false);
  }, [step]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const dismiss = (delay = 320) => {
    setIsExiting(true);
    setTimeout(() => onClose ? onClose() : nav(-1), delay);
  };

  function goBackFromDetails() {
    if (fromFork)               { dismiss(280); }
    else if (editing || skipType || onClose) { dismiss(); }
    else { setStepAnim('slide-out-right'); setTimeout(() => { setStep('choose'); setStepAnim(''); }, 280); }
  }

  function navigateToDetails() { setStepAnim('slide-in-right'); setStep('details'); }

  async function setUnitsVal(u: Units) {
    const user = await repos.user.get();
    if (user) await repos.user.save({ ...user, units: u });
  }

  function finishNav() {
    if (isFirstOpen) { markOnboardingSeen(); nav('/today', { replace: true }); }
    else { dismiss(); }
  }

  // ── Save: Simple ──────────────────────────────────────────────────────────
  async function createSimple() {
    const errs: typeof fieldErrors = {};
    if (!start || sNum <= 0)         errs.start  = 'Enter a weight';
    else if (!target || tNum <= 0)   errs.target = 'Enter a target weight';
    else if (isGain  && tNum <= sNum) errs.target = 'Target must be higher than start weight';
    else if (!isGain && tNum >= sNum) errs.target = 'Target must be lower than start weight';
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setTimeout(() => scrollRef.current?.querySelector('.text-danger')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      return;
    }
    setFieldErrors({});
    const sk = toKg(sNum), tk = toKg(tNum), today = todayISO(), goalType = type as GoalType;
    let endDate: string;
    let gainFloor: number | undefined, gainCeil: number | undefined;
    if (isGain) {
      const p = GAIN_PACES.find(p => p.id === gainPace)!;
      gainFloor = p.surplusFloor; gainCeil = p.surplusCeiling;
      endDate = dateFromGainPace(sk, tk, p.kgPerMonth, today);
    } else {
      endDate = dateFromLosePace(sk, tk, LOSE_PACES.find(p => p.id === losePace)!.kgPerWeek, today);
    }
    if (!endDate) return;
    await repos.goals.put({
      id: activeGoal?.id ?? newId(), name: 'New goal', type: goalType,
      startWeightKg: sk, targetWeightKg: tk,
      startDate: today, targetDate: endDate,
      status: 'active', setupMode: 'simple',
      ...(isGain && { surplusFloor: gainFloor, surplusCeiling: gainCeil,
        trackingMode: 'detailed' as const, macroStyle: 'balanced' as MacroStyle }),
    });
    const user = await repos.user.get();
    if (user) {
      const updates: Record<string, unknown> = {};
      if (isGain) updates.proteinGoalG = Math.round(sk * 1.8);
      await repos.user.save({ ...user, ...updates });
    }
    finishNav();
  }

  // ── Save: Custom ──────────────────────────────────────────────────────────
  async function create() {
    if (!valid) return;
    const sk = toKg(sNum);
    const goalType = (type === 'maintain' ? 'lose_by_date' : type) as GoalType;
    await repos.goals.put({
      id: activeGoal?.id ?? newId(), name: name.trim() || 'New goal', type: goalType,
      startWeightKg: sk, targetWeightKg: toKg(tNum),
      startDate, targetDate: date, status: 'active', setupMode: 'custom',
      dailyDeficitKcalOverride: deficitOverride ?? undefined,
      trackingMode: macroStyle ? 'detailed' : 'simple',
      macroStyle: macroStyle ?? undefined,
      fatTargetG: macroStyle ? fatG : undefined,
      carbLimitG: macroStyle === 'lower_carb' ? carbLimitG : undefined,
    });
    const user = await repos.user.get();
    if (user) {
      const updates: Record<string, unknown> = { proteinGoalG: macroStyle ? proteinG : undefined };
      if (offerHeight) updates.heightCm = offerHeight;
      if (offerAge)    updates.age       = offerAge;
      if (offerSex)    updates.sex       = offerSex;
      if (localBmr > 0 && localBmr !== userBmr) updates.bmr = localBmr;
      await repos.user.save({ ...user, ...updates });
    }
    finishNav();
  }

  function handleCustomSave() {
    const errs: typeof fieldErrors = {};
    if (!start || sNum <= 0)          errs.start     = 'Enter a start weight';
    else if (!target || tNum <= 0)    errs.target    = 'Enter a target weight';
    else if (isGain  && tNum <= sNum) errs.target    = 'Target must be higher than start weight';
    else if (!isGain && tNum >= sNum) errs.target    = 'Target must be lower than start weight';
    if (!startDate) errs.startDate = 'Enter a start date';
    if (!date)      errs.date      = 'Enter a target date';
    else if (startDate && date <= startDate) errs.date = 'Target date must be after start date';
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setTimeout(() => scrollRef.current?.querySelector('.text-danger')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      return;
    }
    setFieldErrors({});
    void create();
  }

  // ── Shared picker bounds ──────────────────────────────────────────────────
  const wMin = units === 'lbs' ? 66  : 30;
  const wMax = units === 'lbs' ? 660 : 300;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <FullScreen
      slideUp={isModal} slideRight={fromFork}
      exiting={isExiting} exitRight={fromFork}
      onScroll={(e) => setNavScrolled(e.currentTarget.scrollTop > 0)}
      scrollRef={scrollRef}
    >
      {/* ── Choose step ── */}
      {step === 'choose' && (
        <div>
          <FlowHeader title={editing ? 'Edit goal' : 'New goal'} onClose={() => dismiss()} />
          <div className="px-6 pb-6">
            <div className="mt-5 space-y-3">
              {TYPES.map((t) => (
                <button key={t.id} disabled={!t.enabled} onClick={() => setType(t.id)}
                  className={`flex w-full items-center gap-3 rounded-card text-left shadow-card ${
                    type === t.id ? 'border-2 border-accent p-[15px]' : 'border border-border-subtle p-4'
                  } ${!t.enabled ? 'opacity-40' : ''}`}>
                  <GoalIcon type={t.id} size={32} />
                  <span className="flex-1">
                    <span className="block text-callout font-semibold">{t.title}</span>
                    <span className="block text-subhead text-content-secondary">{t.desc}</span>
                  </span>
                  {!t.enabled && (
                    <span className="rounded-pill bg-surface-sunken px-2 py-0.5 text-micro font-medium text-content-secondary">Later</span>
                  )}
                </button>
              ))}
            </div>
            <div className="mt-6">
              <Button size="lg" onClick={() => { setSetupMode('custom'); navigateToDetails(); }}>Continue</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Details step ── */}
      {step === 'details' && (
        <div className={stepAnim || undefined}>
          {/* Sticky header */}
          <div className={`sticky top-0 z-20 bg-surface transition-[box-shadow] duration-200${navScrolled ? ' shadow-nav' : ''}`}>
            <div className="pointer-events-none absolute left-0 right-0 bg-surface" style={{ bottom: '100%', height: 'env(safe-area-inset-top, 0px)' }} />
            <div className="flex items-center justify-between px-4 pt-5 pb-3">
              <button onClick={goBackFromDetails} aria-label={skipType ? 'Close' : 'Back'}
                className="-ml-2 flex h-10 w-10 items-center justify-center text-content-muted">
                <Icon name={skipType ? 'close' : 'chevronLeft'} size={skipType ? 18 : 20} strokeWidth={skipType ? 2 : 2.5} />
              </button>
              <span className="text-headline font-semibold text-content">
                {GOAL_TYPE_LABEL[type] ?? 'Your plan'}
              </span>
              <span className="w-10" />
            </div>
            <div className="flex justify-center px-4 pb-3">
              <SegmentedControl<SetupMode>
                value={setupMode}
                onChange={(m) => setSetupMode(m)}
                options={[{ value: 'simple', label: 'Simple' }, { value: 'custom', label: 'Custom' }]}
              />
            </div>
          </div>

          <div className="px-6 pb-8 pt-6">
            {/* ════ SIMPLE ════ */}
            {setupMode === 'simple' && (
              <div className="space-y-6">
                {/* Grouped card — mirrors Custom's "Your goal" card */}
                <div className="overflow-hidden border border-border-field bg-surface" style={{ borderRadius: 24 }}>
                  {/* Weight (Unit is first sub-field inside) */}
                  <div className="px-4 pt-6 pb-3">
                    <CardSectionHeader icon="weight">Weight</CardSectionHeader>
                    <div className="space-y-3">
                      {/* Unit — first sub-field */}
                      <div>
                        <span className="text-subhead font-normal text-content-secondary">Unit</span>
                        <div className="mt-1">
                          <FilterPills<Units>
                            value={units}
                            onChange={(u) => { if (u) void setUnitsVal(u); }}
                            options={[{ value: 'kg', label: 'Kg' }, { value: 'lbs', label: 'Lbs' }]}
                          />
                        </div>
                      </div>
                      <div>
                        <WheelPicker label={`Current (${units})`} value={start}
                          onChange={(v) => { setStart(v); setFieldErrors(p => ({ ...p, start: undefined })); }}
                          min={wMin} max={wMax} step={0.1} unit={units} invalid={!!fieldErrors.start}
                          selectClassName="!bg-surface-sunken !border-transparent focus:!border-transparent" />
                        {fieldErrors.start && <p className="mt-1 text-footnote text-danger">{fieldErrors.start}</p>}
                      </div>
                      <div>
                        <WheelPicker label={`Target (${units})`} value={target}
                          onChange={(v) => { setTarget(v); setFieldErrors(p => ({ ...p, target: undefined })); }}
                          min={wMin} max={wMax} step={0.1} unit={units}
                          invalid={!!fieldErrors.target} centerAt={+start || (units === 'lbs' ? 154 : 70)}
                          selectClassName="!bg-surface-sunken !border-transparent focus:!border-transparent" />
                        {fieldErrors.target && <p className="mt-1 text-footnote text-danger">{fieldErrors.target}</p>}
                      </div>
                    </div>
                  </div>

                  {/* Pace — pt-4 matches Custom sub-section gap */}
                  <div className="px-4 pt-4 pb-6">
                    <CardSectionHeader icon="calendar">Pace</CardSectionHeader>
                    {isGain ? (
                      <FilterPills<GainPaceId> value={gainPace}
                        onChange={(v) => { if (v) setGainPace(v); }}
                        options={GAIN_PACES.map(p => ({ value: p.id, label: p.label }))} />
                    ) : (
                      <FilterPills<LosePaceId> value={losePace}
                        onChange={(v) => { if (v) setLosePace(v); }}
                        options={LOSE_PACES.map(p => ({ value: p.id, label: p.label }))} />
                    )}
                  </div>
                </div>

                {derivedDateText && (
                  <p className="text-callout text-content-secondary" aria-live="polite">{derivedDateText}</p>
                )}

                <Button size="lg" onClick={() => void createSimple()}>Set my goal</Button>
              </div>
            )}

            {/* ════ CUSTOM ════ */}
            {setupMode === 'custom' && (
              <div>
                {/* Section 1: Your goal */}
                <section>
                  <p className="mb-4 text-title font-bold text-content">1. Your goal</p>

                  <div className="overflow-hidden border border-border-field bg-surface" style={{ borderRadius: 24 }}>
                    {/* Goal name */}
                    <div className="p-4">
                      <span className="block mb-2 text-headline font-semibold text-content">Goal name</span>
                      <LabeledInput value={name} onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Summer Cut"
                        className="!bg-surface-sunken !border-transparent focus:!border-transparent" />
                    </div>

                    {/* Weight (Unit is first sub-field inside) */}
                    <div className="p-4 pb-3">
                      <CardSectionHeader icon="weight">Weight</CardSectionHeader>
                      <div className="space-y-3">
                        {/* Unit — first sub-field */}
                        <div>
                          <span className="text-subhead font-normal text-content-secondary">Unit</span>
                          <div className="mt-1">
                            <FilterPills<Units>
                              value={units}
                              onChange={(u) => { if (u) void setUnitsVal(u); }}
                              options={[{ value: 'kg', label: 'Kg' }, { value: 'lbs', label: 'Lbs' }]}
                            />
                          </div>
                        </div>
                        <div>
                          <WheelPicker label={`Start (${units})`} value={start}
                            onChange={(v) => { setStart(v); setFieldErrors(p => ({ ...p, start: undefined })); }}
                            min={wMin} max={wMax} step={0.1} unit={units} invalid={!!fieldErrors.start}
                            selectClassName="!bg-surface-sunken !border-transparent focus:!border-transparent" />
                          {fieldErrors.start && <p className="mt-1 text-footnote text-danger">{fieldErrors.start}</p>}
                        </div>
                        <div>
                          <WheelPicker label={`Target (${units})`} value={target}
                            onChange={(v) => { setTarget(v); setFieldErrors(p => ({ ...p, target: undefined })); }}
                            min={wMin} max={wMax} step={0.1} unit={units} invalid={!!fieldErrors.target}
                            centerAt={+start || (units === 'lbs' ? 154 : 70)}
                            selectClassName="!bg-surface-sunken !border-transparent focus:!border-transparent" />
                          {fieldErrors.target && <p className="mt-1 text-footnote text-danger">{fieldErrors.target}</p>}
                        </div>
                      </div>
                    </div>

                    {/* Dates */}
                    <div className="p-4 pb-5">
                      <CardSectionHeader icon="calendar">Dates</CardSectionHeader>
                      <div className="flex gap-2">
                        <div className="flex-1 min-w-0">
                          <span className="block text-subhead text-content-secondary">Start</span>
                          <div className="mt-1 overflow-hidden rounded-field bg-surface-sunken">
                            <input type="date" value={startDate}
                              onChange={(e) => { setStartDate(e.target.value); setFieldErrors(p => ({ ...p, startDate: undefined })); }}
                              className="w-full bg-surface-sunken px-3 py-2.5 text-subhead text-content focus:outline-none" />
                          </div>
                          {fieldErrors.startDate && <p className="mt-1 text-footnote text-danger">{fieldErrors.startDate}</p>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="block text-subhead text-content-secondary">Target date</span>
                          <div className="mt-1 overflow-hidden rounded-field bg-surface-sunken">
                            <input type="date" value={date} min={startDate || todayISO()}
                              onChange={(e) => { setDate(e.target.value); setFieldErrors(p => ({ ...p, date: undefined })); }}
                              className="w-full bg-surface-sunken px-3 py-2.5 text-subhead text-content focus:outline-none" />
                          </div>
                          {fieldErrors.date && <p className="mt-1 text-footnote text-danger">{fieldErrors.date}</p>}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Review your goal */}
                  <div className="mt-6">
                    <p className="mb-3 text-headline font-semibold text-content">Review your goal</p>
                    <div className={`overflow-hidden border border-border-subtle bg-surface p-5${intensity ? ' shadow-card' : ''}`} style={{ borderRadius: 24 }}>
                      {intensity ? (
                        <>
                          <div className="relative">
                            {sessionTouched && (
                              <button type="button"
                                onClick={() => { setDeficitOverride(null); setSessionTouched(false); }}
                                className="absolute top-0 right-0 text-subhead font-normal text-accent-hover active:opacity-70">
                                Reset
                              </button>
                            )}
                            <p className="text-display font-bold text-center">
                              {units === 'lbs' ? `${kgToLbs(intensity.kgToLose).toFixed(1)} lbs` : `${intensity.kgToLose.toFixed(1)} kg`}
                            </p>
                            <p className="text-center text-subhead text-content-secondary">
                              {Math.round(intensity.weeks)} weeks{'  ·  '}≈ {units === 'lbs' ? `${kgToLbs(intensity.kgPerWeek).toFixed(2)} lbs/week` : `${intensity.kgPerWeek} kg/week`}
                            </p>
                          </div>
                          <div className="mt-3 rounded-field bg-surface-sunken px-3 py-2.5 text-center">
                            <p className="text-subhead text-content-secondary">
                              {isGain ? `+${effectiveMagnitude - 100} to +${effectiveMagnitude + 100} kcal/day` : `≈ –${effectiveMagnitude} kcal/day`}
                            </p>
                          </div>
                          <input type="range"
                            aria-label={isGain ? 'Daily calorie surplus' : 'Daily calorie deficit'}
                            min={sliderMin} max={sliderMax} step={10} value={effectiveMagnitude}
                            onChange={(e) => { setDeficitOverride(Number(e.target.value)); setSessionTouched(true); }}
                            className="mt-[2px] w-full accent-accent" style={{ touchAction: 'pan-x' }} />
                          <div className="mt-5"><PaceMeter level={intensity.level} /></div>
                          {showDeficitWarning && (
                            <div className="mt-4 flex items-start gap-2.5 rounded-control border border-border-subtle bg-surface-sunken p-3">
                              <Icon name="info" size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-content-secondary" />
                              <div className="flex-1">
                                <p className="text-subhead text-content-secondary">
                                  Changing the daily {isGain ? 'surplus' : 'deficit'} will affect how your remaining days are budgeted. Past entries are not changed.
                                </p>
                                <button onClick={() => { setDeficitOverride(null); setSessionTouched(false); }}
                                  className="mt-1.5 text-subhead font-normal text-accent-hover active:opacity-70">
                                  Reset to calculated ({computedMagnitude} kcal)
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-subhead text-content-muted">Fill in your details to preview your goal pace.</p>
                      )}
                    </div>
                  </div>
                </section>

                {/* Divider */}
                <hr className="border-border-field mt-12 mb-12" />

                {/* Section 2: Details about you */}
                <section>
                  <p className="mb-1 text-title font-bold text-content">2. Details about you</p>
                  <p className="mb-4 text-subhead text-content-secondary">
                    Helps estimate your BMR more accurately. Affects calorie and macro targets.
                  </p>
                  <div className="border border-border-field bg-surface p-4" style={{ borderRadius: 24 }}>
                    <div className="space-y-3">
                      <div>
                        <span className="block mb-1 text-subhead font-normal text-content-secondary">Height</span>
                        <div className="relative">
                          <select value={offerHeight ?? ''}
                            onChange={(e) => setOfferHeight(e.target.value === '' ? null : Number(e.target.value))}
                            className="w-full appearance-none rounded-field bg-surface-sunken px-4 py-3 text-subhead text-content pr-10 focus:outline-none">
                            <option value="">—</option>
                            {HEIGHT_OPTIONS.map(n => <option key={n} value={n}>{n} cm</option>)}
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-content-muted">
                            <Icon name="chevronDown" size={16} strokeWidth={2} />
                          </div>
                        </div>
                      </div>
                      <div>
                        <span className="block mb-1 text-subhead font-normal text-content-secondary">Age</span>
                        <div className="relative">
                          <select value={offerAge ?? ''}
                            onChange={(e) => setOfferAge(e.target.value === '' ? null : Number(e.target.value))}
                            className="w-full appearance-none rounded-field bg-surface-sunken px-4 py-3 text-subhead text-content pr-10 focus:outline-none">
                            <option value="">—</option>
                            {AGE_OPTIONS.map(n => <option key={n} value={n}>{n} yrs</option>)}
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-content-muted">
                            <Icon name="chevronDown" size={16} strokeWidth={2} />
                          </div>
                        </div>
                      </div>
                      <div>
                        <span className="block mb-2 text-subhead font-normal text-content-secondary">Sex</span>
                        <FilterPills<Sex> value={offerSex} onChange={setOfferSex}
                          options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
                      </div>
                    </div>
                  </div>
                </section>

                {/* Divider */}
                <hr className="border-border-field mt-12 mb-12" />

                {/* Section 3: Tracking */}
                <section>
                  <p className="mb-1 text-title font-bold text-content">3. Tracking</p>
                  <p className="mb-4 text-subhead text-content-secondary">
                    Choose how carbs and fat are distributed across your day. You can adjust this later.
                  </p>
                  <div className="space-y-2">
                    {MACRO_STYLES.map((s) => (
                      <MacroStyleCard key={s.id} style={s} selected={macroStyle === s.id}
                        onSelect={() => { setMacroStyle(macroStyle === s.id ? null : s.id); setEditingRow(null); }} />
                    ))}
                  </div>

                  {macroStyle && (
                    <div className="mt-5">
                      <p className="mb-3 text-headline font-semibold text-content">Macro targets</p>
                      <div className="overflow-hidden border border-border-field bg-surface" style={{ borderRadius: 24 }}>
                        <MacroRow label="Protein target (g)" displayValue={`${proteinG} per day`}
                          editable isEditing={editingRow === 'protein'} value={proteinG}
                          min={Math.max(40, r5(sNum * 0.8))} max={r5(Math.max(sNum, 50) * 3.0)}
                          onEditToggle={() => setEditingRow(editingRow === 'protein' ? null : 'protein')}
                          onReset={() => { setProteinGState(null); setEditingRow(null); }}
                          onChange={setProteinGState} note={proteinNote(proteinG, sNum)} />
                        {macroStyle === 'balanced' && (
                          <>
                            <MacroRow label="Carb target (g)" displayValue="Adjusts with activity" />
                            <MacroRow label="Fat target (g)" displayValue={`${fatG} per day`}
                              editable isEditing={editingRow === 'fat'} value={fatG}
                              min={10} max={r5(totalCal * 0.55 / 9)}
                              onEditToggle={() => setEditingRow(editingRow === 'fat' ? null : 'fat')}
                              onReset={() => { setFatGState(null); setEditingRow(null); }}
                              onChange={setFatGState} note={macroNote('balanced', 'fat', fatG, totalCal)} />
                          </>
                        )}
                        {macroStyle === 'performance' && (() => {
                          const carbG = Math.max(0, Math.round((totalCal - proteinG * 4 - fatG * 9) / 4));
                          return (
                            <>
                              <MacroRow label="Carb target (g)" displayValue={`Base ${carbG} g · adjusts with activity`} />
                              <MacroRow label="Fat baseline (g)" displayValue={`${fatG} per day`}
                                editable isEditing={editingRow === 'fat'} value={fatG}
                                min={10} max={r5(totalCal * 0.45 / 9)}
                                onEditToggle={() => setEditingRow(editingRow === 'fat' ? null : 'fat')}
                                onReset={() => { setFatGState(null); setEditingRow(null); }}
                                onChange={setFatGState} note={macroNote('performance', 'fat', fatG, totalCal)} />
                            </>
                          );
                        })()}
                        {macroStyle === 'lower_carb' && (
                          <>
                            <MacroRow label="Carb limit (g)" displayValue={`${carbLimitG} per day`}
                              editable isEditing={editingRow === 'carb'} value={carbLimitG}
                              min={20} max={r5(totalCal * 0.55 / 4)}
                              onEditToggle={() => setEditingRow(editingRow === 'carb' ? null : 'carb')}
                              onReset={() => { setCarbLimitGState(null); setEditingRow(null); }}
                              onChange={setCarbLimitGState} note={macroNote('lower_carb', 'carb', carbLimitG, totalCal)} />
                            <MacroRow label="Fat target (g)" displayValue="Adjusts with activity" />
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </section>

                <div className="mt-8">
                  <Button size="lg" onClick={handleCustomSave}>Set my goal</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </FullScreen>
  );
}

// ── CardSectionHeader: inside the grouped card (text-headline) ────────────────
function CardSectionHeader({ children, icon }: { children: React.ReactNode; icon?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {icon && <Icon name={icon as Parameters<typeof Icon>[0]['name']} size={18} className="text-content shrink-0" />}
      <span className="text-headline font-semibold text-content leading-none">{children}</span>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MacroRow({
  label, displayValue, editable = false, isEditing = false, value,
  min = 10, max = 300, step = 5, onEditToggle, onReset, onChange, note,
}: {
  label: string; displayValue: string; editable?: boolean; isEditing?: boolean;
  value?: number; min?: number; max?: number; step?: number;
  onEditToggle?: () => void; onReset?: () => void; onChange?: (v: number) => void;
  note?: string | null;
}) {
  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        {/* label: Regular weight, content-secondary — matches WheelPicker label style */}
        <span className="text-subhead font-normal text-content-secondary">{label}</span>
        {editable && (
          <button type="button" onClick={isEditing ? onReset : onEditToggle}
            className="text-subhead font-normal text-accent-hover active:opacity-70">
            {isEditing ? 'Reset' : 'Edit'}
          </button>
        )}
      </div>
      <div className="mt-1.5 rounded-field bg-surface-sunken px-3 py-2.5">
        <span className="text-subhead text-content">{displayValue}</span>
      </div>
      {isEditing && value !== undefined && onChange && (
        <input type="range" aria-label={label} min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="mt-[2px] w-full accent-accent" style={{ touchAction: 'pan-x' }} />
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

function MacroStyleCard({ style, selected, onSelect }: {
  style: { id: MacroStyle; title: string; subtitle: string }; selected: boolean; onSelect: () => void;
}) {
  return (
    <button type="button" onClick={onSelect}
      className={`flex w-full flex-col rounded-card text-left shadow-card transition-colors ${
        selected ? 'border-2 border-accent bg-surface p-[15px]' : 'border border-border-subtle bg-surface p-4'
      }`}>
      <span className="text-callout font-semibold text-content">{style.title}</span>
      <span className="mt-0.5 text-subhead text-content-secondary">{style.subtitle}</span>
    </button>
  );
}

function FullScreen({
  children, slideUp, slideRight, exiting, exitRight, onScroll, scrollRef,
}: {
  children: React.ReactNode; slideUp?: boolean; slideRight?: boolean;
  exiting?: boolean; exitRight?: boolean;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const enterClass = slideRight ? 'slide-in-right' : slideUp ? 'slide-up-in' : '';
  const exitClass  = exitRight  ? 'slide-out-right' : 'slide-down-out';
  const animClass  = exiting ? exitClass : enterClass;
  return (
    <div className={`fixed inset-0 ${slideUp ? 'z-[200]' : ''} flex justify-center overflow-hidden bg-surface-sunken sm:items-center sm:py-[max(1.5rem,2dvh)] ${animClass}`}
      style={{ touchAction: 'manipulation' }}>
      <div ref={scrollRef}
        className="safe-top safe-bottom flex h-[100dvh] w-full max-w-[26.25rem] flex-col overflow-x-hidden overflow-y-auto bg-surface sm:h-[min(880px,94dvh)] sm:rounded-[2rem] sm:border sm:border-border-subtle sm:shadow-xl"
        style={{ touchAction: 'pan-y' }} onScroll={onScroll}>
        {children}
      </div>
    </div>
  );
}

function FlowHeader({ title, onClose, onBack }: { title: string; onClose?: () => void; onBack?: () => void }) {
  const left = onBack ? (
    <button onClick={onBack} aria-label="Back" className="-ml-2 flex h-10 w-10 items-center justify-center text-content-muted">
      <Icon name="chevronLeft" size={20} strokeWidth={2.5} />
    </button>
  ) : onClose ? (
    <button onClick={onClose} aria-label="Close" className="-ml-2 flex h-10 w-10 items-center justify-center text-content-muted">
      <Icon name="close" size={20} strokeWidth={2.5} />
    </button>
  ) : <span className="w-10" />;
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
        <div className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-accent" style={{ left: pos }} />
      </div>
      <div className="mt-1.5 grid grid-cols-3 text-footnote">
        <span className={`text-left  ${level === 'gentle'     ? 'font-semibold text-content' : 'text-content-muted'}`}>Gentle</span>
        <span className={`text-center ${level === 'moderate'  ? 'font-semibold text-content' : 'text-content-muted'}`}>Moderate</span>
        <span className={`text-right  ${level === 'aggressive' ? 'font-semibold text-content' : 'text-content-muted'}`}>Aggressive</span>
      </div>
    </div>
  );
}

const GOAL_ICON_BODY = "M8.7704 4.44851C8.42901 4.10768 8.25831 3.69789 8.25831 3.21914C8.25831 2.74052 8.4288 2.33052 8.76977 1.98913C9.11061 1.64775 9.5204 1.47705 9.99915 1.47705C10.4778 1.47705 10.8878 1.64754 11.2291 1.98851C11.5705 2.32934 11.7412 2.73913 11.7412 3.21788C11.7412 3.6965 11.5707 4.1065 11.2298 4.44789C10.8889 4.78927 10.4791 4.95997 10.0004 4.95997C9.52179 4.95997 9.11179 4.78948 8.7704 4.44851ZM7.41019 17.4798V7.58851C6.74283 7.53351 6.07026 7.45907 5.39248 7.36518C4.71456 7.27129 4.04727 7.14962 3.39061 7.00018C3.13463 6.94129 2.9304 6.79941 2.7779 6.57455C2.6254 6.34955 2.58554 6.10907 2.65831 5.85309C2.73109 5.59698 2.88686 5.4092 3.12561 5.28976C3.36449 5.17045 3.6172 5.14025 3.88373 5.19914C4.85929 5.40747 5.86894 5.55858 6.91269 5.65247C7.9563 5.74636 8.98533 5.7933 9.99977 5.7933C11.0142 5.7933 12.0441 5.74636 13.0894 5.65247C14.1348 5.55858 15.1469 5.40747 16.1256 5.19914C16.3923 5.14025 16.6439 5.17073 16.8804 5.29059C17.1171 5.41059 17.2723 5.59809 17.3462 5.85309C17.419 6.10907 17.3783 6.34872 17.2241 6.57205C17.07 6.79525 16.8649 6.93629 16.6089 6.99518C15.9523 7.14462 15.285 7.26712 14.6071 7.36268C13.9293 7.45823 13.2567 7.53351 12.5894 7.58851V17.4798C12.5894 17.7371 12.5023 17.9528 12.3283 18.1268C12.1543 18.3009 11.9387 18.3879 11.6814 18.3879C11.4241 18.3879 11.2084 18.3009 11.0344 18.1268C10.8603 17.9528 10.7733 17.7371 10.7733 17.4798V13.3331H9.22623V17.4798C9.22623 17.7371 9.13922 17.9528 8.96519 18.1268C8.79116 18.3009 8.57547 18.3879 8.31811 18.3879C8.06088 18.3879 7.84526 18.3009 7.67123 18.1268C7.4972 17.9528 7.41019 17.7371 7.41019 17.4798Z";
const GOAL_ICON_ARROWS: Record<string, string> = {
  lose_by_date: "M15 17.5L12.5 15.1348L13.3088 14.3696L14.421 15.4217V12.5H15.579V15.4217L16.6912 14.3696L17.5 15.1348L15 17.5Z",
  maintain:     "M17.5 15L15.1348 17.5L14.3696 16.6912L15.4217 15.579L12.5 15.579L12.5 14.421L15.4217 14.421L14.3696 13.3088L15.1348 12.5L17.5 15Z",
  gain_by_date: "M15 12.5L17.5 14.8652L16.6912 15.6304L15.579 14.5783L15.579 17.5L14.421 17.5L14.421 14.5783L13.3088 15.6304L12.5 14.8652L15 12.5Z",
};
export function GoalIcon({ type, size = 20 }: { type: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" className="shrink-0">
      <path d={GOAL_ICON_BODY} fill="currentColor" />
      <circle cx="15" cy="15" r="5" fill="var(--color-accent)" />
      <path d={GOAL_ICON_ARROWS[type] ?? GOAL_ICON_ARROWS.maintain} fill="currentColor" />
    </svg>
  );
}
