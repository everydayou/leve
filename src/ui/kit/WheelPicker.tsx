import { useEffect } from 'react';
import { Icon } from './Icon';

/* ── WheelPicker ─────────────────────────────────────────────────────────────
 *  Wraps a native <select> element (iOS drum-roll picker) in the same visual
 *  shell as LabeledInput. Two modes:
 *    step >= 1  → single wheel (integer or coarse values)
 *    step <  1  → split wheel: [whole] · [decimal digit(s)] [unit]
 *
 *  `value`/`onChange` use string to match the NumberField / LabeledInput API.
 *
 *  `centerAt` — when provided and `value` is '', a "—" placeholder option is
 *  inserted at the `centerAt` position in the drum-roll list. The closed
 *  field shows "—" (empty-looking) while the native picker opens centred on
 *  `centerAt`. Once the user moves the wheel, onChange fires with a real
 *  value and the placeholder option disappears. */

export function WheelPicker({
  label, value, onChange, min, max, step = 1,
  unit, invalid = false, wrapClassName = '', selectClassName = '', centerAt,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  invalid?: boolean;
  wrapClassName?: string;
  selectClassName?: string;
  /** When value is '', insert a "—" placeholder at this position so the
   *  drum roll opens centred here while the closed field looks empty. */
  centerAt?: number;
}) {
  const isDecimal = step < 1;

  // Shared select base class — mirrors LabeledInput styling.
  const baseCls = [
    'w-full appearance-none rounded-field border bg-surface',
    'px-3 py-2.5 pr-7 text-subhead font-semibold text-content',
    'outline-none transition',
    invalid ? 'border-danger' : 'border-border-field focus:border-accent',
    selectClassName,
  ].join(' ');

  /* ── Single wheel ── */
  if (!isDecimal) {
    const options = buildRange(min, max, step);
    const isEmpty = value === '';

    // When empty and centerAt given: find insertion index for the placeholder.
    // We insert "—" (value="") just before the option nearest to centerAt so
    // iOS opens the drum roll with "—" visible in the centre.
    const center = isEmpty && centerAt !== undefined
      ? clamp(snap(centerAt, step, min), min, max)
      : null;

    // Build the displayed options list, injecting placeholder when needed.
    const displayOptions: Array<{ v: number | null; label: string }> =
      center !== null
        ? (() => {
            const insertIdx = options.findIndex(v => v >= center);
            const idx = insertIdx === -1 ? options.length : insertIdx;
            return [
              ...options.slice(0, idx).map(v => ({ v, label: unit ? `${v} ${unit}` : String(v) })),
              { v: null, label: '—' },
              ...options.slice(idx).map(v => ({ v, label: unit ? `${v} ${unit}` : String(v) })),
            ];
          })()
        : options.map(v => ({ v, label: unit ? `${v} ${unit}` : String(v) }));

    const num     = parseFloat(value);
    const clamped = isNaN(num) ? min : clamp(snap(num, step, min), min, max);
    // Select value: '' for placeholder (empty state), otherwise clamped numeric string.
    const selectVal = isEmpty ? '' : String(clamped);

    // Sync: if value is out of range (but not intentionally empty), snap it.
    // eslint-disable-next-line react-hooks/rules-of-hooks -- conditional on stable `isDecimal`
    useEffect(() => {
      if (isEmpty) return; // intentionally empty — don't pre-fill
      if (String(clamped) !== value) onChange(String(clamped));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
    }, []);

    return (
      <label className={`block ${wrapClassName}`}>
        {label && (
          <span className="text-subhead font-normal text-content-secondary">{label}</span>
        )}
        <div className="relative mt-1">
          <select
            value={selectVal}
            onChange={e => {
              const v = e.target.value;
              if (v !== '') onChange(v); // ignore re-selecting the placeholder
            }}
            className={baseCls}
          >
            {displayOptions.map((opt) =>
              opt.v === null
                ? <option key="__placeholder" value="">—</option>
                : <option key={opt.v} value={opt.v}>{opt.label}</option>
            )}
          </select>
          <Icon
            name="chevronDown"
            size={16}
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-content-muted"
          />
        </div>
      </label>
    );
  }

  /* ── Split wheel (decimal) ── */
  // For step=0.1 → 1 decimal place, digits 0–9.
  // For step=0.5 → 1 decimal place, digits 0 and 5.
  const decPlaces  = decimalPlaces(step);
  const stepTenths = Math.round(step * Math.pow(10, decPlaces)); // e.g. 0.1→1, 0.5→5
  const decOptions = buildRange(0, 9, stepTenths);

  const isEmpty  = value === '';
  const num      = parseFloat(value);
  const safeNum  = isNaN(num) ? min : clamp(num, min, max);
  const whole    = Math.floor(safeNum);
  const dec      = Math.round((safeNum - whole) * Math.pow(10, decPlaces));

  const wholeMin = Math.floor(min);
  const wholeMax = Math.floor(max);

  function onWholeChange(newWhole: number) {
    const result = newWhole + dec / Math.pow(10, decPlaces);
    onChange(result.toFixed(decPlaces));
  }
  function onDecChange(newDec: number) {
    const result = whole + newDec / Math.pow(10, decPlaces);
    onChange(result.toFixed(decPlaces));
  }

  // Sync on mount if value is out-of-range. Skip when intentionally empty.
  // eslint-disable-next-line react-hooks/rules-of-hooks -- conditional on stable `isDecimal`
  useEffect(() => {
    if (isEmpty) return;
    const expected = safeNum.toFixed(decPlaces);
    if (expected !== value) onChange(expected);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, []);

  const splitSelectCls = [
    'appearance-none rounded-field border bg-surface',
    'px-3 py-2.5 pr-7 text-subhead font-semibold text-content',
    'outline-none transition',
    invalid ? 'border-danger' : 'border-border-field focus:border-accent',
    selectClassName,
  ].join(' ');

  // ── Empty state: single unified select with "—" placeholder ──────────────
  // When value is '' and centerAt is provided, show a single select (all decimal
  // values in one list) with a "—" option centred at centerAt. iOS opens the drum
  // roll there. First pick fires onChange → switches to normal split mode.
  if (isEmpty && centerAt !== undefined) {
    const allOptions = buildRange(min, max, step);
    const center     = clamp(snap(centerAt, step, min), min, max);
    const insertIdx  = allOptions.findIndex(v => v >= center);
    const idx        = insertIdx === -1 ? allOptions.length : insertIdx;
    const unified: Array<{ v: number | null; label: string }> = [
      ...allOptions.slice(0, idx).map(v => ({ v, label: unit ? `${v.toFixed(decPlaces)} ${unit}` : v.toFixed(decPlaces) })),
      { v: null, label: '—' },
      ...allOptions.slice(idx).map(v => ({ v, label: unit ? `${v.toFixed(decPlaces)} ${unit}` : v.toFixed(decPlaces) })),
    ];
    return (
      <label className={`block ${wrapClassName}`}>
        {label && <span className="text-subhead font-normal text-content-secondary">{label}</span>}
        <div className="relative mt-1">
          <select
            value=""
            onChange={e => { if (e.target.value !== '') onChange(e.target.value); }}
            className={baseCls}
          >
            {unified.map((opt) =>
              opt.v === null
                ? <option key="__placeholder" value="">—</option>
                : <option key={opt.v} value={opt.v.toFixed(decPlaces)}>{opt.label}</option>
            )}
          </select>
          <Icon name="chevronDown" size={16} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-content-muted" />
        </div>
      </label>
    );
  }

  return (
    <label className={`block ${wrapClassName}`}>
      {label && (
        <span className="text-subhead font-normal text-content-secondary">{label}</span>
      )}
      <div className="mt-1 flex items-center gap-1.5">
        {/* Whole number */}
        <div className="relative flex-1">
          <select
            value={whole}
            onChange={e => onWholeChange(Number(e.target.value))}
            className={`w-full ${splitSelectCls}`}
          >
            {buildRange(wholeMin, wholeMax, 1).map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          <Icon name="chevronDown" size={16} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-content-muted" />
        </div>
        {/* Dot separator */}
        <span className="text-subhead font-semibold text-content">.</span>
        {/* Decimal digit(s) */}
        <div className="relative w-[4.5rem]">
          <select
            value={dec}
            onChange={e => onDecChange(Number(e.target.value))}
            className={`w-full ${splitSelectCls}`}
          >
            {decOptions.map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          <Icon name="chevronDown" size={16} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-content-muted" />
        </div>
        {unit && (
          <span className="shrink-0 text-subhead font-semibold text-content-secondary">{unit}</span>
        )}
      </div>
    </label>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildRange(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  for (let v = min; v <= max + 1e-9; v = Math.round((v + step) * 1e9) / 1e9) {
    out.push(v);
  }
  return out;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function snap(v: number, step: number, min: number): number {
  return Math.round((v - min) / step) * step + min;
}

function decimalPlaces(step: number): number {
  const s = step.toString();
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}
