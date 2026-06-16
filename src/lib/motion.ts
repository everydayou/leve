/** Returns true when the user has requested reduced motion via the OS setting
 *  (iOS: Settings → Accessibility → Motion → Reduce Motion).
 *  Use this to skip or shorten JS-driven animations (GaugeArc fill, WeekStrip
 *  spring, Sheet slide-up, chart bar/dot animations). */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
