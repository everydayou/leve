import { useId, useRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { Icon } from './Icon';

/* Labeled text/number input — the standard form field used across the sheets
   and forms. Shows a clear (×) button whenever the field has a value, exactly
   as the search bar does. Fires onChange with an empty-string synthetic event
   so callers need no changes.
   Token-driven; `invalid` flips the border to danger. Spreads native input
   props (value, onChange, inputMode, type, placeholder, autoFocus…). */
export function LabeledInput({
  label, invalid, wrapClassName = '', className = '', labelClassName, id: idProp, ...input
}: {
  label?: string; invalid?: boolean; wrapClassName?: string; labelClassName?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  const generatedId = useId();
  const inputId = idProp ?? generatedId;
  const ref = useRef<HTMLInputElement>(null);

  const hasValue = String(input.value ?? '').length > 0;

  function handleClear() {
    input.onChange?.({ target: { value: '' } } as React.ChangeEvent<HTMLInputElement>);
    ref.current?.focus();
  }

  return (
    <label htmlFor={inputId} className={`block ${wrapClassName}`}>
      {label && (
        <span className={labelClassName ?? 'text-subhead font-normal text-content-secondary'}>
          {label}
        </span>
      )}
      <div className="relative mt-1">
        <input
          {...input}
          ref={ref}
          id={inputId}
          className={`w-full rounded-field border bg-surface-sunken px-3 py-2.5 text-subhead font-semibold
            text-content outline-none transition placeholder:text-content-muted
            ${hasValue ? 'pr-8' : ''}
            ${invalid ? 'border-danger' : 'border-transparent focus:border-accent'} ${className}`}
        />
        {hasValue && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleClear}
            aria-label="Clear"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-content-muted active:text-content"
          >
            <Icon name="close" size={16} strokeWidth={2.25} />
          </button>
        )}
      </div>
    </label>
  );
}
