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

/** True when the goal is a "Maintain weight" goal — no target weight delta,
 *  no deadline; success = staying inside a weight/kcal band indefinitely. */
export function isMaintainGoal(goal: Goal): boolean {
  return goal.type === 'maintain';
}

/** True for goal types whose daily success is a FLOOR/CEILING band around
 *  burn (gain_by_date: surplus band; maintain: maintenance ± band) rather
 *  than a single deficit threshold (lose_by_date). Shared by WeekChart,
 *  TodayScreen's day-success check, and GoalScreen's stat tiles. */
export function usesKcalBand(goal: Goal): boolean {
  return goal.type === 'gain_by_date' || goal.type === 'maintain';
}

/** Generic inclusive-range check — used for both the weight band (maintain)
 *  and the kcal band (gain/maintain) so the "inside vs. outside" logic isn't
 *  duplicated per screen. */
export function inBand(value: number, floor: number, ceiling: number): boolean {
  return value >= floor && value <= ceiling;
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
  // Maintain goals have no weight delta to derive a magnitude from — the
  // "target" is 0 (stay at maintenance); the actual tolerance is expressed
  // via surplusFloor/surplusCeiling instead (see usesKcalBand/inBand).
  if (isMaintainGoal(goal)) return 0;
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

// ── Activity-scaled carb target (round 169) ───────────────────────────────────
// Replaces the old "whatever calories are left after protein/fat" residual
// model for Balanced/Performance macro styles — that model dumped nearly the
// entire calorie envelope into carbs even on zero-activity days, since
// protein/fat targets barely move but the residual is driven by TOTAL burn
// (BMR + activity). Marco's example: 340g carbs on a 420-active-kcal day.
// Carbs now scale with body size (a g/kg sedentary baseline) plus a share of
// today's actual active calories, so a rest day gets a sane baseline and an
// active day gets meaningfully more — continuous, not a fixed lookup table,
// so it stays correct as weight/goals change rather than needing new buckets.
const CARB_MODEL: Record<'balanced' | 'performance', { baselinePerKg: number; activityShare: number; capPerKg?: number }> = {
  // capPerKg (round 182): on very-high-activity days the uncapped formula
  // can climb past 400g, which is a lot to aim for on an everyday/general-
  // health style. 4.5 g/kg sits at the upper end of typical general-
  // population "moderate-high activity" guidance (vs. the 6-10 g/kg
  // endurance-athlete range), so it only bites on unusually large activity
  // days rather than on normal workouts.
  balanced:    { baselinePerKg: 2.2, activityShare: 0.55, capPerKg: 4.5 }, // everyday default
  // No cap for Performance — this style is explicitly for "more carbs
  // around activity," and heavy training days legitimately warrant it
  // (sports-nutrition guidance goes up to ~10 g/kg for endurance athletes).
  performance: { baselinePerKg: 2.4, activityShare: 0.75 }, // "more carbs around activity"
};

/** Carb target (g) for the Balanced/Performance macro styles: a body-weight
 *  baseline (g/kg, sedentary) plus a share of today's active calories
 *  converted to grams (÷4 kcal/g), capped for Balanced only (round 182 —
 *  see CARB_MODEL). `weightKg` falls back to 70 if unknown (e.g. the
 *  goal-setup preview before a weight is on file) so the number stays sane
 *  rather than collapsing to 0. Lower-carb keeps its own explicit,
 *  user-editable carbLimitG — this only applies to the other two. */
export function activityCarbTargetG(
  style: 'balanced' | 'performance',
  weightKg: number | null,
  activeKcal: number,
): number {
  const { baselinePerKg, activityShare, capPerKg } = CARB_MODEL[style];
  const kg = weightKg && weightKg > 0 ? weightKg : 70;
  const baseline = baselinePerKg * kg;
  const fromActivity = (Math.max(0, activeKcal) * activityShare) / 4;
  const target = Math.max(0, Math.round(baseline + fromActivity));
  return capPerKg ? Math.min(target, Math.round(capPerKg * kg)) : target;
}

const round = (n: number): number => Math.round(n * 100) / 100;

// ── Simple-mode pace definitions ──────────────────────────────────────────────

export const LOSE_PACES = [
  { id: 'relaxed',   label: 'Relaxed',   kgPerWeek: 0.25 },
  { id: 'steady',    label: 'Steady',    kgPerWeek: 0.5  },
  { id: 'ambitious', label: 'Ambitious', kgPerWeek: 0.75 },
] as const;
export type LosePaceId = typeof LOSE_PACES[number]['id'];

export const GAIN_PACES = [
  { id: 'lean',   label: 'Lean',   surplusFloor: 50,  surplusCeiling: 200, kgPerMonth: 0.5 },
  { id: 'steady', label: 'Steady', surplusFloor: 150, surplusCeiling: 350, kgPerMonth: 1.0 },
  { id: 'bulk',   label: 'Bulk',   surplusFloor: 300, surplusCeiling: 600, kgPerMonth: 1.5 },
] as const;
export type GainPaceId = typeof GAIN_PACES[number]['id'];

// ── Maintain-mode band presets (r182) ─────────────────────────────────────────
// Maintain goals have no pace (no weight delta) — instead the user picks how
// tight a band to hold, for both weight (kg either side of target) and daily
// calories (kcal either side of maintenance/burn). Mirrors LOSE_PACES/
// GAIN_PACES' role in Guided mode; Detailed mode lets the bounds be edited
// directly instead (like a macro range).
export const MAINTAIN_BANDS = [
  { id: 'tight',    label: 'Tight',    weightRangeKg: 0.5, kcalBand: 100 },
  { id: 'standard', label: 'Standard', weightRangeKg: 1,   kcalBand: 150 },
  { id: 'relaxed',  label: 'Relaxed',  weightRangeKg: 2,   kcalBand: 250 },
] as const;
export type MaintainBandId = typeof MAINTAIN_BANDS[number]['id'];

/** Derive target date from a lose pace. Assumes startKg > targetKg. */
export function dateFromLosePace(
  startKg: number, targetKg: number, kgPerWeek: number, today: string,
): string {
  const kgToLose = startKg - targetKg;
  if (kgToLose <= 0 || kgPerWeek <= 0) return '';
  const days = Math.ceil((kgToLose / kgPerWeek) * 7);
  const d = new Date(today + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

/** Derive target date from a gain pace. Assumes targetKg > startKg. */
export function dateFromGainPace(
  startKg: number, targetKg: number, kgPerMonth: number, today: string,
): string {
  const kgToGain = targetKg - startKg;
  if (kgToGain <= 0 || kgPerMonth <= 0) return '';
  const months = Math.ceil(kgToGain / kgPerMonth);
  const d = new Date(today + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}
