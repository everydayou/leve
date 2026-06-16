import { useRef, useState } from 'react';
import { Button } from '../kit';
import { NutritionGoalsVisual } from './OnboardingScreen1';
import { DailyAllowanceVisual } from './OnboardingDailyAllowance';
import logoLight from '../../assets/logo-leve-light.svg';
import logoDark  from '../../assets/logo-leve-dark.svg';

// ── Constants ─────────────────────────────────────────────────────────────────

const SNAP_RATIO  = 0.4;  // drag > 40 % of width → advance
const FAST_VEL    = 500;  // px/s → fast swipe always advances

const SCREEN_COPY: { title: string; desc: string; cta: string }[] = [
  {
    title: 'Set Goals',
    desc:  'Choose your target, track calories,\nachieve it.',
    cta:   'Next',
  },
  {
    title: 'Daily Allowance',
    desc:  'You get a calorie budget each day.\nFood uses it, activity earns it back.',
    cta:   'Got it',
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * OnboardingFlow — two-screen carousel (Screen 1: Nutrition Goals, Screen 2: Daily Allowance).
 *
 * Features:
 *  • Horizontal swipe with peek effect (~20 % of next screen visible while dragging)
 *  • Snap threshold: release at > 40 % drag or fast swipe (> 500 px/s) → advance
 *  • Animated stepper (pill ↔ dot, 300 ms transition)
 *  • Shared header (logo + Skip) and footer (copy + stepper + CTA)
 */
export default function OnboardingFlow({
  onDone,
  onSkip,
}: {
  onDone: () => void;
  onSkip: () => void;
}) {
  const [screen,     setScreen]     = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const containerRef  = useRef<HTMLDivElement>(null);
  const touchStartX   = useRef(0);
  const touchStartMs  = useRef(0);

  // ── Gesture handlers ───────────────────────────────────────────────────────

  function getWidth() {
    return containerRef.current?.offsetWidth ?? 390;
  }

  function goTo(idx: number) {
    setScreen(idx);
    setDragOffset(0);
    setIsDragging(false);
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current  = e.touches[0].clientX;
    touchStartMs.current = performance.now();
    setIsDragging(true);
  }

  function handleTouchMove(e: React.TouchEvent) {
    const dx = e.touches[0].clientX - touchStartX.current;
    // Rubber-band effect at edges: allow dragging past but with resistance
    const RESISTANCE = 0.4; // lower = more resistance
    let offset = dx;

    if (screen === 0 && dx > 0) {
      // At first screen, dragging right → apply resistance
      offset = dx * RESISTANCE;
    } else if (screen === 1 && dx < 0) {
      // At last screen, dragging left → apply resistance
      offset = dx * RESISTANCE;
    }

    setDragOffset(offset);
  }

  function handleTouchEnd(e: React.TouchEvent) {
    setIsDragging(false);
    const dx  = e.changedTouches[0].clientX - touchStartX.current;
    // eslint-disable-next-line react-hooks/purity -- performance.now() is in an event handler, not render; linter false-positive
    const dt  = (performance.now() - touchStartMs.current) / 1000;
    const vel = Math.abs(dx) / Math.max(dt, 0.01);
    const w   = getWidth();

    if (screen === 0 && dx < 0 && (Math.abs(dx) > w * SNAP_RATIO || vel > FAST_VEL)) {
      goTo(1);
    } else if (screen === 1 && dx > 0 && (Math.abs(dx) > w * SNAP_RATIO || vel > FAST_VEL)) {
      goTo(0);
    } else {
      setDragOffset(0);
    }
  }

  // translateX moves the 200%-wide inner strip left/right.
  // screen=0 → 0 px; screen=1 → -w px; plus live drag offset.
  // eslint-disable-next-line react-hooks/refs -- getWidth() reads containerRef for layout geometry needed in render; safe read-only access
  const translateX = -screen * getWidth() + dragOffset;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 flex justify-center overflow-hidden bg-surface-sunken sm:items-center sm:py-[max(1.5rem,2dvh)]">
      <div className="safe-top safe-bottom flex h-[100dvh] w-full max-w-[26.25rem] flex-col overflow-hidden bg-surface-muted sm:h-[min(880px,94dvh)] sm:rounded-[2rem] sm:border sm:border-border-subtle sm:shadow-xl">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4">
          {/* Invisible placeholder keeps logo centred */}
          <span className="text-callout text-content-secondary opacity-0 pointer-events-none select-none">
            Skip
          </span>
          <img src={logoLight} alt="leve" className="h-7 dark:hidden" aria-hidden="false" />
          <img src={logoDark}  alt="leve" className="h-7 hidden dark:block" aria-hidden="false" />
          <button
            onClick={onSkip}
            className="text-callout text-content-secondary px-1 py-2 rounded-control active:bg-surface-sunken transition-colors"
          >
            Skip
          </button>
        </div>

        {/* ── Carousel ────────────────────────────────────────────────────── */}
        <div
          ref={containerRef}
          className="flex-1 min-h-0 overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Inner strip — 200% wide so each panel = 100% of the viewport */}
          <div
            className="flex h-full"
            style={{
              width:      '200%',
              transform:  `translateX(${translateX}px)`,
              transition: isDragging
                ? 'none'
                : 'transform 400ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              willChange: 'transform',
            }}
          >
            {/* Panel 1 — Nutrition Goals */}
            <div
              className="h-full flex flex-col px-2 overflow-hidden"
              style={{ width: '50%' }}
            >
              <div className="flex-1 flex flex-col justify-center min-h-0">
                <div style={{ transform: 'scale(0.85)', transformOrigin: 'top center' }}>
                  <NutritionGoalsVisual />
                </div>
              </div>
              {/* Copy for Panel 1 */}
              <div className="shrink-0 px-6 pt-6 pb-2 flex flex-col gap-2">
                <h1 className="text-display font-semibold text-content tracking-tight leading-tight">
                  {SCREEN_COPY[0].title}
                </h1>
                <p className="text-callout text-content-secondary leading-relaxed whitespace-pre-line">
                  {SCREEN_COPY[0].desc}
                </p>
              </div>
            </div>

            {/* Panel 2 — Daily Allowance */}
            <div
              className="h-full flex flex-col px-2 overflow-hidden"
              style={{ width: '50%' }}
            >
              <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
                <div style={{ transform: 'scale(0.85)', transformOrigin: 'top center', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <DailyAllowanceVisual />
                </div>
              </div>
              {/* Copy for Panel 2 */}
              <div className="shrink-0 px-6 pt-6 pb-2 flex flex-col gap-2">
                <h1 className="text-display font-semibold text-content tracking-tight leading-tight">
                  {SCREEN_COPY[1].title}
                </h1>
                <p className="text-callout text-content-secondary leading-relaxed whitespace-pre-line">
                  {SCREEN_COPY[1].desc}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Fixed Footer (Stepper + CTA) ────────────────────────────────── */}
        <div className="shrink-0 px-6 pb-10 pt-2 flex flex-col gap-5">

          {/* Stepper — active indicator expands to a pill, inactive shrinks to a dot */}
          <div
            className="flex items-center justify-center gap-2"
            aria-label={`Screen ${screen + 1} of ${SCREEN_COPY.length}`}
            role="status"
          >
            {SCREEN_COPY.map((_, i) => (
              <div
                key={i}
                className="h-2 rounded-pill bg-content transition-all duration-300 ease-in-out"
                style={{
                  width:   screen === i ? '2.5rem' : '0.5rem',
                  opacity: screen === i ? 1 : 0.28,
                }}
              />
            ))}
          </div>

          {/* CTA */}
          <Button
            size="lg"
            onClick={screen === 0 ? () => goTo(1) : onDone}
          >
            {SCREEN_COPY[screen].cta}
          </Button>
        </div>

      </div>
    </div>
  );
}
