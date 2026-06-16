import type { MeasurementType } from '../../domain/types';

/* Radio-button style measurement type selector with pill styling.
   Shows "per 100g" and "per serving" as distinct choices with radio indicators. */
export function MeasurementTypeSelector({
  value,
  onChange,
}: {
  value: MeasurementType;
  onChange: (v: MeasurementType) => void;
}) {
  const options: { value: MeasurementType; label: string }[] = [
    { value: 'per_100g', label: 'per 100g' },
    { value: 'per_serving', label: 'per serving' },
  ];

  return (
    <div className="flex gap-3">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={`flex items-center gap-2 rounded-pill px-4 py-2 transition-all border-2
              ${
                active
                  ? 'border-border-subtle bg-surface text-content shadow-card'
                  : 'border-border-subtle bg-surface text-content-secondary hover:border-border-field'
              }
            `}
          >
            <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-current">
              {active && <div className="h-2.5 w-2.5 rounded-full bg-accent" />}
            </div>
            <span className="text-subhead font-medium">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
