import { useState } from 'react';
import { useKeyboardInset } from '../../lib/useKeyboardInset';

/** Fixed height (round 186) so the bar is pixel-identical everywhere it's
 *  used, regardless of button font metrics — and so callers doing keyboard-
 *  clearance math (Sheet.tsx, GoalSetupScreen.tsx) have an exact number to
 *  add on top of the reported keyboard height, since the bar sits above the
 *  keyboard and isn't itself part of that reported height. */
export const DONE_BAR_HEIGHT = 44;

/**
 * Shared "Done" accessory bar for text-input focus — iOS's numeric/decimal
 * keypads have no built-in Return/confirm key at all, and even the standard
 * QWERTY keyboard's Return key does nothing on a plain, non-form `<input>`
 * (no onKeyDown wiring), so neither ever closes itself. Round 158/159
 * introduced this as option 4 in Dev > Keyboards playground ("decimal +
 * custom Done bar"), which Marco confirmed as the one to use; round 160
 * promoted it app-wide to every numeric-keyboard input. Round 181 renamed
 * it from useNumericDoneBar and moved it into LabeledInput itself, so it
 * now also covers plain text-keyboard fields (Name, Meal name, Goal name,
 * etc.) the same way.
 *
 * Usage: spread `bind` onto the input's onFocus/onBlur (composing with any
 * of your own handlers if the field already has them), and render
 * `doneBar` anywhere as a sibling — it's fixed-positioned so placement in
 * the tree doesn't matter. Tapping Done blurs whichever input is currently
 * focused, so one hook instance per input is fine even when several inputs
 * using this hook exist on the same screen (only the focused one ever
 * shows its bar).
 */
export function useKeyboardDoneBar() {
  const [focused, setFocused] = useState(false);
  const keyboardInset = useKeyboardInset();

  const bind = {
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  };

  const doneBar = focused ? (
    <div
      className="fixed inset-x-0 z-[400] flex items-center justify-end border-t border-border-subtle bg-surface-elevated pl-4"
      style={{ bottom: keyboardInset, paddingRight: '24px', height: DONE_BAR_HEIGHT }}
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
