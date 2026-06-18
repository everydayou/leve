import { WheelPicker } from './WheelPicker';

/* Drop-in replacement for numeric text inputs — renders a native drum-roll
   picker. Caller can override min/max/step/unit/centerAt; defaults suit macro
   fields (0–9999, integer steps). */
export function NumberField({
  label, value, set, min = 0, max = 9999, step = 1, unit, centerAt,
}: {
  label?: string; value: string; set: (s: string) => void;
  min?: number; max?: number; step?: number; unit?: string;
  /** Position the wheel here when value is '' (without pre-filling). */
  centerAt?: number;
}) {
  return (
    <WheelPicker
      label={label}
      value={value}
      onChange={set}
      min={min}
      max={max}
      step={step}
      unit={unit}
      centerAt={centerAt}
    />
  );
}
