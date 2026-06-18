import { useRef } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { Icon } from './Icon';

/* Text input + optional label/suffix/hint. Shows a clear (×) button whenever
   the field has a value, exactly as the search bar does.
   All colours/radius via tokens. `invalid` flips the border + hint to danger. */
export function Field({
  label, suffix, hint, invalid, className = '', ...input
}: {
  label?: string; suffix?: ReactNode; hint?: string; invalid?: boolean; className?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  const ref = useRef<HTMLInputElement>(null);

  const hasValue = String(input.value ?? '').length > 0;

  function handleClear() {
    input.onChange?.({ target: { value: '' } } as React.ChangeEvent<HTMLInputElement>);
    ref.current?.focus();
  }

  return (
    <label className={`block ${className}`}>
      {label && (
        <span className="text-subhead font-normal text-content-secondary">
          {label}
        </span>
      )}
      <div
        className={`mt-1 flex items-center rounded-field border bg-surface px-3 py-2.5
          transition focus-within:border-accent
          ${invalid ? 'border-danger' : 'border-border-subtle'}`}
      >
        <input
          ref={ref}
          className="w-full bg-transparent text-body font-medium text-content
            outline-none placeholder:text-content-muted"
          {...input}
        />
        {hasValue && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleClear}
            aria-label="Clear"
            className="ml-2 shrink-0 text-content-muted active:text-content"
          >
            <Icon name="close" size={16} strokeWidth={2.25} />
          </button>
        )}
        {suffix && !hasValue && (
          <span className="ml-2 shrink-0 text-subhead text-content-secondary">{suffix}</span>
        )}
      </div>
      {hint && (
        <span className={`mt-1 block text-footnote ${invalid ? 'text-danger' : 'text-content-secondary'}`}>
          {hint}
        </span>
      )}
    </label>
  );
}
