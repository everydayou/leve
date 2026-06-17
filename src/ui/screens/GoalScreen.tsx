import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLive } from '../../state/live';
import { useNavigate, useOutletContext } from 'react-router-dom';
import type { DayContext } from '../AppShell';
import { repos } from '../../state/repos';
import { hapticLight } from '../../lib/haptics';
import { prefersReducedMotion } from '../../lib/motion';
import { currentWeightKg, requiredDailyDeficit, isGainGoal } from '../../domain/goal';
import { summarizeDay, itemsByIdMap } from '../../domain/calc';
import { addDays, todayISO } from '../../data/ids';
import { getMondayOfWeek, MS_PER_DAY } from '../../lib/date';
import { round1 } from '../../lib/num';
import { displayWeight, kgToLbs } from '../../domain/units';
import { Card, SegmentedControl, Button, Icon, Skeleton, Badge, Sheet } from '../kit';
import { bmrForDate } from '../../domain/bmr';
import type { Goal, WeightEntry, FoodItem, User } from '../../domain/types';

/** 1-based week number counting from the goal's start week. */
function weekNumber(goalStartDate: string, weekOffset: number, today: string): number {
  const goalMondayMs = +new Date(getMondayOfWeek(goalStartDate) + 'T00:00:00');
  const viewedMondayMs = +new Date(addDays(getMondayOfWeek(today), weekOffset * 7) + 'T00:00:00');
  return Math.round((viewedMondayMs - goalMondayMs) / (7 * MS_PER_DAY)) + 1;
}

/** Short date label e.g. "19 Jun". Used in chart header subtitle. */
const fmtShortDate = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });


/** Short weekday label e.g. "M". */
const fmtWeekday = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 1);

/** Week range label e.g. "Jun 3 – 9" or "Jun 28 – Jul 4". */
const fmtWeekRange = (start: string, end: string): string => {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end   + 'T00:00:00');
  const sDay = s.toLocaleDateString(undefined, { day: 'numeric' });
  const eDay = e.toLocaleDateString(undefined, { day: 'numeric' });
  const eMon = e.toLocaleDateString(undefined, { month: 'short' });
  if (s.getMonth() === e.getMonth()) {
    return `${sDay} – ${eDay} ${eMon}`;
  }
  const sMon = s.toLocaleDateString(undefined, { month: 'short' });
  return `${sDay} ${sMon} – ${eDay} ${eMon}`;
};

type Tab = 'overview' | 'week';

