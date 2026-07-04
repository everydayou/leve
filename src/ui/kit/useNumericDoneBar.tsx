import { useState } from 'react';
import { useKeyboardInset } from '../../lib/useKeyboardInset';

/**
 * Shared "Done" accessory bar for numeric-keyboard inputs (inputMode
 * "numeric" / "decimal", type="tel", etc.) — iOS's number keypads have no
 * built-in Return/confirm key, so they never close themselves. Round
 * 158/159 introduced this as option 4 in Dev > Keyboards playground
 * ("decimal + custom Done bar"), which Marco confirmed as the one to use;
 * round 160 promotes it app-wide to every numeric-keyboard input.
 *
 * Usage: spread `bind` onto the input's onFocus/onBlur (composing with any
 * of your own handlers if the field already has them), and render
 * `doneBar` anywhere as a sibling — it's fixed-positioned so placement in
 * the tree doesn't matter. Tapping Done blurs whichever input is currently
 * focused, so one hook instance per input is fine even when several inputs
 * using this hook exist on the same screen (only the focused one ever
 * shows its bar).
 */
export function useNumericDoneBar() {
  const [focused, setFocused] = useState(false);
  const keyboardInset = useKeyboardInset();

  const bind = {
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  };

  const doneBar = focused ? (
    <div
      className="fixed inset-x-0 z-[400] flex justify-end border-t border-border-subtle bg-surface-elevated py-2 pl-4"
      style={{ bottom: keyboardInset, paddingRight: '24px' }}
    >
      <button
        type="button"
        // onMouseDown (not onClick) fires BEFORE the input's onBlur on
        // iOS/WebKit, so preventDefault here stops the blur from racing
        // the tap and dismissing before the value settles.
        onMouseDown={(e) => { e.preventDefault(); (document.activeElement as HTMLElement | null)?.blur(); }}
        className="text-subhead font-semibold text-accent-hover active:opacity-70"
      >
        Done
      </button>
    </div>
  ) : null;

  return { bind, doneBar };
}
