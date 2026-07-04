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
    // Re-measure shortly after mount too, in case layout settles late
    // (sheet slide-up animation, images loading, fonts swapping in).
    const t1 = setTimeout(measure, 50);
    const t2 = setTimeout(measure, 350);
    return () => {
      window.removeEventListener('resize', measure);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return { ref, minHeight };
}
