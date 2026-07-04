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

export function AnalyzingIndicator({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-border-subtle border-t-accent" />
      <p className="text-subhead text-content-secondary">{label}</p>
    </div>
  );
}
