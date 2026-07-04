import type { NutritionSnapshot } from '../../domain/types';

function fmt(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** Shared macro breakdown — one small badge per macro (Protein / Carbs /
 *  Fibre / Fat), reused everywhere a Food item's (or Meal item's) breakdown
 *  is shown at a glance without opening its editor — Day's-log basket cards
 *  and Pantry Food item / Meal item cards alike (see "Component: Food item
 *  card" in the meals-in-pantry spec). Round 152: was previously one long
 *  pill with all four values dot-separated inside it; split into individual
 *  badges per Marco's visual reference. */
export function MacroSummaryLine({
  nutrition, className = '',
}: {
  nutrition: NutritionSnapshot;
  className?: string;
}) {
  const macros = [
    { label: 'Protein', value: nutrition.protein },
    { label: 'Carbs', value: nutrition.carbs },
    { label: 'Fibre', value: nutrition.fiber },
    { label: 'Fat', value: nutrition.fat },
  ];
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {macros.map(({ label, value }) => (
        <span
          key={label}
          className="rounded-[14px] bg-surface-sunken px-2 py-0.5 text-subhead text-content-secondary"
        >
          {label} {fmt(value)}g
        </span>
      ))}
    </div>
  );
}
