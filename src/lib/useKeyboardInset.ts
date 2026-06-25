import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';

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
          if (mounted) setInset(info.keyboardHeight);
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
 * (window.innerHeight - keyboardInset) and scrolls by exactly the overlap
 * plus a 24 px breathing room.
 */
export function scrollFocusedAboveKeyboard(
  scrollEl: HTMLElement,
  el: HTMLElement,
  keyboardInset: number,
): void {
  const inputRect   = el.getBoundingClientRect();
  const keyboardTop = window.innerHeight - keyboardInset;
  if (inputRect.bottom > keyboardTop - 16) {
    scrollEl.scrollBy({ top: inputRect.bottom - keyboardTop + 24, behavior: 'smooth' });
  }
}
