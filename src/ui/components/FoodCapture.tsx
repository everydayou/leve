// Shared capture-review UI — components only (see useFoodCapture.tsx for the
// capture mechanics; kept in a separate file so eslint-plugin-react-refresh's
// only-export-components rule doesn't flag mixing a hook export in here).
import { Button, OverlayNav } from '../kit';
import { BasketCard, DescribeOverlay, EditOverlay, ServingModal } from './AddEntrySheet';
import { basketNutrition } from './basketHelpers';
import type { BasketItem } from './basketHelpers';

export { BasketCard, DescribeOverlay, EditOverlay, ServingModal };
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

// ── CaptureReviewOverlay ──────────────────────────────────────────────────────
// Review list for freshly-captured item(s) before they're committed
// somewhere (a Meal, a new Pantry Food item, ...) — same BasketCard used by
// the Day's-log basket, so qty stepping/removal look and behave identically.

export function CaptureReviewOverlay({
  title, onBack, items, onQtyChange, onRemove, onEdit, onConfirm, confirmLabel, confirming,
}: {
  title: string;
  onBack: () => void;
  items: BasketItem[];
  onQtyChange: (idx: number, qty: number) => void;
  onRemove: (idx: number) => void;
  onEdit: (idx: number) => void;
  onConfirm: () => void | Promise<void>;
  confirmLabel: string;
  confirming?: boolean;
}) {
  return (
    <div className="space-y-3 py-1">
      <OverlayNav title={title} onBack={onBack} />
      {items.length === 0 ? (
        <p className="py-8 text-center text-subhead text-content-secondary">No items yet.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item, idx) => (
            <BasketCard
              key={item.id}
              item={item}
              nutrition={basketNutrition(item)}
              onQtyChange={(qty) => onQtyChange(idx, qty)}
              onRemove={() => onRemove(idx)}
              onEdit={() => onEdit(idx)}
            />
          ))}
        </div>
      )}
      {items.length > 0 && (
        <Button size="lg" onClick={() => void onConfirm()} disabled={confirming}>
          {confirming ? 'Adding…' : confirmLabel}
        </Button>
      )}
    </div>
  );
}
