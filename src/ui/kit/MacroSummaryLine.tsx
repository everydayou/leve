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
 *  badges per Marco's visual reference — bg-surface-muted (lighter than the
 *  bg-surface-sunken used elsewhere for insets), rounded-[8px], px-2 py-0.5.
 *  Round 154: text size stepped down one notch in the type scale, from
 *  text-subhead (15px) to text-footnote (13px). */
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
          className="rounded-[8px] bg-surface-muted px-2 py-0.5 text-footnote text-content-secondary"
        >
          {label} {fmt(value)}g
        </span>
      ))}
    </div>
  );
}
