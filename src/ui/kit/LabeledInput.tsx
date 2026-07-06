import { useId, useRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { Icon } from './Icon';
import { useKeyboardDoneBar } from './useKeyboardDoneBar';

/* Labeled text/number input — the standard form field used across the sheets
   and forms. Shows a clear (×) button whenever the field has a value, exactly
   as the search bar does. Fires onChange with an empty-string synthetic event
   so callers need no changes.
   Token-driven; `invalid` flips the border to danger. Spreads native input
   props (value, onChange, inputMode, type, placeholder, autoFocus…).
   Round 181: renders the same custom "Done" bar used by numeric-keyboard
   fields (useKeyboardDoneBar) while focused — the standard text keyboard's
   Return key doesn't dismiss a plain, non-form input either, so this now
   applies to every LabeledInput (text or numeric) app-wide, not just the
   decimal ones. Composes with a caller-supplied onFocus/onBlur if present. */
export function LabeledInput({
  label, invalid, wrapClassName = '', className = '', labelClassName, id: idProp, ...input
}: {
  label?: string; invalid?: boolean; wrapClassName?: string; labelClassName?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  const generatedId = useId();
  const inputId = idProp ?? generatedId;
  const ref = useRef<HTMLInputElement>(null);
  const { bind, doneBar } = useKeyboardDoneBar();

  const hasValue = String(input.value ?? '').length > 0;
  const { onFocus, onBlur, ...restInput } = input;

  function handleClear() {
    input.onChange?.({ target: { value: '' } } as React.ChangeEvent<HTMLInputElement>);
    ref.current?.focus();
  }

  return (
    <>
      <label htmlFor={inputId} className={`block ${wrapClassName} ${input.disabled ? 'cursor-default' : ''}`}>
        {label && (
          <span className={labelClassName ?? 'text-subhead font-normal text-content-secondary'}>
            {label}
          </span>
        )}
        <div className="relative mt-1">
          <input
            {...restInput}
            ref={ref}
            id={inputId}
            onFocus={(e) => { onFocus?.(e); bind.onFocus(); }}
            onBlur={(e) => { onBlur?.(e); bind.onBlur(); }}
            className={`w-full rounded-field border bg-surface-sunken px-3 py-2.5 text-subhead font-semibold
              text-content outline-none transition placeholder:text-content-muted
              ${hasValue && !input.disabled ? 'pr-8' : ''}
              ${input.disabled ? 'opacity-50' : ''}
              ${invalid ? 'border-danger' : 'border-transparent focus:border-accent'} ${className}`}
          />
          {hasValue && !input.disabled && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleClear}
              aria-label="Clear"
              // 44x44 tap target (round 182), anchored flush to the field's
              // right edge; the 16px icon stays visually centred inside it.
              className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-content-muted active:text-content"
            >
              <Icon name="close" size={16} strokeWidth={2.25} />
            </button>
          )}
        </div>
      </label>
      {doneBar}
    </>
  );
}
