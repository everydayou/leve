import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useLive } from '../../state/live';
import { repos } from '../../state/repos';
import { isGainGoal, currentWeightKg } from '../../domain/goal';
import { displayWeight } from '../../domain/units';
import { todayISO, addDays } from '../../data/ids';
import { getMondayOfWeek, MS_PER_DAY } from '../../lib/date';
import { round1 } from '../../lib/num';
import { hapticLight } from '../../lib/haptics';
import { Icon, Badge, Skeleton, Card, SegmentedControl } from '../kit';
import { KgWeekChart, WeekChart } from './GoalScreen';
import { weekNumber, fmtWeekRange } from './chartUtils';
import type { Goal, WeightEntry, User, FoodItem } from '../../domain/types';

// ── Slide container (right-to-left push) ────────────────────────────────────

function SlideScreen({ children, exiting, onScroll }: { children: React.ReactNode; exiting: boolean; onScroll?: React.UIEventHandler<HTMLDivElement> }) {
  return (
    <div
      className={`fixed inset-0 z-[150] flex justify-center overflow-hidden bg-surface-sunken ${exiting ? 'slide-out-right' : 'slide-in-right'}`}
      style={{ touchAction: 'manipulation' }}
    >
      <div
        className="safe-top safe-bottom flex h-[100dvh] w-full max-w-[26.25rem] flex-col overflow-x-hidden overflow-y-auto bg-surface"
        style={{ touchAction: 'pan-y' }}
        onScroll={onScroll}
      >
        {children}
      </div>
    </div>
  );
}

// ── Shared nav header ────────────────────────────────────────────────────────

function SlideHeader({ title, onBack, scrolled = false }: { title: string; onBack: () => void; scrolled?: boolean }) {
  return (
    <div className={`sticky top-0 z-20 bg-surface transition-[box-shadow] duration-200${scrolled ? ' shadow-nav' : ''}`}>
      <div className="pointer-events-none absolute left-0 right-0 bg-surface" style={{ bottom: '100%', height: 'env(safe-area-inset-top, 0px)' }} />
      <div className="flex items-center gap-2 px-4 pt-5 pb-4">
        <button onClick={onBack} aria-label="Back" className="-ml-2 flex h-10 w-10 items-center justify-center text-content-muted">
          <Icon name="chevronLeft" size={20} strokeWidth={2.5} />
        </button>
        <span className="text-headline font-semibold text-content truncate">{title}</span>
      </div>
    </div>
  );
}

// ── Stat card (used in goal overview) ───────────────────────────────────────

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card bg-surface shadow-card px-2 py-2.5">
      <span className="text-callout font-semibold text-content">{value}</span>
      <span className="-mt-0.5 whitespace-pre-line text-center text-subhead text-content-secondary leading-tight">{label}</span>
    </div>
  );
}

// ── Chart section (mirrors GoalScreen chart card) ────────────────────────────

type ChartTab = 'overview' | 'week';

