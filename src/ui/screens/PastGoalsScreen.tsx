import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLive } from '../../state/live';
import { repos } from '../../state/repos';
import { isGainGoal, currentWeightKg } from '../../domain/goal';
import { displayWeight } from '../../domain/units';
import { todayISO, addDays } from '../../data/ids';
import { getMondayOfWeek } from '../../lib/date';
import { round1 } from '../../lib/num';
import { Icon, Badge, Skeleton } from '../kit';
import { KgWeekChart } from './GoalScreen';
import type { WeightEntry } from '../../domain/types';

// ── Shared helpers ────────────────────────────────────────────────────────────

const fmtDate = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** Full-screen container that slides in from right on mount, slides out on exit. */
function SlideScreen({
  children,
  exiting,
}: {
  children: React.ReactNode;
  exiting: boolean;
}) {
  const cls = exiting ? 'slide-out-right' : 'slide-in-right';
  return (
    <div
      className={`fixed inset-0 z-[100] flex justify-center overflow-hidden bg-surface-sunken ${cls}`}
      style={{ touchAction: 'manipulation' }}
    >
      <div
        className="safe-top safe-bottom flex h-[100dvh] w-full max-w-[26.25rem] flex-col overflow-x-hidden overflow-y-auto bg-surface"
        style={{ touchAction: 'pan-y' }}
      >
        {children}
      </div>
    </div>
  );
}

// ── Past Goals List ───────────────────────────────────────────────────────────

