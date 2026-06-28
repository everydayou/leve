import { useCallback, useEffect, useState } from 'react';
import { Icon, type IconName } from './Icon';
import { hapticLight } from '../../lib/haptics';
import { prefersReducedMotion } from '../../lib/motion';

export type TabItem = { key: string; label: string; icon: IconName };
export type ActionType = 'scan' | 'food' | 'activity' | 'weight';

type ActionItem = {
  type: ActionType;
  icon: IconName;
  label: string;
  tier: 'inner' | 'outer';
};

const SCAN_ENABLED = !!(import.meta.env.VITE_FOOD_SCAN_API_URL as string | undefined);

// Speed-dial items — preserved for future use (currently disconnected from FAB tap)
const ACTION_ITEMS: ActionItem[] = [
  ...(SCAN_ENABLED ? [{ type: 'scan' as ActionType, icon: 'scanFood' as IconName, label: 'Scan meal', tier: 'outer' as const }] : []),
  { type: 'food',     icon: 'foodIcon',    label: 'Food',       tier: 'inner' },
  { type: 'activity', icon: 'activityIcon',label: 'Activity',   tier: 'inner' },
  { type: 'weight',   icon: 'weight',      label: 'Weight',     tier: 'outer' },
];

/*
  FAB MORPH ANIMATION
  ───────────────────
  Tapping the FAB skips the speed-dial and instead morphs the nav bar into the sheet:

  fwd1 (230ms) — FAB rotates to ×; nav icons fade out; white pill overlay fades in
  fwd2 (350ms) — FAB rotates back to +; white overlay grows from pill → full screen;
                 existing FAB hides; green CTA pill grows from 48px → full width
  open         — morph overlay hidden behind the Sheet portal (z-200)
  rev-init     — immediately snap overlay back to full-screen white (no transition)
  rev2 (350ms) — white shrinks full→pill; CTA shrinks full→48px circle
  rev1 (230ms) — white pill fades out; nav icons fade in; FAB reappears
  idle         — normal state

  The white overlay uses clip-path: inset() which is fully animatable in CSS.
  Pill clip:  inset(calc(100% - safe - 68px)  1rem 0 1rem round 9999px)
  Full clip:  inset(0 0 0 0 round 1.5rem 1.5rem 0 0)   ← matches Sheet top radius

  The CTA pill (green, absolutely positioned over the overlay) grows in width
  and keeps its centre anchored to the FAB position via bottom + translate(−50%,50%).

  Layer stack (bottom → top):
  0  nav-backdrop  gradient — ALWAYS on
  1  tab-pill      glass pill — ALWAYS on
  2  bg-solid      150px surface-muted — ONLY when menuOpen (speed-dial, preserved)
  3  bg-gradient   — ONLY when menuOpen
  4  scrim         full-screen tap blocker — ONLY when menuOpen
  5  FAB+actions   — ALWAYS rendered; FAB hides during fwd2–rev2
  6  morph-overlay white clip-path div + green CTA — ONLY during morph phases
*/

type MorphPhase = 'idle' | 'fwd1' | 'fwd2' | 'open' | 'rev-init' | 'rev2' | 'rev1';

// FAB center is 48px from the bottom of the inner pill container (including safe area).
// Combined: safe-area-inset-bottom + PILL_H(56px) + (-top-4 offset to FAB center) = safe + 48
// → bottom: calc(safe + 48px), and translate(−50%, 50%) keeps the centre fixed as CTA grows.
const FAB_CENTER_BOTTOM = 'calc(max(0.75rem, env(safe-area-inset-bottom)) + 48px)';

// Pill clip: shows the nav pill area (68px from bottom of container, ±1rem sides)
const PILL_CLIP = 'inset(calc(100% - max(0.75rem, env(safe-area-inset-bottom)) - 68px) 1rem 0 1rem round 9999px)';
// Full-screen clip: matches Sheet's rounded-t-sheet top corners (--radius-sheet = 1.5rem)
const FULL_CLIP = 'inset(0 0 0 0 round 1.5rem 1.5rem 0 0)';

