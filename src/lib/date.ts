import { addDays } from '../data/ids';

/** Milliseconds per day — shared constant, avoids per-file redefinition. */
export const MS_PER_DAY = 86_400_000;

/** ISO date of Monday for the week containing `iso` (weeks run Mon→Sun). */
export function getMondayOfWeek(iso: string): string {
  const dow = (new Date(iso + 'T00:00:00').getDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(iso, -dow);
}

/** Format an ISO date as "7th Jun", "21st Mar", etc. (ordinal day + short month). */
export function fmtOrdinalDate(iso: string): string {
  const d   = new Date(iso + 'T00:00:00');
  const day = d.getDate();
  const rem = day % 100;
  const suffix =
    rem >= 11 && rem <= 13 ? 'th'
    : day % 10 === 1 ? 'st'
    : day % 10 === 2 ? 'nd'
    : day % 10 === 3 ? 'rd'
    : 'th';
  const month = d.toLocaleDateString('en', { month: 'short' });
  return `${day}${suffix} ${month}`;
}

/** Format for diary header: "Today, 8th Jun" or "Saturday, 8th Jun". */
export function fmtDiaryDate(iso: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const prefix = iso === today
    ? 'Today'
    : new Date(iso + 'T00:00:00').toLocaleDateString('en', { weekday: 'long' });
  return `${prefix}, ${fmtOrdinalDate(iso)}`;
}
