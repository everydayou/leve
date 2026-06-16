import { describe, it, expect } from 'vitest';
import { mifflinStJeorBMR, canComputeBmr } from './bmr';

describe('mifflinStJeorBMR', () => {
  it('computes the male equation (10w + 6.25h - 5a + 5)', () => {
    // 81.4kg, 181cm, 34y, male -> 814 + 1131.25 - 170 + 5 = 1780.25 -> 1780
    expect(mifflinStJeorBMR({ weightKg: 81.4, heightCm: 181, age: 34, sex: 'male' })).toBe(1780);
  });
  it('applies the female offset (-161)', () => {
    const male = mifflinStJeorBMR({ weightKg: 70, heightCm: 170, age: 30, sex: 'male' });
    const female = mifflinStJeorBMR({ weightKg: 70, heightCm: 170, age: 30, sex: 'female' });
    expect(male - female).toBe(166); // +5 vs -161
  });
});

describe('canComputeBmr', () => {
  it('requires weight, height, age and sex', () => {
    expect(canComputeBmr({ weightKg: 80, heightCm: 180, age: 30, sex: 'male' })).toBe(true);
    expect(canComputeBmr({ weightKg: null, heightCm: 180, age: 30, sex: 'male' })).toBe(false);
    expect(canComputeBmr({ weightKg: 80, heightCm: 180, age: 30 })).toBe(false);
    expect(canComputeBmr({ weightKg: 80, heightCm: 0, age: 30, sex: 'female' })).toBe(false);
  });
});
