import type { NutritionSnapshot } from '../../domain/types';

function fmt(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** Shared "Protein 3.5g · Carbs 30g · Fibre 1g · Fat 6g" summary pill.
 *  One formatting rule for the macro line, reused everywhere a Food item's
 *  (or Meal item's) breakdown is shown at a glance without opening its
 *  editor — Day's-log basket cards and Pantry Food item / Meal item cards
 *  alike (see "Component: Food item card" in the meals-in-pantry spec). */
export function MacroSummaryLine({
  nutrition, className = '',
}: {
  nutrition: NutritionSnapshot;
  className?: string;
}) {
  return (
    <div className={`rounded-[14px] bg-surface-sunken px-3 py-2 text-subhead text-content-secondary ${className}`}>
      Protein {fmt(nutrition.protein)}g · Carbs {fmt(nutrition.carbs)}g · Fibre {fmt(nutrition.fiber)}g · Fat {fmt(nutrition.fat)}g
    </div>
  );
}
