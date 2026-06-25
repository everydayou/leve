import { useEffect, useRef, useState } from 'react';
import { GaugeArc, Button, Badge, Icon } from '../kit';
import { prefersReducedMotion } from '../../lib/motion';
import logoLight from '../../assets/logo-leve-light.svg';
import logoDark  from '../../assets/logo-leve-dark.svg';

// ── Types ─────────────────────────────────────────────────────────────────────

type LogEntry = {
  type: 'food' | 'activity';
  name: string;
  kcal: number; // always positive; sign derived from type
  id:   number; // unique per-add timestamp → stable React key (prevents existing items
                // from re-mounting and re-playing the entrance animation when new
                // items are prepended)
};

// ── Demo sequence ─────────────────────────────────────────────────────────────
// Breakfast → Lunch (gauge goes OVER) → Activity (brings it back).
// Most recent entry is prepended so it appears on top.

const DEMO: Omit<LogEntry, 'id'>[] = [
  { type: 'food',     name: 'Granola', kcal: 380 },
  { type: 'food',     name: 'Pasta',   kcal: 450 },
  { type: 'activity', name: 'Run',     kcal: 600 },
];

// Precompute kcal-remaining after each phase so closures are clean.
const START_LEFT  = 500;
const GAUGE_RANGE = 500; // ±500 kcal → ±100 % of arc (matches TodayScreen)

const PHASES = (() => {
  let left = START_LEFT;
  return DEMO.map((entry) => {
    left += entry.type === 'food' ? -entry.kcal : entry.kcal;
    return { entry, kcalLeft: left };
  });
})();

// ── Timing constants (ms) ────────────────────────────────────────────────────
//
// Per-entry sequence:
//   t+0    → pill notification appears
//   t+300  → log item added (with fade-in) + gauge arc starts + number snaps
//   t+1300 → arc animation complete (300 + 1000)
//   t+1400 → pill fades out (1100 ms after gauge update, 100 ms after arc done)
//   t+2050 → next entry starts (1400 + 650 gap)
//
// Full cycle: ~32 (render) + 1500 (fill+pause) + 3×2050 (entries) + 2000 (rest)
//   ≈ 9 682 ms

const ARC_DURATION   = 1000; // ms — GaugeArc CSS spring transition
const NUM_DURATION   =  250; // ms — animateNum RAF counter (snappy)
const PILL_DELAY     =  300; // ms — pill → log item / gauge update
const PILL_FADE_AT   = 1100; // ms — fade pill this many ms after gauge update
const AFTER_ARC_GAP  =  750; // ms — breathing room between entries
const LOOP_PAUSE     = 2000; // ms — pause before restarting

// ── Shared animated visual ────────────────────────────────────────────────────

/** Visual-only portion: animated gauge + log list.
 *  Used inside OnboardingFlow (carousel) and by the standalone default export. */
