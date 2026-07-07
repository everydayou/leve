import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';

// Measures env(safe-area-inset-bottom) as a real px number (once, cached).
// Capacitor's keyboardWillShow reports the KEY-ROW height only — on iPhones
// with a home indicator the system keyboard's tinted background actually
// extends further, down through the home-indicator safe area. Every fixed,
// bottom-positioned element that anchors itself to `keyboardHeight` alone
// (the Done bar, Sheet/OverlayLayer scroll padding) was floating exactly
// that safe-area amount above the real keyboard, leaving a sliver of page
// content visible in the gap — reported as "Done bar floating a few px
// above the keyboard" across every screen that uses it.
let cachedSafeAreaBottomPx: number | null = null;
function getSafeAreaBottomPx(): number {
  if (cachedSafeAreaBottomPx !== null) return cachedSafeAreaBottomPx;
  if (typeof document === 'undefined') return 0;
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;left:0;bottom:0;height:0;width:0;pointer-events:none;visibility:hidden;' +
    'padding-bottom:env(safe-area-inset-bottom, 0px);';
  document.body.appendChild(probe);
  const px = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
  document.body.removeChild(probe);
  cachedSafeAreaBottomPx = px;
  return px;
}

/**
 * Returns the current keyboard inset height in CSS pixels (0 when hidden).
 *
 * On native iOS (Capacitor + KeyboardResize.None) the WKWebView frame never
 * changes size, so window.visualViewport stays identical to window.innerHeight
 * and the delta is always 0.  We use the Capacitor Keyboard plugin events
 * instead — they report the real keyboard height from the native layer.
 *
 * In the browser / VITE_PREVIEW build we fall back to window.visualViewport,
 * which works correctly there because the browser does shrink the viewport.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      // Native path: Capacitor Keyboard plugin gives exact height regardless
      // of KeyboardResize mode. addListener is async; we track handles so we
      // can remove them on cleanup even if unmount races the async registration.
      let mounted = true;
      const handles: Array<{ remove: () => Promise<void> }> = [];

      void (async () => {
        const h1 = await Keyboard.addListener('keyboardWillShow', (info) => {
          if (mounted) setInset(info.keyboardHeight + getSafeAreaBottomPx());
        });
        const h2 = await Keyboard.addListener('keyboardWillHide', () => {
          if (mounted) setInset(0);
        });
        if (mounted) {
          handles.push(h1, h2);
        } else {
          // Component unmounted before async registration completed — remove immediately.
          void h1.remove();
          void h2.remove();
        }
      })();

      return () => {
        mounted = false;
        handles.forEach((h) => void h.remove());
      };
    }

    // Browser / preview fallback — visualViewport works here because the
    // browser actually shrinks the viewport when the keyboard appears.
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return inset;
}

/**
 * Scrolls a focused input above the keyboard if it is hidden behind it.
 *
 * Uses getBoundingClientRect() for accurate viewport-coordinate maths.
 * Unlike scrollIntoView({block:'nearest'}), this function knows about the
 * keyboard overlay: it checks whether the element's bottom exceeds
 * (window.innerHeight - keyboardInset - extraClearance) and scrolls by
 * exactly the overlap plus a 24 px breathing room.
 *
 * `extraClearance` (round 186) accounts for anything drawn ABOVE the
 * keyboard that isn't part of the reported keyboard height itself — in
 * practice, the custom "Done" bar (DONE_BAR_HEIGHT from useKeyboardDoneBar)
 * that now shows on every focused text/number field. Without it, a field
 * near the bottom of a scroll area gets scrolled just far enough to clear
 * the keyboard but not the bar sitting on top of it.
 */
export function scrollFocusedAboveKeyboard(
  scrollEl: HTMLElement,
  el: HTMLElement,
  keyboardInset: number,
  extraClearance = 0,
): void {
  const inputRect   = el.getBoundingClientRect();
  const keyboardTop = window.innerHeight - keyboardInset - extraClearance;
  if (inputRect.bottom > keyboardTop - 16) {
    scrollEl.scrollBy({ top: inputRect.bottom - keyboardTop + 24, behavior: 'smooth' });
  }
}
