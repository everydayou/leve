import type { Sex, User, WeightEntry } from './types';

/** Mifflin–St Jeor resting metabolic rate (kcal/day) — the most accurate of
 *  the common BMR equations for the general population. Needs weight, height,
 *  age and sex. We expose it ONLY as a calculator to pre-fill the user's BMR
 *  number; the app still trusts that single stored number (V1 "blind trust").
 *
 *  Note: this is BMR (resting), NOT TDEE. The app adds active calories on top
 *  of BMR separately, so do not apply an activity multiplier here. */
export function mifflinStJeorBMR(input: {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
}): number {
  const { weightKg, heightCm, age, sex } = input;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(base + (sex === 'male' ? 5 : -161));
}

/** Derive the BMR for a specific calendar date.
 *
 *  Finds the most-recent WeightEntry on or before `date` and runs
 *  Mifflin–St Jeor with it, so each day's burn reflects the weight the user
 *  actually had at that point in time — not today's weight.
 *
 *  Falls back to `user.bmr` (the manually stored value) when:
 *  - the user's profile is incomplete (no height / age / sex), or
 *  - there are no weight entries on or before `date`.
 *
 *  This keeps past-day deficit calculations accurate when you edit or
 *  backfill weight entries: changing June 5th's weight only affects days
 *  where that entry is the most-recent weight on or before that day. */
export function bmrForDate(
  date: string,
  weights: WeightEntry[],
  user: User,
): number {
  const profileComplete =
    user.heightCm > 0 &&
    user.age != null && user.age > 0 &&
    (user.sex === 'male' || user.sex === 'female');

  if (!profileComplete) return user.bmr;

  const prior = weights
    .filter((w) => w.date <= date)
    .sort((a, b) => b.date.localeCompare(a.date))[0];

  if (!prior) return user.bmr;

  return mifflinStJeorBMR({
    weightKg: prior.weightKg,
    heightCm: user.heightCm,
    age: user.age!,
    sex: user.sex!,
  });
}

/** Whether we have everything needed to compute a BMR. */
export function canComputeBmr(input: {
  weightKg: number | null;
  heightCm?: number;
  age?: number;
  sex?: Sex;
}): boolean {
  return (
    !!input.weightKg && input.weightKg > 0 &&
    !!input.heightCm && input.heightCm > 0 &&
    input.age != null && input.age > 0 &&
    (input.sex === 'male' || input.sex === 'female')
  );
}
