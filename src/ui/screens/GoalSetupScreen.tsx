import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLive } from '../../state/live';
import { repos } from '../../state/repos';
import { newId, todayISO, addDays } from '../../data/ids';
import {
  goalIntensity, currentWeightKg, activityCarbTargetG,
  LOSE_PACES, GAIN_PACES, MAINTAIN_BANDS,
  dateFromLosePace, dateFromGainPace,
  type LosePaceId, type GainPaceId, type MaintainBandId,
} from '../../domain/goal';
import { mifflinStJeorBMR, canComputeBmr } from '../../domain/bmr';
import { kgToLbs, lbsToKg } from '../../domain/units';
import { markOnboardingSeen } from '../../lib/onboarding';
import { hapticLight } from '../../lib/haptics';
import { useKeyboardInset, scrollFocusedAboveKeyboard } from '../../lib/useKeyboardInset';
import { DONE_BAR_HEIGHT } from '../kit/useKeyboardDoneBar';
import { GoalIcon } from './GoalIcon';
import { FirstOpenForkBackdrop, GoalForkBackdrop } from './FirstOpenFork';
import { Button, LabeledInput, NumberField, WheelPicker, Icon, SegmentedControl, FilterPills, Sheet } from '../kit';
import type { Goal, GoalType, MacroStyle, Units, Sex } from '../../domain/types';

// ── Local types ───────────────────────────────────────────────────────────────
type GoalTypeOpt = { id: GoalType | 'maintain'; title: string; desc: string; enabled: boolean };
type Step = 'choose' | 'details';
type EditTarget = 'protein' | 'fat' | 'carb' | null;
type SetupMode = 'simple' | 'custom';

// ── Constants ─────────────────────────────────────────────────────────────────
const TYPES: GoalTypeOpt[] = [
  { id: 'lose_by_date', title: 'Lose weight',    desc: 'Target weight by a deadline. Tracks deficit + trend.', enabled: true  },
  { id: 'maintain',     title: 'Maintain weight', desc: 'Hold steady within a range.',                          enabled: true  },
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
      userHeightCm:        user?.heightCm || null,
      userAge:             user?.age || null,
      userSex:             user?.sex ?? null,
      userWeeklyWeightDay: user?.weeklyWeightDay ?? 0,
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
    userWeeklyWeightDay={data.userWeeklyWeightDay}
  />;
}