export function DailyAllowanceVisual() {
  // `kcalLeft`    — drives the gauge arc (instant state change → CSS handles anim)
  // `displayKcal` — animated number in the gauge centre (RAF interpolation)
  const [kcalLeft,    setKcalLeft]    = useState(0);
  const [displayKcal, setDisplayKcal] = useState(0);
  const [log,         setLog]         = useState<LogEntry[]>([]);
  // `pillEntry` keeps the last entry so the pill retains content while fading out
  const [pillEntry,   setPillEntry]   = useState<Omit<LogEntry, 'id'> | null>(null);
  const [pillVisible, setPillVisible] = useState(false);

  const cancelledRef = useRef(false);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    // Reduced-motion: show the final state without any animation.
    if (reduced) {
      const final = PHASES[PHASES.length - 1];
      /* eslint-disable react-hooks/set-state-in-effect -- skips animation and jumps to final state for reduced-motion users */
      setKcalLeft(final.kcalLeft);
      setDisplayKcal(final.kcalLeft);
      setLog([...DEMO].reverse().map((e, i) => ({ ...e, id: i })));
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }

    cancelledRef.current = false;

    const timers: ReturnType<typeof setTimeout>[] = [];
    let activeRaf: number | null = null;

    // Simple sleep that registers its timer for bulk cleanup.
    function sleep(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const id = setTimeout(resolve, ms);
        timers.push(id);
      });
    }

    // Linearly interpolate the displayed number over `durationMs`.
    // Cancels any in-flight animation before starting a new one.
    function animateNum(from: number, to: number, durationMs: number) {
      if (activeRaf !== null) cancelAnimationFrame(activeRaf);
      const startTime = performance.now();
      function tick(now: number) {
        if (cancelledRef.current) return;
        const t = Math.min((now - startTime) / durationMs, 1);
        setDisplayKcal(Math.round(from + (to - from) * t));
        if (t < 1) {
          activeRaf = requestAnimationFrame(tick);
        } else {
          activeRaf = null;
          setDisplayKcal(to);
        }
      }
      activeRaf = requestAnimationFrame(tick);
    }

    async function run() {
      while (true) {
        if (cancelledRef.current) return;

        // ── Reset to blank slate ────────────────────────────────────────────
        setLog([]);
        setPillVisible(false);
        setKcalLeft(0);
        setDisplayKcal(0);

        // Two frames to ensure the 0-state renders before the fill transition.
        await sleep(32);
        if (cancelledRef.current) return;

        // Trigger gauge fill + simultaneous number count-up.
        setKcalLeft(START_LEFT);
        animateNum(0, START_LEFT, NUM_DURATION);

        // Wait for arc to finish filling + post-fill pause.
        await sleep(ARC_DURATION + 500);
        if (cancelledRef.current) return;

        // ── Entry sequence ──────────────────────────────────────────────────
        let prevKcal = START_LEFT;
        for (const { entry, kcalLeft: snap } of PHASES) {
          if (cancelledRef.current) return;

          // 1. Pill notification appears.
          setPillEntry(entry);
          setPillVisible(true);

          // 2. PILL_DELAY later: log item added, arc starts moving, number animates.
          await sleep(PILL_DELAY);
          if (cancelledRef.current) return;

          setLog((prev) => [{ ...entry, id: Date.now() }, ...prev]);
          setKcalLeft(snap);
          animateNum(prevKcal, snap, NUM_DURATION);
          prevKcal = snap;

          // 3. PILL_FADE_AT into arc animation → fade the pill.
          await sleep(PILL_FADE_AT);
          if (cancelledRef.current) return;
          setPillVisible(false);

          // 4. Let the arc finish, then the gap before the next entry.
          await sleep((ARC_DURATION - PILL_FADE_AT) + AFTER_ARC_GAP);
          if (cancelledRef.current) return;
        }

        // ── Pause before restarting ─────────────────────────────────────────
        await sleep(LOOP_PAUSE);
      }
    }

    run();

    return () => {
      cancelledRef.current = true;
      timers.forEach(clearTimeout);
      if (activeRaf !== null) cancelAnimationFrame(activeRaf);
    };
  }, [reduced]);

  const gaugeValue = Math.max(-1, Math.min(1, kcalLeft / GAUGE_RANGE));
  const isOnTarget = kcalLeft >= 0;

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-3 pt-4 px-0">
      {/* ── Gauge card ──────────────────────────────────────────────────── */}
      {/*   Badge (top) → GaugeArc → flash pill (bottom, inside card)       */}
      {/* No overflow-y-auto here — the carousel Panel 2 (px-6) is the     */}
      {/* clipping context. px-3 here + px-6 parent = 36px total inset,    */}
      {/* comfortably wider than shadow-card-lg's 32px horizontal spread.  */}
      <div className="shrink-0 w-full rounded-main bg-surface border border-border-subtle shadow-card-lg px-4 pt-8 pb-6 flex flex-col items-center">

        {/* Status badge — top of card */}
        <Badge status={isOnTarget ? 'success' : 'default'}>
          {isOnTarget ? 'On target' : 'Over'}
        </Badge>

        {/* Gauge arc with animated centre number */}
        <div className="mt-6">
          <GaugeArc value={gaugeValue} bidirectional transitionMs={ARC_DURATION}>
            <div className="flex flex-col items-center">
              <div
                className="flex items-center"
                style={displayKcal < 0 ? { transform: 'translateX(-4px)' } : undefined}
              >
                {displayKcal < 0 && (
                  <span className="text-title font-semibold leading-none text-content">−</span>
                )}
                <span className="text-hero font-semibold leading-none tracking-tight text-content">
                  {Math.abs(displayKcal)}
                </span>
              </div>
              <span className="mt-0.5 text-subhead text-content-secondary whitespace-nowrap">
                {isOnTarget ? 'kcal available' : 'kcal over'}
              </span>
            </div>
          </GaugeArc>
        </div>

        {/* Flash pill — overlays badge. Positioned with negative margin.
            Opacity transitions on pillVisible; content preserved via pillEntry. */}
        <div
          className="-mt-6 h-8 rounded-pill bg-content px-3 flex items-center gap-6 overflow-hidden"
          style={{
            opacity: pillEntry && pillVisible ? 1 : 0,
            transition: 'opacity 400ms ease',
          }}
          aria-live="polite"
          aria-atomic="true"
        >
          {pillEntry && (
            <>
              <div className="flex items-center gap-1 shrink-0">
                <Icon
                  name={pillEntry.type === 'food' ? 'foodIcon' : 'activityIcon'}
                  size={12}
                  className="shrink-0 text-content-inverse"
                />
                <span className="text-subhead font-medium text-content-inverse whitespace-nowrap">
                  {pillEntry.name}
                </span>
              </div>
              <span className="text-subhead font-bold text-content-inverse whitespace-nowrap">
                {pillEntry.type === 'food' ? `−${pillEntry.kcal}` : `+${pillEntry.kcal}`} kcal
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Log list — prepended so most recent entry is on top ──────── */}
      {log.length > 0 && (
        <div className="shrink-0 w-full rounded-card border border-border-card-no-shadow overflow-hidden">
          {log.map((entry, i) => (
            <div
              key={entry.id}
              className={`log-item-in flex items-center justify-between px-4 py-3${
                i < log.length - 1 ? ' border-b border-border-subtle' : ''
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <Icon
                  name={entry.type === 'food' ? 'foodIcon' : 'activityIcon'}
                  size={16}
                  className="shrink-0 text-content-secondary"
                />
                <span className="truncate text-callout text-content">{entry.name}</span>
              </span>
              <span className={`shrink-0 text-callout font-semibold ml-4 ${
                entry.type === 'activity' ? 'text-accent' : 'text-content'
              }`}>
                {entry.type === 'food' ? `−${entry.kcal}` : `+${entry.kcal}`} kcal
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Spacer — absorbs spare height so bottom section stays pinned */}
      <div className="flex-1" />
    </div>
  );
}

// ── Standalone preview screen ─────────────────────────────────────────────────

/** Full standalone screen — used at the /onboarding2 preview route.
 *  Accepts `onNext` (CTA) and `onSkip` (header button). */
export default function OnboardingDailyAllowance({
  onNext,
  onSkip,
}: {
  onNext?: () => void;
  onSkip?: () => void;
}) {
  return (
    <div className="fixed inset-0 flex justify-center overflow-hidden bg-surface-sunken sm:items-center sm:py-[max(1.5rem,2dvh)]">
      <div className="safe-top safe-bottom flex h-[100dvh] w-full max-w-[26.25rem] flex-col overflow-hidden bg-surface-muted sm:h-[min(880px,94dvh)] sm:rounded-[2rem] sm:border sm:border-border-subtle sm:shadow-xl">

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4">
          {/* Invisible twin keeps logo centred */}
          <span className="text-callout text-content-secondary opacity-0 pointer-events-none select-none">Skip</span>
          <img src={logoLight} alt="leve" className="h-7 dark:hidden" />
          <img src={logoDark}  alt="leve" className="h-7 hidden dark:block" />
          <button
            onClick={onSkip}
            className="text-callout text-content-secondary px-1 py-2 rounded-control active:bg-surface-sunken transition-colors"
          >
            Skip
          </button>
        </div>

        {/* ── Middle — visual ───────────────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0 flex-col px-6 overflow-hidden">
          <DailyAllowanceVisual />
        </div>

        {/* ── Bottom section ────────────────────────────────────────────────── */}
        <div className="shrink-0 px-6 pb-10 pt-2 flex flex-col gap-6">

          <div className="flex flex-col gap-2">
            <h1 className="text-display font-semibold text-content tracking-tight leading-tight">
              Daily allowance
            </h1>
            <p className="text-callout text-content-secondary leading-relaxed">
              You get a calorie budget each day.<br />
              Food uses it, activity earns it back.
            </p>
          </div>

          {/* Page-indicator dots — screen 1 inactive, screen 2 active */}
          <div className="flex items-center justify-center gap-2">
            <div className="size-2 rounded-full bg-progress-track" />
            <div className="h-2 w-10 rounded-pill bg-content" />
          </div>

          <Button size="lg" onClick={onNext}>Got it</Button>
        </div>

      </div>
    </div>
  );
}
