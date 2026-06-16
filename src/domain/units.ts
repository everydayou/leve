import type { Units } from './types';

const LB_PER_KG = 2.2046226218;

export const kgToLbs = (kg: number): number => kg * LB_PER_KG;
export const lbsToKg = (lbs: number): number => lbs / LB_PER_KG;

/** Display a kg value in the user's preferred units. */
export function displayWeight(kg: number, units: Units, digits = 1): string {
  const v = units === 'lbs' ? kgToLbs(kg) : kg;
  return `${v.toFixed(digits)} ${units}`;
}
