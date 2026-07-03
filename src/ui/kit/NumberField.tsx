import { LabeledInput } from './LabeledInput';

/* Numeric input field — decimal keyboard via inputMode (type=text, NOT
   type=number — round 136: some locales' decimal keyboards produce "," for
   the decimal point, which a native type=number input silently rejects
   outright rather than accepting and needing conversion. type=text lets us
   normalize "," -> "." ourselves and still gets the same numeric keypad via
   inputMode=decimal. min/max/step are kept as harmless passthrough attrs
   for backwards compatibility (meaningless on a text input; not enforced). */
export function NumberField({
  label, value, set, min = 0, max = 9999, step = 1, unit,
}: {
  label?: string; value: string; set: (s: string) => void;
  min?: number; max?: number; step?: number; unit?: string;
  /** Accepted for backwards compatibility; no longer used. */
  centerAt?: number;
}) {
  const displayLabel = unit ? `${label ?? ''} (${unit})`.trim() : label;

  function handleChange(raw: string) {
    // Normalize a locale decimal comma to a period, then strip anything
    // that isn't a digit or period, keeping only the FIRST period so the
    // result is always a valid (possibly partial) decimal number.
    let next = raw.replace(/,/g, '.').replace(/[^\d.]/g, '');
    const firstDot = next.indexOf('.');
    if (firstDot !== -1) {
      next = next.slice(0, firstDot + 1) + next.slice(firstDot + 1).replace(/\./g, '');
    }
    set(next);
  }

  return (
    <LabeledInput
      label={displayLabel}
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      type="text"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
    />
  );
}
