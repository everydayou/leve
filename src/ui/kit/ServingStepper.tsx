import { hapticLight } from '../../lib/haptics';

/** Four-button serving stepper: −1 | −0.5 | [value ×] | +0.5 | +1
 *  Rounds to nearest 0.5; minimum value 0.5.
 *  Used in both the add-from-pantry flow and the edit-food modal. */
export function ServingStepper({ qty, setQty }: { qty: string; setQty: (v: string) => void }) {
  const quantity = Number(qty) || 0;
  function adj(delta: number) {
    hapticLight();
    setQty(String(Math.max(0.5, Math.round((quantity + delta) * 2) / 2)));
  }
  const btn = 'flex h-11 w-14 items-center justify-center rounded-control border border-border-field bg-surface text-subhead font-semibold text-content active:bg-surface-sunken';
  return (
    <div className="flex w-full items-center gap-2">
      <button data-no-drag onClick={() => adj(-1)}   className={btn} aria-label="Minus 1">−1</button>
      <button data-no-drag onClick={() => adj(-0.5)} className={btn} aria-label="Minus 0.5">−0.5</button>
      <div className="flex-1 text-center">
        <span className="text-display font-semibold text-content">
          {quantity % 1 === 0 ? quantity : quantity.toFixed(1)}
        </span>
        <span className="ml-1 text-subhead text-content-secondary">×</span>
      </div>
      <button data-no-drag onClick={() => adj(0.5)} className={`${btn} text-accent`} aria-label="Plus 0.5">+0.5</button>
      <button data-no-drag onClick={() => adj(1)}   className={`${btn} text-accent`} aria-label="Plus 1">+1</button>
    </div>
  );
}
