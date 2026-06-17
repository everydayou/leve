import { addDays } from '../../data/ids';
import { getMondayOfWeek, MS_PER_DAY } from '../../lib/date';

/** 1-based week number counting from the goal's start week. */
export function weekNumber(goalStartDate: string, weekOffset: number, today: string): number {
  const goalMondayMs = +new Date(getMondayOfWeek(goalStartDate) + 'T00:00:00');
  const viewedMondayMs = +new Date(addDays(getMondayOfWeek(today), weekOffset * 7) + 'T00:00:00');
  return Math.round((viewedMondayMs - goalMondayMs) / (7 * MS_PER_DAY)) + 1;
}

/** Week range label e.g. "Jun 3 – 9" or "Jun 28 – Jul 4". */
export const fmtWeekRange = (start: string, end: string): string => {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end   + 'T00:00:00');
  const sDay = s.toLocaleDateString(undefined, { day: 'numeric' });
  const eDay = e.toLocaleDateString(undefined, { day: 'numeric' });
  const eMon = e.toLocaleDateString(undefined, { month: 'short' });
  if (s.getMonth() === e.getMonth()) {
    return `${sDay} – ${eDay} ${eMon}`;
  }
  const sMon = s.toLocaleDateString(undefined, { month: 'short' });
  return `${sDay} ${sMon} – ${eDay} ${eMon}`;
};
