import { describe, it, expect } from 'vitest';
import { goalIntensity, weekVerdict, currentWeightKg, daysBetween, requiredDailyDeficit, requiredWeeklyDeficit, isGainGoal, isMaintainGoal, usesKcalBand, inBand, MAINTAIN_BANDS } from './goal';
import type { Goal, WeightEntry } from './types';

describe('goalIntensity', () => {
  it('matches the wireframe example (4kg over 8 weeks ~= 0.5kg/wk, ~-550 kcal/day, moderate)', () => {
    const i = goalIntensity(85, 81, '2026-06-05', '2026-07-31');
    expect(i.kgToLose).toBe(4);
    expect(i.kgPerWeek).toBeCloseTo(0.5, 1);
    expect(i.kcalPerDay).toBeGreaterThan(500);
    expect(i.kcalPerDay).toBeLessThan(600);
    expect(i.level).toBe('moderate');
    expect(i.tooFast).toBe(false);
  });
  it('flags an aggressive pace above ~1% bodyweight/week', () => {
    const i = goalIntensity(85, 80, '2026-06-01', '2026-06-29'); // 5kg in 4 weeks
    expect(i.level).toBe('aggressive');
    expect(i.tooFast).toBe(true);
  });
});

describe('weekVerdict', () => {
  it('reads on_track within buffer, behind below, ahead at/over target', () => {
    expect(weekVerdict(3850, 3850)).toBe('ahead');
    expect(weekVerdict(3300, 3850)).toBe('on_track'); // ~86%
    expect(weekVerdict(2000, 3850)).toBe('behind');
  });
});

describe('currentWeightKg', () => {
  it('returns the latest dated entry (single source of truth)', () => {
    const w: WeightEntry[] = [
      { id: '1', date: '2026-06-01', weightKg: 85, source: 'manual' },
      { id: '2', date: '2026-06-03', weightKg: 81.4, source: 'manual' },
    ];
    expect(currentWeightKg(w)).toBe(81.4);
    expect(currentWeightKg([])).toBeNull();
  });
});

it('daysBetween counts inclusive-ish day span', () => {
  expect(daysBetween('2026-06-01', '2026-06-08')).toBe(7);
});

describe('required daily/weekly deficit', () => {
  const goal: Goal = {
    id: 'g', name: 'Cut', type: 'lose_by_date',
    startWeightKg: 85, targetWeightKg: 81, startDate: '2026-06-05', targetDate: '2026-07-31',
    status: 'active',
  };
  it('daily target is the derived ~-550/day average', () => {
    const d = requiredDailyDeficit(goal);
    expect(d).toBeGreaterThan(500);
    expect(d).toBeLessThan(600);
  });
  it('weekly target is ~7x the daily', () => {
    expect(requiredWeeklyDeficit(goal)).toBe(Math.round(requiredDailyDeficit(goal) * 7));
  });
});