// ── Main form ─────────────────────────────────────────────────────────────────
export function GoalSetupForm({
  activeGoal, currentWeight, currentProteinGoal, userBmr,
  skipType = false, userUnits, userHeightCm, userAge, userSex, userWeeklyWeightDay, onClose,
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
  userWeeklyWeightDay?: number;
  onClose?: () => void;
}) {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const typeParam   = searchParams.get('type') as GoalType | null;
  const isFirstOpen = searchParams.get('first-open') === 'true';
  // Round 190 — forwarded by GoalForkScreen's pickGoal so the exit-transition
  // backdrop below can show the exact same Close-vs-Back header the real
  // fork route will show once it remounts.
  const fromToday   = searchParams.get('from') === 'today';

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
  const [losePace, setLosePace] = useState<LosePaceId>('relaxed');
  const [gainPace, setGainPace] = useState<GainPaceId>('relaxed');

  // ── Maintain band (r182) ─────────────────────────────────────────────────
  // Guided mode: one preset drives both the weight range and the kcal band.
  // Detailed mode: the two bounds below are directly editable (like a macro
  // range) and default from whichever preset is selected.
  const [maintainBand, setMaintainBand] = useState<MaintainBandId>('standard');
  // Detailed/Custom mode's own picker (Guided keeps the 3-preset FilterPills
  // above via maintainBand) — adds a 4th "Custom" choice that reveals the
  // min/max wheels below.
  type WeightBandChoice = MaintainBandId | 'custom';
  const [weightBandChoice, setWeightBandChoice] = useState<WeightBandChoice>('standard');
  const [showBandSheet, setShowBandSheet] = useState(false);
  const [rangeFloor, setRangeFloor] = useState<string>('');
  const [rangeCeiling, setRangeCeiling] = useState<string>('');
  const [reviewDate, setReviewDate] = useState<string>('');

  // ── Goal fields ───────────────────────────────────────────────────────────
  const [type, setType] = useState<GoalTypeOpt['id']>(typeParam ?? activeGoal?.type ?? 'lose_by_date');
  const [name, setName] = useState(activeGoal?.name ?? '');
  const [start, setStart] = useState(() => {
    const kg = activeGoal ? activeGoal.startWeightKg : currentWeight;
    if (kg != null) return String(toDisp(kg));
    return units === 'lbs' ? '132' : '60'; // default centerAt when no weight history
  });
  const [target, setTarget] = useState(() => {
    const kg = activeGoal ? activeGoal.targetWeightKg : null;
    return kg != null ? String(toDisp(kg)) : '';
  });
  const [date,      setDate]      = useState(activeGoal?.targetDate ?? '');
  const [startDate, setStartDate] = useState(activeGoal?.startDate ?? todayISO());
  useEffect(() => {
    if (activeGoal?.type === 'maintain') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (activeGoal.maintainBandId) { setMaintainBand(activeGoal.maintainBandId); setWeightBandChoice(activeGoal.maintainBandId); }
      else setWeightBandChoice('custom');
      if (activeGoal.weightRangeFloorKg   != null) setRangeFloor(String(toDisp(activeGoal.weightRangeFloorKg)));
      if (activeGoal.weightRangeCeilingKg != null) setRangeCeiling(String(toDisp(activeGoal.weightRangeCeilingKg)));
      if (activeGoal.reviewDate) setReviewDate(activeGoal.reviewDate);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGoal?.id]);
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

  // Direct profile query — GoalSetupForm reads the user record itself so
  // Section 2 always pre-fills regardless of any prop-passing timing issue.
  const profileUser = useLive(() => repos.user.get(), []);
  useEffect(() => {
    if (!profileUser) return;
    const h = profileUser.heightCm || null;
    const a = profileUser.age ?? null;
    const s = profileUser.sex ?? null;
    // Functional updater: only back-fill if the field hasn't been touched yet.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (h) setOfferHeight(prev => prev !== null ? prev : h);
    if (a) setOfferAge(prev => prev !== null ? prev : a);
    if (s) setOfferSex(prev => prev !== null ? prev : s);
  }, [profileUser]);

  // ── Weigh-in cadence ─────────────────────────────────────────────────────
  const [weighCadence, setWeighCadence] = useState<'daily' | 'weekly' | null>(null);
  const [weighDay,     setWeighDay]     = useState<number>(userWeeklyWeightDay ?? 0);

  // ── Macro style ───────────────────────────────────────────────────────────
  const [macroStyle,      setMacroStyle]      = useState<MacroStyle | null>(activeGoal?.macroStyle ?? null);
  const [editingRow,      setEditingRow]      = useState<EditTarget>(null);
  const [proteinGState,   setProteinGState]   = useState<number | null>(currentProteinGoal ?? null);
  const [fatGState,       setFatGState]       = useState<number | null>(activeGoal?.fatTargetG ?? null);
  const [carbLimitGState, setCarbLimitGState] = useState<number | null>(activeGoal?.carbLimitG ?? null);

  // ── Derived ───────────────────────────────────────────────────────────────
  const sNum      = +start  || 0;
  const tNum      = +target || 0;
  const isGain     = type === 'gain_by_date';
  const isMaintain = type === 'maintain';

  // Maintain has no target-weight delta and no deadline — "valid" just means
  // a positive current weight is on file. The weight RANGE (floor/ceiling)
  // is validated separately in handleCustomSave/createSimple.
  const maintainBandDef = MAINTAIN_BANDS.find(b => b.id === maintainBand)!; // Guided mode preset
  const standardBandDef  = MAINTAIN_BANDS.find(b => b.id === 'standard')!;
  // Detailed mode: null when "Custom" is chosen (min/max are hand-entered).
  const detailedBandDef  = weightBandChoice !== 'custom' ? MAINTAIN_BANDS.find(b => b.id === weightBandChoice)! : null;
  const detailedKcalBand = detailedBandDef ? detailedBandDef.kcalBand : standardBandDef.kcalBand;
  const rangeFloorNum    = detailedBandDef
    ? toDisp(toKg(sNum) - detailedBandDef.weightRangeKg)
    : (rangeFloor   !== '' ? +rangeFloor   : toDisp(toKg(sNum) - standardBandDef.weightRangeKg));
  const rangeCeilingNum  = detailedBandDef
    ? toDisp(toKg(sNum) + detailedBandDef.weightRangeKg)
    : (rangeCeiling !== '' ? +rangeCeiling : toDisp(toKg(sNum) + standardBandDef.weightRangeKg));

  const weightValid = isMaintain
    ? sNum > 0
    : isGain ? sNum > 0 && tNum > 0 && tNum > sNum : sNum > 0 && tNum > 0 && sNum > tNum;
  const valid = isMaintain ? weightValid : weightValid && !!startDate && !!date && startDate < date;
  const intensity          = !isMaintain && valid ? goalIntensity(toKg(sNum), toKg(tNum), startDate, date) : null;
  const computedMagnitude  = intensity?.kcalPerDay ?? 0;
  const sliderMin          = Math.max(200, computedMagnitude - 500);
  const sliderMax          = computedMagnitude + 500;
  const effectiveMagnitude = isMaintain ? 0 : (deficitOverride ?? computedMagnitude);
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
    if (isMaintain || !weightValid) return null; // maintain has no pace-derived end date
    const sk = toKg(sNum), tk = toKg(tNum), today = todayISO();
    if (isGain) { const p = GAIN_PACES.find(p => p.id === gainPace)!; return dateFromGainPace(sk, tk, p.kgPerMonth, today); }
    const p = LOSE_PACES.find(p => p.id === losePace)!;
    return dateFromLosePace(sk, tk, p.kgPerWeek, today);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMaintain, weightValid, sNum, tNum, losePace, gainPace, isGain, units]);

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

  // ── Keyboard scroll handling ─────────────────────────────────────────────
  // useKeyboardInset() uses Capacitor Keyboard plugin events on device
  // (visualViewport doesn't change with KeyboardResize.None) and falls back
  // to visualViewport in the browser. When the keyboard appears we add
  // padding-bottom so all fields stay scrollable, and we nudge the focused
  // field into view above the keyboard.
  const keyboardInset = useKeyboardInset();
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    // + DONE_BAR_HEIGHT (round 186): the custom Done bar sits above the
    // keyboard and isn't part of the reported keyboard height, so both the
    // padding and the scroll-into-view target need the extra room too —
    // see Sheet.tsx's matching fix for the same issue.
    scrollEl.style.paddingBottom = keyboardInset > 0 ? `${keyboardInset + DONE_BAR_HEIGHT}px` : '';
    if (keyboardInset > 0) {
      const focused = document.activeElement as HTMLElement | null;
      if (focused && scrollEl.contains(focused)) {
        setTimeout(() => scrollFocusedAboveKeyboard(scrollEl, focused, keyboardInset, DONE_BAR_HEIGHT), 100);
      }
    }
  }, [keyboardInset]);

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
    else if (fromFork) { nav('/today', { replace: true }); }
    else { dismiss(); }
  }

  // ── Save: Simple ──────────────────────────────────────────────────────────
  async function createSimple() {
    const errs: typeof fieldErrors = {};
    if (!isMaintain) {
      if (!start || sNum <= 0)         errs.start  = 'Enter a weight';
      else if (!target || tNum <= 0)   errs.target = 'Enter a target weight';
      else if (isGain  && tNum <= sNum) errs.target = 'Target must be higher than start weight';
      else if (!isGain && tNum >= sNum) errs.target = 'Target must be lower than start weight';
    } else if (!start || sNum <= 0) {
      errs.start = 'Enter your current weight';
    }
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setTimeout(() => scrollRef.current?.querySelector('.text-danger')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      return;
    }
    setFieldErrors({});

    if (isMaintain) {
      const sk = toKg(sNum), today = todayISO();
      const band = maintainBandDef;
      const floorKg = sk - band.weightRangeKg, ceilKg = sk + band.weightRangeKg;
      // No deadline — far-future sentinel so downstream date math never
      // trips the lose/gain "final day / overdue" derivations (those are
      // gated off entirely for maintain in GoalScreen anyway).
      const farFuture = addDays(today, 3650);
      await repos.goals.put({
        id: activeGoal?.id ?? newId(), name: 'New goal', type: 'maintain',
        startWeightKg: sk, targetWeightKg: sk,
        startDate: today, targetDate: farFuture,
        status: 'active', setupMode: 'simple',
        maintainBandId: band.id,
        weightRangeFloorKg: floorKg, weightRangeCeilingKg: ceilKg,
        surplusFloor: -band.kcalBand, surplusCeiling: band.kcalBand,
        macroStyle: 'balanced' as MacroStyle,
        trackingMode: 'detailed' as const,
        diaryShowProtein: false, diaryShowCarbs: false, diaryShowFat: false,
      });
      if (!activeGoal) {
        await repos.weights.upsertForDate({ id: newId(), date: today, weightKg: sk, source: 'manual' });
      }
      const user = await repos.user.get();
      if (user) {
        const simpleUpdates: Record<string, unknown> = {
          proteinGoalG: Math.round(sk * 1.8),
          ...(weighCadence && { weightCadence: weighCadence }),
          weeklyWeightDay: weighCadence === 'weekly' ? weighDay : user.weeklyWeightDay,
        };
        if (offerHeight) simpleUpdates.heightCm = offerHeight;
        if (offerAge)    simpleUpdates.age       = offerAge;
        if (offerSex)    simpleUpdates.sex       = offerSex;
        if (localBmr > 0 && localBmr !== userBmr) simpleUpdates.bmr = localBmr;
        await repos.user.save({ ...user, ...simpleUpdates });
      }
      finishNav();
      return;
    }

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
    const simpleProteinG = Math.round(sk * 1.8);
    await repos.goals.put({
      id: activeGoal?.id ?? newId(), name: 'New goal', type: goalType,
      startWeightKg: sk, targetWeightKg: tk,
      startDate: today, targetDate: endDate,
      status: 'active', setupMode: 'simple',
      macroStyle: 'balanced' as MacroStyle,
      trackingMode: 'detailed' as const,
      // Macros are calculated but hidden by default in simple mode
      diaryShowProtein: false, diaryShowCarbs: false, diaryShowFat: false,
      ...(isGain && { surplusFloor: gainFloor, surplusCeiling: gainCeil }),
    });
    // Log the starting weight for the start date (new goals only)
    if (!activeGoal) {
      await repos.weights.upsertForDate({ id: newId(), date: today, weightKg: sk, source: 'manual' });
    }
    const user = await repos.user.get();
    if (user) {
      const simpleUpdates: Record<string, unknown> = {
        proteinGoalG: simpleProteinG,
        ...(weighCadence && { weightCadence: weighCadence }),
        weeklyWeightDay: weighCadence === 'weekly' ? weighDay : user.weeklyWeightDay,
      };
      if (offerHeight) simpleUpdates.heightCm = offerHeight;
      if (offerAge)    simpleUpdates.age       = offerAge;
      if (offerSex)    simpleUpdates.sex       = offerSex;
      if (localBmr > 0 && localBmr !== userBmr) simpleUpdates.bmr = localBmr;
      await repos.user.save({ ...user, ...simpleUpdates });
    }
    finishNav();
  }

  // ── Save: Custom ──────────────────────────────────────────────────────────
  async function create() {
    if (!valid) return;
    const sk = toKg(sNum);
    const goalType = type as GoalType;
    if (isMaintain) {
      const floorKg = toKg(rangeFloorNum), ceilKg = toKg(rangeCeilingNum);
      const midKg = (floorKg + ceilKg) / 2;
      const today = todayISO();
      await repos.goals.put({
        id: activeGoal?.id ?? newId(), name: name.trim() || 'New goal', type: 'maintain',
        startWeightKg: sk, targetWeightKg: midKg,
        startDate: startDate || today, targetDate: addDays(startDate || today, 3650),
        status: 'active', setupMode: 'custom',
        weightRangeFloorKg: floorKg, weightRangeCeilingKg: ceilKg,
        maintainBandId: weightBandChoice !== 'custom' ? weightBandChoice : undefined,
        surplusFloor: -detailedKcalBand, surplusCeiling: detailedKcalBand,
        reviewDate: reviewDate || undefined,
        trackingMode: macroStyle ? 'detailed' : 'simple',
        macroStyle: macroStyle ?? undefined,
        fatTargetG: macroStyle ? fatG : undefined,
        carbLimitG: macroStyle === 'lower_carb' ? carbLimitG : undefined,
      });
    } else {
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
    }
    // Log the starting weight for the start date (new goals only)
    if (!activeGoal) {
      await repos.weights.upsertForDate({ id: newId(), date: startDate || todayISO(), weightKg: sk, source: 'manual' });
    }
    const user = await repos.user.get();
    if (user) {
      const updates: Record<string, unknown> = { proteinGoalG: macroStyle ? proteinG : undefined };
      if (offerHeight) updates.heightCm = offerHeight;
      if (offerAge)    updates.age       = offerAge;
      if (offerSex)    updates.sex       = offerSex;
      if (localBmr > 0 && localBmr !== userBmr) updates.bmr = localBmr;
      if (weighCadence) updates.weightCadence = weighCadence;
      updates.weeklyWeightDay = weighCadence === 'weekly' ? weighDay : user.weeklyWeightDay;
      await repos.user.save({ ...user, ...updates });
    }
    finishNav();
  }

  async function handleCustomSave() {
    // Save profile fields immediately so they're never lost even if goal validation fails
    const profileUser = await repos.user.get();
    if (profileUser) {
      const profileUpdates: Record<string, unknown> = {};
      if (offerHeight) profileUpdates.heightCm = offerHeight;
      if (offerAge)    profileUpdates.age       = offerAge;
      if (offerSex)    profileUpdates.sex       = offerSex;
      if (localBmr > 0 && localBmr !== userBmr) profileUpdates.bmr = localBmr;
      if (Object.keys(profileUpdates).length > 0) {
        await repos.user.save({ ...profileUser, ...profileUpdates });
      }
    }
    const errs: typeof fieldErrors = {};
    if (isMaintain) {
      if (!start || sNum <= 0) errs.start = 'Enter your current weight';
      if (rangeCeilingNum <= rangeFloorNum) errs.target = 'Range max must be higher than range min';
      if (!startDate) errs.startDate = 'Enter a start date';
    } else {
      if (!start || sNum <= 0)          errs.start     = 'Enter a start weight';
      else if (!target || tNum <= 0)    errs.target    = 'Enter a target weight';
      else if (isGain  && tNum <= sNum) errs.target    = 'Target must be higher than start weight';
      else if (!isGain && tNum >= sNum) errs.target    = 'Target must be lower than start weight';
      if (!startDate) errs.startDate = 'Enter a start date';
      if (!date)      errs.date      = 'Enter a target date';
      else if (startDate && date <= startDate) errs.date = 'Target date must be after start date';
    }
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
    <>
    {/* Round 190 — a static peek of wherever "back" is headed, rendered
        UNDERNEATH the FullScreen below while its own slide-out-right exit
        plays. Without this, the exit animation revealed a blank
        bg-surface-sunken background for the ~280-320ms until dismiss()'s
        setTimeout actually navigated away — "slides out nicely, but to a
        white screen, then the first screen appears" per Marco. Only
        rendered during the exit itself (isExiting && fromFork): the rest
        of the time FullScreen's own opaque background fully covers it. */}
    {isExiting && fromFork && (
      isFirstOpen ? <FirstOpenForkBackdrop /> : <GoalForkBackdrop fromToday={fromToday} />
    )}
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
          {/* Sticky header — title/back button only (round 184). The
              segmented control used to live in here too, but this block has
              its own opaque bg-surface spanning the full row, which hid the
              info card's border wherever it poked up into the row — not just
              behind the pill. Moving the control into normal flow below (see
              next block) lets it and the info card scroll together with
              nothing opaque behind either of them. */}
          <div className={`sticky top-0 z-20 bg-surface transition-[box-shadow] duration-200${navScrolled ? ' shadow-nav' : ''}`}>
            <div className="pointer-events-none absolute left-0 right-0 bg-surface" style={{ bottom: '100%', height: 'var(--safe-top)' }} />
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
          </div>

          {/* Segmented control + merged info card (round 183/184, reviving
              the round-65 Tracking-step pattern on the now-dissolved Tracking
              screen). Both live in normal flow now — no sticky/opaque
              ancestor — so the card's -mt-[18px] pull-up has nothing behind
              it but the page itself, and only the pill's own opaque shape
              covers the card's border where the two actually overlap. */}
          <div className="flex justify-center px-4 pt-3">
            <SegmentedControl<SetupMode>
              value={setupMode}
              onChange={(m) => setSetupMode(m)}
              options={[{ value: 'simple', label: 'Guided' }, { value: 'custom', label: 'Detailed' }]}
            />
          </div>
          <div className="px-6">
            <div className="-mt-[18px] rounded-card border border-border-card-no-shadow px-4 pb-4 pt-6">
              <div className="flex items-start gap-2">
                <Icon name="info" size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-content-secondary" />
                <p className="text-callout text-content-secondary">
                  {setupMode === 'simple'
                    ? "We'll estimate your calories and macros based on your goal. You can fine-tune everything later."
                    : "Choose your own calorie and macro targets for more control. You can adjust them anytime."}
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 pb-8 pt-6">
            {/* ════ SIMPLE ════ */}
            {setupMode === 'simple' && (
              <div className="space-y-6">
                <div className="space-y-3">
                {/* Weight card */}
                <div className="overflow-hidden rounded-sheet border border-border-card-no-shadow bg-surface px-4 pt-6 pb-6">
                    <CardSectionHeader icon="weight">Weight</CardSectionHeader>
                    <div className="space-y-3">
                      {/* Units — first sub-field */}
                      <div>
                        <span className="text-subhead font-normal text-content-secondary">Units</span>
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
                          mode="single"
                          centerAt={units === 'lbs' ? 132 : 60} />
                        {fieldErrors.start && <p className="mt-1 text-footnote text-danger">{fieldErrors.start}</p>}
                      </div>
                      {!isMaintain && (
                        <div>
                          <WheelPicker label={`Target (${units})`} value={target}
                            onChange={(v) => { setTarget(v); setFieldErrors(p => ({ ...p, target: undefined })); }}
                            min={wMin} max={wMax} step={0.1} unit={units}
                            mode="single"
                            invalid={!!fieldErrors.target} centerAt={+start || (units === 'lbs' ? 154 : 70)} />
                          {fieldErrors.target && <p className="mt-1 text-footnote text-danger">{fieldErrors.target}</p>}
                        </div>
                      )}
                    </div>
                </div>

                {/* Pace card (maintain: "Range" instead of a pace) */}
                <div className="overflow-hidden rounded-sheet border border-border-card-no-shadow bg-surface px-4 pt-6 pb-6">
                    <CardSectionHeader icon="calendar">{isMaintain ? 'Range' : 'Pace'}</CardSectionHeader>
                    {isMaintain ? (
                      <FilterPills<MaintainBandId> value={maintainBand}
                        onChange={(v) => { if (v) setMaintainBand(v); }}
                        options={MAINTAIN_BANDS.map(b => ({ value: b.id, label: b.label }))} />
                    ) : isGain ? (
                      <FilterPills<GainPaceId> value={gainPace}
                        onChange={(v) => { if (v) setGainPace(v); }}
                        options={GAIN_PACES.map(p => ({ value: p.id, label: p.label }))} />
                    ) : (
                      <FilterPills<LosePaceId> value={losePace}
                        onChange={(v) => { if (v) setLosePace(v); }}
                        options={LOSE_PACES.map(p => ({ value: p.id, label: p.label }))} />
                    )}
                    {isMaintain && (() => {
                      const sk = toKg(sNum);
                      const floorDisp = toDisp(sk - maintainBandDef.weightRangeKg);
                      const ceilDisp  = toDisp(sk + maintainBandDef.weightRangeKg);
                      const unitLabel = units === 'lbs' ? 'lbs' : 'kg';
                      const rows = [
                        { label: 'Weight range',  value: `${floorDisp.toFixed(1)}–${ceilDisp.toFixed(1)} ${unitLabel}` },
                        { label: 'Daily calories', value: `±${maintainBandDef.kcalBand} kcal` },
                      ];
                      return (
                        <div className="mt-3 rounded-card border border-border-subtle bg-surface-sunken p-4 space-y-2" aria-live="polite">
                          {rows.map(({ label, value }) => (
                            <div key={label} className="flex items-center justify-between">
                              <span className="text-subhead text-content-secondary">{label}</span>
                              <span className="text-subhead font-semibold text-content">{value}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    {!isMaintain && derivedDate && (() => {
                      const today = todayISO();
                      const totalDays = Math.round((Date.parse(derivedDate + 'T00:00:00') - Date.parse(today + 'T00:00:00')) / 86400_000);
                      if (totalDays <= 0) return null;
                      const endDateStr = new Date(derivedDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
                      const durationStr = totalDays < 14 ? `${totalDays} days` : totalDays < 84 ? `${Math.round(totalDays / 7)} weeks` : `${Math.round(totalDays / 30)} months`;
                      if (isGain) {
                        const p = GAIN_PACES.find(p => p.id === gainPace)!;
                        const weeklyKg = Math.round((p.kgPerMonth / 4.33) * 100) / 100;
                        const weeklyDisp = units === 'lbs' ? `+${(weeklyKg * 2.20462).toFixed(2)} lbs` : `+${weeklyKg.toFixed(2)} kg`;
                        const rows = [
                          { label: 'Duration',        value: durationStr },
                          { label: 'End date',         value: endDateStr },
                          { label: 'Weekly target',    value: weeklyDisp },
                          { label: 'Daily surplus',    value: `+${p.surplusFloor} to +${p.surplusCeiling} kcal` },
                        ];
                        return (
                          <div className="mt-3 rounded-card border border-border-subtle bg-surface-sunken p-4 space-y-2" aria-live="polite">
                            {rows.map(({ label, value }) => (
                              <div key={label} className="flex items-center justify-between">
                                <span className="text-subhead text-content-secondary">{label}</span>
                                <span className="text-subhead font-semibold text-content">{value}</span>
                              </div>
                            ))}
                          </div>
                        );
                      }
                      const p = LOSE_PACES.find(p => p.id === losePace)!;
                      const kcal = Math.round((p.kgPerWeek * 7700) / 7);
                      const weeklyDisp = units === 'lbs' ? `${kgToLbs(p.kgPerWeek).toFixed(2)} lbs` : `${p.kgPerWeek} kg`;
                      const rows = [
                        { label: 'Duration',       value: durationStr },
                        { label: 'End date',        value: endDateStr },
                        { label: 'Weekly target',   value: weeklyDisp },
                        { label: 'Daily deficit',   value: `−${kcal} kcal` },
                      ];
                      return (
                        <div className="mt-3 rounded-card border border-border-subtle bg-surface-sunken p-4 space-y-2" aria-live="polite">
                          {rows.map(({ label, value }) => (
                            <div key={label} className="flex items-center justify-between">
                              <span className="text-subhead text-content-secondary">{label}</span>
                              <span className="text-subhead font-semibold text-content">{value}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                </div>
                </div>

                <Button size="lg" onClick={() => void createSimple()}>{editing ? 'Save changes' : 'Set my goal'}</Button>
              </div>
            )}

            {/* ════ CUSTOM ════ */}
            {setupMode === 'custom' && (
              <div>
                {/* Section 1: Your goal */}
                <section>
                  <p className="mb-4 text-title font-bold text-content">1. Your goal</p>

                  <div className="space-y-3">
                  {/* Goal name */}
                  <div className="overflow-hidden rounded-sheet border border-border-card-no-shadow bg-surface p-4">
                      <div className="flex items-baseline gap-2 mb-2"><span className="text-headline font-semibold text-content">Goal name</span><span className="text-footnote text-content-muted">(optional)</span></div>
                      <LabeledInput value={name} onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Summer Cut"
                        />
                  </div>

                  {/* Weight (Unit is first sub-field inside) */}
                  <div className="overflow-hidden rounded-sheet border border-border-card-no-shadow bg-surface p-4">
                      <CardSectionHeader icon="weight">Weight</CardSectionHeader>
                      <div className="space-y-3">
                        {/* Unit — first sub-field */}
                        <div>
                          <span className="text-subhead font-normal text-content-secondary">Units</span>
                          <div className="mt-1">
                            <FilterPills<Units>
                              value={units}
                              onChange={(u) => { if (u) void setUnitsVal(u); }}
                              options={[{ value: 'kg', label: 'Kg' }, { value: 'lbs', label: 'Lbs' }]}
                            />
                          </div>
                        </div>
                        <div>
                          <WheelPicker label={`${isMaintain ? 'Current' : 'Start'} (${units})`} value={start}
                            onChange={(v) => { setStart(v); setFieldErrors(p => ({ ...p, start: undefined })); }}
                            min={wMin} max={wMax} step={0.1} unit={units} invalid={!!fieldErrors.start}
                            mode="single"
                            centerAt={units === 'lbs' ? 132 : 60} />
                          {fieldErrors.start && <p className="mt-1 text-footnote text-danger">{fieldErrors.start}</p>}
                        </div>
                        {isMaintain ? (
                          <div>
                            <span className="block mb-1 text-subhead font-normal text-content-secondary">Weight range ({units})</span>
                            <button type="button"
                              onClick={() => { hapticLight(); setShowBandSheet(true); }}
                              className="flex w-full items-center justify-between rounded-field bg-surface-sunken px-3 py-2.5 text-subhead font-semibold text-content"
                            >
                              <span>{weightBandChoice === 'custom' ? 'Custom' : MAINTAIN_BANDS.find(b => b.id === weightBandChoice)!.label}</span>
                              <Icon name="chevronDown" size={16} className="text-content-muted" />
                            </button>
                            {weightBandChoice === 'custom' && (
                              <div className="mt-2 flex gap-2">
                                <WheelPicker label="Min" wrapClassName="flex-1" mode="single"
                                  value={rangeFloor !== '' ? rangeFloor : rangeFloorNum.toFixed(1)}
                                  onChange={setRangeFloor} min={wMin} max={wMax} step={0.1} unit={units} />
                                <WheelPicker label="Max" wrapClassName="flex-1" mode="single"
                                  value={rangeCeiling !== '' ? rangeCeiling : rangeCeilingNum.toFixed(1)}
                                  onChange={setRangeCeiling} min={wMin} max={wMax} step={0.1} unit={units} />
                              </div>
                            )}
                            {fieldErrors.target && <p className="mt-1 text-footnote text-danger">{fieldErrors.target}</p>}
                          </div>
                        ) : (
                          <div>
                            <WheelPicker label={`Target (${units})`} value={target}
                              onChange={(v) => { setTarget(v); setFieldErrors(p => ({ ...p, target: undefined })); }}
                              min={wMin} max={wMax} step={0.1} unit={units} invalid={!!fieldErrors.target}
                              mode="single"
                              centerAt={+start || (units === 'lbs' ? 154 : 70)}
                              />
                            {fieldErrors.target && <p className="mt-1 text-footnote text-danger">{fieldErrors.target}</p>}
                          </div>
                        )}

                        <div>
                          <span className="block mb-1 text-subhead font-normal text-content-secondary">Weigh-in frequency <span className="text-footnote text-content-muted">(optional)</span></span>
                          <FilterPills<'daily' | 'weekly'>
                            value={weighCadence}
                            onChange={(v) => { setWeighCadence(v); }}
                            options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }]}
                          />
                        </div>
                        {weighCadence === 'weekly' && (
                          <div>
                            <FilterPills<string>
                              value={String(weighDay)}
                              onChange={(v) => { if (v !== undefined) setWeighDay(Number(v)); }}
                              options={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, i) => ({ value: String(i), label }))}
                            />
                          </div>
                        )}
                      </div>
                  </div>

                  {/* Dates — maintain has no deadline, only an optional review-date reminder */}
                  <div className="overflow-hidden rounded-sheet border border-border-card-no-shadow bg-surface p-4">
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
                          <span className="block text-subhead text-content-secondary">
                            {isMaintain ? <>Review date <span className="text-footnote text-content-muted">(optional)</span></> : 'Target date'}
                          </span>
                          <div className="mt-1 overflow-hidden rounded-field bg-surface-sunken">
                            {isMaintain ? (
                              <input type="date" value={reviewDate} min={startDate || todayISO()}
                                onChange={(e) => setReviewDate(e.target.value)}
                                className="w-full bg-surface-sunken px-3 py-2.5 text-subhead text-content focus:outline-none" />
                            ) : (
                              <input type="date" value={date} min={startDate || todayISO()}
                                onChange={(e) => { setDate(e.target.value); setFieldErrors(p => ({ ...p, date: undefined })); }}
                                className="w-full bg-surface-sunken px-3 py-2.5 text-subhead text-content focus:outline-none" />
                            )}
                          </div>
                          {!isMaintain && fieldErrors.date && <p className="mt-1 text-footnote text-danger">{fieldErrors.date}</p>}
                        </div>
                      </div>
                  </div>
                  </div>

                  {/* Review your goal */}
                  <div className="mt-6">
                    <p className="mb-3 text-headline font-semibold text-content">Review your goal</p>
                    <div className={`overflow-hidden border border-border-subtle bg-surface p-5${(intensity || (isMaintain && weightValid)) ? ' shadow-card' : ''}`} style={{ borderRadius: 24 }}>
                      {isMaintain && weightValid ? (
                        <>
                          <p className="text-display font-bold text-center">{Math.round(safeBmr)} kcal</p>
                          <p className="text-center text-subhead text-content-secondary">estimated maintenance calories / day</p>
                          <div className="mt-3 rounded-field bg-surface-sunken px-3 py-2.5 text-center">
                            <p className="text-callout font-normal text-content">Daily calorie band</p>
                            <p className="text-callout font-semibold text-content">
                              {Math.round(safeBmr) - detailedKcalBand} – {Math.round(safeBmr) + detailedKcalBand} kcal
                            </p>
                          </div>
                          <div className="mt-3 rounded-field bg-surface-sunken px-3 py-2.5 text-center">
                            <p className="text-callout font-normal text-content">Weight range</p>
                            <p className="text-callout font-semibold text-content">
                              {rangeFloorNum.toFixed(1)} – {rangeCeilingNum.toFixed(1)} {units}
                            </p>
                          </div>
                        </>
                      ) : intensity ? (
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
                            <p className="text-callout font-normal text-content">
                              {isGain ? 'Daily surplus' : 'Daily deficit'}
                            </p>
                            <p className="text-callout font-semibold text-content">
                              {isGain
                                ? `+${effectiveMagnitude - 100} to +${effectiveMagnitude + 100} kcal`
                                : `–${effectiveMagnitude} kcal`}
                            </p>
                          </div>
                          <input type="range"
                            aria-label={isGain ? 'Daily calorie surplus' : 'Daily calorie deficit'}
                            min={sliderMin} max={sliderMax} step={10} value={effectiveMagnitude}
                            onChange={(e) => { setDeficitOverride(Number(e.target.value)); setSessionTouched(true); }}
                            className="mt-[2px] w-full accent-accent" style={{ touchAction: 'pan-x' }} />
                          <div className="mt-5"><PaceMeter level={intensity.level} kcalPerDay={effectiveMagnitude} /></div>
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
                        <p className="text-subhead text-content-muted">
                          {isMaintain ? 'Fill in your current weight to preview your goal.' : 'Fill in your details to preview your goal pace.'}
                        </p>
                      )}
                    </div>
                  </div>
                </section>

                {/* Divider */}
                <hr className="border-border-field mt-12 mb-12" />

                {/* Section 2: Details about you */}
                <section>
                  <div className="flex items-baseline gap-2 mb-1"><p className="text-title font-bold text-content">2. Details about you</p><span className="text-footnote text-content-muted">(optional)</span></div>
                  <p className="mb-4 text-subhead text-content-secondary">
                    Helps estimate your BMR more accurately. Affects calorie and macro targets.
                  </p>
                  <div className="overflow-hidden rounded-sheet border border-border-card-no-shadow bg-surface p-4">
                    <div className="space-y-3">
                      <NumberField
                        label="Height"
                        unit="cm"
                        value={offerHeight !== null ? String(offerHeight) : ''}
                        set={(v) => setOfferHeight(v ? Number(v) : null)}
                        placeholder="e.g. 175"
                      />
                      <NumberField
                        label="Age"
                        value={offerAge !== null ? String(offerAge) : ''}
                        set={(v) => setOfferAge(v ? Number(v) : null)}
                        placeholder="e.g. 30"
                      />
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
                  <div className="flex items-baseline gap-2 mb-1"><p className="text-title font-bold text-content">3. Tracking</p><span className="text-footnote text-content-muted">(optional)</span></div>
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
                      <div className="overflow-hidden rounded-sheet border border-border-card-no-shadow bg-surface pb-2">
                        <div className="px-4 pt-4 pb-3">
                          <p className="text-headline font-semibold text-content">Macro targets</p>
                        </div>
                        <MacroRow compact label="Protein target (g)" displayValue={`${proteinG} per day`}
                          editable isEditing={editingRow === 'protein'} value={proteinG}
                          min={Math.max(40, r5(sNum * 0.8))} max={r5(Math.max(sNum, 50) * 3.0)}
                          onEditToggle={() => setEditingRow(editingRow === 'protein' ? null : 'protein')}
                          onReset={() => { setProteinGState(null); setEditingRow(null); }}
                          onChange={setProteinGState} note={proteinNote(proteinG, sNum)} />
                        {macroStyle === 'balanced' && (() => {
                          // Round 169: body-weight baseline (see
                          // activityCarbTargetG) — no activity logged yet in
                          // this preview, so it shows the resting baseline only.
                          const carbG = activityCarbTargetG('balanced', sNum, 0);
                          return (
                            <>
                              <MacroRow compact label="Carb target (g)" displayValue={`Base ${carbG} g · adjusts with activity`} />
                              <MacroRow compact label="Fat target (g)" displayValue={`${fatG} per day`}
                                editable isEditing={editingRow === 'fat'} value={fatG}
                                min={10} max={r5(totalCal * 0.55 / 9)}
                                onEditToggle={() => setEditingRow(editingRow === 'fat' ? null : 'fat')}
                                onReset={() => { setFatGState(null); setEditingRow(null); }}
                                onChange={setFatGState} note={macroNote('balanced', 'fat', fatG, totalCal)} />
                            </>
                          );
                        })()}
                        {macroStyle === 'performance' && (() => {
                          // Round 169: same body-weight-baseline model, just a
                          // higher baseline/activity share ("more carbs around
                          // activity" — see CARB_MODEL in domain/goal.ts).
                          const carbG = activityCarbTargetG('performance', sNum, 0);
                          return (
                            <>
                              <MacroRow compact label="Carb target (g)" displayValue={`Base ${carbG} g · adjusts with activity`} />
                              <MacroRow compact label="Fat baseline (g)" displayValue={`${fatG} per day`}
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
                            <MacroRow compact label="Carb limit (g)" displayValue={`${carbLimitG} per day`}
                              editable isEditing={editingRow === 'carb'} value={carbLimitG}
                              min={20} max={r5(totalCal * 0.55 / 4)}
                              onEditToggle={() => setEditingRow(editingRow === 'carb' ? null : 'carb')}
                              onReset={() => { setCarbLimitGState(null); setEditingRow(null); }}
                              onChange={setCarbLimitGState} note={macroNote('lower_carb', 'carb', carbLimitG, totalCal)} />
                            <MacroRow compact label="Fat target (g)" displayValue="Adjusts with activity" />
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </section>

                <div className="mt-8">
                  <Button size="lg" onClick={() => void handleCustomSave()}>{editing ? 'Save changes' : 'Set my goal'}</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </FullScreen>

    {/* Weight-range band picker (maintain, Detailed mode) — tap the pill above to open */}
    {showBandSheet && (
      <Sheet title="Weight range" onClose={() => setShowBandSheet(false)}>
        <div className="pb-2">
          {([...MAINTAIN_BANDS, { id: 'custom' as const, label: 'Custom', weightRangeKg: 0, kcalBand: 0 }]).map((b) => (
            <button
              key={b.id}
              onClick={() => {
                hapticLight();
                if (b.id === 'custom' && weightBandChoice !== 'custom') {
                  // Seed the wheels with whatever range was showing, so they
                  // open on a sensible value instead of blank.
                  const seedDef = detailedBandDef ?? standardBandDef;
                  setRangeFloor(toDisp(toKg(sNum) - seedDef.weightRangeKg).toFixed(1));
                  setRangeCeiling(toDisp(toKg(sNum) + seedDef.weightRangeKg).toFixed(1));
                }
                setWeightBandChoice(b.id);
                setShowBandSheet(false);
              }}
              className="flex w-full items-center justify-between rounded-control px-3 py-3 text-left text-subhead text-content active:bg-surface-sunken"
            >
              <span>
                <span className="block font-semibold">{b.label}</span>
                {b.id !== 'custom' && (
                  <span className="block text-footnote text-content-secondary">
                    ±{b.weightRangeKg} {units} · ±{b.kcalBand} kcal
                  </span>
                )}
              </span>
              {weightBandChoice === b.id && <Icon name="check" size={18} strokeWidth={2.25} className="text-accent" />}
            </button>
          ))}
        </div>
      </Sheet>
    )}
    </>
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
  min = 10, max = 300, step = 5, onEditToggle, onReset, onChange, note, compact = false,
}: {
  label: string; displayValue: string; editable?: boolean; isEditing?: boolean;
  value?: number; min?: number; max?: number; step?: number;
  onEditToggle?: () => void; onReset?: () => void; onChange?: (v: number) => void;
  note?: string | null; compact?: boolean;
}) {
  return (
    <div className={compact ? "px-4 py-2.5" : "p-4"}>
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

function PaceMeter({ level, kcalPerDay = 0 }: { level: 'gentle' | 'moderate' | 'aggressive'; kcalPerDay?: number }) {
  // Continuous scale: 0 kcal/day = 0%, 1200 kcal/day = 100% (capped).
  // Zone boundaries: gentle <350 kcal ≈ <0.35 kg/week, moderate 350–750, aggressive >750.
  const MAX_KCAL = 1200;
  const pct = Math.min(100, Math.round((kcalPerDay / MAX_KCAL) * 100));
  return (
    <div>
      <div className="relative h-2 rounded-pill bg-surface-sunken">
        <div
          className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-accent"
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="mt-1.5 grid grid-cols-3 text-footnote">
        <span className={`text-left  ${level === 'gentle'     ? 'font-semibold text-content' : 'text-content-muted'}`}>Gentle</span>
        <span className={`text-center ${level === 'moderate'  ? 'font-semibold text-content' : 'text-content-muted'}`}>Moderate</span>
        <span className={`text-right  ${level === 'aggressive' ? 'font-semibold text-content' : 'text-content-muted'}`}>Aggressive</span>
      </div>
    </div>
  );
}