export function GoalScreen() {
  const nav = useNavigate();
  const { openAddEntry } = useOutletContext<DayContext>();
  const [tab, setTab] = useState<Tab>('overview');
  const [weekOffset, setWeekOffset] = useState(0);
  // Incrementing a key remounts the chart, restarting CSS animations.
  const [animKeys, setAnimKeys] = useState({ overview: 0, week: 0 });
  // navDir: 1 = forward (more recent week), -1 = backward (earlier week), 0 = initial/tab switch
  const [navDir, setNavDir] = useState<1 | -1 | 0>(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showCompleteSheet, setShowCompleteSheet] = useState(false);
  const [showEndSheet, setShowEndSheet] = useState(false);
  const [dismissedOutcome, setDismissedOutcome] = useState(false);
  const handleTabChange = (t: Tab) => {
    hapticLight();
    setNavDir(0);
    setTab(t);
    setAnimKeys((prev) => ({ ...prev, [t]: prev[t] + 1 }));
  };
  // Fire once when chart animations play on initial mount.
  useEffect(() => { hapticLight(); }, []);
  // Chart card swipe — refs live here (before data check); handlers defined after minWeekOffset
  const swipeStart  = useRef<{ x: number; y: number } | null>(null);
  const swipeIsH    = useRef<boolean | null>(null); // null = axis not yet decided
  const cardWrapRef = useRef<HTMLDivElement>(null);

  const data = useLive(async () => {
    const [goals, weights, user, items] = await Promise.all([
      repos.goals.getAll(),
      repos.weights.all(),
      repos.user.get(),
      repos.foodItems.all(),
    ]);
    // Prefer the active goal; fall back to the most recent non-active goal so
    // the Goal tab can render completed / ended outcome views.
    const active = goals.find(g => g.status === 'active');
    const sorted = [...goals].sort((a, b) => b.startDate.localeCompare(a.startDate));
    const goal = active ?? sorted[0];
    return { goal, weights, user, items };
  }, []);

  if (!data) {
    return (
      <div className="space-y-3 p-4" aria-busy>
        <Skeleton className="h-7 w-36 mx-auto" />
        <Skeleton className="h-5 w-52 mx-auto" />
        <Skeleton className="h-56 w-full mt-2" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!data.goal || dismissedOutcome) {
    return (
      <div>
        <div className="px-6 pt-4 pb-2">
          <h1 className="text-title font-semibold text-content">Goal</h1>
        </div>
      <div className="flex min-h-[65vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M60 0C93.1371 0 120 26.8629 120 60C120 93.1371 93.1371 120 60 120C26.8629 120 0 93.1371 0 60C0 26.8629 26.8629 0 60 0ZM60 28C42.3269 28 28 42.3269 28 60C28 77.6731 42.3269 92 60 92C77.6731 92 92 77.6731 92 60C92 42.3269 77.6731 28 60 28ZM60 48C66.6274 48 72 53.3726 72 60C72 66.6274 66.6274 72 60 72C53.3726 72 48 66.6274 48 60C48 53.3726 53.3726 48 60 48Z" fill="var(--color-accent)"/>
        </svg>
        <div>
          <p className="text-title font-semibold text-content">No active goal</p>
          <p className="mt-1 w-[240px] max-w-full text-callout text-content">Set a target weight and date to start tracking your progress.</p>
        </div>
        <div className="w-full max-w-[16rem]">
          <Button onClick={() => nav('/goal-setup')}>Set a goal</Button>
        </div>
      </div>
      </div>
    );
  }

  const { goal, weights, user, items } = data;
  const today = todayISO();
  const now = currentWeightKg(weights) ?? goal.startWeightKg;

  // ── Lifecycle state detection (derived — nothing stored) ──────────────────
  const isFinalDay  = goal.status === 'active' && goal.targetDate === today;
  const isOverdue   = goal.status === 'active' && goal.targetDate < today;
  const isCompleted = goal.status === 'completed';
  const isEnded     = goal.status === 'abandoned';

  if (isCompleted || isEnded) {
    return <GoalOutcomeView
      goal={goal}
      weights={weights}
      mode={isCompleted ? 'completed' : 'ended'}
      onDismiss={() => setDismissedOutcome(true)}
    />;
  }
  // ─────────────────────────────────────────────────────────────────────────

  const remaining = isGainGoal(goal)
    ? Math.max(0, goal.targetWeightKg - now)
    : Math.max(0, now - goal.targetWeightKg);
  const daysLeft = Math.max(0, Math.round((Date.parse(goal.targetDate) - Date.parse(today)) / MS_PER_DAY));
  const isEarlyComplete = !isOverdue && remaining === 0;
  const hasTodayWeight  = weights.some(w => w.date === today);
  const daysPast        = isOverdue ? Math.round((Date.parse(today) - Date.parse(goal.targetDate)) / MS_PER_DAY) : 0;

  async function endGoalOverdue() {
    await repos.goals.put({ ...goal, status: 'abandoned' });
  }

  async function completeGoalEarly() {
    await repos.goals.put({ ...goal, status: 'completed' });
  }

  // Week navigation bounds: clamp to goal date range.
  const minWeekOffset = Math.round(
    (Date.parse(getMondayOfWeek(goal.startDate) + 'T00:00:00') - Date.parse(getMondayOfWeek(today) + 'T00:00:00')) /
      (7 * MS_PER_DAY),
  );
  const prevWeekDisabled = weekOffset <= minWeekOffset;
  const nextWeekDisabled = weekOffset >= 0;

  // Week range label shown under the "Week N" nav header
  const viewedWeekStart = addDays(getMondayOfWeek(today), weekOffset * 7);
  const viewedWeekEnd   = addDays(viewedWeekStart, 6);
  const weekRangeLabel  = fmtWeekRange(viewedWeekStart, viewedWeekEnd);

  // Swipe handlers — defined here so they close over prevWeekDisabled / nextWeekDisabled
  function onChartTouchStart(e: React.TouchEvent) {
    swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    swipeIsH.current   = null;
    if (cardWrapRef.current) cardWrapRef.current.style.transition = 'none';
  }
  function onChartTouchMove(e: React.TouchEvent) {
    if (!swipeStart.current || !cardWrapRef.current) return;
    const dx = e.touches[0].clientX - swipeStart.current.x;
    const dy = e.touches[0].clientY - swipeStart.current.y;
    // Decide gesture axis once we have 6 px of movement
    if (swipeIsH.current === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      swipeIsH.current = Math.abs(dx) > Math.abs(dy);
    }
    if (!swipeIsH.current) return;
    // Rubber-band only at boundaries (0.2 resistance)
    const atBack = prevWeekDisabled && dx > 0;
    const atFwd  = nextWeekDisabled && dx < 0;
    if (atBack || atFwd) {
      cardWrapRef.current.style.transform = `translateX(${(dx * 0.2).toFixed(1)}px)`;
    }
  }
  function onChartTouchEnd(e: React.TouchEvent) {
    if (!swipeStart.current) return;
    const dx = e.changedTouches[0].clientX - swipeStart.current.x;
    const dy = e.changedTouches[0].clientY - swipeStart.current.y;
    swipeStart.current = null;
    // Always spring back to rest
    if (cardWrapRef.current) {
      cardWrapRef.current.style.transition = 'transform 280ms cubic-bezier(0.25, 0.46, 0.45, 0.94)';
      cardWrapRef.current.style.transform  = 'translateX(0)';
    }
    if (!swipeIsH.current || Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return;
    if (dx > 0 && !prevWeekDisabled) {
      hapticLight();
      setNavDir(-1);
      setWeekOffset((w) => w - 1);
      setAnimKeys((prev) => ({ ...prev, [tab]: prev[tab] + 1 }));
    } else if (dx < 0 && !nextWeekDisabled) {
      hapticLight();
      setNavDir(1);
      setWeekOffset((w) => w + 1);
      setAnimKeys((prev) => ({ ...prev, [tab]: prev[tab] + 1 }));
    }
  }

  return (
    <div className="pb-8 space-y-3">
      {/* ── Page title + settings trigger ──────────────────────────── */}
      <div className="px-6 pt-4 flex items-start justify-between">
        <h1 className="text-title font-semibold text-content">Goal</h1>
        <button
          onClick={() => setShowSettings(true)}
          aria-label="Goal settings"
          className="flex h-11 w-11 items-center justify-center -mr-2.5 rounded-control text-content-secondary active:bg-surface-sunken"
        >
          <Icon name="moreHoriz" size={20} />
        </button>
      </div>

      {/* ── Final-day banner — only when target not yet reached ──── */}
      {isFinalDay && !isEarlyComplete && !hasTodayWeight && (
        <div className="mx-6 rounded-card bg-accent px-4 py-4">
          <p className="text-callout font-semibold text-content">🎯 Final day!</p>
          <p className="mt-0.5 text-subhead text-content">Log your weigh-in and mark the goal complete</p>
          <button
            onClick={() => { hapticLight(); openAddEntry('weight', { hideTabs: true }); }}
            className="mt-3 w-full rounded-control bg-surface py-2.5 text-subhead font-semibold text-content active:opacity-80"
          >
            Log weight
          </button>
        </div>
      )}

      {/* ── Merged goal overview + chart container ───────────────── */}
      <div className="mx-6 rounded-main" style={{ boxShadow: 'inset 0 0 0 1px var(--color-border-field)' }}>
        {/* Goal overview — top section */}
        <div className="pt-5 px-6 pb-4">
          <h1 className="text-headline font-semibold text-center text-content">{goal.name}</h1>
          <p className="mt-0 text-subhead text-content text-center mb-4">
            Goal {displayWeight(goal.targetWeightKg, user?.units ?? 'kg')}  ·  by {fmtShortDate(goal.targetDate)}
          </p>
          {/* Stat tiles: white bg + shadow */}
          <div className="grid grid-cols-3 gap-2 items-stretch">
            <button onClick={() => { hapticLight(); setShowSettings(true); }} className="flex flex-col items-center justify-center rounded-card bg-surface shadow-card px-2 py-2.5 w-full active:opacity-70 transition-opacity">
              <span className="text-callout font-semibold text-content">{displayWeight(now, user?.units ?? 'kg')}</span>
              <span className="-mt-0.5 text-center text-subhead text-content-secondary">Current</span>
            </button>
            <button onClick={() => { hapticLight(); setShowSettings(true); }} className="flex flex-col items-center justify-center rounded-card bg-surface shadow-card px-2 py-2.5 w-full active:opacity-70 transition-opacity">
              <span className="text-callout font-semibold text-content">{isEarlyComplete ? '🎯' : displayWeight(remaining, user?.units ?? 'kg')}</span>
              <span className="-mt-0.5 text-center text-subhead text-content-secondary">{isGainGoal(goal) ? 'To gain' : 'Weight left'}</span>
            </button>
            <button onClick={() => { hapticLight(); setShowSettings(true); }} className="flex flex-col items-center justify-center rounded-card bg-surface shadow-card px-2 py-2.5 w-full active:opacity-70 transition-opacity">
              <span className="text-callout font-semibold text-content">
                {isOverdue ? `+${daysPast} d` : daysLeft > 0 ? `${daysLeft} d` : '🎯'}
              </span>
              <span className="-mt-0.5 text-center text-subhead text-content-secondary">
                {isOverdue ? 'Overdue' : daysLeft > 0 ? 'Time left' : 'Today'}
              </span>
            </button>
          </div>
          {/* Complete goal CTA — target reached early, OR final day with weight logged */}
          {(isEarlyComplete || (isFinalDay && hasTodayWeight)) && !isOverdue && (
            <div className="mt-2">
              <Button size="lg" onClick={() => { hapticLight(); setShowCompleteSheet(true); }}>Complete goal</Button>
            </div>
          )}
          {/* Overdue CTAs */}
          {isOverdue && (
            <div className="mt-2 space-y-2">
              <Button size="lg" onClick={() => { hapticLight(); setShowEndSheet(true); }}>End goal</Button>
              <Button variant="outline" onClick={() => { hapticLight(); nav('/goal-setup?skip-type=true'); }}>Extend goal date</Button>
            </div>
          )}
        </div>
        {/* ── Chart card — swipeable with rubber-band at week boundaries ─ */}
        <div ref={cardWrapRef} style={{ willChange: 'transform' }}>
        <Card padded={false} className="pt-6 pb-6 px-4 rounded-main shadow-card-lg"
          onTouchStart={onChartTouchStart}
          onTouchMove={onChartTouchMove}
          onTouchEnd={onChartTouchEnd}
        >
          {/* Segmented control — inside the card */}
          <div className="mb-4 flex justify-center">
            <SegmentedControl
              value={tab}
              onChange={(t) => handleTabChange(t as Tab)}
              options={[
                { value: 'overview', label: 'Weight' },
                { value: 'week', label: 'Calories' },
              ]}
            />
          </div>

          {/* Week navigation + date range — shown for both tabs */}
          <div className="mb-1 flex items-center justify-between">
            <button
              onClick={() => { hapticLight(); setNavDir(-1); setWeekOffset((w) => w - 1); setAnimKeys((prev) => ({ ...prev, [tab]: prev[tab] + 1 })); }}
              aria-label="Previous week"
              disabled={prevWeekDisabled}
              className="flex h-11 w-11 items-center justify-center rounded-control text-content-secondary active:bg-surface-sunken disabled:opacity-40 disabled:cursor-default"
            >
              <Icon name="chevronLeft" size={22} strokeWidth={2.25} />
            </button>
            <div className="text-center">
              <div className="text-subhead font-semibold text-content">
                Week {weekNumber(goal.startDate, weekOffset, today)}
              </div>
              <div className="text-subhead text-content-secondary">{weekRangeLabel}</div>
            </div>
            <button
              onClick={() => { hapticLight(); setNavDir(1); setWeekOffset((w) => w + 1); setAnimKeys((prev) => ({ ...prev, [tab]: prev[tab] + 1 })); }}
              aria-label="Next week"
              disabled={nextWeekDisabled}
              className="flex h-11 w-11 items-center justify-center rounded-control text-content-secondary active:bg-surface-sunken disabled:opacity-40 disabled:cursor-default"
            >
              <Icon name="chevronRight" size={22} strokeWidth={2.25} />
            </button>
          </div>

          {/* Chart — keyed so switching tabs remounts and restarts animations */}
          <div className="mt-3">
            {tab === 'overview' ? (
              <KgWeekChart
                key={animKeys.overview}
                goal={goal}
                weights={weights}
                weekOffset={weekOffset}
                today={today}
                navDir={navDir}
              />
            ) : (
              <WeekChart
                goal={goal}
                weights={weights}
                user={user}
                items={items ?? []}
                weekOffset={weekOffset}
                today={today}
                animTrigger={animKeys.week}
                navDir={navDir}
              />
            )}
          </div>
        </Card>
        </div>
      </div>

      {showSettings && (
        <GoalSettingsSheet goal={goal} onClose={() => setShowSettings(false)} />
      )}

      {/* Complete goal confirmation sheet */}
      {showCompleteSheet && (
        <Sheet
          title="Complete goal"
          onClose={() => setShowCompleteSheet(false)}
          footer={
            <div className="space-y-2">
              <Button size="lg" onClick={() => setShowCompleteSheet(false)}>Cancel</Button>
              <Button variant="outline" size="lg" onClick={async () => { setShowCompleteSheet(false); await completeGoalEarly(); }}>
                Yes, complete goal
              </Button>
            </div>
          }
        >
          <p className="text-subhead text-content-secondary pb-2">
            Please confirm that you wish to complete this goal. Your goal will be stored in &ldquo;Past goals&rdquo;.
          </p>
        </Sheet>
      )}

      {/* End goal confirmation sheet (overdue) */}
      {showEndSheet && (
        <Sheet
          title="End goal"
          onClose={() => setShowEndSheet(false)}
          footer={
            <Button size="lg" variant="destructive" onClick={async () => { setShowEndSheet(false); await endGoalOverdue(); }}>
              Yes, end goal
            </Button>
          }
        >
          <div className="space-y-3 pb-2">
            <p className="text-subhead text-content-secondary">
              End this goal? It'll stay in your history. You can start a new one anytime.
            </p>
            <Button variant="ghost" onClick={() => setShowEndSheet(false)}>Cancel</Button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

// ── Goal lifecycle sub-components ─────────────────────────────────────────────

/** Bottom sheet with plan summary + Complete / Edit plan / End goal actions.
 *  Accessible from the normal active view via the ⋯ button in the header. */
function GoalSettingsSheet({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const nav = useNavigate();
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  async function markComplete() {
    await repos.goals.put({ ...goal, status: 'completed' });
    onClose();
  }

  async function endGoal() {
    await repos.goals.put({ ...goal, status: 'abandoned' });
    onClose();
  }

  return (
    <>
      <Sheet title="Goal" onClose={onClose}>
        <div className="space-y-3 pb-2">
          <Button size="lg" onClick={() => setShowCompleteConfirm(true)}>Mark as complete</Button>
          <Button variant="outline" onClick={() => { onClose(); nav('/goal-setup'); }}>Edit plan</Button>
          <Button variant="outline" onClick={() => setShowEndConfirm(true)}>End goal</Button>
        </div>
      </Sheet>

      {showCompleteConfirm && (
        <Sheet
          title="Complete goal"
          onClose={() => setShowCompleteConfirm(false)}
          footer={
            <div className="space-y-2">
              <Button size="lg" onClick={() => setShowCompleteConfirm(false)}>Cancel</Button>
              <Button variant="outline" size="lg" onClick={markComplete}>Yes, complete goal</Button>
            </div>
          }
        >
          <p className="text-subhead text-content-secondary pb-2">
            Please confirm that you wish to complete this goal. Your goal will be stored in &ldquo;Past goals&rdquo;.
          </p>
        </Sheet>
      )}

      {showEndConfirm && (
        <Sheet
          title="End goal"
          onClose={() => setShowEndConfirm(false)}
          footer={<Button size="lg" variant="destructive" onClick={endGoal}>Yes, end goal</Button>}
        >
          <div className="space-y-3 pb-2">
            <p className="text-subhead text-content-secondary">End this goal? It'll stay in your history. You can start a new one anytime.</p>
            <Button variant="ghost" onClick={() => setShowEndConfirm(false)}>Cancel</Button>
          </div>
        </Sheet>
      )}
    </>
  );
}

/** Full-screen outcome view for completed or ended goals. */
function GoalOutcomeView({ goal, weights, mode, onDismiss }: {
  goal: Goal; weights: WeightEntry[]; mode: 'completed' | 'ended'; onDismiss: () => void;
}) {
  const nav = useNavigate();
  const [exiting, setExiting] = useState(false);
  const today = todayISO();
  const nowKg = currentWeightKg(weights) ?? goal.startWeightKg;
  const gainGoal = isGainGoal(goal);
  const lostKg = gainGoal
    ? Math.max(0, round1(nowKg - goal.startWeightKg))
    : Math.max(0, round1(goal.startWeightKg - nowKg));
  const daysTaken = Math.max(1, Math.round(
    (Date.parse(today) - Date.parse(goal.startDate)) / MS_PER_DAY,
  ));
  // Goal is achieved only when completed AND target weight was actually reached.
  const goalAchieved = mode === 'completed' && (
    gainGoal ? nowKg >= goal.targetWeightKg : nowKg <= goal.targetWeightKg
  );

  function slideDown(cb: () => void) {
    setExiting(true);
    setTimeout(cb, 320);
  }

  const animClass = exiting ? 'slide-down-out' : 'slide-up-in';

  return createPortal(
    <div className={`fixed inset-0 z-[200] flex justify-center overflow-hidden bg-surface-sunken ${animClass}`} style={{ touchAction: 'manipulation' }}>
      <div className="safe-top safe-bottom flex h-[100dvh] w-full max-w-[26.25rem] flex-col overflow-y-auto bg-surface-sunken" style={{ touchAction: 'pan-y' }}>
        {/* X dismiss button */}
        <div className="px-4 pt-5 pb-2 flex-shrink-0">
          <button
            onClick={() => slideDown(onDismiss)}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded-control text-content-muted active:bg-surface-sunken"
          >
            <Icon name="close" size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex flex-col items-center px-6 pb-8 gap-5">
          {/* Success icon */}
          <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M51.6615 69.3544L39.9329 57.6258C38.7146 56.4065 37.1783 55.7969 35.324 55.7969C33.4707 55.7969 31.9344 56.4065 30.7152 57.6258C29.497 58.844 28.8937 60.3803 28.9055 62.2346C28.9173 64.0879 29.5323 65.6237 30.7505 66.8419L46.9483 83.0397C48.2969 84.3795 49.8704 85.0494 51.6688 85.0494C53.4663 85.0494 55.0354 84.3795 56.3762 83.0397L89.0731 50.3413C90.2923 49.1231 90.9019 47.5932 90.9019 45.7516C90.9019 43.9091 90.2923 42.3787 89.0731 41.1604C87.8549 39.9412 86.3186 39.3316 84.4643 39.3316C82.6109 39.3316 81.0751 39.9412 79.8569 41.1604L51.6615 69.3544ZM60 120C51.6781 120 43.8698 118.426 36.5751 115.278C29.2794 112.13 22.9334 107.858 17.5371 102.463C12.1417 97.0666 7.87004 90.7206 4.72202 83.4249C1.57401 76.1301 0 68.3219 0 60C0 51.6781 1.57401 43.8698 4.72202 36.5751C7.87004 29.2794 12.1417 22.9334 17.5371 17.5371C22.9334 12.1417 29.2794 7.87004 36.5751 4.72202C43.8698 1.57401 51.6781 0 60 0C68.3219 0 76.1302 1.57401 83.4249 4.72202C90.7206 7.87004 97.0666 12.1417 102.463 17.5371C107.858 22.9334 112.13 29.2794 115.278 36.5751C118.426 43.8698 120 51.6781 120 60C120 68.3219 118.426 76.1301 115.278 83.4249C112.13 90.7206 107.858 97.0666 102.463 102.463C97.0666 107.858 90.7206 112.13 83.4249 115.278C76.1302 118.426 68.3219 120 60 120Z" fill="var(--color-accent)"/>
          </svg>

          {/* Title */}
          <div className="text-center -mt-1">
            {goalAchieved ? (
              <>
                <p className="text-display font-bold text-content leading-tight">Congrats</p>
                <p className="text-display font-bold text-content leading-tight">goal achieved!</p>
              </>
            ) : (
              <p className="text-display font-bold text-content">Goal ended</p>
            )}
          </div>

          {/* Summary container — outlined, no chart */}
          <div className="w-full rounded-main" style={{ boxShadow: 'inset 0 0 0 1px var(--color-border-field)' }}>
            <div className="pt-5 px-6 pb-5">
              <h1 className="text-headline font-semibold text-center text-content">{goal.name}</h1>
              <p className="mt-0 text-subhead text-content-secondary text-center mb-4">
                Goal {displayWeight(goal.targetWeightKg, user?.units ?? 'kg')} · by {fmtShortDate(goal.targetDate)}
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col items-center justify-center rounded-card bg-surface shadow-card px-2 py-2.5">
                  <span className="text-callout font-semibold text-content">{displayWeight(lostKg, user?.units ?? 'kg')}</span>
                  <span className="-mt-0.5 text-center text-subhead text-content-secondary leading-tight">Weight<br/>{gainGoal ? 'gained' : 'lost'}</span>
                </div>
                <div className="flex flex-col items-center justify-center rounded-card bg-surface shadow-card px-2 py-2.5">
                  <span className="text-callout font-semibold text-content">{displayWeight(nowKg, user?.units ?? 'kg')}</span>
                  <span className="-mt-0.5 text-center text-subhead text-content-secondary leading-tight">Final<br/>weight</span>
                </div>
                <div className="flex flex-col items-center justify-center rounded-card bg-surface shadow-card px-2 py-2.5">
                  <span className="text-callout font-semibold text-content">{daysTaken}</span>
                  <span className="-mt-0.5 text-center text-subhead text-content-secondary leading-tight">Total<br/>days</span>
                </div>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="w-full">
            <Button size="lg" onClick={() => slideDown(() => nav('/goal-setup?new=true'))}>Start next goal</Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Kg weekly chart ───────────────────────────────────────────────────────────

/** 7-day weight chart for the viewed week.
 *  Dashed planned trajectory line + mint dots for actual weigh-ins.
 *  Verdict row below: ahead (mint) or behind (dark) plan. */
function KgWeekChart({ goal, weights, weekOffset, today, navDir = 0 }: {
  goal: Goal; weights: WeightEntry[]; weekOffset: number; today: string;
  navDir?: 1 | -1 | 0;
}) {
  const weekStart = addDays(getMondayOfWeek(today), weekOffset * 7);
  const days      = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const W = 300, H = 153;
  const padLeft = 28, padRight = 10, padTop = 12, padBottom = 24;
  const chartW = W - padLeft - padRight;
  const chartH = H - padTop - padBottom;

  const goalStartMs = +new Date(goal.startDate    + 'T00:00:00');
  const goalEndMs   = +new Date(goal.targetDate   + 'T00:00:00');
  const totalMs     = Math.max(goalEndMs - goalStartMs, 1);

  /** Linear interpolation: planned weight on any ISO date. */
  const plannedFor = (iso: string): number => {
    const ms = +new Date(iso + 'T00:00:00');
    const t  = Math.max(0, Math.min(1, (ms - goalStartMs) / totalMs));
    return goal.startWeightKg + (goal.targetWeightKg - goal.startWeightKg) * t;
  };

  const daySeries = days.map((d) => ({
    date:           d,
    planned:        plannedFor(d),
    actual:         weights.find((w) => w.date === d)?.weightKg ?? null,
    isBeforeGoal:   d < goal.startDate,
  }));

  // Y-axis: fixed to the full goal range.
  // Lose: start at top, target at bottom (weight goes down).
  // Gain: start at bottom, target at top (weight goes up).
  const STEP = 0.5;
  const BUFFER = 0.3;
  const actualKgs = daySeries.map((d) => d.actual).filter((k): k is number => k !== null);
  const gain = isGainGoal(goal);

  // Base range: for lose, start(heavier) = top, target(lighter) = bottom.
  //             for gain, target(heavier) = top, start(lighter) = bottom.
  const baseMin = Math.floor(Math.min(goal.startWeightKg, goal.targetWeightKg) / STEP) * STEP;
  const baseMax = Math.max(goal.startWeightKg, goal.targetWeightKg);

  // Expand only if weigh-ins push outside the goal range.
  const dataMin = actualKgs.length > 0 ? Math.min(...actualKgs) - BUFFER : baseMin;
  const dataMax = actualKgs.length > 0 ? Math.max(...actualKgs) : baseMax;

  const rawMin = Math.min(dataMin, baseMin);
  const rawMax = Math.max(dataMax, baseMax);

  const tickMin = Math.floor(rawMin / STEP) * STEP;
  const tickMax = Math.ceil( rawMax / STEP) * STEP;
  const ticks: number[] = [];
  for (let v = tickMin; v <= tickMax + 0.001; v = round1(v + STEP)) ticks.push(v);

  const yMin = tickMin;
  const yMax = tickMax;

  const slotW = chartW / 7;
  const xFor  = (i: number) => padLeft + i * slotW + slotW / 2;
  const yFor  = (kg: number) => padTop + ((yMax - kg) / (yMax - yMin)) * chartH;

  // Planned line: only from goal start date onward
  const planLine = daySeries
    .map((d, i) => d.isBeforeGoal ? null : `${xFor(i).toFixed(1)},${yFor(d.planned).toFixed(1)}`)
    .filter((p): p is string => p !== null)
    .join(' ');

  // Actual dots + connecting polyline (only days with data, from goal start)
  const actualPts = daySeries
    .map((d, i) => (d.actual !== null && !d.isBeforeGoal) ? `${xFor(i).toFixed(1)},${yFor(d.actual).toFixed(1)}` : null)
    .filter((p): p is string => p !== null);

  // Weekly summary: last day with data up to today.
  // Ahead = weight is on the right side of the plan:
  //   lose: actual ≤ planned (lighter than planned = ahead)
  //   gain: actual ≥ planned (heavier than planned = ahead)
  const lastLogged = daySeries.filter((d) => d.actual !== null && d.date <= today).slice(-1)[0];
  const isAhead    = lastLogged
    ? (gain ? lastLogged.actual! >= lastLogged.planned : lastLogged.actual! <= lastLogged.planned)
    : false;
  const diffKg     = lastLogged ? Math.abs(lastLogged.actual! - lastLogged.planned) : 0;

  const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  // Animation: plan line settles vertically (slides into position), then actual line draws.
  const SETTLE_DUR = 0.45;
  const LINE_DELAY = SETTLE_DUR + 0.05;
  const LINE_DUR   = 0.9;

  // Haptics: fire in sync with each dot's kgDotPop animation.
  // KgWeekChart remounts on every week nav (key={animKeys.overview}), so a
  // mount-only effect fires each time the chart appears.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const dotIdxs = daySeries
      .map((d, i) => (!d.isBeforeGoal && d.actual !== null ? i : -1))
      .filter((x) => x >= 0);
    if (dotIdxs.length === 0) return;
    const xFirst = xFor(dotIdxs[0]);
    const timers = dotIdxs.map((i) => {
      const delayMs = (LINE_DELAY + (xFor(i) - xFirst) * LINE_DUR / 1200) * 1000;
      return window.setTimeout(() => hapticLight(), Math.round(delayMs));
    });
    return () => timers.forEach(window.clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount only — component remounts on week nav via key={animKeys.overview}

  // How many px does the plan line shift per week? (goal rate converted to Y scale)
  const MS_PER_DAY   = 86400_000;
  const weeklyKgDrop = (goal.startWeightKg - goal.targetWeightKg) /
    Math.max(1, totalMs / (7 * MS_PER_DAY));
  const weeklyYShift = (weeklyKgDrop / Math.max(0.01, yMax - yMin)) * chartH;
  // navDir 1 = going forward (line drops) → start from above (negative offset)
  // navDir -1 = going backward (line rises) → start from below (positive offset)
  const planFromY = navDir === 0 ? 0 : -navDir * weeklyYShift;

  // Build a human-readable summary for screen readers.
  const chartSummary = (() => {
    const latestActual = daySeries.filter((d) => d.actual !== null && d.date <= today).slice(-1)[0];
    const parts: string[] = [`Weight chart for the week of ${weekStart}.`];
    if (latestActual) {
      parts.push(`Latest logged weight: ${displayWeight(latestActual.actual!, user?.units ?? 'kg')} on ${latestActual.date}.`);
      parts.push(`${displayWeight(diffKg, user?.units ?? 'kg')} ${isAhead ? 'ahead of' : 'behind'} target.`);
    } else {
      parts.push('No weight logged this week.');
    }
    parts.push(`Goal: ${displayWeight(goal.startWeightKg, user?.units ?? 'kg')} → ${displayWeight(goal.targetWeightKg, user?.units ?? 'kg')} by ${goal.targetDate}.`);
    return parts.join(' ');
  })();

  return (
    <>
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={chartSummary}>
      <defs>
        <style>{`
          @keyframes planSettle {
            from { transform: translateY(${planFromY.toFixed(1)}px); }
            to   { transform: translateY(0px); }
          }
          @keyframes kgLineGrow {
            from { stroke-dashoffset: 1200; }
            to   { stroke-dashoffset: 0; }
          }
          @keyframes kgDotPop {
            0%   { transform: scale(0); }
            60%  { transform: scale(1.4); }
            80%  { transform: scale(0.85); }
            100% { transform: scale(1); }
          }
        `}</style>
      </defs>

      {/* Y-axis grid + labels */}
      {ticks.map((v) => (
        <g key={v}>
          <line x1={padLeft + 16} y1={yFor(v)} x2={padLeft + chartW - 16} y2={yFor(v)}
            stroke="var(--color-border-subtle)" strokeWidth={0.75} />
          {(user?.units === 'lbs' ? Number.isInteger(Math.round(kgToLbs(v))) : v === Math.floor(v)) && (
            <text x={padLeft - 4} y={yFor(v)} textAnchor="end" dominantBaseline="middle"
              fontSize="12"
              fontWeight="400"
              fill="var(--color-content-muted)"
            >{user?.units === 'lbs' ? Math.round(kgToLbs(v)) : v}</text>
          )}
        </g>
      ))}

      {/* Planned trajectory — dashed, settles vertically into position */}
      {planLine && (
        <g style={{
          animationName: 'planSettle',
          animationDuration: `${SETTLE_DUR}s`,
          animationTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
          animationFillMode: 'both',
        }}>
          <polyline points={planLine} fill="none"
            stroke="var(--color-border-strong)" strokeWidth={1.5}
            strokeDasharray="4 6" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}

      {/* Actual weight connecting line — curved, draws after plan line finishes */}
      {actualPts.length > 1 && (() => {
        // Convert points to path with cubic Bezier curves for smooth line
        const pts = actualPts.map(p => {
          const [x, y] = p.split(',').map(Number);
          return { x, y };
        });
        let pathD = `M ${pts[0].x} ${pts[0].y}`;
        for (let i = 1; i < pts.length; i++) {
          const p0 = pts[i - 1];
          const p1 = pts[i];
          const p_prev = i > 1 ? pts[i - 2] : p0;
          const p_next = i < pts.length - 1 ? pts[i + 1] : p1;

          // Control points for cubic Bezier (Catmull-Rom style)
          const cp1x = p0.x + (p1.x - p_prev.x) / 6;
          const cp1y = p0.y + (p1.y - p_prev.y) / 6;
          const cp2x = p1.x - (p_next.x - p0.x) / 6;
          const cp2y = p1.y - (p_next.y - p0.y) / 6;

          pathD += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p1.x} ${p1.y}`;
        }
        return (
          <path d={pathD} fill="none"
            stroke="var(--color-accent)" strokeWidth={2.5}
            strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray="1200"
            style={{
              animationName: 'kgLineGrow',
              animationDuration: `${LINE_DUR}s`,
              animationDelay: `${LINE_DELAY}s`,
              animationTimingFunction: 'ease-out',
              animationFillMode: 'both',
            }}
          />
        );
      })()}

      {/* Actual weight dots — pop exactly when the line reaches each slot.
           The line draws via stroke-dashoffset 1200→0 over LINE_DUR. A dot at
           x=xFor(i) is reached at time proportional to its offset from xFirst. */}
      {(() => {
        const dotIdxs = daySeries.map((d, i) => (!d.isBeforeGoal && d.actual !== null ? i : -1)).filter(x => x >= 0);
        const xFirst = dotIdxs.length > 0 ? xFor(dotIdxs[0]) : xFor(0);
        return daySeries.map((d, i) => d.actual !== null && !d.isBeforeGoal && (
          <circle key={d.date} cx={xFor(i)} cy={yFor(d.actual)} r={3.5}
            fill="var(--color-accent)"
            style={{
              transformBox: 'fill-box',
              transformOrigin: '50% 50%',
              animationName: 'kgDotPop',
              animationDuration: '0.4s',
              animationTimingFunction: 'ease-out',
              animationFillMode: 'both',
              // Line reveals left→right at rate 1200px/LINE_DUR; dot fires when line reaches its x
              animationDelay: `${(LINE_DELAY + (xFor(i) - xFirst) * LINE_DUR / 1200).toFixed(2)}s`,
            }}
          />
        ));
      })()}

      {/* X-axis day labels */}
      {DAY_LABELS.map((letter, i) => {
        const isToday       = days[i] === today;
        const isFuture      = days[i] > today;
        const isBeforeGoal  = days[i] < goal.startDate;
        return (
          <text key={i} x={xFor(i)} y={H - 7} textAnchor="middle" fontSize="12"
            fontWeight={isToday ? '700' : '400'}
            fill={isToday ? 'var(--color-content)' : 'var(--color-content-muted)'}
            opacity={isBeforeGoal ? 0.2 : isFuture ? 0.4 : 1}>
            {letter}
          </text>
        );
      })}

      {/* No data hint */}
      {daySeries.every((d) => d.actual === null || d.isBeforeGoal) && (
        <text x={padLeft + chartW / 2} y={padTop + chartH / 2}
          textAnchor="middle" dominantBaseline="middle"
          fontSize="9" fill="var(--color-content-muted)">
          Log weigh-ins to see your trend
        </text>
      )}
    </svg>

    {/* Weekly verdict — badge */}
    <div className="mt-3 flex justify-center">
      {lastLogged ? (
        <Badge status={isAhead ? 'success' : 'default'}>
          {isAhead ? 'Ahead' : 'Behind'}{'  ·  '}{displayWeight(diffKg, user?.units ?? 'kg')}
        </Badge>
      ) : (
        <Badge status="neutral">No weigh-ins yet</Badge>
      )}
    </div>
    </>
  );
}

// ── Week chart (cumulative consumption vs. budget) ────────────────────────────
// Bars show cumulative calories CONSUMED. The dashed ramp shows cumulative
// BUDGET (what you COULD eat while still hitting your deficit target).
// Bar exceeds ramp = over budget = bad (dark).
// Bar stays below ramp = on track (mint).

interface DayBar { date: string; consumed: number; budget: number; hasData: boolean }

function WeekChart({ goal, weights, user, items, weekOffset, today, animTrigger = 0 }: {
  goal: Goal; weights: WeightEntry[]; user: User | null | undefined; items: FoodItem[];
  weekOffset: number; today: string; animTrigger?: number; navDir?: 1 | -1 | 0;
}) {
  const weekStart    = addDays(getMondayOfWeek(today), weekOffset * 7);
  const days         = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const iMap         = itemsByIdMap(items);
  const dailyTarget  = requiredDailyDeficit(goal); // signed: negative for gain
  const gainChart    = isGainGoal(goal);

  const rawData = useLive(async (): Promise<DayBar[]> => {
    return Promise.all(days.map(async (d) => {
      const [foods, activities] = await Promise.all([
        repos.foodEntries.byDate(d),
        repos.activities.byDate(d),
      ]);
      const hasData = foods.length > 0 || activities.length > 0;
      const bmr = user ? bmrForDate(d, weights, user) : 0;
      const { consumed, totalBurn } = summarizeDay(bmr, foods, activities, iMap);
      // dailyTarget is signed: positive=deficit(lose), negative=surplus(gain).
      // budget = what you should eat to hit the target:
      //   lose: totalBurn - deficit (eat LESS than burn)
      //   gain: totalBurn - (-surplus) = totalBurn + surplus (eat MORE than burn)
      const budget = (totalBurn > 0 ? totalBurn : bmr) - dailyTarget;
      return { date: d, consumed, budget, hasData };
    }));
  }, [weekOffset, weights, user]);

  // Keep last valid data so skeleton never flashes on week change.
  const [displayData, setDisplayData] = useState<DayBar[] | null>(null);
  const rawDataRef = useRef<DayBar[] | null>(null);
  // 'in' = bars growing up; 'out' = bars collapsing down.
  const [animPhase, setAnimPhase] = useState<'in' | 'out'>('in');
  const prevTrigger = useRef(animTrigger);
  const mountHapticDone = useRef(false);

  useEffect(() => {
    if (!rawData) return;
    rawDataRef.current = rawData;
    // Only update display immediately if not mid-collapse.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- update display data when rawData changes, guarded by animation phase
    if (animPhase !== 'out') setDisplayData(rawData);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawData]);

  // Initial mount: fire haptics once when data first arrives and bars start growing.
  useEffect(() => {
    if (!displayData || mountHapticDone.current) return;
    mountHapticDone.current = true;
    if (prefersReducedMotion()) return;
    displayData.forEach((d, i) => {
      if (d.date > today || d.date < goal.startDate) return;
      window.setTimeout(() => hapticLight(), i * 70);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayData]);

  useEffect(() => {
    if (animTrigger === prevTrigger.current) return;
    prevTrigger.current = animTrigger;
    setAnimPhase('out');
    const hapticTimers: number[] = [];
    const t = window.setTimeout(() => {
      // Swap in latest data and start grow animation.
      if (rawDataRef.current) setDisplayData(rawDataRef.current);
      setAnimPhase('in');
      // Fire haptics in sync with each bar's staggered grow (i * 70ms).
      if (!prefersReducedMotion()) {
        rawDataRef.current?.forEach((d, i) => {
          if (d.date > today || d.date < goal.startDate) return;
          hapticTimers.push(window.setTimeout(() => hapticLight(), i * 70));
        });
      }
    }, 220);
    return () => {
      window.clearTimeout(t);
      hapticTimers.forEach(window.clearTimeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on animTrigger only; goal.startDate/today are stable refs used inside
  }, [animTrigger]);

  const W = 300, H = 153;
  const padLeft = 28, padRight = 12, padTop = 14, padBottom = 24;
  const chartW = W - padLeft - padRight;
  const chartH = H - padTop - padBottom;

  if (!displayData) {
    return (
      <div className="flex h-[135px] items-center justify-center">
        <Skeleton className="h-full w-full rounded-card" />
      </div>
    );
  }

  const dayData = displayData;

  // Build cumulative consumed + cumulative budget
  const cumulData = dayData.reduce<(DayBar & { cumConsumed: number; cumBudget: number; isFuture: boolean; isBeforeGoal: boolean })[]>(
    (acc, d) => {
      const prev = acc[acc.length - 1];
      const isFuture     = d.date > today;
      const isBeforeGoal = d.date < goal.startDate;
      // Consumption: only accumulate past/today days that have data
      const cumConsumed = (prev?.cumConsumed ?? 0) + (!isFuture && !isBeforeGoal && d.hasData ? d.consumed : 0);
      // Budget: always project forward for goal days (fixes flat-line on new weeks)
      // but skip pre-goal days so the ramp starts at goal start
      const cumBudget = (prev?.cumBudget ?? 0) + (!isBeforeGoal ? d.budget : 0);
      return [...acc, { ...d, cumConsumed, cumBudget, isFuture, isBeforeGoal }];
    },
    [],
  );

  const maxBudget   = Math.max(...cumulData.map((d) => d.cumBudget));
  const maxConsumed = Math.max(...cumulData.map((d) => d.cumConsumed));
  const maxY = Math.max(maxBudget, maxConsumed) * 1.1 || 9000;

  const toY     = (v: number) => padTop + chartH * (1 - Math.max(0, v) / maxY);
  const barSlot = chartW / 7;
  const barW    = barSlot - 7;
  const barX    = (i: number) => padLeft + i * barSlot + 3.5;
  const midX    = (i: number) => padLeft + (i + 0.5) * barSlot;

  // Budget ramp through all 7 days
  const rampPoints = cumulData
    .map((d, i) => `${midX(i).toFixed(1)},${toY(d.cumBudget).toFixed(1)}`)
    .join(' ');

  // Summary: last past day with data
  const lastWithData = cumulData.filter((d) => d.hasData && !d.isFuture).slice(-1)[0];
  const hasAnyData   = Boolean(lastWithData);
  const cumCons      = lastWithData?.cumConsumed ?? 0;
  const cumBudg      = lastWithData?.cumBudget   ?? 0;
  const isOver       = cumCons > cumBudg;
  const diff         = Math.abs(Math.round(cumCons - cumBudg));

  const weekChartLabel = hasAnyData
    ? `Calorie ${gainChart ? 'surplus' : 'deficit'} chart, week of ${weekStart}. Cumulative consumed: ${Math.round(cumCons)} kcal, budget: ${Math.round(cumBudg)} kcal. ${isOver ? `Over budget by ${diff} kcal.` : `Under budget by ${diff} kcal.`}`
    : `Calorie ${gainChart ? 'surplus' : 'deficit'} chart, week of ${weekStart}. No data logged yet.`;

  return (
    <>
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={weekChartLabel}>
      <defs>
        <style>{`
          @keyframes barGrow {
            from { transform: scaleY(0); }
            to   { transform: scaleY(1); }
          }
          @keyframes barCollapse {
            from { transform: scaleY(1); }
            to   { transform: scaleY(0); }
          }
        `}</style>
      </defs>

      {/* Y-axis labels (5K, 6K, etc.) */}
      {(() => {
        const yAxisTicks = [];
        for (let v = 5000; v <= maxY; v += 5000) {
          yAxisTicks.push(v);
        }
        return yAxisTicks.map((v) => (
          <text key={v} x={padLeft - 4} y={toY(v)} textAnchor="end" dominantBaseline="middle"
            fontSize="12"
            fontWeight="400"
            fill="var(--color-content-muted)"
          >{(v / 1000).toFixed(0)}K</text>
        ));
      })()}

      {/* Budget ramp — dashed. For lose: bar exceeds it = over budget (bad).
          For gain: bar stays below it = under budget (bad). */}
      {dailyTarget !== 0 && (
        <polyline points={rampPoints} fill="none"
          stroke="var(--color-border-strong)" strokeWidth={1.5}
          strokeDasharray="4 4" strokeLinejoin="round" />
      )}

      {cumulData.map(({ date, cumConsumed, cumBudget, isFuture, isBeforeGoal, hasData }, i) => {
        const isToday = date === today;
        const x = barX(i);

        // Pre-goal or future: just a faint stub + label
        if (isBeforeGoal || isFuture) {
          return (
            <g key={date} opacity={isBeforeGoal ? 0.2 : 1}>
              <rect x={x} y={padTop + chartH - 4} width={barW} height={4}
                rx={2} fill="var(--color-border-subtle)" />
              <text x={x + barW / 2} y={H - 7} textAnchor="middle"
                fontSize="12" fill="var(--color-content-muted)">
                {fmtWeekday(date)}
              </text>
            </g>
          );
        }

        const ratio    = cumConsumed > 0 ? Math.min(1, cumConsumed / maxY) : 0;
        const barH     = Math.max(ratio * chartH, hasData ? 5 : 0);
        const barY     = padTop + chartH - barH;
        // Lose: over budget (bar > ramp) = bad (dark); under = mint.
        // Gain: under budget (bar < ramp) = bad (dark); over = mint (eating enough).
        const onTarget = gainChart ? cumConsumed >= cumBudget : cumConsumed <= cumBudget;
        const fillColor = !hasData
          ? 'var(--color-border-subtle)'
          : onTarget
          ? 'var(--color-accent)'
          : 'var(--color-content)';

        return (
          <g key={date}>
            <rect x={x} y={barY} width={barW} height={Math.max(barH, 0)}
              rx={8} fill={fillColor} opacity={hasData ? 1 : 0.5}
              style={{
                transformBox: 'fill-box',
                transformOrigin: '50% 100%',
                animationName: animPhase === 'out' ? 'barCollapse' : 'barGrow',
                animationDuration: animPhase === 'out' ? '0.18s' : '0.45s',
                animationTimingFunction: animPhase === 'out'
                  ? 'ease-in'
                  : 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                animationFillMode: 'both',
                animationDelay: animPhase === 'out' ? '0s' : `${(i * 0.07).toFixed(2)}s`,
              }}
            />
            <text x={x + barW / 2} y={H - 7} textAnchor="middle"
              fontSize="12" fontWeight={isToday ? '700' : '400'}
              fill={isToday ? 'var(--color-content)' : 'var(--color-content-muted)'}>
              {fmtWeekday(date)}
            </text>
          </g>
        );
      })}
    </svg>

    {/* Weekly summary — badge.
        Lose: under budget (not over) = success. Gain: over budget = success. */}
    <div className="mt-3 flex justify-center">
      {!hasAnyData ? (
        <Badge status="neutral">No data yet</Badge>
      ) : gainChart ? (
        <Badge status={isOver ? 'success' : 'default'}>
          {isOver ? 'On target' : 'Under target'}{'  ·  '}{diff.toLocaleString()} kcal
        </Badge>
      ) : (
        <Badge status={!isOver ? 'success' : 'default'}>
          {isOver ? 'Over' : 'On target'}{'  ·  '}{diff.toLocaleString()} kcal
        </Badge>
      )}
    </div>
    </>
  );
}
