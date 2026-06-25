import { useRef, useState, useLayoutEffect, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import type { DayContext } from '../AppShell';
import { hapticLight } from '../../lib/haptics';
import { useLive } from '../../state/live';
import { repos } from '../../state/repos';
import { useDay } from '../../state/useDay';
import { todayISO, addDays, newId } from '../../data/ids';
import { getMondayOfWeek, fmtDiaryDate } from '../../lib/date';
import { nutritionFor, effectiveNutrition, calcDigestionCalories } from '../../domain/calc';
import { requiredDailyDeficit, isGainGoal } from '../../domain/goal';
import { mifflinStJeorBMR } from '../../domain/bmr';
import { onDecimalChange } from '../../lib/num';
import { kgToLbs } from '../../domain/units';
import { prefersReducedMotion } from '../../lib/motion';
import {
  Card, QuickLogCard, Badge, Button, LabeledInput, NumberField, WheelPicker,
  Icon, GaugeArc, Sheet, Skeleton, ProgressBar, ServingStepper, FilterPills,
} from '../kit';
import { WeightLogSheet } from '../components/WeightLogSheet';
import type { ShowToast } from '../components/Toaster';
import type { NutritionSnapshot } from '../../domain/types';
import { Thumb } from '../components/PhotoPicker';
import type { FoodEntry, FoodItem, WeightEntry, ActivityEntry, Goal, Sex, User } from '../../domain/types';
import { ScanResults } from '../components/AddEntrySheet';
import type { ResultItem } from '../components/AddEntrySheet';

const FREQUENT_MIN_LOGS = 3;
const FREQUENT_MIN_FOODS = 3;
const GAUGE_RANGE = 500;
const reminderKey = (date: string) => `weightReminderDismissed_${date}`;

// ── Outer shell: fixed header + 3-panel carousel ──────────────────────────────

export function TodayScreen() {
  const { date, setDate } = useOutletContext<DayContext>();

  // Shared data — fetched once, passed to each panel
  const goal          = useLive(() => repos.goals.getActive(), []);
  const allGoals      = useLive(() => repos.goals.getAll(), []) ?? [];
  const user          = useLive(() => repos.user.get(), []);
  const items         = useLive(() => repos.foodItems.all(), []) ?? [];
  const weights       = useLive(() => repos.weights.all(), []) ?? [];
  const freqIds       = useLive(() => repos.foodEntries.frequentItemIds(4, FREQUENT_MIN_LOGS), []) ?? [];
  const frequentFoods = freqIds
    .map((id) => items.find((i) => i.id === id))
    .filter((i): i is FoodItem => !!i);

  // Weekly data for strip indicators — fetch 3 weeks so adjacent weeks render during drag.
  const monday      = getMondayOfWeek(date);
  const prevMonday  = addDays(monday, -7);
  const stripEnd    = addDays(monday, 13); // next week's Sunday
  const weekFoods   = useLive(() => repos.foodEntries.byDateRange(prevMonday, stripEnd), [prevMonday, stripEnd]) ?? [];
  const weekActs    = useLive(() => repos.activities.byDateRange(prevMonday, stripEnd), [prevMonday, stripEnd]) ?? [];

  // Compute per-day state for all 21 days (prev + current + next week).
  const bmr         = user?.bmr ?? 0;
  const dailyTarget = goal ? requiredDailyDeficit(goal) : 0; // signed: negative for gain
  const gainGoal    = goal ? isGainGoal(goal) : false;
  const stripDays   = Array.from({ length: 21 }, (_, i) => addDays(prevMonday, i));
  const today       = todayISO();

  // Most recently ended/completed goal (used when no active goal).
  const pastGoal = !goal
    ? [...allGoals]
        .filter((g) => g.status === 'completed' || g.status === 'abandoned')
        .sort((a, b) => (b.targetDate > a.targetDate ? 1 : -1))[0]
    : undefined;

  type DayState = 'succeed' | 'fail' | 'succeed-past' | 'fail-past' | 'no-info' | 'not-completed' | 'future';
  const dayStates: Record<string, DayState> = {};
  for (const d of stripDays) {
    if (d > today) {
      dayStates[d] = 'future';
    } else if (d === today) {
      dayStates[d] = 'not-completed';
    } else {
      const foods    = weekFoods.filter((e) => e.date === d);
      const acts     = weekActs.filter((a) => a.date === d);
      if (foods.length === 0 && acts.length === 0) {
        dayStates[d] = 'no-info';
      } else {
        const consumed   = foods.reduce((s, e) => s + (e.snapshot?.calories ?? 0), 0);
        const actCals    = acts.reduce((s, a) => s + a.activeCalories, 0);
        const digestion  = calcDigestionCalories(foods);
        const deficit    = (bmr + actCals + digestion) - consumed;

        if (goal) {
          // Active goal: normal succeed/fail.
          if (gainGoal) {
            // Gain: succeed only when consumed is within the surplus floor–ceiling band.
            const totalBurnD = bmr + actCals + digestion;
            const floorEff   = goal.surplusFloor  != null ? goal.surplusFloor  : Math.max(50, Math.abs(dailyTarget) - 100);
            const ceilEff    = goal.surplusCeiling != null ? goal.surplusCeiling : Math.abs(dailyTarget) + 100;
            dayStates[d] = consumed >= totalBurnD + floorEff && consumed <= totalBurnD + ceilEff ? 'succeed' : 'fail';
          } else {
            dayStates[d] = deficit >= dailyTarget ? 'succeed' : 'fail';
          }
        } else if (pastGoal && d >= pastGoal.startDate && d <= pastGoal.targetDate) {
          // Past goal: succeed/fail but visually desaturated ("past" variant).
          const pTarget  = requiredDailyDeficit(pastGoal);
          const pGain    = isGainGoal(pastGoal);
          if (pGain) {
            const totalBurnD = bmr + actCals + digestion;
            const floorEff   = (pastGoal as Goal).surplusFloor  != null ? (pastGoal as Goal).surplusFloor! : Math.max(50, Math.abs(pTarget) - 100);
            const ceilEff    = (pastGoal as Goal).surplusCeiling != null ? (pastGoal as Goal).surplusCeiling! : Math.abs(pTarget) + 100;
            dayStates[d] = consumed >= totalBurnD + floorEff && consumed <= totalBurnD + ceilEff ? 'succeed-past' : 'fail-past';
          } else {
            dayStates[d] = deficit >= pTarget ? 'succeed-past' : 'fail-past';
          }
        } else {
          dayStates[d] = 'no-info';
        }
      }
    }
  }

  // ── Carousel ────────────────────────────────────────────────────────────────
  const carouselRef  = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null);
  // Non-passive touchmove listener — allows e.preventDefault() to block
  // vertical scroll during a horizontal carousel swipe.
  //
  // WHY duplicate the direction detection here: React event handlers run at
  // the document root (delegation), so this native listener fires FIRST.
  // Previously, on the initial significant touchmove `horizontal` was still
  // null when this ran → no preventDefault → one frame where both axes moved
  // freely. Running detection here too means we lock AND prevent on the
  // exact same event, closing that gap.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onMove = (e: TouchEvent) => {
      const d = drag.current;
      if (!d) return;
      if (d.horizontal === null) {
        const dx = e.touches[0].clientX - d.x;
        const dy = e.touches[0].clientY - d.y;
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
          d.horizontal = Math.abs(dx) > Math.abs(dy);
        }
      }
      if (d.horizontal === true) e.preventDefault();
    };
    el.addEventListener('touchmove', onMove, { passive: false });
    return () => el.removeEventListener('touchmove', onMove);
  }, []);

  // Reset strip to center before the browser paints when date changes.
  useLayoutEffect(() => {
    if (carouselRef.current) {
      carouselRef.current.style.transition = 'none';
      carouselRef.current.style.transform  = 'translateX(-33.333%)';
    }
  }, [date]);

  function onTouchStart(e: React.TouchEvent) {
    drag.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, horizontal: null };
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!drag.current || !carouselRef.current) return;
    const dx = e.touches[0].clientX - drag.current.x;
    const dy = e.touches[0].clientY - drag.current.y;

    if (drag.current.horizontal === null) {
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6)
        drag.current.horizontal = Math.abs(dx) > Math.abs(dy);
      return;
    }
    if (!drag.current.horizontal) return;

    const goalStartDate = goal?.startDate ?? null;
    const atFuture      = addDays(date, 1) > today;
    const atGoalStart   = goalStartDate ? date <= goalStartDate : false;
    const atEdge        = (dx < 0 && atFuture) || (dx > 0 && atGoalStart);
    // At a boundary: allow drag with 0.35 resistance (rubber-band) instead of hard stop.
    const visual        = atEdge ? dx * 0.35 : dx;
    carouselRef.current.style.transition = 'none';
    carouselRef.current.style.transform  = `translateX(calc(-33.333% + ${visual}px))`;
  }

  // iOS fires touchcancel (not touchend) when it steals the gesture for the
  // home-bar swipe or app switcher. Snap back to centre so the carousel is
  // never left at an arbitrary offset when the user returns to the app.
  function onTouchCancel() {
    drag.current = null;
    if (!carouselRef.current) return;
    carouselRef.current.style.transition = 'transform 280ms cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    carouselRef.current.style.transform  = 'translateX(-33.333%)';
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (!drag.current || !carouselRef.current) return;
    const dx     = e.changedTouches[0].clientX - drag.current.x;
    const wasH   = drag.current.horizontal === true;
    drag.current = null;
    const el     = carouselRef.current;

    // Normal spring-back (swipe too small): bouncy spring.
    // Boundary spring-back (rubber-band snapping back): soft damped easing.
    const springBack = (soft = false) => {
      el.style.transition = soft
        ? 'transform 280ms cubic-bezier(0.25, 0.46, 0.45, 0.94)'
        : 'transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1)';
      el.style.transform  = 'translateX(-33.333%)';
    };

    if (!wasH || Math.abs(dx) < 50) { springBack(); return; }

    const goalStartDate = goal?.startDate ?? null;
    const goingBack = dx > 0;
    if (!goingBack && addDays(date, 1) > today) { springBack(true); return; }
    if (goingBack && goalStartDate && date <= goalStartDate) { springBack(true); return; }

    const newDate    = goingBack ? addDays(date, -1) : addDays(date, 1);
    const snapTarget = goingBack ? 'translateX(0)' : 'translateX(-66.666%)';

    el.style.transition = 'transform 220ms cubic-bezier(0.4, 0, 0.2, 1)';
    el.style.transform  = snapTarget;
    setTimeout(() => setDate(newDate), 220);
  }

  return (
    <div>
      {/* ── Header: title + week strip (scrolls with content) ───────────────── */}
      <div className="px-6 pt-4 mb-2">
        <div className="flex items-end justify-between">
          <h1 className="text-title font-semibold text-content">Diary</h1>
          <div className="flex items-center gap-1.5 pb-0.5">
            <Icon name="calendar" size={14} className="text-content-secondary" />
            <span className="text-subhead text-content-secondary">{fmtDiaryDate(date)}</span>
          </div>
        </div>
      </div>
      <WeekStrip date={date} setDate={setDate} dayStates={dayStates}
        goalStartDate={goal?.startDate ?? null} />

      {/* ── Carousel + day content ─────────────────────────────────────────── */}
      <div className="pb-6">
        {/* Carousel container — overflow:hidden clips side panels;
            non-passive native listener handles axis locking. */}
        <div
          ref={containerRef}
          style={{ overflow: 'hidden', paddingTop: '24px', marginTop: '-24px' }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchCancel}
        >
          <div ref={carouselRef} style={{ display: 'flex', width: '300%' }}>
            {[addDays(date, -1), date, addDays(date, 1)].map((d) => (
              <div key={d} style={{ width: '33.333%', flexShrink: 0 }}>
                <DayPanel
                  date={d}
                  items={items}
                  weights={weights}
                  frequentFoods={frequentFoods}
                  dailyTarget={dailyTarget}
                  proteinGoalG={user?.proteinGoalG ?? 0}
                  isActive={d === date}
                  gainGoal={gainGoal}
                  goal={goal}
                  macroStyle={goal?.macroStyle}
                  fatTargetG={goal?.fatTargetG}
                  carbLimitG={goal?.carbLimitG}
                  diaryShowProtein={goal?.diaryShowProtein}
                  diaryShowCarbs={goal?.diaryShowCarbs}
                  diaryShowFat={goal?.diaryShowFat}
                  weightCadence={user?.weightCadence ?? 'weekly'}
                  weeklyWeightDay={user?.weeklyWeightDay ?? 0}
                  units={user?.units ?? 'kg'}
                  hasPastGoal={!!pastGoal}
                  profileUser={user}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Macro progress bars ───────────────────────────────────────────────────────

/** Single macro column: label top, number middle, progress bar bottom.
 *  Used in horizontal MacroBarsRow layout. */
function MacroCol({
  label, consumed, targetG = 0,
}: { label: string; consumed: number; targetG?: number }) {
  const hasTarget = targetG > 0;
  const achieved  = hasTarget && consumed >= targetG;
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-footnote text-content-secondary">{label}</span>
        <span className="flex items-center gap-0.5 text-footnote text-content">
          {achieved && <Icon name="daySucceed" size={13} className="text-success" />}
          <span className="font-semibold">{consumed}</span>
        </span>
      </div>
      <div className="mt-1">
        <ProgressBar value={hasTarget ? Math.min(1, consumed / targetG) : 0} />
      </div>
    </div>
  );
}

/** Vertically-stacked macro row for the detail sheet. */
function MacroDetailRow({ label, consumed, targetG = 0 }: {
  label: string; consumed: number; targetG?: number;
}) {
  const hasTarget = targetG > 0;
  const achieved  = hasTarget && consumed >= targetG;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-subhead text-content-secondary">{label}</span>
        <span className="flex items-center gap-1 text-subhead text-content">
          {achieved && <Icon name="daySucceed" size={14} className="text-success" />}
          <span className="font-semibold">{consumed} g</span>
          {hasTarget && <span className="text-content-muted"> / {targetG} g</span>}
        </span>
      </div>
      <ProgressBar value={hasTarget ? Math.min(1, consumed / targetG) : 0} />
    </div>
  );
}

/** Full-screen sheet showing all three macros stacked vertically. */
function MacroDetailSheet({
  protein, proteinGoal, carbs, fat,
  macroStyle, fatTarget = 0, carbLimit = 0,
  onClose,
}: {
  protein: number; proteinGoal: number;
  carbs: number; fat: number;
  macroStyle?: string; fatTarget?: number; carbLimit?: number;
  onClose: () => void;
}) {
  const carbTarget = carbLimit; // pre-computed per mode in DayPanel
  const fatTargetEff = (macroStyle === 'balanced' || macroStyle === 'performance') ? fatTarget : 0;
  return (
    <Sheet title="Macros" onClose={onClose}>
      <div className="px-4 pb-6 space-y-5">
        <MacroDetailRow label="Protein" consumed={protein} targetG={proteinGoal} />
        <MacroDetailRow label="Carbs"   consumed={carbs}   targetG={carbTarget} />
        <MacroDetailRow label="Fat"     consumed={fat}     targetG={fatTargetEff} />
      </div>
    </Sheet>
  );
}

/** Shown at the bottom of the gauge card. Macros are laid out horizontally.
 *  Protein shown when proteinGoal > 0; carbs + fat when macroStyle is set.
 *  Individual macros can be hidden via diary show flags.
 *  Tapping anywhere opens the MacroDetailSheet via onExpand. */
function MacroBarsRow({
  protein, proteinGoal,
  carbs, fat,
  gainDetailed = false,
  macroStyle,
  fatTarget = 0,
  carbLimit = 0,
  showProtein,
  showCarbs,
  showFat,
  onExpand,
}: {
  protein: number; proteinGoal: number;
  carbs: number; fat: number;
  gainDetailed?: boolean;
  macroStyle?: string;
  fatTarget?: number;
  carbLimit?: number;
  showProtein?: boolean;
  showCarbs?: boolean;
  showFat?: boolean;
  onExpand?: () => void;
}) {
  const wantProtein = proteinGoal > 0 && (showProtein !== false);
  // Default visibility per tracking mode: carbs only for lower_carb, fat only for balanced/performance.
  // showCarbs/showFat undefined = use per-mode default; true/false = explicit user override.
  const carbsDefault = gainDetailed; // all detailed modes have a computable carb target
  const fatDefault   = macroStyle === 'balanced' || macroStyle === 'performance';
  const wantCarbs    = gainDetailed && (showCarbs ?? carbsDefault);
  const wantFat      = gainDetailed && (showFat   ?? fatDefault);
  if (!wantProtein && !wantCarbs && !wantFat) return null;
  return (
    <button
      onClick={() => { hapticLight(); onExpand?.(); }}
      className="w-full text-left active:opacity-70 transition-opacity"
      aria-label="View macro details"
    >
      <div className="flex gap-4 px-6 pt-3 pb-5">
        {wantProtein && (
          <MacroCol label="Protein" consumed={Math.round(protein)} targetG={proteinGoal} />
        )}
        {wantCarbs && (
          <MacroCol
            label="Carbs"
            consumed={Math.round(carbs)}
            targetG={carbLimit}
          />
        )}
        {wantFat && (
          <MacroCol
            label="Fat"
            consumed={Math.round(fat)}
            targetG={macroStyle === 'balanced' || macroStyle === 'performance' ? fatTarget : 0}
          />
        )}
      </div>
    </button>
  );
}

// ── Week strip ────────────────────────────────────────────────────────────────

const WEEK_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

type DayState = 'succeed' | 'fail' | 'succeed-past' | 'fail-past' | 'no-info' | 'not-completed' | 'future';

// ── Day-state indicator icons (24×24, matching uploaded assets) ───────────────

/** Solid thin circle — "current day, not yet logged" (current.svg) */
function CurrentDayRing({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

/** Dashed circle — "past day, nothing logged" (empty.svg) */
function EmptyDayRing({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
    </svg>
  );
}

/** Faded circle — "future / disabled day" (disable.svg) */
function DisabledDayRing({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1" opacity="0.2" />
    </svg>
  );
}

function WeekStrip({
  date, setDate, dayStates, goalStartDate,
}: {
  date: string;
  setDate: (d: string) => void;
  dayStates: Record<string, DayState>;
  goalStartDate: string | null;
}) {
  const today       = todayISO();
  const monday      = getMondayOfWeek(date);
  const todayMonday = getMondayOfWeek(today);
  const prevMonday  = addDays(monday, -7);
  const nextMonday  = addDays(monday,  7);

  const trackRef = useRef<HTMLDivElement>(null);
  const swipe    = useRef<{ x: number } | null>(null);

  // Reset track to center before paint whenever the displayed WEEK changes.
  // Keyed on monday so tapping a different day within the same week doesn't jump.
  useLayoutEffect(() => {
    if (trackRef.current) {
      trackRef.current.style.transition = 'none';
      trackRef.current.style.transform  = 'translateX(-33.333%)';
    }
  }, [monday]);

  // Boundary flags — compare by WEEK (monday) not raw date.
  // This fixes the bug where e.g. being on Thursday in week 2 blocked forward
  // navigation to week 3 (the current week) because Thursday+7 > today.
  const atFutureEdge = monday >= todayMonday;
  const atGoalEdge   = !!goalStartDate && prevMonday < getMondayOfWeek(goalStartDate);

  function onStripTouchStart(e: React.TouchEvent) {
    if (trackRef.current) trackRef.current.style.transition = 'none';
    swipe.current = { x: e.touches[0].clientX };
  }

  function onStripTouchMove(e: React.TouchEvent) {
    if (!swipe.current || !trackRef.current) return;
    const dx        = e.touches[0].clientX - swipe.current.x;
    const goingBack = dx > 0;
    const atEdge    = (goingBack && atGoalEdge) || (!goingBack && atFutureEdge);
    trackRef.current.style.transform =
      `translateX(calc(-33.333% + ${atEdge ? dx * 0.20 : dx}px))`;
  }

  function onStripTouchCancel() {
    swipe.current = null;
    if (!trackRef.current) return;
    trackRef.current.style.transition = 'transform 280ms cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    trackRef.current.style.transform  = 'translateX(-33.333%)';
  }

  function onStripTouchEnd(e: React.TouchEvent) {
    if (!swipe.current || !trackRef.current) return;
    const el        = trackRef.current;
    const dx        = e.changedTouches[0].clientX - swipe.current.x;
    swipe.current   = null;
    const goingBack = dx > 0;
    const canGo     = goingBack ? !atGoalEdge : !atFutureEdge;

    if (Math.abs(dx) >= 20 && canGo) {
      // Commit: slide adjacent panel fully into view, then update date.
      // useLayoutEffect resets track to center once date/monday changes.
      el.style.transition = 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1)';
      el.style.transform  = `translateX(${goingBack ? '0%' : '-66.666%'})`;
      const rawTarget = addDays(date, goingBack ? -7 : 7);
      // Clamp both edges so we never land on a disabled day:
      // • going back into the goal's first week → clamp to goalStartDate
      // • going forward into the current week where the target falls after today → clamp to today
      let target = rawTarget;
      if (goingBack && goalStartDate && target < goalStartDate) target = goalStartDate;
      if (!goingBack && target > today) target = today;
      setTimeout(() => setDate(target), 200);
    } else {
      el.style.transition = 'transform 280ms cubic-bezier(0.25, 0.46, 0.45, 0.94)';
      el.style.transform  = 'translateX(-33.333%)';
    }
  }

  // Render 7 day buttons for a given week's Monday.
  function renderWeekPanel(weekMonday: string) {
    return Array.from({ length: 7 }, (_, i) => {
      const day               = addDays(weekMonday, i);
      const isSelected        = day === date;
      const isToday           = day === today;
      const isFuture          = day > today;
      const isBeforeGoalStart = goalStartDate ? day < goalStartDate : false;
      const isDisabled        = isFuture || isBeforeGoalStart;
      const state             = dayStates[day] ?? (isFuture ? 'future' : 'no-info');

      return (
        <button
          key={day}
          disabled={isDisabled}
          onClick={() => { hapticLight(); setDate(day); }}
          // w-9 fixes the active-state width to match the selected-pill width (w-9).
          // No transition: instant press/release prevents the reverse-animation
          // artifact that looks like a rollback outline in WKWebView.
          // appearance-none + bg-transparent strip native -webkit-appearance:button.
          className={`relative flex flex-col items-center w-9 rounded-[18px] outline-none bg-transparent appearance-none before:absolute before:content-[''] before:-inset-x-1 before:inset-y-0 ${isDisabled ? 'opacity-30 cursor-default' : 'active:bg-surface-sunken'}`}
        >
          {/* Pill — always 36px wide (w-full = button's w-9).
               Border always present as transparent so there is no "border
               appearing" frame during the selected → default transition.
               transition-all animates bg-color + border-color smoothly. */}
          <div
            className={[
              'flex flex-col items-center gap-1 rounded-[18px] px-2 py-1.5 transition-all w-full border',
              isSelected ? 'bg-surface border-border-subtle shadow-card' : 'bg-transparent border-transparent',
            ].join(' ')}
          >
            <span className={[
              'text-label transition',
              isSelected
                ? 'font-semibold text-content'
                : isToday
                  ? 'text-content font-bold'
                  : 'text-content-secondary font-medium',
            ].join(' ')}>
              {WEEK_LETTERS[i]}
            </span>
            <span className="flex h-6 w-6 items-center justify-center text-content">
              {isDisabled
                ? <DisabledDayRing size={24} />
                : state === 'succeed'       ? <Icon name="daySucceed" size={24} className="text-accent" />
                : state === 'fail'          ? <Icon name="dayFail"    size={24} className="text-content" />
                : state === 'succeed-past'  ? <span className="opacity-40"><Icon name="daySucceed" size={24} className="text-accent" /></span>
                : state === 'fail-past'     ? <span className="opacity-40"><Icon name="dayFail"    size={24} className="text-content" /></span>
                : state === 'not-completed' ? <CurrentDayRing size={24} />
                : <span className="text-content-muted"><EmptyDayRing size={24} /></span>}
            </span>
          </div>
        </button>
      );
    });
  }

  return (
    // overflow-hidden clips prev/next panels; no horizontal padding here —
    // each panel carries its own px-6 so the 3-panel layout tiles correctly.
    <div
      className="bg-surface-muted overflow-hidden pt-2 pb-1"
      onTouchStart={onStripTouchStart}
      onTouchMove={onStripTouchMove}
      onTouchEnd={onStripTouchEnd}
      onTouchCancel={onStripTouchCancel}
    >
      {/* Track: 3 panels wide. Starts at -33.333% to show center panel. */}
      <div
        ref={trackRef}
        style={{ display: 'flex', width: '300%', transform: 'translateX(-33.333%)' }}
      >
        {[prevMonday, monday, nextMonday].map((mon) => (
          <div key={mon} style={{ width: '33.333%', flexShrink: 0 }} className="px-6">
            <div className="flex justify-between">
              {renderWeekPanel(mon)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Day panel (one per carousel slot) ────────────────────────────────────────

interface DayPanelProps {
  date: string;
  hasPastGoal?: boolean;
  items: FoodItem[];
  weights: WeightEntry[];
  frequentFoods: FoodItem[];
  dailyTarget: number;
  proteinGoalG: number;
  isActive: boolean;
  gainGoal?: boolean;
  /** Full goal object — used for surplusFloor/surplusCeiling range logic. */
  goal?: Goal | null;
  /** For gain goals in detailed tracking — drives macro bar display. */
  macroStyle?: string;
  fatTargetG?: number;
  carbLimitG?: number;
  diaryShowProtein?: boolean;
  diaryShowCarbs?: boolean;
  diaryShowFat?: boolean;
  weightCadence?: 'daily' | 'weekly';
  weeklyWeightDay?: number;
  units?: 'kg' | 'lbs';
  profileUser?: User | null;
}

function DayPanel({ date, items, weights, frequentFoods, dailyTarget, proteinGoalG, isActive, gainGoal = false, goal = null, macroStyle, fatTargetG, carbLimitG, diaryShowProtein, diaryShowCarbs, diaryShowFat, weightCadence = 'weekly', weeklyWeightDay = 0, units = 'kg', hasPastGoal = false, profileUser = null }: DayPanelProps) {
  const nav = useNavigate();
  const ctx = useOutletContext<DayContext>();
  const [editFood,          setEditFood]          = useState<FoodEntry | null>(null);
  const [editMeal,          setEditMeal]          = useState<FoodEntry | null>(null);
  const [editActivity,      setEditActivity]      = useState<ActivityEntry | null>(null);
  const [showWeightSheet,   setShowWeightSheet]   = useState(false);
  const [showBreakdown,     setShowBreakdown]     = useState(false);
  const [showProfileSetup,  setShowProfileSetup]  = useState(false);
  const [showMacroDetail,   setShowMacroDetail]   = useState(false);
  const [reminderDismissed, setReminderDismissed] = useState(
    () => localStorage.getItem(reminderKey(todayISO())) === '1',
  );
  const day = useDay(date);

  const isToday = date === todayISO();
  const showFrequent = frequentFoods.length >= FREQUENT_MIN_FOODS;
  const todayWeightEntry = weights.find((w) => w.date === todayISO());
  const isAfter8pm = new Date().getHours() >= 20;
  // Gate reminder to the user's chosen weigh-in day.
  // weeklyWeightDay: 0=Mon…6=Sun; JS Date.getDay(): 0=Sun…6=Sat
  const todayJsDay = new Date().getDay(); // 0=Sun
  const todayDowIndex = todayJsDay === 0 ? 6 : todayJsDay - 1; // convert to 0=Mon
  const isWeighInDay = weightCadence === 'daily' || todayDowIndex === weeklyWeightDay;
  const showWeightReminder = isToday && isAfter8pm && !todayWeightEntry && !reminderDismissed && isWeighInDay;
  function dismissReminder() {
    localStorage.setItem(reminderKey(todayISO()), '1');
    setReminderDismissed(true);
  }

  // ── Gauge animation ──────────────────────────────────────────────────────
  // gaugeDisplay drives the arc. It animates 0 → real value when the panel
  // becomes visible, and resets to 0 when it goes off-screen so the next
  // visit re-plays the animation.
  const [gaugeDisplay, setGaugeDisplay] = useState(0);
  const anim = useRef({ activated: false, inPhase: false });

  const { consumed = 0, totalBurn = 0, protein = 0 } = day?.summary ?? {};
  const carbs = day ? Math.round(day.foods.reduce((s, f) => s + effectiveNutrition(f, day.itemsById).carbs, 0)) : 0;
  const fat   = day ? Math.round(day.foods.reduce((s, f) => s + effectiveNutrition(f, day.itemsById).fat,   0)) : 0;
  const bmrIsEstimated = day?.bmrIsEstimated ?? false;
  const actCals    = day?.activities.reduce((s, a) => s + a.activeCalories, 0) ?? 0;
  const hasGoal    = dailyTarget !== 0; // active goal exists (regardless of BMR)
  const hasTarget  = hasGoal && totalBurn > 0; // has enough info for full numbers
  const budget     = Math.max(0, totalBurn - dailyTarget);
  const left       = Math.round(budget - consumed);
  const gaugeRange = budget > 0 ? budget : GAUGE_RANGE;
  const gaugeValue = Math.max(-1, Math.min(1, left / gaugeRange));
  const isPastDay  = date < todayISO();

  // Effective carb target, computed the same way GoalSetupScreen shows it:
  //   lower_carb  → explicit carbLimitG (falls back to ~25% of target kcal)
  //   balanced / performance → residual: (targetKcal − protein_kcal − fat_kcal) ÷ 4
  //     ("Adjusts with activity" in setup — so we recompute daily from live totalBurn)
  const targetKcal = totalBurn > 0 ? totalBurn - dailyTarget : 0; // lose: +deficit, gain: +surplus
  const effectiveCarbLimit: number = (() => {
    if (!macroStyle || targetKcal <= 0) return 0;
    if (macroStyle === 'lower_carb') {
      return carbLimitG
        ? carbLimitG
        : Math.max(20, Math.round(targetKcal * 0.25 / 4 / 5) * 5);
    }
    // balanced / performance: residual kcal → grams
    return Math.max(0, Math.round((targetKcal - proteinGoalG * 4 - (fatTargetG ?? 0) * 9) / 4));
  })();

  // ── Macro section visibility ────────────────────────────────────────────────
  // Mirror the MacroBarsRow visibility logic so the container only renders
  // when at least one bar will actually show. Respects diary toggle flags;
  // simple-mode goals default those flags to false until user turns them on.
  const showMacroSection = (() => {
    const wantProtein = proteinGoalG > 0 && diaryShowProtein !== false;
    const gainDetailed = !!macroStyle;
    const wantCarbs = gainDetailed && (diaryShowCarbs ?? gainDetailed);
    const wantFat   = gainDetailed && (diaryShowFat   ?? (macroStyle === 'balanced' || macroStyle === 'performance'));
    return wantProtein || wantCarbs || wantFat;
  })();

  // ── Gain goal zone computation ─────────────────────────────────────────────
  // Floor/ceiling surplus range. Falls back to |dailyTarget| ± 100 for old goals.
  const gainFloorEff    = gainGoal ? (goal?.surplusFloor  != null ? goal.surplusFloor  : Math.max(50, Math.abs(dailyTarget) - 100)) : 0;
  const gainCeilEff     = gainGoal ? (goal?.surplusCeiling != null ? goal.surplusCeiling : Math.abs(dailyTarget) + 100) : 0;
  const gainFloorBudget = totalBurn + gainFloorEff;
  const gainCeilBudget  = totalBurn + gainCeilEff;
  type GainZone = 'below' | 'in' | 'above';
  const gainZone: GainZone = gainGoal
    ? (consumed < gainFloorBudget ? 'below' : consumed <= gainCeilBudget ? 'in' : 'above')
    : 'below'; // unused for lose
  // Zone-specific display number and label for the gauge center.
  // Round consumed once so this matches BreakdownSheet's consumedSurplus.
  const consumedRnd    = Math.round(consumed);
  const gainDisplayNum = gainZone === 'below'
    ? gainFloorBudget - consumedRnd   // kcal until floor
    : gainZone === 'in'
      ? gainCeilBudget - consumedRnd  // kcal room left in range (matches breakdown)
      : consumedRnd - gainCeilBudget; // kcal over ceiling
  const gainLabel = gainZone === 'below' ? 'kcal to go' : gainZone === 'in' ? 'kcal available' : 'kcal over';
  // Arc color: both arcs mint when in range, both dark otherwise.
  const gainArcColor = gainZone === 'in' ? 'var(--color-accent)' : 'var(--color-content)';
  // effectiveGaugeValue: for gain, drive the arc by distance from midpoint.
  const gainMidBudget   = totalBurn + (gainFloorEff + gainCeilEff) / 2;
  const gainGaugeValue  = gainMidBudget > 0 ? Math.max(-1, Math.min(1, (gainMidBudget - consumed) / gainMidBudget)) : gaugeValue;
  const effectiveGaugeValue = gainGoal ? gainGaugeValue : gaugeValue;

  // Day-specific weight entry (shown in the Weight stat tile).
  // Daily cadence → exact date match only.
  // Weekly cadence → most recent entry from the start of the current weigh-in
  //   period (the most recent occurrence of weeklyWeightDay ≤ this date) up to
  //   and including this date. If nothing in that window → null ("—").
  const dayWeightKg = (() => {
    if (weightCadence === 'daily') {
      return weights.find((w) => w.date === date)?.weightKg ?? null;
    }
    // Find the start of the weigh-in period: most recent weeklyWeightDay ≤ date.
    const d = new Date(date + 'T00:00:00');
    // weeklyWeightDay: 0=Mon…6=Sun → convert to JS getDay() 0=Sun…6=Sat
    const targetJsDay = weeklyWeightDay === 6 ? 0 : weeklyWeightDay + 1;
    const periodStart = new Date(d);
    let daysBack = 0;
    while (daysBack < 7) {
      if (periodStart.getDay() === targetJsDay) break;
      periodStart.setDate(periodStart.getDate() - 1);
      daysBack++;
    }
    const periodStartISO = periodStart.toISOString().slice(0, 10);
    // Find most recent entry in [periodStart, date]
    const inWindow = weights
      .filter((w) => w.date >= periodStartISO && w.date <= date)
      .sort((a, b) => b.date.localeCompare(a.date));
    return inWindow[0]?.weightKg ?? null;
  })();

  // Trigger: panel activates + data ready → animate 0 → value
  useEffect(() => {
    const s = anim.current;
    if (!isActive) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset gauge to 0 when panel becomes inactive
      setGaugeDisplay(0);
      s.activated = false;
      s.inPhase   = false;
      return;
    }
    if (!day || s.activated) return;
    s.activated = true;
    // Skip animation for past days and when Reduce Motion is enabled — jump straight to value.
    if (prefersReducedMotion() || isPastDay) {
      setGaugeDisplay(effectiveGaugeValue);
      return;
    }
    s.inPhase = true;
    setGaugeDisplay(0);
    const t = setTimeout(() => { s.inPhase = false; setGaugeDisplay(effectiveGaugeValue); }, 80);
    // Two haptic pulses: one at the start of the arc fill, one at the end.
    const h1 = setTimeout(() => hapticLight(), 130);  // ~50ms after arc activation
    const h2 = setTimeout(() => hapticLight(), 680);  // arc activation (80ms) + fill duration (600ms)
    return () => {
      clearTimeout(t);
      clearTimeout(h1); clearTimeout(h2);
      s.inPhase = false;
    };
  }, [isActive, Boolean(day)]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live update: while active, reflect food/activity changes smoothly
  useEffect(() => {
    if (!isActive || !anim.current.activated || anim.current.inPhase) return;
    setGaugeDisplay(effectiveGaugeValue);
  }, [effectiveGaugeValue]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!day) return (
    <div className="space-y-4 p-4" aria-busy>
      <Skeleton className="h-56 w-full rounded-main" />
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-12 w-full" />
    </div>
  );

  return (
    <div className="pb-6">
      {bmrIsEstimated && hasGoal && (
        <button onClick={() => { hapticLight(); setShowBreakdown(true); }} className="mx-4 mt-4 flex w-[calc(100%-2rem)] items-center gap-2 rounded-card border border-border-subtle bg-surface-sunken px-4 py-3 text-left">
          <Icon name="info" size={16} strokeWidth={1.75} className="shrink-0 text-content-muted" />
          <span className="text-subhead text-content-secondary">Numbers estimated — tap breakdown to add your profile</span>
        </button>
      )}

      {/* Screen-reader live region: announces the updated calories remaining
          whenever the user logs food or activity. Visually hidden. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {hasTarget
          ? gainGoal
            ? `${Math.abs(left)} kcal ${left <= 0 && left >= -100 ? 'on target' : left > 0 ? 'to go' : 'over'}`
            : `${Math.abs(left)} kcal ${left >= 0 ? 'remaining' : 'over budget'}`
          : ''}
      </div>

      {hasGoal ? (
        /* Outer container = the grey background shape. White gauge card overlays
           the top of it; protein bar reveals the grey area at the bottom. */
        <div className={`mx-6 mt-1 w-[calc(100%-3rem)] rounded-main ${showMacroSection ? 'bg-surface-sunken' : ''}`}>
          {/* White gauge card — floats on top of the grey container */}
          <div className="rounded-main bg-surface border border-border-subtle shadow-card-lg">
            <div className="px-4 pb-5 pt-6">
              {/* Badge is tappable; gauge arc is decorative only; center numbers are tappable */}
              <div className="pt-1 pb-1">
                <div className="flex justify-center">
                  <button
                    onClick={() => { hapticLight(); setShowBreakdown(true); }}
                    className="rounded-xl px-3 py-1 active:bg-surface-sunken transition-colors"
                    aria-label="View calorie breakdown"
                  >
                    {gainGoal ? (
                      // Gain: 3-state by zone
                      <Badge status={gainZone === 'in' ? 'success' : 'default'}>
                        {gainZone === 'below' ? (isPastDay ? 'Under target' : 'Under target') : gainZone === 'in' ? 'In range' : 'Over'}
                      </Badge>
                    ) : (
                      <Badge status={left >= 0 ? 'success' : 'default'}>
                        {left >= 0 ? 'On target' : 'Over'}
                      </Badge>
                    )}
                  </button>
                </div>
                <div className="mt-3">
                  <GaugeArc
                    value={gaugeDisplay}
                    bidirectional
                    disabled={isPastDay && !goal}
                    strokePositive={gainGoal ? gainArcColor : undefined}
                    strokeNegative={gainGoal ? gainArcColor : undefined}
                  >
                    <button
                      onClick={() => { hapticLight(); setShowBreakdown(true); }}
                      className="flex flex-col items-center rounded-xl px-6 py-2 active:bg-surface-sunken transition-colors"
                      aria-label="View calorie breakdown"
                    >
                      <div
                        className="flex items-center gap-1"
                        style={left < 0 && !gainGoal ? { transform: 'translateX(-4px)' } : undefined}
                      >
                        {left < 0 && !gainGoal && (
                          <span className="text-title font-semibold leading-none text-content">−</span>
                        )}
                        <span className="text-hero font-semibold leading-none tracking-tight text-content">
                          {gainGoal ? gainDisplayNum : Math.abs(left)}
                        </span>
                      </div>
                      <span className="mt-0.5 text-subhead text-content-secondary whitespace-nowrap">
                        {gainGoal
                          ? gainLabel
                          : isPastDay
                            ? (left >= 0 ? 'kcal under' : 'kcal over')
                            : (left >= 0 ? 'kcal available' : 'kcal over')}
                      </span>
                    </button>
                  </GaugeArc>
                </div>
              </div>
              <div className="grid grid-cols-3 pb-2" style={{ marginTop: 0 }}>
                <button onClick={() => { hapticLight(); ctx.openAddEntry('food', { hideTabs: true }); }} className="flex flex-col items-center rounded-xl px-2 py-1 active:bg-surface-sunken transition-colors">
                  <span className={`text-callout font-semibold ${day.foods.length === 0 ? 'text-content-muted' : 'text-content'}`}>{day.foods.length === 0 ? '—' : gainGoal ? `${Math.round(consumed)}` : `−${Math.round(consumed)}`}</span>
                  <span className="-mt-0.5 flex items-center gap-1 text-subhead text-content-secondary"><Icon name="foodIcon" size={12} />Food</span>
                </button>
                <button onClick={() => { hapticLight(); ctx.openAddEntry('activity', { hideTabs: true }); }} className="flex flex-col items-center rounded-xl px-2 py-1 active:bg-surface-sunken transition-colors">
                  <span className={`text-callout font-semibold ${day.activities.length === 0 ? 'text-content-muted' : 'text-content'}`}>{day.activities.length === 0 ? '—' : gainGoal ? `−${Math.round(actCals)}` : Math.round(actCals)}</span>
                  <span className="-mt-0.5 flex items-center gap-1 text-subhead text-content-secondary" style={{ transform: 'translateX(-2px)' }}><Icon name="activityIcon" size={12} />Activity</span>
                </button>
                <button onClick={() => { hapticLight(); ctx.openAddEntry('weight', { hideTabs: true }); }} className="flex flex-col items-center rounded-xl px-2 py-1 active:bg-surface-sunken transition-colors">
                  <span className={`text-callout font-semibold ${dayWeightKg != null ? 'text-content' : 'text-content-muted'}`}>{dayWeightKg != null ? (units === 'lbs' ? kgToLbs(dayWeightKg).toFixed(1) : dayWeightKg.toFixed(1)) : '—'}</span>
                  <span className="-mt-0.5 flex items-center gap-1 text-subhead text-content-secondary" style={{ transform: 'translateX(-2px)' }}><Icon name="weight" size={12} />Weight</span>
                </button>
              </div>
            </div>
          </div>
          {/* Macro bars — grey area below the white card, inside the container */}
          {showMacroSection && (
            <MacroBarsRow
              protein={protein} proteinGoal={proteinGoalG}
              carbs={carbs} fat={fat}
              gainDetailed={!!macroStyle}
              macroStyle={macroStyle}
              fatTarget={fatTargetG}
              carbLimit={effectiveCarbLimit}
              showProtein={diaryShowProtein}
              showCarbs={diaryShowCarbs}
              showFat={diaryShowFat}
              onExpand={() => setShowMacroDetail(true)}
            />
          )}
        </div>
      ) : (
        /* Same layout for no-goal variant */
        <div className={`mx-6 mt-1 w-[calc(100%-3rem)] rounded-main ${showMacroSection ? 'bg-surface-sunken' : ''}`}>
          <div className="rounded-main bg-surface border border-border-subtle shadow-card-lg">
            <div className="px-4 pb-5 pt-6">
              <div className="flex justify-center">
                <button
                  onClick={() => { hapticLight(); nav('/goal-fork'); }}
                  className="rounded-full bg-surface-sunken px-4 py-1.5 text-subhead font-medium text-content-secondary active:opacity-70 transition-opacity"
                  aria-label={hasPastGoal ? 'View past goal' : 'Set a goal'}
                >
                  {hasPastGoal ? 'Past goal' : 'No goal set'}
                </button>
              </div>
              <div className="mt-3">
                <GaugeArc value={0} disabled>
                  <button
                    onClick={() => { hapticLight(); setShowBreakdown(true); }}
                    className="flex flex-col items-center rounded-xl px-6 py-2 active:bg-surface-sunken transition-colors"
                    aria-label="View calorie breakdown"
                  >
                    <span className="text-hero font-semibold leading-none tracking-tight text-content">
                      {consumed > 0 ? Math.round(consumed) : '—'}
                    </span>
                    <span className="mt-0.5 text-subhead text-content-secondary whitespace-nowrap">
                      {consumed > 0 ? 'kcal logged' : 'kcal'}
                    </span>
                  </button>
                </GaugeArc>
              </div>
              <div className="grid grid-cols-3 pb-2" style={{ marginTop: 0 }}>
                <button onClick={() => { hapticLight(); ctx.openAddEntry('food', { hideTabs: true }); }} className="flex flex-col items-center rounded-xl px-2 py-1 active:bg-surface-sunken transition-colors">
                  <span className={`text-callout font-semibold ${day.foods.length === 0 ? 'text-content-muted' : 'text-content'}`}>{day.foods.length === 0 ? '—' : gainGoal ? `${Math.round(consumed)}` : `−${Math.round(consumed)}`}</span>
                  <span className="-mt-0.5 flex items-center gap-1 text-subhead text-content-secondary"><Icon name="foodIcon" size={12} />Food</span>
                </button>
                <button onClick={() => { hapticLight(); ctx.openAddEntry('activity', { hideTabs: true }); }} className="flex flex-col items-center rounded-xl px-2 py-1 active:bg-surface-sunken transition-colors">
                  <span className={`text-callout font-semibold ${day.activities.length === 0 ? 'text-content-muted' : 'text-content'}`}>{day.activities.length === 0 ? '—' : gainGoal ? `−${Math.round(actCals)}` : Math.round(actCals)}</span>
                  <span className="-mt-0.5 flex items-center gap-1 text-subhead text-content-secondary" style={{ transform: 'translateX(-2px)' }}><Icon name="activityIcon" size={12} />Activity</span>
                </button>
                <button onClick={() => { hapticLight(); ctx.openAddEntry('weight', { hideTabs: true }); }} className="flex flex-col items-center rounded-xl px-2 py-1 active:bg-surface-sunken transition-colors">
                  <span className={`text-callout font-semibold ${dayWeightKg != null ? 'text-content' : 'text-content-muted'}`}>{dayWeightKg != null ? (units === 'lbs' ? kgToLbs(dayWeightKg).toFixed(1) : dayWeightKg.toFixed(1)) : '—'}</span>
                  <span className="-mt-0.5 flex items-center gap-1 text-subhead text-content-secondary" style={{ transform: 'translateX(-2px)' }}><Icon name="weight" size={12} />Weight</span>
                </button>
              </div>
            </div>
          </div>
          {showMacroSection && (
            <MacroBarsRow
              protein={protein} proteinGoal={proteinGoalG}
              carbs={carbs} fat={fat}
              gainDetailed={!!macroStyle}
              macroStyle={macroStyle}
              fatTarget={fatTargetG}
              carbLimit={effectiveCarbLimit}
              showProtein={diaryShowProtein}
              showCarbs={diaryShowCarbs}
              showFat={diaryShowFat}
              onExpand={() => setShowMacroDetail(true)}
            />
          )}
        </div>
      )}

      {showBreakdown && hasGoal && (
        <BreakdownSheet
          bmrIsEstimated={bmrIsEstimated}
          onSetupProfile={() => { setShowBreakdown(false); setShowProfileSetup(true); }}
          mode="goal"
          bmr={day.bmr}
          consumed={consumed}
          actCals={actCals}
          digestionCalories={day.summary.digestionCalories}
          dailyTarget={dailyTarget}
          gainGoal={gainGoal}
          gainZone={gainZone}
          gainFloor={gainFloorEff}
          gainCeil={gainCeilEff}
          onClose={() => setShowBreakdown(false)}
        />
      )}
      {showBreakdown && !hasGoal && (
        <BreakdownSheet
          mode="no-goal"
          bmr={day.bmr}
          consumed={consumed}
          actCals={actCals}
          digestionCalories={0}
          dailyTarget={0}
          onClose={() => setShowBreakdown(false)}
        />
      )}

      {showWeightReminder && (
        <div className="mx-6 mt-4">
          <div className="flex items-center gap-3 rounded-card border border-border-subtle bg-surface-sunken px-4 py-3">
            <Icon name="scale" size={20} className="shrink-0 text-content-muted" />
            <div className="min-w-0 flex-1">
              <p className="text-subhead font-medium text-content">Log today's weight</p>
              <p className="text-caption text-content-secondary">You haven't weighed in yet today.</p>
            </div>
            <Button variant="subtle" size="xs" fullWidth={false} onClick={() => setShowWeightSheet(true)}>Log</Button>
            <button onClick={() => { hapticLight(); dismissReminder(); }} aria-label="Dismiss weight reminder"
              className="relative shrink-0 p-1 text-content-muted active:opacity-70 before:absolute before:content-[''] before:-inset-3">
              <Icon name="close" size={16} strokeWidth={2} />
            </button>
          </div>
        </div>
      )}

      <section className="mt-4 px-6 pb-3">
        <div className="mb-3">
          <h3 className="text-subhead font-semibold">Day's log</h3>
        </div>

        {showFrequent && (
          <div className="mb-3">
            <div className="grid grid-cols-4 gap-2">
              {frequentFoods.map((it) => (
                <QuickLogCard key={it.id} onClick={async () => { hapticLight(); const id = await quickLog(it, date); ctx.showToast('Food logged', async () => repos.foodEntries.remove(id)); }}>
                  <Thumb photo={it.photo} size={28} />
                  <span className="mt-0.5 w-full block text-label font-medium text-content truncate px-1">{it.name}</span>
                  <div className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-surface">
                    <Icon name="addSmall" size={10} className="text-content" />
                  </div>
                </QuickLogCard>
              ))}
            </div>
          </div>
        )}

        {(() => {
          // Merge food + activity entries into a single chronological log (newest first).
          type LogItem =
            | { kind: 'food'; entry: FoodEntry }
            | { kind: 'activity'; entry: ActivityEntry };
          const logItems: LogItem[] = [
            ...day.foods.map((e): LogItem => ({ kind: 'food', entry: e })),
            ...day.activities.map((a): LogItem => ({ kind: 'activity', entry: a })),
          ].sort((a, b) => (b.entry.createdAt > a.entry.createdAt ? 1 : -1));

          return (
            <Card tone="base" padded={false} className="overflow-hidden py-2 !shadow-none">
              <ul>
                {logItems.map((item, index) => {
                  const isLast = index === logItems.length - 1;
                  if (item.kind === 'food') {
                    const entry = item.entry;
                    const foodItem = entry.foodItemId ? items.find((i) => i.id === entry.foodItemId) : null;
                    const isMealEntry = !!entry.mealData;
                    return (
                      <li key={entry.id}>
                        <button
                          onClick={() => { hapticLight(); if (isMealEntry) setEditMeal(entry); else setEditFood(entry); }}
                          className={`flex w-full items-center justify-between px-4 py-2.5 text-left active:bg-surface-sunken${!isLast ? ' border-b border-border-subtle' : ''}`}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <Icon name={isMealEntry ? 'scanFood' : 'foodIcon'} size={16} className="shrink-0 text-content-secondary" />
                            <span className="truncate text-subhead text-content">
                              {entry.manualName ?? labelFor(items, entry.foodItemId)}
                              {foodItem && entry.quantity != null && (
                                <span className="ml-1 text-content-secondary">
                                  ({entry.quantity}{foodItem.measurementType === 'per_100g' ? 'g' : 'x'})
                                </span>
                              )}
                            </span>
                          </span>
                          <span className="shrink-0 text-subhead font-bold text-content">
                            {gainGoal ? '' : '−'}{effectiveNutrition(entry, day.itemsById).calories} kcal
                          </span>
                        </button>
                      </li>
                    );
                  } else {
                    const act = item.entry;
                    return (
                      <li key={act.id}>
                        <button
                          onClick={() => { hapticLight(); setEditActivity(act); }}
                          className={`flex w-full items-center justify-between px-4 py-2.5 text-left active:bg-surface-sunken${!isLast ? ' border-b border-border-subtle' : ''}`}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <Icon name="activityIcon" size={16} className="shrink-0 text-content-secondary" />
                            <span className="truncate text-subhead text-content">{act.name ?? 'Activity'}</span>
                          </span>
                          <span className="shrink-0 text-subhead font-bold text-content">{gainGoal ? '−' : '+'}{act.activeCalories} kcal</span>
                        </button>
                      </li>
                    );
                  }
                })}
                {logItems.length === 0 && (
                  <li className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                    <Icon name="foodIcon" size={24} className="text-content-muted" />
                    <span className="text-subhead text-content-muted">
                      Add food by tapping<br />on the + button
                    </span>
                  </li>
                )}
              </ul>
            </Card>
          );
        })()}
      </section>

      {showMacroDetail && (
        <MacroDetailSheet
          protein={protein} proteinGoal={proteinGoalG}
          carbs={carbs} fat={fat}
          macroStyle={macroStyle}
          fatTarget={fatTargetG}
          carbLimit={effectiveCarbLimit}
          onClose={() => setShowMacroDetail(false)}
        />
      )}
      {editFood && <EditFoodSheet entry={editFood} items={items} onClose={() => setEditFood(null)} showToast={ctx.showToast} />}
      {editMeal && <MealEditSheet entry={editMeal} pantryItems={items} onClose={() => setEditMeal(null)} showToast={ctx.showToast} />}
      {editActivity && <EditActivitySheet entry={editActivity} onClose={() => setEditActivity(null)} showToast={ctx.showToast} />}
      {showProfileSetup && (
        <ProfileSetupSheet
          currentWeightKg={weights.length > 0 ? [...weights].sort((a, b) => b.date.localeCompare(a.date))[0].weightKg : null}
          initialHeight={profileUser?.heightCm && profileUser.heightCm > 0 ? profileUser.heightCm : null}
          initialAge={profileUser?.age ?? null}
          initialSex={profileUser?.sex ?? null}
          onClose={() => setShowProfileSetup(false)}
        />
      )}
      {showWeightSheet && <WeightLogSheet date={todayISO()} onClose={() => setShowWeightSheet(false)} />}
    </div>
  );
}

// ── Breakdown sheet ───────────────────────────────────────────────────────────

type BreakdownInfoKey = 'bmr' | 'activity' | 'digestion' | 'food' | 'goal' | 'available';

function BreakdownSheet({
  mode = 'goal', bmr, consumed, actCals, digestionCalories, dailyTarget,
  gainGoal = false, gainZone = 'below', gainFloor = 0, gainCeil = 0,
  bmrIsEstimated = false, onSetupProfile, onClose,
}: {
  mode?: 'goal' | 'no-goal';
  bmr: number; consumed: number; actCals: number; digestionCalories: number;
  dailyTarget: number; gainGoal?: boolean; gainZone?: 'below' | 'in' | 'above';
  gainFloor?: number; gainCeil?: number;
  bmrIsEstimated?: boolean; onSetupProfile?: () => void;
  onClose: () => void;
}) {
  const [activeInfo, setActiveInfo] = useState<BreakdownInfoKey | null>(null);
  const [infoEntered, setInfoEntered] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Reset scroll to top on every panel transition (including initial mount)
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    let parent = el.parentElement;
    while (parent && parent !== document.body) {
      const ov = window.getComputedStyle(parent).overflowY;
      if (ov === 'auto' || ov === 'scroll') { parent.scrollTop = 0; break; }
      parent = parent.parentElement;
    }
  }, [activeInfo]);

  function openInfo(key: BreakdownInfoKey) {
    setActiveInfo(key);
    requestAnimationFrame(() => setInfoEntered(true));
  }
  function closeInfo() {
    setInfoEntered(false);
    setTimeout(() => setActiveInfo(null), 260);
  }

  const slide: React.CSSProperties = {
    transition: 'transform 260ms cubic-bezier(0.32,0.72,0,1)',
  };

  // ── All derived values (computed unconditionally so header can reference them) ──
  const totalBurn       = Math.round(bmr + actCals + digestionCalories);
  const consumedRnd     = Math.round(consumed);
  const netBalance      = consumedRnd - totalBurn;
  const netBalanceStr   = `${netBalance >= 0 ? '+' : '−'}${Math.abs(netBalance).toLocaleString()} kcal`;
  const left            = totalBurn - consumedRnd - Math.round(dailyTarget);
  const isOver          = left < 0;
  const consumedSurplus = gainGoal ? netBalance : 0;
  const targetMagnitude = Math.round(Math.abs(dailyTarget));
  const goalLabel       = gainGoal ? 'Goal (surplus)' : 'Goal (deficit)';
  const goalValue       = gainGoal
    ? `+${gainFloor.toLocaleString()} to +${gainCeil.toLocaleString()} kcal`
    : `−${targetMagnitude.toLocaleString()} kcal`;
  const availableNum    = gainGoal
    ? (gainZone === 'below' ? gainFloor - consumedSurplus
       : gainZone === 'in'   ? gainCeil  - consumedSurplus
                              : consumedSurplus - gainCeil)
    : Math.abs(left);
  const bdBadgeStatus   = (gainGoal ? gainZone === 'in' : !isOver) ? 'success' : 'default';
  const bdBadgeText     = gainGoal
    ? (gainZone === 'below' ? 'Under target' : gainZone === 'in' ? 'In range' : 'Over')
    : (isOver ? 'Over' : 'On target');
  const availableLabel  = bdBadgeText === 'Under target' ? 'To go'
    : bdBadgeText === 'Over' ? 'Over'
    : 'Available';

  const infoTitles: Record<BreakdownInfoKey, string> = {
    bmr: 'BMR', activity: 'Activity', digestion: 'Estimated digestion',
    food: 'Food', goal: 'Goal', available: availableLabel,
  };

  // ── Animated sticky header ─────────────────────────────────────────────────
  const animatedHeader = (
    <div className="relative overflow-hidden mb-5">
      <div style={{ ...slide, transform: infoEntered ? 'translateX(-100%)' : 'translateX(0)' }}>
        <div className="flex items-center gap-2 py-1">
          <button data-no-drag onClick={onClose} aria-label="Close" className="-m-1 p-1 text-content-muted">
            <Icon name="close" size={22} strokeWidth={2.25} />
          </button>
          <h2 className="flex-1 text-center text-headline font-semibold">Calorie breakdown</h2>
          <span className="w-6" />
        </div>
      </div>
      {activeInfo && (
        <div className="absolute inset-0 bg-surface"
          style={{ ...slide, transform: infoEntered ? 'translateX(0)' : 'translateX(100%)' }}>
          <div className="flex items-center gap-2 py-1">
            <button data-no-drag onClick={closeInfo} aria-label="Back" className="-m-1 p-1 text-content-muted">
              <Icon name="back" size={22} strokeWidth={2.25} />
            </button>
            <h2 className="flex-1 text-center text-headline font-semibold">{infoTitles[activeInfo]}</h2>
            <span className="w-6" />
          </div>
        </div>
      )}
    </div>
  );

  // ── No-goal content ──────────────────────────────────────────────────────
  if (mode === 'no-goal') {
    const noGoalRows = [
      { label: 'Food consumed', value: `${Math.round(consumed).toLocaleString()} kcal` },
      ...(actCals > 0 ? [{ label: 'Activity', value: `${Math.round(actCals).toLocaleString()} kcal` }] : []),
    ];
    return (
      <Sheet onClose={onClose} stickyHeader={animatedHeader}>
        <div ref={wrapperRef} className="rounded-card border border-border-subtle bg-surface overflow-hidden">
          {noGoalRows.map(({ label, value }, idx) => (
            <div key={label}
              className={`flex items-center justify-between px-4 py-3 ${idx < noGoalRows.length - 1 ? 'border-b border-border-subtle' : ''}`}>
              <span className="text-subhead text-content">{label}</span>
              <span className="text-subhead text-content">{value}</span>
            </div>
          ))}
        </div>
        {actCals > 0 && (
          <p className="mt-3 text-subhead text-content-muted">
            Activity is tracked but not counted toward your total. Set a goal to see your full calorie picture.
          </p>
        )}
        <div className="h-2" />
      </Sheet>
    );
  }

  // ── Math rows ────────────────────────────────────────────────────────────
  type MathRow = { label: string; value: string; infoKey: BreakdownInfoKey };
  const mathRows: MathRow[] = [
    { label: 'BMR',      value: `−${Math.round(bmr).toLocaleString()} kcal`,    infoKey: 'bmr' },
    { label: 'Activity', value: `−${Math.round(actCals).toLocaleString()} kcal`, infoKey: 'activity' },
    ...(digestionCalories > 0 ? [{
      label: 'Estimated digestion',
      value: `−${digestionCalories.toLocaleString()} kcal`,
      infoKey: 'digestion' as BreakdownInfoKey,
    }] : []),
    { label: 'Food', value: `+${Math.round(consumed).toLocaleString()} kcal`, infoKey: 'food' },
  ];

  // ── Info panel content ───────────────────────────────────────────────────
  const infoPanels: Record<BreakdownInfoKey, React.ReactNode> = {
    bmr: bmrIsEstimated ? (
      <div className="space-y-3 leading-relaxed">
        <p className="text-subhead text-content">Your <span className="font-medium">Basal Metabolic Rate</span> is the energy your body burns at complete rest — just to keep your organs running, breathing, and staying warm.</p>
        <p className="text-subhead text-content">Right now this is an <span className="font-medium">estimate</span> based on your weight only, using population-average height (170 cm), age (35), and a neutral sex factor.</p>
        <p className="text-subhead text-content">For an accurate BMR, add your height, age, and sex to your profile. The numbers will update automatically.</p>
      </div>
    ) : (
      <div className="space-y-3 leading-relaxed">
        <p className="text-subhead text-content">Your <span className="font-medium">Basal Metabolic Rate</span> is the energy your body burns at complete rest, just to keep your organs running, breathing, and staying warm.</p>
        <p className="text-subhead text-content">It's the largest part of your daily calorie burn, usually 60 to 70% of your total. You set it manually in your profile.</p>
        <p className="text-subhead text-content-secondary pb-2"><span className="font-semibold">Note: </span>Auto-calibration based on your logged data is coming in a future update.</p>
      </div>
    ),
    activity: (
      <div className="space-y-3 leading-relaxed">
        <p className="text-subhead text-content">Calories burned from <span className="font-medium">physical activity</span> you've logged manually, including workouts, walks, or any other movement you add.</p>
        <p className="text-subhead text-content">This is added to your BMR to calculate how much you can eat to stay on track.</p>
        <p className="text-subhead text-content-secondary pb-2"><span className="font-semibold">Note: </span>Apple Health and device sync (Apple Watch, etc.) is coming in a future update.</p>
      </div>
    ),
    digestion: (
      <div className="space-y-3 leading-relaxed">
        <p className="text-subhead text-content">When you eat, your body uses energy to break down and absorb food. This is called the <span className="font-medium">Thermic Effect of Food</span>.</p>
        <p className="text-subhead text-content">The estimate is calculated from your logged foods:</p>
        <div className="rounded-card border border-border-subtle bg-surface overflow-hidden">
          {[['Protein', 'around 25 to 30%'], ['Carbs', 'around 6 to 8%'], ['Fat', 'around 2 to 3%']].map(([macro, rate], idx, arr) => (
            <div key={macro} className={`flex items-center justify-between px-4 py-2.5 ${idx < arr.length - 1 ? 'border-b border-border-subtle' : ''}`}>
              <span className="text-subhead text-content-secondary">{macro}</span>
              <span className="text-subhead font-medium text-content">{rate} of its calories</span>
            </div>
          ))}
        </div>
        <p className="text-subhead text-content">It gets added to your burn total because it's real energy your body uses. Days with more protein give you a slightly larger budget.</p>
        <p className="text-subhead text-content-secondary pb-2"><span className="font-semibold">Note: </span>Actual values vary depending on food composition and individual metabolism.</p>
      </div>
    ),
    food: (
      <div className="space-y-3 leading-relaxed">
        <p className="text-subhead text-content">Total calories from all <span className="font-medium">food entries</span> logged today.</p>
        <p className="text-subhead text-content">Every meal and snack you add contributes here. Food is the only positive number in the balance. Everything else is a burn.</p>
        <p className="text-subhead text-content-secondary pb-2"><span className="font-semibold">Note: </span>AI meal estimation and food scan are coming to make logging faster.</p>
      </div>
    ),
    goal: gainGoal ? (
      <div className="space-y-3 leading-relaxed">
        <p className="text-subhead text-content">Your <span className="font-medium">daily surplus target</span> is the extra calories above your total burn that you're aiming to eat to support muscle growth.</p>
        <p className="text-subhead text-content">A controlled surplus combined with training gives your body the fuel it needs to build muscle while keeping fat gain low. Your target range is +{gainFloor.toLocaleString()} to +{gainCeil.toLocaleString()} kcal per day.</p>
        <p className="text-subhead text-content-secondary pb-2"><span className="font-semibold">Note: </span>Going well above the range tends to add more fat than muscle.</p>
      </div>
    ) : (
      <div className="space-y-3 leading-relaxed">
        <p className="text-subhead text-content">Your <span className="font-medium">daily deficit target</span> is how many fewer calories you need to eat than you burn each day to reach your goal weight on time.</p>
        <p className="text-subhead text-content">A deficit of {targetMagnitude.toLocaleString()} kcal per day means your body draws on stored fat to make up the difference. Around 7,700 kcal equals roughly 1 kg of fat.</p>
        <p className="text-subhead text-content-secondary pb-2"><span className="font-semibold">Note: </span>Your target is calculated from your start weight, goal weight, and deadline.</p>
      </div>
    ),
    available: bdBadgeText === 'Under target' ? (
      <div className="space-y-3 leading-relaxed">
        <p className="text-subhead text-content"><span className="font-medium">To go</span> is how many more calories you need to eat today to reach the floor of your surplus range.</p>
        <p className="text-subhead text-content">Once you're in range, this label changes to <span className="font-medium">Available</span>, showing how much room you have left before going over the ceiling.</p>
      </div>
    ) : bdBadgeText === 'Over' ? (
      <div className="space-y-3 leading-relaxed">
        <p className="text-subhead text-content"><span className="font-medium">Over</span> shows how much you've gone past your {gainGoal ? 'surplus ceiling' : 'calorie budget'} today.</p>
        <p className="text-subhead text-content">A single day over won't derail your goal. What matters is the average over the week.</p>
      </div>
    ) : (
      <div className="space-y-3 leading-relaxed">
        <p className="text-subhead text-content"><span className="font-medium">Available</span> is how many more calories you can eat today and still hit your daily target.</p>
        <p className="text-subhead text-content">{gainGoal ? 'Once you go over the ceiling of your surplus range, this switches to "Over".' : 'Once this hits zero, any more food puts you past your deficit target for the day.'}</p>
      </div>
    ),
  };

  const scrollableContent = (
    <div ref={wrapperRef} className="relative" style={{ overflow: activeInfo ? 'hidden' : 'visible' }}>
      <div style={{ ...slide, transform: infoEntered ? 'translateX(-100%)' : 'translateX(0)' }}>

        {/* ── Estimated BMR disclaimer ── */}
        {bmrIsEstimated && (
          <button
            data-no-drag
            onClick={onSetupProfile}
            className="mb-3 flex w-full items-start gap-3 rounded-card border border-border-subtle bg-surface-sunken px-4 py-3 text-left"
          >
            <Icon name="info" size={17} strokeWidth={1.75} className="mt-0.5 shrink-0 text-content-muted" />
            <div className="min-w-0">
              <p className="text-subhead font-medium text-content">Numbers are estimated</p>
              <p className="mt-0.5 text-footnote text-content-secondary">BMR is calculated from your weight only. Add your height, age, and sex for an accurate result.</p>
              <p className="mt-1.5 text-footnote font-semibold text-accent">Complete your profile →</p>
            </div>
          </button>
        )}

        {/* ── One unified container ── */}
        <div className="rounded-card border border-border-card-no-shadow bg-surface pt-2.5">

          {/* Math rows — left side is fully tappable to open info */}
          {mathRows.map(({ label, value, infoKey }) => (
            <div key={label} className="flex items-center px-4">
              <button data-no-drag onClick={() => openInfo(infoKey)}
                className="flex items-center gap-1 min-w-0 flex-1 pr-3 py-1.5 text-left"
                aria-label={`Learn about ${label}`}>
                <span className="text-subhead text-content-secondary">{label}</span>
                <Icon name="info" size={15} strokeWidth={1.75} className="text-content-muted shrink-0" />
              </button>
              <span className="text-subhead text-content-secondary shrink-0">{value}</span>
            </div>
          ))}

          {/* Total row — mt-1.5 puts divider 12px below Food, pt-3 puts Total text 12px below divider */}
          <div className="flex items-center justify-between px-4 mt-1.5 pt-3 pb-1.5 border-t border-border-field">
            <span className="text-subhead font-semibold text-content">Total</span>
            <span className="text-subhead font-bold text-content">{netBalanceStr}</span>
          </div>

          {/* Goal row — pb-3 doubles the gap before the status card */}
          <div className="flex items-center px-4">
            <button data-no-drag onClick={() => openInfo('goal')}
              className="flex items-center gap-1 min-w-0 flex-1 pr-3 pt-1.5 pb-4 text-left"
              aria-label={`Learn about ${goalLabel}`}>
              <span className="text-subhead text-content-secondary">{goalLabel}</span>
              <Icon name="info" size={15} strokeWidth={1.75} className="text-content-muted shrink-0" />
            </button>
            <span className="text-subhead text-content-secondary shrink-0">{goalValue}</span>
          </div>

          {/* ── Status card — -mx-px -mb-px so its bg covers the outer border on sides/bottom ── */}
          <div className="rounded-card shadow-card-lg bg-surface -mx-px -mb-px">
            <div className="px-4 pt-4 pb-0">
              <Badge status={bdBadgeStatus}>{bdBadgeText}</Badge>
            </div>
            <div className="flex items-center justify-between px-4 pb-2">
              <button data-no-drag onClick={() => openInfo('available')}
                className="flex items-center gap-1 py-2 text-left"
                aria-label={`Learn about ${availableLabel}`}>
                <span className="text-subhead text-content-secondary">{availableLabel}</span>
                <Icon name="info" size={15} strokeWidth={1.75} className="text-content-muted shrink-0" />
              </button>
              <span className="text-title font-bold text-content">{availableNum.toLocaleString()} kcal</span>
            </div>
          </div>

        </div>
        <div className="h-2" />
      </div>

      {/* Info panel (slides in from right) */}
      {activeInfo && (
        <div className="absolute inset-0 bg-surface"
          style={{ ...slide, transform: infoEntered ? 'translateX(0)' : 'translateX(100%)' }}>
          {infoPanels[activeInfo]}
        </div>
      )}
    </div>
  );

  return (
    <Sheet onClose={onClose} stickyHeader={animatedHeader}>
      {scrollableContent}
    </Sheet>
  );
}

// ── Edit sheets ───────────────────────────────────────────────────────────────

function EditFoodSheet({ entry, items, onClose, showToast }: {
  entry: FoodEntry; items: FoodItem[]; onClose: () => void; showToast?: ShowToast;
}) {
  const item     = items.find((i) => i.id === entry.foodItemId);
  const name     = entry.manualName ?? item?.name ?? 'Food';
  const isManual = !item;

  async function del() {
    await repos.foodEntries.remove(entry.id);
    showToast?.('Food removed', async () => repos.foodEntries.add(entry));
    onClose();
  }

  // Wrap onClose so saving shows a confirmation toast.
  function onSaved() {
    showToast?.('Changes saved');
    onClose();
  }

  const trashBtn = (
    <button data-no-drag onClick={del} aria-label="Delete entry"
      className="-m-1 p-1 text-accent-hover active:text-danger">
      <Icon name="trash" size={20} strokeWidth={2} />
    </button>
  );

  return (
    <Sheet title={name} onClose={onClose} forceExpanded rightAction={trashBtn}>
      {isManual
        ? <ManualFoodFields entry={entry} onClose={onSaved} />
        : <PantryFoodQty    entry={entry} item={item!} onClose={onSaved} />}
    </Sheet>
  );
}

function PantryFoodQty({ entry, item, onClose }: { entry: FoodEntry; item: FoodItem; onClose: () => void }) {
  const [qty, setQty] = useState(String(entry.quantity ?? ''));
  const quantity = Number(qty) || 0;
  const isServing = item.measurementType === 'per_serving';
  async function save() {
    await repos.foodEntries.update({
      ...entry, quantity, snapshot: nutritionFor(item, quantity),
    });
    onClose();
  }
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-center py-10">
        {isServing
          ? <ServingStepper qty={qty} setQty={setQty} />
          : <LabeledInput label="Quantity (g)" value={qty} onChange={onDecimalChange(setQty)} inputMode="decimal" />}
      </div>
      <Button size="lg" onClick={save}>Save changes</Button>
    </div>
  );
}

function ManualFoodFields({ entry, onClose }: { entry: FoodEntry; onClose: () => void }) {
  const [name, setName] = useState(entry.manualName ?? '');
  const [cal,  setCal]  = useState(String(entry.snapshot.calories));
  const [pro,  setPro]  = useState(String(entry.snapshot.protein));
  const [carb, setCarb] = useState(String(entry.snapshot.carbs));
  const [fib,  setFib]  = useState(String(entry.snapshot.fiber));
  const [fat,  setFat]  = useState(String(entry.snapshot.fat));
  async function save() {
    if (!name.trim()) return;
    const snapshot: NutritionSnapshot = {
      calories: +cal || 0, protein: +pro || 0, carbs: +carb || 0,
      fiber: +fib || 0, fat: +fat || 0,
    };
    await repos.foodEntries.update({ ...entry, manualName: name.trim(), snapshot });
    onClose();
  }
  return (
    <div className="flex flex-col gap-3">
      <LabeledInput label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Food name" />
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Calories"    value={cal}  set={setCal} max={5000} step={1} />
        <NumberField label="Protein (g)" value={pro}  set={setPro} max={500} step={1} />
        <NumberField label="Carbs (g)"   value={carb} set={setCarb} max={800} step={1} />
        <NumberField label="Fiber (g)"   value={fib}  set={setFib} max={200} step={1} />
        <NumberField label="Fat (g)"     value={fat}  set={setFat} max={400} step={1} />
      </div>
      <Button size="lg" onClick={save} disabled={!name.trim()} className="mt-1">Save changes</Button>
    </div>
  );
}

// ── Meal edit sheet ───────────────────────────────────────────────────────────

function MealEditSheet({ entry, pantryItems, onClose, showToast }: {
  entry: FoodEntry; pantryItems: FoodItem[]; onClose: () => void; showToast?: ShowToast;
}) {
  const meal = entry.mealData!;
  const [mealItems, setMealItems] = useState<ResultItem[]>(meal.items);
  const [mealName,  setMealName]  = useState(meal.name);

  async function save() {
    const selected = mealItems.filter((i) => i.selected);
    const snapshot: NutritionSnapshot = {
      calories: selected.reduce((s, i) => s + i.calories, 0),
      protein:  selected.reduce((s, i) => s + i.protein, 0),
      carbs:    selected.reduce((s, i) => s + i.carbs, 0),
      fiber:    selected.reduce((s, i) => s + i.fiber, 0),
      fat:      selected.reduce((s, i) => s + i.fat, 0),
    };
    const name = mealName.trim() || meal.name;
    await repos.foodEntries.update({
      ...entry,
      manualName: name,
      snapshot,
      mealData: { ...meal, name, items: mealItems },
    });
    showToast?.('Changes saved');
    onClose();
  }

  async function del() {
    await repos.foodEntries.remove(entry.id);
    showToast?.('Meal removed', async () => repos.foodEntries.add(entry));
    onClose();
  }

  const trashBtn = (
    <button data-no-drag onClick={del} aria-label="Delete meal"
      className="-m-1 p-1 text-accent-hover active:text-danger">
      <Icon name="trash" size={20} strokeWidth={2} />
    </button>
  );

  function addPantryItem(id: string) {
    const foodItem = pantryItems.find((i) => i.id === id);
    if (!foodItem) return;
    const qty = foodItem.measurementType === 'per_100g' ? 100 : 1;
    const n = nutritionFor(foodItem, qty);
    setMealItems((prev) => [
      ...prev,
      {
        name: foodItem.name,
        selected: true,
        confidence: 'high' as const,
        calories: n.calories,
        protein: n.protein,
        carbs: n.carbs,
        fiber: n.fiber,
        fat: n.fat,
        estimatedGrams: qty,
      },
    ]);
  }

  const pickerSection = (
    <div className="mt-2">
      <label className="block">
        <span className="text-micro font-medium uppercase text-content-secondary">Add from pantry</span>
        <div className="relative mt-1">
          <select
            value=""
            onChange={(e) => { if (e.target.value) addPantryItem(e.target.value); }}
            className="w-full appearance-none rounded-field border border-transparent bg-surface-sunken pl-3 pr-10 py-3 text-body font-medium text-content"
          >
            <option value="">Pick an item</option>
            {pantryItems
              .filter((i) => !mealItems.some((m) => m.name === i.name))
              .map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
            <Icon name="chevronDown" size={16} strokeWidth={2} className="text-content-muted" />
          </div>
        </div>
      </label>
    </div>
  );

  return (
    <Sheet title={mealName || meal.name} onClose={onClose} rightAction={trashBtn} forceExpanded>
      <ScanResults
        items={mealItems}
        onChange={setMealItems}
        onLog={save}
        scanPhoto={meal.photo ?? null}
        mealName={mealName}
        onMealNameChange={setMealName}
        logLabel="Save changes"
        extraSection={pickerSection}
      />
    </Sheet>
  );
}


// ── Edit activity sheet ───────────────────────────────────────────────────────

function EditActivitySheet({ entry, onClose, showToast }: {
  entry: ActivityEntry;
  onClose: () => void;
  showToast?: ShowToast;
}) {
  const [name, setName] = useState(entry.name ?? '');
  const [kcal, setKcal] = useState(String(entry.activeCalories));

  async function save() {
    const v = Number(kcal);
    if (!v) return;
    await repos.activities.update({
      ...entry,
      name: name.trim() || undefined,
      activeCalories: v,
    });
    onClose();
  }

  async function del() {
    await repos.activities.remove(entry.id);
    showToast?.('Activity deleted', async () => repos.activities.add(entry));
    onClose();
  }

  const trashBtn = (
    <button onClick={() => void del()} className="-m-1 p-1 text-accent-hover active:text-danger transition-colors">
      <Icon name="trash" size={20} strokeWidth={2} />
    </button>
  );

  return (
    <Sheet
      title={entry.name ?? 'Activity'}
      onClose={onClose}
      forceExpanded
      rightAction={trashBtn}
      footer={<Button size="lg" onClick={() => void save()} disabled={!Number(kcal)}>Save</Button>}
    >
      <div className="space-y-3">
        <LabeledInput
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Morning run"
        />
        <WheelPicker
          label="Calories"
          value={kcal}
          onChange={setKcal}
          min={0}
          max={3000}
          step={5}
          unit="kcal"
          centerAt={300}
        />
      </div>
    </Sheet>
  );
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

async function quickLog(it: FoodItem, date: string): Promise<string> {
  const id  = newId();
  const qty = it.measurementType === 'per_100g' ? 100 : 1;
  await repos.foodEntries.add({
    id, date, foodItemId: it.id, quantity: qty, isManual: false,
    snapshot: nutritionFor(it, qty), createdAt: new Date().toISOString(),
  });
  return id;
}

function labelFor(items: { id: string; name: string }[], id?: string) {
  return items.find((i) => i.id === id)?.name ?? 'Food';
}

// ── Profile setup sheet ───────────────────────────────────────────────────────

const HEIGHT_CM_OPTIONS: number[] = Array.from({ length: 81 }, (_, i) => 140 + i);
const AGE_PROFILE_OPTIONS: number[] = Array.from({ length: 81 }, (_, i) => 10 + i);

function ProfileSetupSheet({
  currentWeightKg,
  initialHeight,
  initialAge,
  initialSex,
  onClose,
}: {
  currentWeightKg: number | null;
  initialHeight: number | null;
  initialAge: number | null;
  initialSex: Sex | null;
  onClose: () => void;
}) {
  const [height, setHeight] = useState<number | null>(initialHeight && initialHeight > 0 ? initialHeight : null);
  const [age,    setAge]    = useState<number | null>(initialAge ?? null);
  const [sex,    setSex]    = useState<Sex | null>(initialSex ?? null);
  const [saving, setSaving] = useState(false);

  const canSave = height != null && age != null && sex != null;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const user = await repos.user.get();
      const wKg  = currentWeightKg ?? 70;
      const bmrValue = mifflinStJeorBMR({ weightKg: wKg, heightCm: height!, age: age!, sex: sex! });
      const base = user ?? { id: 'default', heightCm: 0, units: 'kg' as const, bmr: 0 };
      await repos.user.save({ ...base, heightCm: height!, age: age!, sex: sex!, bmr: bmrValue });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between mb-5">
        <button data-no-drag onClick={onClose} aria-label="Close" className="-m-1 p-1 text-content-muted">
          <Icon name="close" size={22} strokeWidth={2.25} />
        </button>
        <h2 className="flex-1 text-center text-headline font-semibold">Your profile</h2>
        <span className="w-6" />
      </div>

      <p className="text-subhead text-content-secondary mb-4">
        Used to calculate your BMR accurately using the Mifflin–St Jeor equation.
      </p>

      {/* Sex */}
      <div className="mb-4">
        <p className="text-footnote text-content-muted mb-2">Sex</p>
        <FilterPills<Sex>
          options={[
            { value: 'male',   label: 'Male'   },
            { value: 'female', label: 'Female' },
          ]}
          value={sex}
          onChange={setSex}
        />
      </div>

      {/* Height */}
      <div className="mb-4">
        <p className="text-footnote text-content-muted mb-2">Height</p>
        <div className="relative rounded-card border border-border-field bg-surface-field">
          <select
            value={height ?? ''}
            onChange={e => setHeight(e.target.value ? Number(e.target.value) : null)}
            className="w-full appearance-none bg-transparent px-4 py-3 pr-10 text-subhead text-content"
          >
            <option value="">Select height</option>
            {HEIGHT_CM_OPTIONS.map(n => <option key={n} value={n}>{n} cm</option>)}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-content-muted">
            <Icon name="chevronDown" size={16} strokeWidth={2} />
          </div>
        </div>
      </div>

      {/* Age */}
      <div className="mb-6">
        <p className="text-footnote text-content-muted mb-2">Age</p>
        <div className="relative rounded-card border border-border-field bg-surface-field">
          <select
            value={age ?? ''}
            onChange={e => setAge(e.target.value ? Number(e.target.value) : null)}
            className="w-full appearance-none bg-transparent px-4 py-3 pr-10 text-subhead text-content"
          >
            <option value="">Select age</option>
            {AGE_PROFILE_OPTIONS.map(n => <option key={n} value={n}>{n} yrs</option>)}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-content-muted">
            <Icon name="chevronDown" size={16} strokeWidth={2} />
          </div>
        </div>
      </div>

      <Button
        variant="solid"
        disabled={!canSave || saving}
        onClick={handleSave}
        className="w-full"
      >
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </Sheet>
  );
}
