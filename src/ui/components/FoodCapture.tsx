// Shared capture UI — components only (see useFoodCapture.tsx for the
// capture mechanics; kept in a separate file so eslint-plugin-react-refresh's
// only-export-components rule doesn't flag mixing a hook export in here).
import { DescribeOverlay, ServingModal } from './AddEntrySheet';
import type { BasketItem } from './basketHelpers';

export { DescribeOverlay, ServingModal };
export type { BasketItem };

// ── AnalyzingIndicator ──────────────────────────────────────────────────────
// Same spinner+label the Day's-log basket shows in place of its content
// while a scan/describe/label call is in flight.

export function AnalyzingIndicator({ label, compact = false }: {
  label: string;
  /** Round 189: Pantry's "+ New food" is a compact, content-sized Sheet
   *  (not forceExpanded like Meal/FoodItem detail's own AI-capture views),
   *  and the default py-16 padding here made it noticeably taller than the
   *  method-picker screen it swaps with — Marco asked to shrink the
   *  loading screen itself rather than pad the other states up to match
   *  it. Only PantryNewFoodScan opts in; the two forceExpanded call sites
   *  (PantryMealDetail, PantryFoodItemDetail) keep the roomier default. */
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${compact ? 'py-10' : 'py-16'}`}>
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-border-subtle border-t-accent" />
      <p className="text-subhead text-content-secondary">{label}</p>
    </div>
  );
}