function PastGoalChart({
  goal, weights, user, items,
}: {
  goal: Goal; weights: WeightEntry[]; user: User | null; items: FoodItem[];
}) {
  // For past goals, "today" is capped at the goal's target date
  const today = todayISO();
  const chartToday = goal.targetDate < today ? goal.targetDate : today;

  const [tab, setTab] = useState<ChartTab>('overview');
  const [weekOffset, setWeekOffset] = useState(0); // 0 = goal's end week
  const [navDir, setNavDir] = useState<1 | -1 | 0>(0);
  const [animKeys, setAnimKeys] = useState({ overview: 0, week: 0 });

  function handleTabChange(t: ChartTab) {
    setTab(t);
    setAnimKeys((prev) => ({ ...prev, [t]: prev[t] + 1 }));
  }

  // Bounds: clamp to [goal start week … goal end week]
  const goalEndMonday = getMondayOfWeek(chartToday);
  const goalStartMonday = getMondayOfWeek(goal.startDate);
  const minWeekOffset = Math.round(
    (Date.parse(goalStartMonday + 'T00:00:00') - Date.parse(goalEndMonday + 'T00:00:00')) /
      (7 * MS_PER_DAY),
  );
  const prevWeekDisabled = weekOffset <= minWeekOffset;
  const nextWeekDisabled = weekOffset >= 0;

  // Week label (relative to goal start, not real today)
  const wNum = weekNumber(goal.startDate, weekOffset, chartToday);

  const viewedWeekStart = addDays(goalEndMonday, weekOffset * 7);
  const viewedWeekEnd   = addDays(viewedWeekStart, 6);
  const weekRangeLabel  = fmtWeekRange(viewedWeekStart, viewedWeekEnd);

  return (
    <Card padded={false}>
      {/* Tab toggle */}
      <div className="px-4 pt-4 pb-3">
        <SegmentedControl<ChartTab>
          value={tab}
          onChange={handleTabChange}
          options={[
            { value: 'overview', label: 'Weight' },
            { value: 'week',     label: 'Calories' },
          ]}
        />
      </div>

      {/* Week navigation */}
      <div className="mb-1 flex items-center justify-between px-1">
        <button
          onClick={() => { hapticLight(); setNavDir(-1); setWeekOffset((w) => w - 1); setAnimKeys((prev) => ({ ...prev, [tab]: prev[tab] + 1 })); }}
          aria-label="Previous week"
          disabled={prevWeekDisabled}
          className="flex h-11 w-11 items-center justify-center rounded-control text-content-secondary active:bg-surface-sunken disabled:opacity-40 disabled:cursor-default"
        >
          <Icon name="chevronLeft" size={22} strokeWidth={2.25} />
        </button>
        <div className="text-center">
          <div className="text-subhead font-semibold text-content">Week {wNum}</div>
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

      <div className="px-4 pb-4 mt-2">
        {tab === 'overview' ? (
          <KgWeekChart
            key={animKeys.overview}
            goal={goal}
            weights={weights}
            weekOffset={weekOffset}
            today={chartToday}
            navDir={navDir}
            units={user?.units ?? 'kg'}
          />
        ) : (
          <WeekChart
            goal={goal}
            weights={weights}
            user={user}
            items={items}
            weekOffset={weekOffset}
            today={chartToday}
            animTrigger={animKeys.week}
            navDir={navDir}
          />
        )}
      </div>
    </Card>
  );
}

// ── Past goal detail screen ──────────────────────────────────────────────────

