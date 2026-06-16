import { LabeledInput } from './LabeledInput';
import { onDecimalChange } from '../../lib/num';

/* Labeled decimal number field — the single shared wrapper that replaces the
   per-file `Num`/`EditNum` duplicates (TodayScreen, PantryScreen, AddEntrySheet).
   Normalises a typed comma to a dot (onDecimalChange) and uses inputMode
   "decimal" so the right keypad shows. `set` receives the normalised string. */
export function NumberField({ label, value, set }: { label?: string; value: string; set: (s: string) => void }) {
  return <LabeledInput label={label} value={value} onChange={onDecimalChange(set)} inputMode="decimal" />;
}
