import { useEffect, useRef, useState } from 'react';

/**
 * Measures the live distance from this element's top edge to the bottom
 * of the viewport and returns it as a min-height (px) — a "fill the rest
 * of the screen" panel that works regardless of flexbox/percentage-height
 * quirks through Sheet's `flex-1 overflow-y-auto` scroll area sitting
 * inside a `dvh`-based panel height. Round 166 tried the pure-CSS
 * `min-height: 100%` + `flex: 1` version; Marco confirmed on-device that
 * it didn't hold up (grey panel still ended early), so round 167 measures
 * directly instead, which sidesteps the whole percentage-resolution
 * question. Since the Sheet itself is pinned to the bottom of the screen
 * (`fixed inset-0 ... justify-end`), "distance to the viewport bottom" is
 * exactly the right target — nothing else exists below it.
 *
 * Round 168 root-cause fix: round 167's re-measure timeouts (50ms, 350ms)
 * were landing WHILE the Sheet's own open transition was still running —
 * Sheet.tsx slides the panel up over OPEN_MS = 420ms (transform), so a
 * measurement at 350ms still reads a `top` from partway through the
 * slide (higher up than its resting position), undersizing the fill and
 * leaving a plain white gap below the grey panel — exactly what Marco
 * kept seeing. Rather than guess a single "safe" delay, this now polls
 * across the whole settle window and also re-measures on every
 * `transitionend` bubbling up from anywhere in the document (cheap, and
 * catches the panel's transform transition ending directly regardless of
 * its exact duration).
 *
 * Usage: `const fill = useFillToBottom<HTMLDivElement>();` then spread
 * `ref={fill.ref}` and `style={{ minHeight: fill.minHeight }}` (merge with
 * any other inline styles) onto the panel that should reach the bottom.
 */
export function useFillToBottom<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [minHeight, setMinHeight] = useState(0);

  useEffect(() => {
    function measure() {
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      setMinHeight(Math.max(0, window.innerHeight - top));
    }

    measure();
    window.addEventListener('resize', measure);

    // Poll through Sheet's open-transition settle window (OPEN_MS = 420ms
    // in Sheet.tsx, plus slack for slower devices) instead of a single
    // fixed delay that can land mid-animation.
    const pollDelays = [50, 120, 200, 300, 420, 520, 650, 850];
    const pollIds = pollDelays.map((delay) => setTimeout(measure, delay));

    // Belt-and-suspenders: re-measure whenever any CSS transition finishes
    // anywhere in the document (covers the Sheet panel's own slide-up,
    // wherever it happens to be timed).
    document.addEventListener('transitionend', measure);

    return () => {
      window.removeEventListener('resize', measure);
      document.removeEventListener('transitionend', measure);
      pollIds.forEach(clearTimeout);
    };
  }, []);

  return { ref, minHeight };
}
