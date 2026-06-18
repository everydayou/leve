import { WheelPicker } from './WheelPicker';

/* Drop-in replacement for numeric text inputs — renders a native drum-roll
   picker. Caller can override min/max/step/unit; defaults suit macro fields
   (0–9999, integer steps). */
export function NumberField({
  label, value, set, min = 0, max = 9999, step = 1, unit,
}: {
  label?: string; value: string; set: (s: string) => void;
  min?: number; max?: number; step?: number; unit?: string;
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
    />
  );
}
