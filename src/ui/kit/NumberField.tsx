import { LabeledInput } from './LabeledInput';

/* Numeric input field — plain decimal keyboard (type=number inputMode=decimal).
   Drop-in for macro / qty fields. min/max/step become native input attrs.
   centerAt is accepted but ignored (was only needed by the old WheelPicker). */
export function NumberField({
  label, value, set, min = 0, max = 9999, step = 1, unit,
}: {
  label?: string; value: string; set: (s: string) => void;
  min?: number; max?: number; step?: number; unit?: string;
  /** Accepted for backwards compatibility; no longer used. */
  centerAt?: number;
}) {
  const displayLabel = unit ? `${label ?? ''} (${unit})`.trim() : label;
  return (
    <LabeledInput
      label={displayLabel}
      value={value}
      onChange={(e) => set(e.target.value)}
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
    />
  );
}
