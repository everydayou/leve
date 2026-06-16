import { useEffect, useState } from 'react';
import { Icon, type IconName } from './Icon';
import { hapticLight } from '../../lib/haptics';
import { prefersReducedMotion } from '../../lib/motion';

export type TabItem = { key: string; label: string; icon: IconName };
export type ActionType = 'scan' | 'food' | 'activity' | 'weight';

type ActionItem = {
  type: ActionType;
  icon: IconName;
  label: string;
  /** Distance ring from the FAB centre. 'inner' = adjacent slot, 'outer' = one
   *  slot further out. Drives both the emanate-from-FAB start offset and the
   *  inner-leads-outer stagger. */
  tier: 'inner' | 'outer';
};

const ACTION_ITEMS: ActionItem[] = [
  { type: 'scan',     icon: 'scanFood',    label: 'Scan meal',  tier: 'outer' },
  { type: 'food',     icon: 'foodIcon',    label: 'Food',       tier: 'inner' },
  { type: 'activity', icon: 'activityIcon',label: 'Activity',   tier: 'inner' },
  { type: 'weight',   icon: 'weight',      label: 'Weight',     tier: 'outer' },
];

/*
  Layer stack (bottom → top):
  0  nav-backdrop  120 px gradient transparent→surface-muted — ALWAYS on. The
                   resting backdrop that lets the floating pill read over
                   scrolling content (restored from round 88; token, no hex).
  1  tab-pill      glass pill with navigation tab buttons.
  2  bg-solid      150 px, surface-muted @ 90 % — ACTIVE ONLY (menu open). Painted
                   ABOVE the pill so it HIDES the nav bar (pill + labels) when the
                   dial opens — a backdrop BEHIND the pill could never hide it.
  3  bg-gradient   100 px, transparent→surface-muted @ 90 % — ACTIVE ONLY.
                   Layers 2+3 are the backdrop under the FAB while the dial is
                   open; they fade in/out with the FAB morph.
  4  scrim         full-screen INVISIBLE tap-blocker — rendered last-but-one so it
                   sits above the pill in the stacking order; when open it
                   intercepts ALL taps (including the nav bar). No visible fill.
  5  fab+actions   FAB (48 px base → 64 px active) + 4 action buttons (48 px) —
                   rendered AFTER the scrim, always interactive; container height
                   hard-matched to the real pill so the FAB -top-4 aligns correctly
*/
export function FloatingTabBar({
  items, active, onSelect, onAction,
}: {
  items: TabItem[];
  active: string;
  onSelect: (key: string) => void;
  onAction: (type: ActionType) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted]   = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- close speed-dial when the active tab changes externally
  useEffect(() => { setMenuOpen(false); }, [active]);

  function openMenu() {
    hapticLight();
    setMenuOpen(true);
    requestAnimationFrame(() => setMounted(true));
  }

  function closeMenu() {
    hapticLight();
    setMounted(false);    // buttons, FAB and bg all revert together (same render)
    setMenuOpen(false);
  }

  function handleAction(type: ActionType) {
    hapticLight();
    setMounted(false);
    setMenuOpen(false);
    onAction(type);
  }

  const mid   = Math.ceil(items.length / 2);
  const left  = items.slice(0, mid);
  const right = items.slice(mid);

  const reduced    = prefersReducedMotion();
  const springEase = 'cubic-bezier(0.34,1.56,0.64,1)';          // FAB: full spring
  const btnEase    = 'cubic-bezier(0.34,1.30,0.64,1)';          // buttons: gentler

  /*
    CHOREOGRAPHY (two-phase, mirrored open ↔ close):

    OPEN  (tap +):
      Phase 1 (0 → FAB_DUR):  FAB rotates +→× and scales 48→64; the active
                              background (layers 1+2) fades in. These run
                              together, keyed off menuOpen.
      Phase 2 (≈¾ in → …):    the four buttons emanate FROM BEHIND the FAB —
                              starting collapsed at the FAB centre (scaled down,
                              hidden), then fanning out to their slots on the
                              spring. Keyed off `mounted`, delayed by BTN_LEAD.
    CLOSE (tap ×):
      Everything reverts AT ONCE — buttons retract behind the FAB while the FAB
      rotates ×→+ / scales down and the background fades out, all kicked off in
      the same render (menuOpen + mounted both → false, no delay).
  */
  const FAB_DUR  = 230;   // FAB rotate+scale AND background fade (was 280)
  const BTN_DUR  = 380;   // action-button spring travel (was 460)
  const BTN_LEAD = Math.round(FAB_DUR / 2);  // buttons start HALFWAY through the FAB

  // Slot distance from the FAB centre (px), measured to each button's resting
  // centre so they collapse exactly onto the FAB. With the 64 px active FAB,
  // 12 px gaps and 48 px buttons:
  //   inner = half-FAB(32) + gap(12) + half-btn(24)              = 68
  //   outer = inner + (half-btn(24) + gap(12) + half-btn(24))    = 128
  const slotDist = (tier: 'inner' | 'outer') => (tier === 'outer' ? 128 : 68);

  /* ── Tab button ────────────────────────────────────────────────────────── */
  const Tab = (t: TabItem) => {
    const isActive = t.key === active;
    return (
      <button
        key={t.key}
        role="tab"
        aria-selected={isActive}
        aria-label={t.label}
        onClick={() => { hapticLight(); onSelect(t.key); }}
        className={`flex flex-1 flex-col items-center gap-0.5 py-1 transition-opacity duration-150
          ${menuOpen ? 'opacity-30' : 'opacity-100'}`}
      >
        <Icon name={t.icon} size={24} filled={isActive} strokeWidth={1.85}
          className={isActive ? 'text-content' : 'text-content-secondary'} aria-hidden />
        <span className={`text-micro font-medium ${isActive ? 'text-content' : 'text-content-secondary'}`} aria-hidden>
          {t.label}
        </span>
      </button>
    );
  };

  /*
    Action button animation — "emanate from behind the FAB":
      START (closed): translateX(±slotDist) scale(0.4) opacity:0
                      → collapsed onto the FAB centre, scaled down and hidden
                        BEHIND the FAB (the FAB is painted after / on top).
      END   (open):   translateX(0) scale(1) opacity:1  → resting in its slot.

    Transform order is translateX THEN scale, so the offset is measured in the
    parent's coordinate space (the button travels the FULL slot distance from
    the FAB centre regardless of its current scale). Left slots collapse to the
    RIGHT (+, toward the FAB), right slots to the LEFT (−).

    Timing: on OPEN every button is delayed by BTN_LEAD so it starts ≈¾ through
    the FAB morph; inner buttons lead, outer follow (+70 ms). On CLOSE there is
    no delay — buttons retract immediately, ahead of the FAB.
  */
  /* NOTE: this is a render HELPER, invoked as `renderActionBtn(...)` (NOT as a
     <Component/>). Defining a component inline and using it as JSX gives it a new
     function identity every render, so React would remount the <button> each time
     — and a freshly-mounted node has no previous style to transition from, so the
     buttons would just pop in/out with no animation. Calling it as a function (the
     same pattern as Tab above) keeps the host <button> nodes stable across renders
     so their CSS transitions actually run. */
  const renderActionBtn = (item: ActionItem, side: 'left' | 'right') => {
    const open     = menuOpen && mounted;
    const dist     = slotDist(item.tier);
    const startTx  = side === 'left' ? dist : -dist;       // collapse toward FAB
    const tx       = open ? 0 : startTx;
    const lead     = item.tier === 'outer' ? 70 : 0;       // inner leads outer
    const delay    = reduced ? 0 : (open ? BTN_LEAD + lead : 0);
    // Subtle unfurl: start at ±45° and settle to 0°. Right buttons spin clockwise
    // (−45→0), left buttons counter-clockwise (+45→0). Rotate is LAST in the
    // transform list so it spins around the button's own centre and doesn't
    // affect the parent-space translateX travel.
    const startRot = side === 'right' ? -45 : 45;
    const rot      = open ? 0 : startRot;

    return (
      <button
        key={item.type}
        aria-label={item.label}
        onClick={() => handleAction(item.type)}
        style={{
          width: 48, height: 48,
          transform: `translateX(${tx}px) scale(${open ? 1 : 0.4}) rotate(${rot}deg)`,
          opacity: open ? 1 : 0,
          pointerEvents: menuOpen ? 'auto' : 'none',
          transition: reduced
            ? 'none'
            : `transform ${BTN_DUR}ms ${btnEase} ${delay}ms, opacity ${Math.round(BTN_DUR * 0.6)}ms ease-out ${delay}ms`,
        }}
        className="flex items-center justify-center rounded-pill bg-surface shadow-card border border-border-subtle"
      >
        <Icon name={item.icon} size={22} className="text-content" />
      </button>
    );
  };

  const leftActions  = ACTION_ITEMS.slice(0, 2);  // scan, food
  const rightActions = ACTION_ITEMS.slice(2);      // activity, weight

  // Shared bottom padding — same on Layer 3 (pill) and Layer 5 (FAB+actions)
  const bottomPad = 'pb-[max(0.75rem,env(safe-area-inset-bottom))]';

  /*
    Layer 5 pill height calculation:
      Tab button: py-1 (8 px) + icon 24 px + gap-0.5 (2 px) + text-micro (~10 px) = 44 px
      Pill outer: py-1.5 (12 px)
      Total: 56 px
    The FAB uses -top-4 (-16 px) → FAB centre = -16 + 24 = 8 px from pill top.
    Action row uses top: -12 px → button centre = -12 + 20 = 8 px from pill top. ✓
  */
  const PILL_H = 56;

  return (
    <div className="pointer-events-none absolute inset-0 z-30">

      {/* ── Layer 0: Nav backdrop — 120 px gradient, ALWAYS on ──────────────
          Restored resting backdrop (round 88). Fades transparent→surface-muted
          so the floating pill stays legible over scrolling content. Token-based
          (no hardcoded hex); pointer-events:none so it never blocks taps.       */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0"
        style={{
          height: 120,
          background: 'linear-gradient(to bottom, transparent, var(--color-surface-muted))',
        }}
      />

      {/* ── Layer 1: Tab pill ───────────────────────────────────────────────
          Sits directly on the nav backdrop. CRUCIAL: the active FAB backdrop
          (layers 2+3) is rendered AFTER this, so when the dial opens it paints
          OVER the pill — that's what makes the nav bar (pill + labels) disappear
          behind the 98 % surface. A backdrop BEHIND the pill could never hide it,
          no matter the opacity.                                                */}
      <div className={`pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 ${bottomPad}`}>
        <div
          role="tablist"
          aria-label="Main navigation"
          className="glass pointer-events-auto relative flex w-full max-w-sm items-center rounded-pill px-3 py-1.5 select-none"
        >
          <div className="flex flex-1 justify-around">{left.map(Tab)}</div>
          <div className="w-14" aria-hidden />
          <div className="flex flex-1 justify-around">{right.map(Tab)}</div>
        </div>
      </div>

      {/* ── Layer 2: Active solid base — 150 px, surface-muted @ 90 % ────────
          Active only. Painted ABOVE the pill so it HIDES the nav bar when the
          dial is open. Keyed off menuOpen and timed to FAB_DUR so it fades in/
          out in lock-step with the FAB morph.                                  */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0"
        style={{
          height: 150,
          backgroundColor: 'var(--color-surface-muted)',
          opacity: menuOpen ? 0.9 : 0,
          transition: reduced ? 'none' : `opacity ${FAB_DUR}ms ease`,
        }}
      />

      {/* ── Layer 3: Active gradient fade — 100 px, transparent→surface-muted @ 90 % ──
          Sits above layer 2. Div opacity 0.9 → bottom = 90 % surface-muted,
          top = fully transparent (0 %). Same menuOpen/FAB_DUR sync.            */}
      <div
        className="pointer-events-none absolute inset-x-0"
        style={{
          bottom: 150,
          height: 100,
          background: 'linear-gradient(to bottom, transparent, var(--color-surface-muted))',
          opacity: menuOpen ? 0.9 : 0,
          transition: reduced ? 'none' : `opacity ${FAB_DUR}ms ease`,
        }}
      />

      {/* ── Layer 4: Full-screen tap-blocker ────────────────────────────────
          Rendered AFTER the pill → sits ABOVE it in stacking order. INVISIBLE
          (no fill): its only job is to intercept every tap (including the nav
          bar) so the rest of the screen is inert while the dial is open. The
          visible backdrop comes entirely from layers 1+2.                      */}
      <div
        className="absolute inset-0"
        style={{
          background: 'transparent',
          pointerEvents: menuOpen ? 'auto' : 'none',
        }}
        onClick={closeMenu}
        aria-hidden
      />

      {/* ── Layer 5: FAB + action buttons ───────────────────────────────────
          Rendered AFTER the scrim → stays interactive above it.
          Container height = PILL_H (56 px) so -top-4 FAB offset is identical
          to Layer 3, keeping the FAB visually aligned with the pill.          */}
      <div className={`pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 ${bottomPad}`}>
        <div
          className="relative w-full max-w-sm px-3 py-1.5"
          style={{ height: PILL_H }}
        >
          {/* Action button row — 12 px gaps, centred above FAB */}
          <div
            className="pointer-events-none absolute inset-x-0 flex items-center justify-center gap-3"
            style={{ top: '-16px' }}
            aria-hidden={!menuOpen ? true : undefined}
          >
            {leftActions.map((item) => renderActionBtn(item, 'left'))}
            {/* 64 px placeholder = active FAB width, so the gap-3 leaves a true
                12 px between the FAB and the two inner buttons */}
            <div className="w-16 shrink-0" aria-hidden />
            {rightActions.map((item) => renderActionBtn(item, 'right'))}
          </div>

          {/* FAB — 48 px base, scales to 64 px when active. Scaled from its own
              centre (transform-origin) so it grows symmetrically and stays
              anchored to the same point above the pill. */}
          <div className="pointer-events-auto absolute left-1/2 -top-4 -translate-x-1/2">
            <button
              aria-label={menuOpen ? 'Close menu' : 'Add entry'}
              onClick={menuOpen ? closeMenu : openMenu}
              style={{
                width: 48, height: 48,
                transform: menuOpen ? 'scale(1.3333)' : 'scale(1)',  // 48 → 64 px
                transformOrigin: 'center',
                transition: reduced ? 'none' : `transform ${FAB_DUR}ms ${springEase}`,
              }}
              className="flex items-center justify-center rounded-pill bg-accent text-on-accent shadow-lg active:bg-accent-hover"
            >
              <span
                style={{
                  display: 'inline-flex',
                  transform: menuOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                  transition: reduced
                    ? 'none'
                    : `transform ${FAB_DUR}ms ${springEase}`,
                }}
              >
                <Icon name="plus" size={26} strokeWidth={2.25} />
              </span>
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