export function PastGoalsScreen() {
  const nav = useNavigate();
  const [exiting, setExiting] = useState(false);

  const goals = useLive(async () => {
    const all = await repos.goals.getAll();
    return all.filter(g => g.status !== 'active').sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, []);

  function goBack() {
    setExiting(true);
    setTimeout(() => nav(-1), 280);
  }

  return (
    <SlideScreen exiting={exiting}>
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-surface">
        <div
          className="pointer-events-none absolute left-0 right-0 bg-surface"
          style={{ bottom: '100%', height: 'env(safe-area-inset-top, 0px)' }}
        />
        <div className="flex items-center gap-2 px-4 pt-5 pb-4">
          <button
            onClick={goBack}
            aria-label="Back"
            className="-ml-2 flex h-10 w-10 items-center justify-center text-content-muted"
          >
            <Icon name="chevronLeft" size={20} strokeWidth={2.5} />
          </button>
          <span className="text-headline font-semibold text-content">Past goals</span>
        </div>
      </div>

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
                onClick={() => nav(`/past-goals/${g.id}`)}
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

// ── Past Goal Detail ──────────────────────────────────────────────────────────

export function PastGoalDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [exiting, setExiting] = useState(false);
  const today = todayISO();

  // For weekly chart navigation — start at the goal's last week
  const [weekOffset, setWeekOffset] = useState(0);
  const [navDir, setNavDir] = useState<1 | -1 | 0>(0);

  const data = useLive(async () => {
    const [allGoals, allWeights, user] = await Promise.all([
      repos.goals.getAll(),
      repos.weights.all(),
      repos.user.get(),
    ]);
    const goal = allGoals.find(g => g.id === id);
    if (!goal) return null;
    return { goal, weights: allWeights as WeightEntry[], units: user?.units ?? 'kg' };
  }, [id]);

  function goBack() {
    setExiting(true);
    setTimeout(() => nav(-1), 280);
  }

  if (data === null) {
    return (
      <SlideScreen exiting={exiting}>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-subhead text-content-muted">Goal not found.</p>
        </div>
      </SlideScreen>
    );
  }

  if (data === undefined) {
    return (
      <SlideScreen exiting={exiting}>
        <div className="p-6 space-y-3">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-36 w-full rounded-main" />
          <Skeleton className="h-40 w-full rounded-card" />
        </div>
      </SlideScreen>
    );
  }

  const { goal, weights, units } = data;
  const gainGoal = isGainGoal(goal);
  const nowKg = currentWeightKg(weights) ?? goal.startWeightKg;
  const lostKg = gainGoal
    ? Math.max(0, round1(nowKg - goal.startWeightKg))
    : Math.max(0, round1(goal.startWeightKg - nowKg));
  const MS_PER_DAY = 86400000;
  const daysTaken = Math.max(1, Math.round(
    (Date.parse(goal.targetDate) - Date.parse(goal.startDate)) / MS_PER_DAY,
  ));

  // Anchor weekOffset=0 to the goal's target week
  const goalEndMonday = getMondayOfWeek(goal.targetDate);

  // Compute an adjusted today that stays within the goal period for the chart
  const chartToday = goal.targetDate < today ? goal.targetDate : today;
  const chartTodayForOffset = addDays(goalEndMonday, weekOffset * 7);
  void chartTodayForOffset; // used via weekOffset in KgWeekChart

  function changeWeek(dir: 1 | -1) {
    const next = weekOffset + dir;
    const weekStart = addDays(goalEndMonday, next * 7);
    const goalStart = getMondayOfWeek(goal.startDate);
    if (weekStart < goalStart && dir === -1) return; // don't go before goal start
    if (weekStart > goalEndMonday && dir === 1) return; // don't go past goal end
    setNavDir(dir);
    setWeekOffset(next);
  }

  return (
    <SlideScreen exiting={exiting}>
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-surface">
        <div
          className="pointer-events-none absolute left-0 right-0 bg-surface"
          style={{ bottom: '100%', height: 'env(safe-area-inset-top, 0px)' }}
        />
        <div className="flex items-center gap-2 px-4 pt-5 pb-4">
          <button
            onClick={goBack}
            aria-label="Back"
            className="-ml-2 flex h-10 w-10 items-center justify-center text-content-muted"
          >
            <Icon name="chevronLeft" size={20} strokeWidth={2.5} />
          </button>
          <span className="text-headline font-semibold text-content truncate">{goal.name}</span>
        </div>
      </div>

      <div className="px-6 pb-8 space-y-5">
        {/* Goal overview card — mirrors Completion screen stats section */}
        <div className="rounded-main" style={{ boxShadow: 'inset 0 0 0 1px var(--color-border-field)' }}>
          <div className="px-6 pt-5 pb-5">
            <p className="text-subhead text-content-secondary text-center mb-4">
              Goal {displayWeight(goal.targetWeightKg, units)} · by {fmtDate(goal.targetDate)}
            </p>
            <div className="grid grid-cols-3 gap-2">
              <StatCard
                value={displayWeight(lostKg, units)}
                label={`Weight\n${gainGoal ? 'gained' : 'lost'}`}
              />
              <StatCard
                value={displayWeight(nowKg, units)}
                label={'Final\nweight'}
              />
              <StatCard
                value={String(daysTaken)}
                label={'Total\ndays'}
              />
            </div>
            <div className="mt-3 flex justify-center">
              <Badge status={goal.status === 'completed' ? 'success' : 'neutral'}>
                {goal.status === 'completed' ? 'Completed' : 'Ended'}
              </Badge>
            </div>
          </div>
        </div>

        {/* Weekly weight chart */}
        <div className="rounded-card border border-border-subtle bg-surface p-4 shadow-card">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => changeWeek(-1)}
              aria-label="Previous week"
              className="flex h-8 w-8 items-center justify-center rounded-full text-content-muted active:bg-surface-sunken"
            >
              <Icon name="chevronLeft" size={16} strokeWidth={2.5} />
            </button>
            <span className="text-subhead font-semibold text-content">Weight trend</span>
            <button
              onClick={() => changeWeek(1)}
              aria-label="Next week"
              className="flex h-8 w-8 items-center justify-center rounded-full text-content-muted active:bg-surface-sunken"
            >
              <Icon name="chevronRight" size={16} strokeWidth={2.5} />
            </button>
          </div>
          <KgWeekChart
            goal={goal}
            weights={weights}
            weekOffset={weekOffset}
            today={chartToday}
            navDir={navDir}
            units={units}
          />
        </div>
      </div>
    </SlideScreen>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card bg-surface shadow-card px-2 py-2.5">
      <span className="text-callout font-semibold text-content">{value}</span>
      <span className="-mt-0.5 whitespace-pre-line text-center text-subhead text-content-secondary leading-tight">{label}</span>
    </div>
  );
}