export function FloatingTabBar({
  items, active, onSelect, onAction, onFabMorphComplete, startFabReverseRef,
}: {
  items: TabItem[];
  active: string;
  onSelect: (key: string) => void;
  /** Called when a speed-dial action is chosen OR when FAB morph forward completes. */
  onAction: (type: ActionType) => void;
  /** Called at the end of the forward morph (fwd2) so AppShell can open the sheet. */
  onFabMorphComplete?: () => void;
  /** Ref populated by FloatingTabBar with a function that AppShell can call to start
   *  the reverse morph (sheet closing → FAB restores). */
  startFabReverseRef?: React.MutableRefObject<(() => void) | null>;
}) {
  // ── Speed-dial state (preserved, currently disconnected from FAB tap) ──────
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted]   = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMenuOpen(false); }, [active]);

  /* Speed-dial open — preserved for future use (currently disconnected from FAB tap)
  function openMenu() {
    hapticLight();
    setMenuOpen(true);
    requestAnimationFrame(() => setMounted(true));
  }
  */
  // Provide a no-op so the rest of the speed-dial machinery has something to reference
  const _openMenu = () => { /* see block comment above */ };
  void _openMenu; // suppress TS6133

  function closeMenu() {
    hapticLight();
    setMounted(false);
    setMenuOpen(false);
  }

  function handleAction(type: ActionType) {
    hapticLight();
    setMounted(false);
    setMenuOpen(false);
    onAction(type);
  }

  // ── Morph animation state ─────────────────────────────────────────────────
  const [morphPhase, setMorphPhase] = useState<MorphPhase>('idle');
  // morphEntered: triggers the opacity fade-in of the pill overlay in fwd1
  const [morphEntered, setMorphEntered] = useState(false);

  const startReverse = useCallback(() => {
    // rev-init: immediately full screen (no transition), then transition to pill
    setMorphPhase('rev-init');
    requestAnimationFrame(() => {
      setMorphPhase('rev2');
    });
    setTimeout(() => setMorphPhase('rev1'), 350);
    setTimeout(() => {
      setMorphPhase('idle');
      setMorphEntered(false);
    }, 580);
  }, []);

  // Expose startReverse to AppShell via ref
  useEffect(() => {
    if (startFabReverseRef) startFabReverseRef.current = startReverse;
    return () => { if (startFabReverseRef) startFabReverseRef.current = null; };
  }, [startFabReverseRef, startReverse]);

  function startMorph() {
    if (morphPhase !== 'idle') return;
    hapticLight();
    setMorphPhase('fwd1');
    requestAnimationFrame(() => setMorphEntered(true)); // trigger opacity fade-in

    setTimeout(() => setMorphPhase('fwd2'), 230); // FAB_DUR

    setTimeout(() => {
      onFabMorphComplete?.();
      setMorphPhase('open');
    }, 580); // FAB_DUR + 350
  }

  const mid   = Math.ceil(items.length / 2);
  const left  = items.slice(0, mid);
  const right = items.slice(mid);

  const reduced    = prefersReducedMotion();
  const springEase = 'cubic-bezier(0.34,1.56,0.64,1)';
  const btnEase    = 'cubic-bezier(0.34,1.30,0.64,1)';

  const FAB_DUR  = 230;
  const BTN_DUR  = 380;
  const BTN_LEAD = Math.round(FAB_DUR / 2);

  const slotDist = (tier: 'inner' | 'outer') => (tier === 'outer' ? 128 : 68);

  // ── Morph overlay computed styles ─────────────────────────────────────────
  const isMorphing = morphPhase !== 'idle';
  // Show the FAB button normally during idle, fwd1, rev1; hide during active morph
  const fabHidden = morphPhase === 'fwd2' || morphPhase === 'open' || morphPhase === 'rev-init' || morphPhase === 'rev2';
  // FAB icon rotates to × during fwd1 only
  const fabRotated = morphPhase === 'fwd1';
  // Nav tab opacity: normal when idle or open (sheet covers everything); 0 during all morph phases
  const navIconOpacity = (morphPhase === 'idle' || morphPhase === 'open') ? 1 :
    morphPhase === 'rev1' ? 1 : // fading back in
    0;

  // White overlay clip-path
  const overlayClipPath = (() => {
    switch (morphPhase) {
      case 'idle': case 'fwd1': case 'rev1': return PILL_CLIP;
      case 'fwd2': case 'open': case 'rev-init': return FULL_CLIP;
      case 'rev2': return PILL_CLIP; // transitions FROM FULL_CLIP
      default: return PILL_CLIP;
    }
  })();

  // Overlay opacity: fades in during fwd1, always 1 during active morph, fades out during rev1
  const overlayOpacity = (() => {
    switch (morphPhase) {
      case 'idle': return 0;
      case 'fwd1': return morphEntered ? 1 : 0;
      case 'rev1': return 0; // fading out
      default: return 1;
    }
  })();

  // CSS transition for the overlay
  const overlayTransition = reduced ? 'none' : (() => {
    switch (morphPhase) {
      case 'fwd1': return `opacity ${FAB_DUR}ms ease, clip-path ${FAB_DUR}ms ease`;
      case 'fwd2': return 'clip-path 350ms cubic-bezier(0.22, 0.65, 0.25, 1)';
      case 'rev-init': return 'none'; // immediate snap to full-screen
      case 'rev2': return 'clip-path 350ms cubic-bezier(0.22, 0.65, 0.25, 1)';
      case 'rev1': return 'opacity 230ms ease';
      default: return 'none';
    }
  })();

  // Green CTA pill: visible and expanding during fwd2, shrinking during rev2
  const showCTA = morphPhase === 'fwd2' || morphPhase === 'rev-init' || morphPhase === 'rev2';
  const ctaExpanded = morphPhase === 'fwd2' || morphPhase === 'rev-init';
  const ctaTransition = reduced ? 'none' : (() => {
    if (morphPhase === 'fwd2') return 'width 350ms cubic-bezier(0.22, 0.65, 0.25, 1), height 350ms cubic-bezier(0.22, 0.65, 0.25, 1)';
    if (morphPhase === 'rev2') return 'width 350ms cubic-bezier(0.22, 0.65, 0.25, 1), height 350ms cubic-bezier(0.22, 0.65, 0.25, 1)';
    return 'none';
  })();

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
        className="flex flex-1 flex-col items-center gap-0.5 py-1"
        style={{
          opacity: navIconOpacity,
          transition: reduced ? 'none' : 'opacity 230ms ease',
        }}
      >
        <Icon name={t.icon} size={24} filled={isActive} strokeWidth={1.85}
          className={isActive ? 'text-content' : 'text-content-secondary'} aria-hidden />
        <span className={`text-micro font-medium ${isActive ? 'text-content' : 'text-content-secondary'}`} aria-hidden>
          {t.label}
        </span>
      </button>
    );
  };

  const renderActionBtn = (item: ActionItem, side: 'left' | 'right') => {
    const open     = menuOpen && mounted;
    const dist     = slotDist(item.tier);
    const startTx  = side === 'left' ? dist : -dist;
    const tx       = open ? 0 : startTx;
    const lead     = item.tier === 'outer' ? 70 : 0;
    const delay    = reduced ? 0 : (open ? BTN_LEAD + lead : 0);
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

  const leftActions  = ACTION_ITEMS.slice(0, 2);
  const rightActions = ACTION_ITEMS.slice(2);

  const bottomPad = 'pb-[max(0.75rem,env(safe-area-inset-bottom))]';
  const PILL_H = 56;

  return (
    <div className="pointer-events-none absolute inset-0 z-30">

      {/* ── Layer 0: Nav backdrop ──────────────────────────────────────────── */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0"
        style={{
          height: 120,
          background: 'linear-gradient(to bottom, transparent, var(--color-surface-muted))',
        }}
      />

      {/* ── Layer 1: Tab pill ─────────────────────────────────────────────── */}
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

      {/* ── Layer 2: Speed-dial active solid base (preserved) ────────────── */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0"
        style={{
          height: 150,
          backgroundColor: 'var(--color-surface-muted)',
          opacity: menuOpen ? 0.9 : 0,
          transition: reduced ? 'none' : `opacity ${FAB_DUR}ms ease`,
        }}
      />

      {/* ── Layer 3: Speed-dial active gradient (preserved) ──────────────── */}
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

      {/* ── Layer 4: Tap-blocker scrim (speed-dial, preserved) ───────────── */}
      <div
        className="absolute inset-0"
        style={{ background: 'transparent', pointerEvents: menuOpen ? 'auto' : 'none' }}
        onClick={closeMenu}
        aria-hidden
      />

      {/* ── Layer 5: FAB + speed-dial action buttons ──────────────────────── */}
      <div className={`pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 ${bottomPad}`}>
        <div
          className="relative w-full max-w-sm px-3 py-1.5"
          style={{ height: PILL_H }}
        >
          {/* Speed-dial action buttons (preserved, only visible when menuOpen) */}
          <div
            className="pointer-events-none absolute inset-x-0 flex items-center justify-center gap-3"
            style={{ top: '-16px' }}
            aria-hidden={!menuOpen ? true : undefined}
          >
            {leftActions.map((item) => renderActionBtn(item, 'left'))}
            <div className="w-16 shrink-0" aria-hidden />
            {rightActions.map((item) => renderActionBtn(item, 'right'))}
          </div>

          {/* FAB button — hidden during active morph phases (fwd2 → rev2) */}
          <div
            className="pointer-events-auto absolute left-1/2 -top-4 -translate-x-1/2"
            style={{
              opacity: fabHidden ? 0 : 1,
              pointerEvents: fabHidden ? 'none' : 'auto',
              transition: reduced ? 'none' : `opacity ${fabHidden ? 150 : 200}ms ease`,
            }}
          >
            <button
              aria-label={menuOpen ? 'Close menu' : 'Add entry'}
              onClick={morphPhase === 'idle' ? startMorph : menuOpen ? closeMenu : undefined}
              style={{
                width: 48, height: 48,
                transform: menuOpen ? 'scale(1.3333)' : 'scale(1)',
                transformOrigin: 'center',
                transition: reduced ? 'none' : `transform ${FAB_DUR}ms ${springEase}`,
              }}
              className="flex items-center justify-center rounded-pill bg-accent text-on-accent shadow-lg active:bg-accent-hover"
            >
              <span
                style={{
                  display: 'inline-flex',
                  transform: (menuOpen || fabRotated) ? 'rotate(45deg)' : 'rotate(0deg)',
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

      {/* ── Layer 6: Morph animation overlay ─────────────────────────────────
          Rendered only when a morph phase is active. Contains:
          (a) white surface div clipped to pill → full screen
          (b) green CTA pill that grows from FAB size to full width           */}
      {isMorphing && (
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {/* White surface — clip-path morphs between pill and full screen */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'var(--color-surface)',
              clipPath: overlayClipPath,
              opacity: overlayOpacity,
              transition: overlayTransition,
            }}
          />

          {/* Green CTA pill — visible during fwd2 / rev-init / rev2 */}
          {showCTA && (
            <div
              style={{
                position: 'absolute',
                left: '50%',
                bottom: FAB_CENTER_BOTTOM,
                // translate(-50%, 50%) keeps the centre fixed at FAB_CENTER_BOTTOM
                // as the element's width/height change during animation
                transform: 'translate(-50%, 50%)',
                width: ctaExpanded ? 'calc(100% - 2rem)' : '48px',
                height: ctaExpanded ? '56px' : '48px',
                borderRadius: '9999px',
                backgroundColor: 'var(--color-accent)',
                transition: ctaTransition,
              }}
            />
          )}
        </div>
      )}

    </div>
  );
}
