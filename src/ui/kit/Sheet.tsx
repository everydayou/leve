import { useLayoutEffect, useRef, useState, useEffect, createContext, useContext, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { prefersReducedMotion } from '../../lib/motion';
import { useKeyboardInset, scrollFocusedAboveKeyboard } from '../../lib/useKeyboardInset';

/** Provides the current keyboard inset (px) to Sheet's children.
 *  Use `useSheetKeyboardInset()` in any child rendered inside a Sheet to
 *  hide or reposition elements when the keyboard is open. */
const SheetKeyboardContext = createContext(0);
// eslint-disable-next-line react-refresh/only-export-components -- hooks co-located with their context
export function useSheetKeyboardInset() { return useContext(SheetKeyboardContext); }

/** Internal context — child forms call `set` to register their CTA in the
 *  Sheet's pinned footer slot (outside the scroll area). */
const SheetFooterSetContext = createContext<((node: ReactNode) => void) | null>(null);

/** Internal context — overlay components call `set` to register a full-panel
 *  overlay that slides in from the right, covering the Sheet header. */
const SheetOverlaySetContext = createContext<((node: ReactNode) => void) | null>(null);

/** Internal context — overlay components call `set` to register their own
 *  pinned CTA inside the OverlayLayer footer slot. */
const OverlayFooterSetContext = createContext<((node: ReactNode) => void) | null>(null);

/** Shape of the nav bar registered by OverlayNav via OverlayNavSetContext. */
type OverlayNavValue = { title: string; onBack: () => void; right?: ReactNode };

/** Internal context — OverlayNav calls `set` to register its props with
 *  OverlayLayer so the nav bar renders ABOVE the scroll area (truly fixed,
 *  immune to rubber-band scroll on iOS). */
const OverlayNavSetContext = createContext<((nav: OverlayNavValue | null) => void) | null>(null);

/** Internal context — child forms register a dismiss/back function so the
 *  OverlayLayer can call it when the user swipes right to go back. */
const SheetOverlayBackSetContext = createContext<((fn: (() => void) | null) => void) | null>(null);

/** Register a function that should be called when the user swipes right on
 *  the overlay to go back. Call from inside a Sheet child (same rule as
 *  useSheetSetOverlay — must be inside Sheet's context tree). */
// eslint-disable-next-line react-refresh/only-export-components
export function useSheetSetOverlayBack(fn: () => void): void {
  const set = useContext(SheetOverlayBackSetContext);
  const fnRef = useRef(fn);
  fnRef.current = fn; // eslint-disable-line react-hooks/refs
  useEffect(() => {
    if (!set) return;
    set(() => fnRef.current());
    return () => set(null);
  }, [set]);
}

/** Provides whether the OverlayLayer's scroll area has scrolled past the top. */
const OverlayScrolledContext = createContext(false);

/** Returns true when the current overlay's scroll area has scrolled down.
 *  Use inside an OverlayNav or any overlay child to conditionally show a shadow. */
// eslint-disable-next-line react-refresh/only-export-components
export function useOverlayScrolled(): boolean { return useContext(OverlayScrolledContext); }

/** Shared nav row for overlay panels. Back arrow on left, centred title,
 *  optional right slot. Registers itself with OverlayLayer via OverlayNavSetContext
 *  so the nav bar is rendered ABOVE the scroll area — fully fixed, immune to
 *  rubber-band scroll on iOS. This component renders nothing in the tree. */
export function OverlayNav({
  title, onBack, right,
}: {
  title: string;
  onBack: () => void;
  right?: ReactNode;
}) {
  const set = useContext(OverlayNavSetContext);
  // Keep a ref so the stable callback wrapper always calls the latest onBack.
  const propsRef = useRef({ onBack, right });
  propsRef.current = { onBack, right }; // eslint-disable-line react-hooks/refs

  // useLayoutEffect fires before paint — no visible flash on first render.
  useLayoutEffect(() => {
    set?.({
      title,
      // Stable wrapper: OverlayLayer calls this, which reads propsRef.current
      // so it always invokes the freshest onBack even if the parent re-rendered.
      onBack: () => propsRef.current.onBack(),
      right: propsRef.current.right,
    });
    return () => set?.(null);
  }, [set, title]);

  // Renders nothing — the nav bar is drawn by OverlayLayer above the scroll area.
  return null;
}

/** Register a CTA button from inside Sheet's scroll area children so it
 *  renders in the Sheet's pinned footer slot (outside the scroll area).
 *
 *  This keeps the button at the bottom of the panel regardless of keyboard
 *  state — it will never float up into the form content when the keyboard opens.
 *
 *  To avoid stale onClick closures without widening `deps`, use a ref:
 *    const saveRef = useRef(save); saveRef.current = save;
 *    useSheetSetFooter(<Button onClick={() => saveRef.current()} disabled={!v}>Save</Button>, [!!v]);
 *
 *  Pass `null` as `node` to hide the footer (e.g. PantryPick before an item is picked). */
// eslint-disable-next-line react-refresh/only-export-components -- hooks co-located with their context
export function useSheetSetFooter(node: ReactNode, deps: readonly unknown[]): void {
  const set = useContext(SheetFooterSetContext);
  const nodeRef = useRef(node);
  nodeRef.current = node; // eslint-disable-line react-hooks/refs -- intentional: update nodeRef mid-render so the effect always reads the latest node
  useEffect(() => {
    set?.(nodeRef.current);
    return () => set?.(null);
  }, [set, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps -- deps intentionally dynamic; spread controls re-registration frequency
}

/** Register a full-panel overlay from inside a Sheet child. When `node` is
 *  non-null the overlay slides in from the right, covering the entire sheet
 *  surface (header, tabs, scroll area). Pass `null` to slide it back out. */
// eslint-disable-next-line react-refresh/only-export-components -- hook co-located with its context
export function useSheetSetOverlay(node: ReactNode, deps: readonly unknown[]): void {
  const set = useContext(SheetOverlaySetContext);
  const nodeRef = useRef(node);
  nodeRef.current = node; // eslint-disable-line react-hooks/refs
  useEffect(() => {
    set?.(nodeRef.current);
    return () => set?.(null);
  }, [set, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Register a pinned CTA button inside the current OverlayLayer footer slot.
 *  Works like useSheetSetFooter but scoped to the overlay surface. */
// eslint-disable-next-line react-refresh/only-export-components -- hook co-located with its context
export function useOverlaySetFooter(node: ReactNode, deps: readonly unknown[]): void {
  const set = useContext(OverlayFooterSetContext);
  const nodeRef = useRef(node);
  nodeRef.current = node; // eslint-disable-line react-hooks/refs
  useEffect(() => {
    set?.(nodeRef.current);
    return () => set?.(null);
  }, [set, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Full-panel overlay that slides in from the right when `node` is non-null,
 *  covering the sheet's grab handle, header, and scroll area. Provides its own
 *  pinned footer slot via OverlayFooterSetContext.
 *  Swipe right-to-left (≥60px horizontal, less vertical) calls `onBack`. */
function OverlayLayer({ node, onBack }: { node: ReactNode; onBack?: (() => void) | null }) {
  const [show, setShow]         = useState(false);
  const [rendered, setRendered] = useState<ReactNode>(null);
  const [overlayFooter, setOverlayFooter] = useState<ReactNode>(null);
  const [overlayNav, setOverlayNav] = useState<OverlayNavValue | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const keyboardInset = useKeyboardInset(); // keyboard inset for overlay scroll area
  const setOverlayFooterCb = useCallback((n: ReactNode) => setOverlayFooter(n), []);
  const setOverlayNavCb = useCallback((nav: OverlayNavValue | null) => setOverlayNav(nav), []);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  useEffect(() => {
    if (node) {
      clearTimeout(timerRef.current);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: must put rendered in DOM before triggering the CSS transition in the rAF below
      setRendered(node);
      // Two rAFs ensure the initial translateX(100%) is painted before the
      // transition begins; a single rAF can race the browser's paint flush.
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setShow(true)));
      return () => cancelAnimationFrame(id);
    } else {
      setShow(false);
      setOverlayFooter(null); // hide footer immediately when overlay starts closing
      timerRef.current = setTimeout(() => setRendered(null), 290);
      return () => clearTimeout(timerRef.current);
    }
  }, [node]);

  if (!rendered) return null;

  return (
    <div
      className="absolute inset-0 z-40 flex flex-col rounded-t-sheet bg-surface overflow-hidden"
      style={{
        transform: show ? 'translateX(0)' : 'translateX(100%)',
        transition: prefersReducedMotion()
          ? 'none'
          : 'transform 280ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
      }}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
        if (dx > 60 && dy < Math.abs(dx) * 0.6) {
          onBack?.();
        }
      }}
    >
      {/* Nav bar — rendered OUTSIDE the scroll container so it stays fixed
          during rubber-band scroll on iOS (sticky inside a scroll area moves). */}
      {overlayNav && (
        <div className={`shrink-0 px-5 pb-3 pt-3 bg-surface${scrolled ? ' shadow-[0_1px_0_0_var(--color-border-subtle)]' : ''}`}>
          <div className="flex items-center">
            <span className="w-10 shrink-0 flex items-center">
              <button onClick={overlayNav.onBack} className="-m-3 p-3 text-content-secondary active:opacity-70" aria-label="Back">
                <Icon name="back" size={22} strokeWidth={2.25} />
              </button>
            </span>
            <h2 className="flex-1 text-center text-headline font-semibold text-content">{overlayNav.title}</h2>
            {overlayNav.right ?? <span className="w-10" />}
          </div>
        </div>
      )}
      <OverlayNavSetContext.Provider value={setOverlayNavCb}>
      <OverlayFooterSetContext.Provider value={setOverlayFooterCb}>
        <OverlayScrolledContext.Provider value={scrolled}>
          <div
            className="flex-1 overflow-y-auto overscroll-contain px-5"
            style={{
              touchAction: 'pan-y',
              paddingBottom: keyboardInset > 0 ? `${keyboardInset}px` : '0.5rem',
            }}
            onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
          >
            {rendered}
          </div>
        </OverlayScrolledContext.Provider>
        {overlayFooter && (
          <div
            className="shrink-0 px-5"
            style={{
              paddingTop: '1.5rem',
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
              background: 'linear-gradient(to bottom, transparent 0px, var(--color-surface) 1.5rem)',
            }}
          >
            {overlayFooter}
          </div>
        )}
      </OverlayFooterSetContext.Provider>
      </OverlayNavSetContext.Provider>
    </div>
  );
}

// Focusable element selector used by the focus trap.
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const OPEN_MS  = 420;        // slide-up / expand duration
const CLOSE_MS = 300;        // slide-down / dismiss duration
const DRAG_DISMISS_PX = 110; // drag at least this far down to dismiss


/** Native-feeling bottom sheet: slides up on open, follows your finger when
 *  you drag the grab-handle/header down, and dismisses past a threshold
 *  (otherwise springs back). The scrim fades in/out with the panel. Renders
 *  the dimmed scrim + a rounded glass surface; the X (close) lives on the LEFT
 *  per the app-wide top-bar rule. This is the single bottom-sheet atom every
 *  screen consumes (Add entry, Today edit sheets, Pantry form, Account sheets). */
const EXPAND_THRESHOLD = 60; // px of upward drag to trigger expansion

export function Sheet({ children, title, titleIcon, subtitle, stickyHeader, rightAction, footer, onClose, forceExpanded, scrollAreaPaddingBottom, closeImmediately, 'aria-label': ariaLabel }: {
  children: ReactNode;
  title?: string;
  /** Optional icon rendered inline to the left of the title text. */
  titleIcon?: ReactNode;
  subtitle?: ReactNode;
  /** Non-scrolling content rendered between the grab-handle and the scroll area.
   *  Use for animated or custom headers that must stay fixed inside the panel. */
  stickyHeader?: ReactNode;
  /** Optional element placed in the right slot of the title row (replaces the placeholder span). */
  rightAction?: ReactNode;
  /** Primary CTA rendered in a sticky footer below the scroll area.
   *  The footer handles safe-area-inset-bottom + 8px so callers don't need to. */
  footer?: ReactNode;
  onClose: () => void;
  /** When true, forces the panel to open at 90dvh (same as fully expanded state). */
  forceExpanded?: boolean;
  /** Override the scroll area's auto-calculated padding-bottom.
   *  Use when children include a sticky footer button that already handles its own
   *  safe-area inset — this prevents the padding zone from allowing content to bleed
   *  through below the sticky element. Keyboard inset always takes priority. */
  scrollAreaPaddingBottom?: string;
  /** Accessible name for the dialog — used by screen readers (VoiceOver: "Add entry, web dialog").
   *  Falls back to `title` if omitted. */
  'aria-label'?: string;
  /** When true, the × close button calls onClose() immediately with no slide-down animation.
   *  Use when the caller handles its own dismiss animation (e.g. FAB morph reverse). */
  closeImmediately?: boolean;
}) {
  const [dragY, setDragY] = useState(0);
  const [closing, setClosing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // Keyboard height in CSS px — drives padding-bottom on the scroll area and
  // the scroll-into-view nudge.  Sourced from the Capacitor Keyboard plugin
  // on device (visualViewport doesn't update with KeyboardResize.None) and
  // from window.visualViewport in the browser / preview build.
  const keyboardInset = useKeyboardInset();
  // True once the user has scrolled the scroll area — triggers the header shadow.
  const [scrolled, setScrolled] = useState(false);
  // Footer node registered by a child form via useSheetSetFooter(). Takes effect
  // when no explicit `footer` prop is passed. Stable setter avoids re-renders.
  const [childFooter, setChildFooter] = useState<ReactNode>(null);
  const setChildFooterCb = useCallback((node: ReactNode) => setChildFooter(node), []);
  // Explicit footer prop takes priority over child-registered footer.
  const effectiveFooter = footer ?? childFooter;
  const [childOverlay, setChildOverlay] = useState<ReactNode>(null);
  const setChildOverlayCb = useCallback((node: ReactNode) => setChildOverlay(node), []);
  // Back function registered by a child via useSheetSetOverlayBack();
  // passed to OverlayLayer so swipe-right can call it.
  const [childOverlayBack, setChildOverlayBack] = useState<(() => void) | null>(null);
  const setChildOverlayBackCb = useCallback(
    (fn: (() => void) | null) => setChildOverlayBack(() => fn),
    [],
  );
  // Ref to the panel element — used by the focus trap.
  const panelRef = useRef<HTMLDivElement>(null);
  // Ref to the scroll area — used to scroll a focused input into view when keyboard opens.
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  // Ref mirror of keyboardInset so the stable focusin listener can read it without
  // being recreated every time the inset changes.
  const keyboardInsetRef = useRef(0);
  keyboardInsetRef.current = keyboardInset; // eslint-disable-line react-hooks/refs -- intentional: mirror state into ref so the stable focusin listener always reads the latest value without being recreated
  // Remember which element had focus before the sheet opened so we can restore it.
  const triggerRef = useRef<Element | null>(null);
  // Tracks whether the last drag ended as a cancel (no dismiss/expand) so
  // we can apply the soft spring-back easing instead of the open easing.
  const isSpringBack = useRef(false);
  // `entered` is false on the very first paint so the panel starts off-screen
  // and the scrim starts transparent. After one rAF both animate in together.
  const [entered, setEntered] = useState(false);
  const dragging = useRef(false);
  const startY = useRef<number | null>(null);

  // ── Body scroll lock ─────────────────────────────────────────────────────────
  // On iOS/WKWebView, when the keyboard opens inside a sheet, the system can
  // scroll `window` (and the <main> behind the sheet) to bring the focused input
  // into view — even though the sheet is portalled to document.body and uses
  // position:fixed. The only reliable fix is to pin the body with position:fixed
  // at the current scroll offset (the standard "body scroll lock" technique).
  // We also lock <main>'s overflowY to prevent any residual scroll inside it.
  // Snapshot is taken synchronously at first render so we capture scroll state
  // Snapshot is taken synchronously at first render so we capture scroll state
  // before the sheet locks the body. Ref is written during render intentionally
  // (one-time lazy init, no state update). The eslint-disable block is correct.
  /* eslint-disable react-hooks/refs */
  const scrollSnapshot = useRef<{ mainEl: HTMLElement | null; mainTop: number; windowY: number } | null>(null);
  if (scrollSnapshot.current == null) {
    if (typeof document !== 'undefined') {
      const mainEl = document.querySelector('main') as HTMLElement | null;
      scrollSnapshot.current = {
        mainEl,
        mainTop: mainEl?.scrollTop ?? 0,
        windowY: window.scrollY,
      };
    } else {
      scrollSnapshot.current = { mainEl: null, mainTop: 0, windowY: 0 };
    }
  }
  /* eslint-enable react-hooks/refs */

  // useLayoutEffect fires synchronously after DOM mutations but BEFORE the
  // browser paints, so the scroll correction is invisible to the user.
  useLayoutEffect(() => {
    const { mainEl, mainTop, windowY } = scrollSnapshot.current!;

    // Lock <main> overflow so focus events can't scroll it. Also pin its height
    // to the current rendered height: when the keyboard opens on iOS/WKWebView
    // the viewport shrinks (dvh changes), which would make <main>'s height
    // contract and visually "pull" the background content upward. Freezing the
    // height prevents that shift — the locked <main> won't change size.
    if (mainEl) {
      mainEl.scrollTop = mainTop;
      mainEl.style.overflowY = 'hidden';
      mainEl.style.height = `${mainEl.offsetHeight}px`;
    }

    // Body scroll lock: freeze the body at the current window scroll position.
    // This prevents iOS from scrolling the page when the keyboard opens inside
    // the sheet. position:fixed + top:-scrollY is the standard iOS technique.
    document.body.style.position = 'fixed';
    document.body.style.top = `-${windowY}px`;
    document.body.style.width = '100%';
    document.body.style.overflowY = 'scroll'; // keep scrollbar width stable on desktop

    // Trigger the open animation on the next frame: first paint shows the panel
    // off-screen + scrim transparent; then both animate in together.
    // When Reduce Motion is enabled, skip the transition and snap immediately.
    let raf: number;
    if (prefersReducedMotion()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- called inside useLayoutEffect (synchronous pre-paint flush), not useEffect
      setEntered(true);
      raf = 0;
    } else {
      raf = requestAnimationFrame(() => setEntered(true));
    }

    return () => {
      cancelAnimationFrame(raf);

      // Restore body scroll lock.
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflowY = '';
      window.scrollTo(0, windowY); // restore exact scroll position

      // Restore <main>.
      if (mainEl) {
        mainEl.style.overflowY = '';
        mainEl.style.height = '';
        mainEl.scrollTop = mainTop;
      }
    };
  }, []);

  // ── Scroll focused input into view ───────────────────────────────────────────
  //
  // Case 1 — keyboard just opened (keyboardInset went 0 → N):
  // Fire once after the keyboard animation settles and scroll the current
  // focused input above the keyboard using viewport-coordinate maths.
  useEffect(() => {
    if (keyboardInset <= 0) return;
    const scrollEl = scrollAreaRef.current;
    const focused = document.activeElement as HTMLElement | null;
    if (!scrollEl || !focused || !scrollEl.contains(focused)) return;
    // 100 ms lets the keyboard slide-up animation finish before we measure.
    setTimeout(() => scrollFocusedAboveKeyboard(scrollEl, focused, keyboardInset), 100);
  }, [keyboardInset]);

  // Case 2 — keyboard already open, user taps a different field:
  // keyboardInset doesn't change so the effect above won't re-fire.
  // A focusin listener on the scroll area catches this and scrolls the
  // newly focused element above the keyboard.
  useEffect(() => {
    const scrollEl = scrollAreaRef.current;
    if (!scrollEl) return;
    const onFocusin = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || !scrollEl.contains(el)) return;
      const inset = keyboardInsetRef.current;
      if (inset <= 0) return;
      setTimeout(() => scrollFocusedAboveKeyboard(scrollEl, el, inset), 100);
    };
    scrollEl.addEventListener('focusin', onFocusin);
    return () => scrollEl.removeEventListener('focusin', onFocusin);
  }, []); // stable — reads inset via ref, no deps needed

  // ── Focus management ─────────────────────────────────────────────────────────
  // 1. Save the element that triggered the sheet so we can restore focus on close.
  // 2. Move focus into the sheet's first focusable element once the panel mounts.
  // 3. Trap Tab/Shift+Tab inside the panel so VoiceOver / keyboard can't escape.
  useEffect(() => {
    triggerRef.current = document.activeElement;

    // Focus the panel itself (tabIndex=-1) rather than the first interactive element.
    // This announces the dialog to screen readers via role="dialog" + aria-label
    // without triggering a visible :focus-visible ring on the close button.
    // The panel div is a non-interactive element so browsers don't apply focus styles to it.
    panelRef.current?.focus({ preventScroll: true });

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusables = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last  = focusables[focusables.length - 1];
      if (e.shiftKey) {
        // If focus is on the panel itself or the first interactive element, wrap to last.
        if (document.activeElement === first || document.activeElement === panelRef.current) {
          e.preventDefault(); last.focus();
        }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // Restore focus to the trigger element when the sheet unmounts.
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus({ preventScroll: true });
      }
    };
  }, []);

  function close() {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, CLOSE_MS);
  }

  // Pointer events so the grab-drag works for touch AND mouse (browser).
  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    startY.current = e.clientY;
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (startY.current == null || !dragging.current) return;
    const dy = e.clientY - startY.current;
    // Positive dy = dragging down; negative = dragging up.
    // Only translate panel downward; upward drag is handled on release.
    setDragY(dy > 0 ? dy : dy); // keep full value so onPointerUp can read direction
  }
  function onPointerUp() {
    if (!dragging.current) return;
    dragging.current = false;
    startY.current = null;
    if (dragY < -EXPAND_THRESHOLD && !expanded && !forceExpanded) {
      // Dragged up from 50% → expand to 90%
      setExpanded(true);
      setDragY(0);
    } else if (expanded && !forceExpanded && dragY > 60) {
      // Dragged down from 90% → collapse back to 50% first (never dismiss directly from full)
      setExpanded(false);
      setDragY(0);
    } else if (dragY > DRAG_DISMISS_PX && (!expanded || forceExpanded)) {
      // At 50% or force-expanded: dragged past threshold → dismiss
      setDragY(0);
      close();
    } else {
      // Cancel — spring back with soft damped easing.
      isSpringBack.current = true;
      setDragY(0);
      setTimeout(() => { isSpringBack.current = false; }, OPEN_MS + 50);
    }
  }

  // Panel: starts off-screen (translateY 100%), slides in once entered.
  // Downward drag follows finger 1:1 (dismiss direction).
  // Upward drag gets 0.25 rubber-band resistance — panel floats slightly above
  // its resting position, then snaps back when released.
  const renderDy = dragY > 0 ? dragY : dragY * 0.25;
  const panelTranslateY = closing
    ? '100%'
    : entered
    ? (renderDy ? `${renderDy}px` : '0px')
    : '100%';

  const springBackEasing = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'; // soft damped
  const openEasing       = 'cubic-bezier(0.22, 0.65, 0.25, 1)';     // smooth ease-out — even deceleration, no front-loading

  const panelStyle: React.CSSProperties = {
    transform: `translateY(${panelTranslateY})`,
    // Expanded: fixed 90dvh so long content scrolls. Default: auto height so
    // short forms (weight/activity) are compact; capped at 50dvh for tall ones.
    // forceExpanded lets callers (e.g. scan results) open at full height immediately.
    // Always use concrete max-height values so CSS can interpolate between them.
    // height:auto→fixed and fixed→undefined cannot be animated by CSS, so we rely
    // on max-height (50dvh ↔ 90dvh) as the animatable dimension for expand/collapse.
    height: (expanded || forceExpanded) ? '91dvh' : 'auto',
    maxHeight: (expanded || forceExpanded) ? '91dvh' : '50dvh',
    minHeight: '20dvh',
    // eslint-disable-next-line react-hooks/refs -- read-only ref used to suppress CSS transition while dragging; state would cause extra renders
    transition: dragging.current
      ? 'none'
      : [
          // eslint-disable-next-line react-hooks/refs -- read-only ref used for spring-back easing selection during drag release
          `transform ${closing ? CLOSE_MS : OPEN_MS}ms ${isSpringBack.current ? springBackEasing : openEasing}`,
          `max-height ${OPEN_MS}ms ${openEasing}`,
        ].join(', '),
  };

  // Scrim: transparent on first paint, fades in with the panel.
  // Transition only active when animating (open/close/drag) — never on mount.
  const scrimOpacity = closing
    ? 0
    : !entered
    ? 0
    : Math.min(1, Math.max(0.15, 1 - Math.max(0, renderDy) / 500));

  const scrimStyle: React.CSSProperties = {
    opacity: scrimOpacity,
    // eslint-disable-next-line react-hooks/refs -- read-only ref used to suppress CSS transition while dragging; state would cause extra renders
    transition: dragging.current
      ? 'none'
      : `opacity ${closing ? CLOSE_MS : OPEN_MS}ms ease`,
  };

  // Render into document.body via a portal so the sheet escapes any ancestor
  // overflow:hidden or stacking-context constraints (the AppShell outer div has
  // overflow-hidden which, in WebKit/Safari, traps fixed+absolute children).
  // Portal = root stacking context = always above everything.
  return createPortal(
    // pan-y: allows the sheet's scroll area to scroll vertically via touch
    // while still blocking horizontal swipe navigation. The body is position:fixed
    // so there is nothing behind the sheet to scroll accidentally.
    // Touches on the scrim or grab-handle still get e.preventDefault() to
    // prevent any browser default (grab-handle has its own touch-none class).
    <div
      className="fixed inset-0 z-[200] flex flex-col justify-end"
      style={{ touchAction: 'pan-y' }}
      onTouchMove={(e) => {
        // Let scroll-area touches flow to the native pan-y handler.
        if (scrollAreaRef.current?.contains(e.target as Node)) return;
        e.preventDefault();
        e.stopPropagation();
      }}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <button
        className="absolute inset-0 bg-scrim"
        style={scrimStyle}
        aria-label="Close"
        onClick={close}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? title}
        tabIndex={-1}
        className="relative mx-auto w-full max-w-[26.25rem] flex flex-col rounded-t-sheet bg-surface outline-none"
        style={panelStyle}
      >
        {/* Surface cover: anchored to the panel's bottom edge (top:100%) so it
            only ever extends BELOW the panel — not above it. Uses vh (layout
            viewport, never shrinks) to fill the gap WKWebView shows between
            the dvh-based panel bottom and the keyboard when the keyboard opens. */}
        <div
          className="absolute inset-x-0 pointer-events-none bg-surface"
          style={{ top: '100%', height: '50vh' }}
          aria-hidden="true"
        />
        {/* Header wrapper — shadow appears once the scroll area has been scrolled,
            mirroring the same pattern used on fixed nav bars in full-screen views. */}
        <div
          className={`shrink-0 cursor-grab touch-none transition-[box-shadow] duration-200 active:cursor-grabbing${scrolled ? ' shadow-nav' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <div
            className="px-5 pt-3"
          >
            <div className="mx-auto mb-3 h-1.5 w-11 rounded-pill bg-border-strong" />
            {/* Title row — only rendered when a title is provided. Sheets that
                manage their own header (e.g. navigating sub-pages) omit title. */}
            {title !== undefined && (
              <div className="mb-4 flex items-center gap-2">
                <button data-no-drag onClick={closeImmediately ? onClose : close} aria-label="Close" className="-m-3 p-3 text-content-secondary">
                  <Icon name="close" size={22} strokeWidth={2.25} />
                </button>
                <div className="flex-1 flex flex-col items-center">
                  <h2 className="text-center text-headline font-semibold">
                    {titleIcon ? (
                      <span className="inline-flex items-center justify-center gap-1.5">
                        {titleIcon}
                        {title}
                      </span>
                    ) : title}
                  </h2>
                  {subtitle && (
                    <div className="flex items-center justify-center gap-1.5">
                      {subtitle}
                    </div>
                  )}
                </div>
                {rightAction ?? <span className="w-6" />}
              </div>
            )}
          </div>
          {stickyHeader && (
            <div className="px-5" data-no-drag>{stickyHeader}</div>
          )}
        </div>
        <SheetOverlayBackSetContext.Provider value={setChildOverlayBackCb}>
        <SheetOverlaySetContext.Provider value={setChildOverlayCb}>
          <SheetFooterSetContext.Provider value={setChildFooterCb}>
            <SheetKeyboardContext.Provider value={keyboardInset}>
              <div
                ref={scrollAreaRef}
                className="flex-1 overflow-y-auto px-5"
                onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
                style={{ touchAction: 'pan-y',
                  paddingBottom: keyboardInset > 0
                    ? `${keyboardInset}px`
                    : scrollAreaPaddingBottom !== undefined
                    ? scrollAreaPaddingBottom
                    : effectiveFooter
                    ? '8px'
                    : 'env(safe-area-inset-bottom, 0px)',
                }}
              >{children}</div>
              {effectiveFooter && (
                <div
                  className="shrink-0 px-5"
                  style={{
                    paddingTop: '1.5rem',
                    paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
                    // Gradient fades scroll content into the surface behind the CTA
                    background: 'linear-gradient(to bottom, transparent 0px, var(--color-surface) 1.5rem)',
                  }}
                >
                  {effectiveFooter}
                </div>
              )}
            </SheetKeyboardContext.Provider>
          </SheetFooterSetContext.Provider>
        </SheetOverlaySetContext.Provider>
        </SheetOverlayBackSetContext.Provider>
        {/* Full-panel overlay — absolute inset-0 covers header, tabs, and scroll area */}
        <OverlayLayer node={childOverlay} onBack={childOverlayBack} />
      </div>
    </div>,
    document.body,
  );
}