describe('gain_by_date goal type', () => {
  const gainGoal: Goal = {
    id: 'g2', name: 'Bulk', type: 'gain_by_date',
    startWeightKg: 70, targetWeightKg: 74, startDate: '2026-06-05', targetDate: '2026-07-31',
    status: 'active',
  };

  it('isGainGoal identifies gain goals', () => {
    expect(isGainGoal(gainGoal)).toBe(true);
    const loseGoal: Goal = { ...gainGoal, type: 'lose_by_date' };
    expect(isGainGoal(loseGoal)).toBe(false);
  });

  it('goalIntensity uses absolute kg delta (same as lose with same magnitude)', () => {
    const i = goalIntensity(70, 74, '2026-06-05', '2026-07-31');
    expect(i.kgToLose).toBe(4); // magnitude, not direction
    expect(i.kcalPerDay).toBeGreaterThan(500);
    expect(i.kcalPerDay).toBeLessThan(600);
  });

  it('requiredDailyDeficit returns negative value for gain (surplus)', () => {
    const d = requiredDailyDeficit(gainGoal);
    expect(d).toBeLessThan(0); // negative = surplus
    expect(d).toBeGreaterThan(-600);
    expect(d).toBeLessThan(-500);
  });

  it('requiredWeeklyDeficit is also negative for gain', () => {
    expect(requiredWeeklyDeficit(gainGoal)).toBeLessThan(0);
    expect(requiredWeeklyDeficit(gainGoal)).toBe(Math.round(requiredDailyDeficit(gainGoal) * 7));
  });

  it('weekVerdict works correctly with negative targets (gain)', () => {
    // target = -3850 kcal/week surplus needed
    // actual = -4000 (bigger surplus) → ahead
    expect(weekVerdict(-4000, -3850)).toBe('ahead');
    // actual = -3300 (smaller surplus, but within 85%) → on_track
    expect(weekVerdict(-3300, -3850)).toBe('on_track');
    // actual = -2000 (well short of surplus) → behind
    expect(weekVerdict(-2000, -3850)).toBe('behind');
  });

  it('gain goal with manual override stores positive magnitude, returns negative', () => {
    const overrideGoal: Goal = { ...gainGoal, dailyDeficitKcalOverride: 400 };
    expect(requiredDailyDeficit(overrideGoal)).toBe(-400);
  });
});

describe('maintain goal type', () => {
  const maintainGoal: Goal = {
    id: 'g3', name: 'Hold steady', type: 'maintain',
    startWeightKg: 72, targetWeightKg: 72, startDate: '2026-06-05', targetDate: '2036-06-05',
    status: 'active',
    weightRangeFloorKg: 71, weightRangeCeilingKg: 73, maintainBandId: 'standard',
    surplusFloor: -150, surplusCeiling: 150,
  };

  it('isMaintainGoal identifies maintain goals, isGainGoal/isMaintainGoal are mutually exclusive', () => {
    expect(isMaintainGoal(maintainGoal)).toBe(true);
    expect(isGainGoal(maintainGoal)).toBe(false);
    const loseGoal: Goal = { ...maintainGoal, type: 'lose_by_date' };
    expect(isMaintainGoal(loseGoal)).toBe(false);
  });

  it('usesKcalBand is true for gain and maintain, false for lose', () => {
    expect(usesKcalBand(maintainGoal)).toBe(true);
    expect(usesKcalBand({ ...maintainGoal, type: 'gain_by_date' })).toBe(true);
    expect(usesKcalBand({ ...maintainGoal, type: 'lose_by_date' })).toBe(false);
  });

  it('requiredDailyDeficit is 0 for maintain regardless of override', () => {
    expect(requiredDailyDeficit(maintainGoal)).toBe(0);
    expect(requiredDailyDeficit({ ...maintainGoal, dailyDeficitKcalOverride: 300 })).toBe(0);
  });

  it('inBand checks an inclusive floor/ceiling range', () => {
    expect(inBand(72, 71, 73)).toBe(true);
    expect(inBand(71, 71, 73)).toBe(true); // boundary inclusive
    expect(inBand(73, 71, 73)).toBe(true); // boundary inclusive
    expect(inBand(70.9, 71, 73)).toBe(false);
    expect(inBand(73.1, 71, 73)).toBe(false);
  });

  it('MAINTAIN_BANDS presets are ordered tight -> standard -> relaxed with widening ranges', () => {
    expect(MAINTAIN_BANDS.map(b => b.id)).toEqual(['tight', 'standard', 'relaxed']);
    expect(MAINTAIN_BANDS[0].weightRangeKg).toBeLessThan(MAINTAIN_BANDS[1].weightRangeKg);
    expect(MAINTAIN_BANDS[1].weightRangeKg).toBeLessThan(MAINTAIN_BANDS[2].weightRangeKg);
    expect(MAINTAIN_BANDS[0].kcalBand).toBeLessThan(MAINTAIN_BANDS[1].kcalBand);
    expect(MAINTAIN_BANDS[1].kcalBand).toBeLessThan(MAINTAIN_BANDS[2].kcalBand);
  });
});
