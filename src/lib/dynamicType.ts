/**
 * Dynamic Type support for WKWebView / Capacitor
 * ─────────────────────────────────────────────
 * iOS Dynamic Type changes the system's preferred body font size but
 * WKWebView doesn't automatically scale web content to match it.
 *
 * Strategy:
 *   1. Create an invisible probe element styled with `font: -apple-system-body`.
 *      On iOS, this resolves to the actual body font size the user has chosen
 *      in Settings → Display & Text Size → Text Size (Dynamic Type).
 *   2. Compute a scale factor relative to the iOS default "Large" = 17 px.
 *   3. Write the scale as a CSS custom property `--dt-scale` on <html>.
 *      ONLY the type-scale tokens in index.css use `calc(Xrem * var(--dt-scale, 1))`
 *      so text sizes respond while layout geometry (spacing, widths, radii) is
 *      unaffected — those use plain `rem` against the fixed 16 px baseline.
 *
 * iOS Dynamic Type body sizes (approximate):
 *   xSmall=12  Small=13  Medium=15  Large=17 (default)
 *   XL=19  XXL=21  XXXL=23
 *   a11y-L=28  a11y-XL=33  a11y-XXL=40  a11y-XXXL=53
 *
 * On non-iOS platforms the probe returns 16 px (browser default), so the
 * scale is 16/17 ≈ 0.94 — visually identical and harmless.
 */

const IOS_DEFAULT_BODY_PX = 17; // "Large" (the factory default)

/** Read the OS-preferred body font size via a hidden CSS probe. */
function probeSystemBodyPx(): number {
  const el = document.createElement('span');
  el.setAttribute(
    'style',
    'font:-apple-system-body;position:absolute;visibility:hidden;pointer-events:none;',
  );
  document.documentElement.appendChild(el);
  const size = parseFloat(getComputedStyle(el).fontSize) || IOS_DEFAULT_BODY_PX;
  el.remove();
  return size;
}

/** Apply the Dynamic Type scale as a CSS variable (text-only, not layout). */
export function applyDynamicTypeScale(): void {
  if (typeof window === 'undefined') return;
  const systemBodyPx = probeSystemBodyPx();
  // Clamp to a minimum of 1.0 so text never shrinks below the default design
  // size — it only scales UP at larger Dynamic Type settings (XL, XXL, a11y).
  const scale = Math.max(1, Math.round((systemBodyPx / IOS_DEFAULT_BODY_PX) * 1000) / 1000);
  document.documentElement.style.setProperty('--dt-scale', String(scale));
}

/**
 * Apply once on boot, then re-apply whenever the app regains visibility
 * (covers the case where the user switches to Settings, changes Dynamic Type,
 * then returns to the app without fully closing it).
 */
export function initDynamicType(): void {
  applyDynamicTypeScale();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      applyDynamicTypeScale();
    }
  });
}
