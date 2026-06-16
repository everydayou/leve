import type { Goal, WeightEntry } from './types';
import { KCAL_PER_KG } from './calc';

export type PaceLevel = 'gentle' | 'moderate' | 'aggressive';

export interface GoalIntensity {
  kgToLose: number; // magnitude of kg to move (always ≥ 0)
  days: number;
  weeks: number;
  kgPerWeek: number;
  kcalPerDay: number; // required average daily kcal change (always positive magnitude)
  pctBodyweightPerWeek: number;
  level: PaceLevel;
  tooFast: boolean; // pace exceeds ~1% bodyweight/week
  summary: string; // human one-liner
}

/** True when the goal is a "Build muscle" / gain goal. */
export function isGainGoal(goal: Goal): boolean {
  return goal.type === 'gain_by_date';
}

const MS_PER_DAY = 86_400_000;

export function daysBetween(startISO: string, endISO: string): number {
  const d = (Date.parse(endISO) - Date.parse(startISO)) / MS_PER_DAY;
  return Math.max(1, Math.round(d));
}

/** Goal-setup intensity feedback. Derived only — nothing new is stored.
 *  Works for both lose and gain goals: kgToLose is the absolute kg delta,
 *  kcalPerDay is the required daily magnitude (always positive). */
export function goalIntensity(
  startWeightKg: number,
  targetWeightKg: number,
  startDate: string,
  targetDate: string,
): GoalIntensity {
  const kgToLose = Math.max(0, Math.abs(targetWeightKg - startWeightKg));
  const days = daysBetween(startDate, targetDate);
  const weeks = days / 7;
  const kgPerWeek = kgToLose / weeks;
  const kcalPerDay = (kgToLose * KCAL_PER_KG) / days;
  const pctBodyweightPerWeek = (kgPerWeek / startWeightKg) * 100;

  let level: PaceLevel;
  if (kgPerWeek < 0.35) level = 'gentle';
  else if (kgPerWeek <= 0.75) level = 'moderate';
  else level = 'aggressive';

  const tooFast = pctBodyweightPerWeek > 1.0;
  const summary =
    level === 'gentle'
      ? 'Gentle & easy to sustain.'
      : level === 'moderate'
        ? 'Moderate & sustainable.'
        : tooFast
          ? 'Aggressive — above ~1%/week.'
          : 'Aggressive but doable.';

  return {
    kgToLose, days, weeks,
    kgPerWeek: round(kgPerWeek),
    kcalPerDay: Math.round(kcalPerDay),
    pctBodyweightPerWeek: round(pctBodyweightPerWeek),
    level, tooFast, summary,
  };
}

/** Required weekly kcal delta for the goal (derived). Signed: negative for gain. */
export function requiredWeeklyDeficit(goal: Goal): number {
  return Math.round(requiredDailyDeficit(goal) * 7);
}

/** Required average DAILY kcal delta for the goal.
 *  Positive = deficit required (lose goal).
 *  Negative = surplus required (gain goal: eat this many kcal MORE than burn).
 *  Uses the manual override when set (via GoalSetupScreen slider). */
export function requiredDailyDeficit(goal: Goal): number {
  const magnitude = goal.dailyDeficitKcalOverride != null
    ? Math.abs(goal.dailyDeficitKcalOverride)
    : goalIntensity(goal.startWeightKg, goal.targetWeightKg, goal.startDate, goal.targetDate).kcalPerDay;
  return isGainGoal(goal) ? -magnitude : magnitude;
}

export type Verdict = 'on_track' | 'behind' | 'ahead';

/** Weekly verdict — the layer that keeps one off-day from flipping everything.
 *  Works for both lose (positive target = deficit) and gain (negative target = surplus).
 *  For gain, actual and target are both negative; ratio > 1 means bigger surplus = ahead. */
export function weekVerdict(actualWeeklyDeficit: number, targetWeeklyDeficit: number): Verdict {
  if (Math.abs(targetWeeklyDeficit) < 1) return 'on_track'; // no meaningful target
  const ratio = actualWeeklyDeficit / targetWeeklyDeficit;
  if (ratio >= 1.0) return 'ahead';
  if (ratio >= 0.85) return 'on_track'; // small buffer
  return 'behind';
}

/** Latest weight = single source of truth for "current weight". */
export function currentWeightKg(weights: WeightEntry[]): number | null {
  if (weights.length === 0) return null;
  const sorted = [...weights].sort((a, b) => b.date.localeCompare(a.date));
  return sorted[0].weightKg;
}

const round = (n: number): number => Math.round(n * 100) / 100;
