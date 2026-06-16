import { hapticLight } from '../../lib/haptics';

/* iOS segmented control — used for the goal chart range (Weekly/Monthly/Total)
   and Add-entry Food/Activity tabs. Sliding selected pill on a sunken track. */
export function SegmentedControl<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex w-fit rounded-pill bg-surface-sunken p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => { hapticLight(); onChange(o.value); }}
            className={`rounded-pill px-4 py-1.5 text-subhead font-medium transition whitespace-nowrap
              ${active ? 'segmented-active text-content shadow-sm' : 'text-content-secondary'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
