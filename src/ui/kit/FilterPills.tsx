import { hapticLight } from '../../lib/haptics';

/* FilterPills — a row of single-select filter pills that HUG their content
   (unlike SegmentedControl, whose segments are equal-width). The selected pill
   gets the white, softly-raised treatment of a segmented-control control; the
   rest sit flat on a sunken tint. Wraps to a second line if the labels don't
   fit. Token-driven only. */
export function FilterPills<T extends string>({
  options, value, onChange, className = '',
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => { hapticLight(); onChange(o.value); }}
            aria-pressed={active}
            className={`rounded-pill border px-3.5 py-1.5 text-subhead font-medium transition active:scale-95
              ${active
                ? 'border-border-field bg-surface text-accent-hover shadow-card'
                : 'border-transparent bg-surface-sunken text-content'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
