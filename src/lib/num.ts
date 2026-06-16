// Decimal input handling.
//
// On a localized iOS keyboard the decimal pad shows the device-region
// separator — for many EU regions that's a comma, not a dot. We can't force
// the key glyph, but we CAN make the app speak dots: normalise any typed
// comma to a dot so the field shows a dot and `Number(...)` parses correctly.
//
// Usage:
//   <input value={v} onChange={onDecimalChange(set)} inputMode="decimal" />
export function normalizeDecimal(s: string): string {
  return s.replace(/,/g, '.');
}

/** onChange wrapper that normalises commas to dots before calling the setter. */
export function onDecimalChange(set: (s: string) => void) {
  return (e: React.ChangeEvent<HTMLInputElement>) => set(normalizeDecimal(e.target.value));
}

/** Round to 1 decimal. */
export const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Format a weight value for display: 1 decimal, but drop a trailing ".0" so
 *  whole numbers read cleanly. Also kills float-subtraction tails like
 *  2.7999999 → "2.8". */
export function fmtKg(n: number): string {
  const r = round1(n);
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}