function PastGoalDetail({
  goalId, onBack,
}: {
  goalId: string; onBack: () => void;
}) {
  const [exiting, setExiting] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const data = useLive(async () => {
    const [allGoals, allWeights, allItems, user] = await Promise.all([
      repos.goals.getAll(),
      repos.weights.all(),
      repos.foodItems.all(),
      repos.user.get(),
    ]);
    const goal = allGoals.find((g) => g.id === goalId);
    if (!goal) return null;
    return { goal, weights: allWeights as WeightEntry[], items: allItems as FoodItem[], user: user ?? null };
  }, [goalId]);

  function goBack() {
    setExiting(true);
    setTimeout(onBack, 280);
  }

  if (data === null) {
    return (
      <SlideScreen exiting={exiting} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}>
        <SlideHeader title="Goal" onBack={goBack} scrolled={scrolled} />
        <p className="px-6 text-subhead text-content-muted">Goal not found.</p>
      </SlideScreen>
    );
  }

  if (data === undefined) {
    return (
      <SlideScreen exiting={exiting} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}>
        <div className="p-6 space-y-3">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-36 w-full rounded-main" />
          <Skeleton className="h-48 w-full rounded-card" />
        </div>
      </SlideScreen>
    );
  }

  const { goal, weights, items, user } = data;
  const units = user?.units ?? 'kg';
  const gainGoal = isGainGoal(goal);
  const nowKg = currentWeightKg(weights) ?? goal.startWeightKg;
  const lostKg = Math.max(0, round1(gainGoal ? nowKg - goal.startWeightKg : goal.startWeightKg - nowKg));
  const daysTaken = Math.max(1, Math.round(
    (Date.parse(goal.targetDate) - Date.parse(goal.startDate)) / MS_PER_DAY,
  ));

  const fmtDate = (iso: string) =>
    new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <SlideScreen exiting={exiting} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}>
      <SlideHeader title={goal.name} onBack={goBack} scrolled={scrolled} />

      <div className="px-6 pb-8 space-y-4">
        {/* Overview card */}
        <div className="rounded-main" style={{ boxShadow: 'inset 0 0 0 1px var(--color-border-field)' }}>
          <div className="px-6 pt-5 pb-5">
            <p className="text-subhead text-content-secondary text-center mb-4">
              Goal {displayWeight(goal.targetWeightKg, units)} · by {fmtDate(goal.targetDate)}
            </p>
            <div className="grid grid-cols-3 gap-2">
              <StatCard value={displayWeight(lostKg, units)} label={`Weight\n${gainGoal ? 'gained' : 'lost'}`} />
              <StatCard value={displayWeight(nowKg, units)} label={'Final\nweight'} />
              <StatCard value={String(daysTaken)} label={'Total\ndays'} />
            </div>
            <div className="mt-3 flex justify-center">
              <Badge status={goal.status === 'completed' ? 'success' : 'neutral'}>
                {goal.status === 'completed' ? 'Completed' : 'Ended'}
              </Badge>
            </div>
          </div>
        </div>

        {/* Full chart — same as GoalScreen */}
        <PastGoalChart goal={goal} weights={weights} user={user} items={items} />
      </div>
    </SlideScreen>
  );
}

// ── Past goals list ──────────────────────────────────────────────────────────

function PastGoalsList({
  onBack, onSelect,
}: {
  onBack: () => void; onSelect: (id: string) => void;
}) {
  const [exiting, setExiting] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const goals = useLive(async () => {
    const all = await repos.goals.getAll();
    return all
      .filter((g) => g.status !== 'active')
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, []);

  function goBack() {
    setExiting(true);
    setTimeout(onBack, 280);
  }

  const fmtDate = (iso: string) =>
    new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <SlideScreen exiting={exiting} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}>
      <SlideHeader title="Past goals" onBack={goBack} scrolled={scrolled} />

      <div className="px-6 pb-8">
        {goals === undefined ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-card" />
            <Skeleton className="h-20 w-full rounded-card" />
          </div>
        ) : goals.length === 0 ? (
          <p className="text-subhead text-content-muted text-center mt-8">No past goals yet.</p>
        ) : (
          <div className="space-y-3">
            {goals.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => { hapticLight(); onSelect(g.id); }}
                className="w-full rounded-card border border-border-subtle bg-surface p-4 text-left shadow-card active:opacity-70"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-subhead font-semibold text-content truncate">{g.name}</p>
                    <p className="text-footnote text-content-secondary mt-0.5">
                      {isGainGoal(g) ? 'Build muscle' : 'Lose weight'} · {fmtDate(g.startDate)} – {fmtDate(g.targetDate)}
                    </p>
                  </div>
                  <Badge status={g.status === 'completed' ? 'success' : 'neutral'}>
                    {g.status === 'completed' ? 'Completed' : 'Ended'}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </SlideScreen>
  );
}

// ── Portal entry point (rendered from GoalScreen) ────────────────────────────

export function PastGoalsPortal({
  onClose,
}: {
  goal?: Goal; weights?: WeightEntry[]; user?: User | null; onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return createPortal(
    <>
      <PastGoalsList
        onBack={onClose}
        onSelect={setSelectedId}
      />
      {selectedId !== null && (
        <PastGoalDetail
          goalId={selectedId}
          onBack={() => setSelectedId(null)}
        />
      )}
    </>,
    document.body,
  );
}

// ── Legacy route exports (kept for App.tsx compatibility, redirect to /goal) ─
export function PastGoalsScreen() { return null; }
export function PastGoalDetailScreen() { return null; }
