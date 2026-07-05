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
 * `transitionend` bubbling up in the document.
 *
 * Round 170 — bottomGapPx: rounds 167/168 targeted a flush fill (grey's
 * bottom edge = viewport bottom), which worked but left the Save button
 * however far *above* that edge the content's own padding happened to
 * put it. Two problems fell out of that: (1) when content is short
 * (e.g. no Save button showing, just "+ Add a new food item"), the flush
 * target let the grey panel — and the gap below its last real content —
 * stretch to fill however much screen was left, which read as a huge
 * dead zone; (2) any residual white after the panel (stray padding
 * elsewhere) always showed past a flush edge, since there was zero
 * margin for error. `bottomGapPx` folds Marco's "~60px from the bottom,
 * max" requirement directly into the fill target itself — the panel now
 * stretches to (viewport bottom − bottomGapPx), never further, so short
 * content gets capped at a small, fixed gap instead of "whatever's left."
 * Long content (natural height already exceeds the target) is unaffected
 * — the min-height simply has no effect and the panel's own trailing
 * padding is all that shows.
 *
 * Usage: `const fill = useFillToBottom<HTMLDivElement>(36);` then spread
 * `ref={fill.ref}` and `style={{ minHeight: fill.minHeight }}` (merge with
 * any other inline styles) onto the panel that should reach the bottom.
 */
export function useFillToBottom<T extends HTMLElement>(bottomGapPx = 0) {
  const ref = useRef<T>(null);
  const [minHeight, setMinHeight] = useState(0);

  useEffect(() => {
    function measure() {
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      setMinHeight(Math.max(0, window.innerHeight - top - bottomGapPx));
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
  }, [bottomGapPx]);

  return { ref, minHeight };
}
