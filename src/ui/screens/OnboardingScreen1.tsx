import { useEffect, useRef, useState } from 'react';
import { SegmentedControl, Badge, Icon } from '../kit';
import { prefersReducedMotion } from '../../lib/motion';

// ── Timing (ms) ───────────────────────────────────────────────────────────────

const CHART_DRAW_MS  = 1500; // weight line draws in
const HOLD_MS        = 1800; // pause on each view before switching
const TAB_SWITCH_MS  = 250;  // gap between tab change and calories anim start
const CAL_GROW_MS    = 1000; // calorie bars grow in
const LOOP_PAUSE_MS  = 1000; // pause before loop restarts

// ── Demo data ─────────────────────────────────────────────────────────────────
//
// Goal: start 87 kg → target 81 kg over ~10 weeks (goal started ~Mon Jun 1 2026)
// This week: Mon=85.0, Wed=84.6, Fri=84.2  (Fri = "today" for the demo)
// Week 2 of the goal.
//
// Calories: daily budget ~286 kcal deficit over TDEE (~2000 kcal burn)
//   Mon 380, Tue 920, Wed 1540, Thu 2200, Fri 2580 (cumulative consumed)
//   Budget ramp: Mon 286, Tue 572, Wed 858, Thu 1144, Fri 1430 (cumulative)
//   → Mon under, Tue under, Wed under, Thu over, Fri over

// ── Component ─────────────────────────────────────────────────────────────────

type Tab = 'weight' | 'calories';

/** Animated goal card for onboarding Screen 1 — "Nutrition Goals".
 *  Cycles: weight chart draws in → hold → switch to calories → bars grow → hold → repeat. */
export function NutritionGoalsVisual() {
  const [tab,         setTab]         = useState<Tab>('weight');
  const [weightKey,   setWeightKey]   = useState(0);  // remount → replay animation
  const [calKey,      setCalKey]      = useState(0);
  const [calVisible,  setCalVisible]  = useState(false);
  const cancelRef = useRef(false);
  const reduced   = prefersReducedMotion();

  useEffect(() => {
    if (reduced) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- skips animation and jumps to final state for reduced-motion users
      setTab('calories');
      setCalVisible(true);
      return;
    }

    cancelRef.current = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    function sleep(ms: number) {
      return new Promise<void>((resolve) => {
        const id = setTimeout(resolve, ms);
        timers.push(id);
      });
    }

    async function run() {
      while (true) {
        if (cancelRef.current) return;

        // Reset to weight tab (remount chart so animation replays)
        setTab('weight');
        setCalVisible(false);
        setWeightKey((k) => k + 1);

        await sleep(CHART_DRAW_MS + HOLD_MS);
        if (cancelRef.current) return;

        // Switch to calories, remount chart
        setTab('calories');
        setCalKey((k) => k + 1);
        await sleep(TAB_SWITCH_MS);
        if (cancelRef.current) return;

        setCalVisible(true);
        await sleep(CAL_GROW_MS + HOLD_MS);
        if (cancelRef.current) return;

        await sleep(LOOP_PAUSE_MS);
      }
    }

    run();
    return () => {
      cancelRef.current = true;
      timers.forEach(clearTimeout);
    };
  }, [reduced]);

  return (
    <div className="w-full rounded-main bg-surface border border-border-subtle shadow-card px-4 pt-4 pb-4 flex flex-col gap-3">
      {/* Segmented control — visual only, centred */}
      <div className="flex justify-center">
        <SegmentedControl
          options={[
            { value: 'weight',   label: 'Weight'   },
            { value: 'calories', label: 'Calories' },
          ]}
          value={tab}
          onChange={() => {/* visual-only */}}
        />
      </div>

      {/* Chart nav header */}
      <ChartHeader tab={tab} />

      {/* Chart area */}
      {tab === 'weight' ? (
        <OnboardingKgWeekChart key={weightKey} drawDuration={CHART_DRAW_MS} />
      ) : (
        <OnboardingWeekChart key={calKey} visible={calVisible} growDuration={CAL_GROW_MS} />
      )}
    </div>
  );
}

// ── Chart nav header ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- prop accepted for caller typing; intentionally unused in this static header
function ChartHeader(_props: { tab: Tab }) {
  return (
    <div className="flex items-center justify-between">
      <button
        disabled
        className="flex h-7 w-7 items-center justify-center rounded-control text-content-muted opacity-30"
        aria-label="Previous week"
      >
        <Icon name="chevronLeft" size={16} strokeWidth={2.5} />
      </button>
      <div className="flex flex-col items-center">
        <span className="text-subhead font-semibold text-content">Week 2</span>
        <span className="text-caption text-content-muted">8 – 14 Jun</span>
      </div>
      <button
        disabled
        className="flex h-7 w-7 items-center justify-center rounded-control text-content-muted opacity-30"
        aria-label="Next week"
      >
        <Icon name="chevronRight" size={16} strokeWidth={2.5} />
      </button>
    </div>
  );
}

// ── Onboarding weight chart ───────────────────────────────────────────────────
//
// Static demo: Y range 65–68 kg, weigh-ins Mon–Fri.
// Plan line gently descends Mon 67.0 → Sun 66.0.
// Actuals: Mon 67.3, Tue 67.0, Wed 66.8, Thu 66.5, Fri 66.1
// Fri: actual 66.1 < planned 66.4 → Ahead · 0.3 kg

function OnboardingKgWeekChart({ drawDuration }: { drawDuration: number }) {
  const W = 300, H = 153;
  const padLeft = 28, padRight = 10, padTop = 12, padBottom = 24;
  const chartW = W - padLeft - padRight;
  const chartH = H - padTop - padBottom;

  // Y axis: 65–68, step 0.5
  const STEP = 0.5;
  const yMin = 65, yMax = 68;
  const ticks: number[] = [];
  for (let v = yMin; v <= yMax + 0.001; v = Math.round((v + STEP) * 10) / 10) ticks.push(v);

  const slotW = chartW / 7;
  const xFor  = (i: number) => padLeft + i * slotW + slotW / 2;
  const yFor  = (kg: number) => padTop + ((yMax - kg) / (yMax - yMin)) * chartH;

  // Days M T W T F S S (indices 0-6). Today = Friday = index 4.
  const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const TODAY_IDX  = 4;

  // Plan line: Mon=67.0, drops ~0.1/day → Fri=66.4, Sun=66.0
  const PLAN = [67.0, 66.9, 66.8, 66.6, 66.4, 66.2, 66.0];
  const planLine = PLAN.map((kg, i) => `${xFor(i).toFixed(1)},${yFor(kg).toFixed(1)}`).join(' ');

  // Actual weigh-ins Mon–Fri (all 5 days)
  const actuals: Array<{ i: number; kg: number }> = [
    { i: 0, kg: 67.3 },
    { i: 1, kg: 67.0 },
    { i: 2, kg: 66.8 },
    { i: 3, kg: 66.5 },
    { i: 4, kg: 66.1 },
  ];

  // Build cubic bezier path (Catmull-Rom style, same as KgWeekChart)
  const pts = actuals.map(({ i, kg }) => ({ x: xFor(i), y: yFor(kg) }));
  let pathD = `M ${pts[0].x} ${pts[0].y}`;
  for (let idx = 1; idx < pts.length; idx++) {
    const p0 = pts[idx - 1];
    const p1 = pts[idx];
    const pPrev = idx > 1 ? pts[idx - 2] : p0;
    const pNext = idx < pts.length - 1 ? pts[idx + 1] : p1;
    const cp1x = p0.x + (p1.x - pPrev.x) / 6;
    const cp1y = p0.y + (p1.y - pPrev.y) / 6;
    const cp2x = p1.x - (pNext.x - p0.x) / 6;
    const cp2y = p1.y - (pNext.y - p0.y) / 6;
    pathD += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p1.x} ${p1.y}`;
  }

  // Animation timings (mirrors KgWeekChart)
  const SETTLE_DUR = 0.45;
  const LINE_DELAY = SETTLE_DUR + 0.05;
  const LINE_DUR   = drawDuration / 1000 - LINE_DELAY;
  const xFirst     = xFor(actuals[0].i);

  return (
    <>
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-hidden="true">
      <defs>
        <style>{`
          @keyframes ob_kgLineGrow {
            from { stroke-dashoffset: 220; }
            to   { stroke-dashoffset: 0; }
          }
          @keyframes ob_kgDotPop {
            0%   { transform: scale(0); }
            60%  { transform: scale(1.4); }
            80%  { transform: scale(0.85); }
            100% { transform: scale(1); }
          }
        `}</style>
      </defs>

      {/* Y-axis grid + labels */}
      {ticks.map((v) => (
        <g key={v}>
          <line x1={padLeft + 16} y1={yFor(v)} x2={padLeft + chartW - 16} y2={yFor(v)}
            stroke="var(--color-border-subtle)" strokeWidth={0.75} />
          {v === Math.floor(v) && (
            <text x={padLeft - 4} y={yFor(v)} textAnchor="end" dominantBaseline="middle"
              fontSize="12" fontWeight="400" fill="var(--color-content-muted)">{v}</text>
          )}
        </g>
      ))}

      {/* Plan line — dashed, static */}
      <polyline points={planLine} fill="none"
        stroke="var(--color-border-strong)" strokeWidth={1.5}
        strokeDasharray="4 6" strokeLinecap="round" strokeLinejoin="round" />

      {/* Actual line — cubic bezier, draws after brief delay.
          strokeDasharray 220 is slightly above the actual path length (~170 SVG units)
          so the line draws fully across LINE_DUR before the last dot pops. */}
      <path d={pathD} fill="none"
        stroke="var(--color-accent)" strokeWidth={2.5}
        strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray="220"
        style={{
          animationName: 'ob_kgLineGrow',
          animationDuration: `${LINE_DUR.toFixed(2)}s`,
          animationDelay: `${LINE_DELAY}s`,
          animationTimingFunction: 'ease-out',
          animationFillMode: 'both',
        }}
      />

      {/* Dots — pop one after another as the line draws across the chart.
          Delay is proportional to x-position fraction across LINE_DUR,
          scaled by 0.85 so the last dot aligns with the line completion. */}
      {actuals.map(({ i, kg }) => {
        const xLast = xFor(actuals[actuals.length - 1].i);
        const xFrac = (xFor(i) - xFirst) / (xLast - xFirst); // 0 → 1
        return (
          <circle key={i} cx={xFor(i)} cy={yFor(kg)} r={3.5}
            fill="var(--color-accent)"
            style={{
              transformBox: 'fill-box',
              transformOrigin: '50% 50%',
              animationName: 'ob_kgDotPop',
              animationDuration: '0.4s',
              animationTimingFunction: 'ease-out',
              animationFillMode: 'both',
              animationDelay: `${(LINE_DELAY + xFrac * LINE_DUR * 0.85).toFixed(2)}s`,
            }}
          />
        );
      })}

      {/* X-axis day labels */}
      {DAY_LABELS.map((letter, i) => (
        <text key={i} x={xFor(i)} y={H - 7} textAnchor="middle" fontSize="12"
          fontWeight={i === TODAY_IDX ? '700' : '400'}
          fill={i === TODAY_IDX ? 'var(--color-content)' : 'var(--color-content-muted)'}
          opacity={i > TODAY_IDX ? 0.4 : 1}>
          {letter}
        </text>
      ))}
    </svg>

    {/* Badge — Fri actual 66.1 < planned 66.4 → ahead by 0.3 kg */}
    <div className="mt-3 flex justify-center">
      <Badge status="success">Ahead{'  ·  '}0.3 kg</Badge>
    </div>
    </>
  );
}

// ── Onboarding calorie chart ──────────────────────────────────────────────────
//
// Cumulative calorie bars Mon–Fri, Sat/Sun future stubs.
// Daily budget: 286 kcal deficit target → cumulative budget ramp.
// Demo consumed: Mon 380, +540=920, +620=1540, +660=2200, +380=2580
// Budget ramp:   Mon 286, 572, 858, 1144, 1430
// Mon–Wed: under budget (mint). Thu–Fri: over budget (dark).

// Mon–Wed under budget (green), Thu–Fri over budget (dark).
// Fri cumConsumed 1480, cumBudget 1430 → Over · 50 kcal.
const DEMO_CAL_DATA = [
  { cumConsumed: 200,  cumBudget: 286,  hasData: true  }, // Mon — green
  { cumConsumed: 480,  cumBudget: 572,  hasData: true  }, // Tue — green
  { cumConsumed: 750,  cumBudget: 858,  hasData: true  }, // Wed — green
  { cumConsumed: 1180, cumBudget: 1144, hasData: true  }, // Thu — dark (over)
  { cumConsumed: 1480, cumBudget: 1430, hasData: true  }, // Fri — dark (over by 50)
  { cumConsumed: 0,    cumBudget: 1716, hasData: false }, // Sat (future)
  { cumConsumed: 0,    cumBudget: 2002, hasData: false }, // Sun (future)
];
const TODAY_CAL_IDX = 4;
const DAY_LABELS_CAL = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function OnboardingWeekChart({ visible, growDuration }: { visible: boolean; growDuration: number }) {
  const W = 300, H = 153;
  const padLeft = 28, padRight = 12, padTop = 14, padBottom = 24;
  const chartW = W - padLeft - padRight;
  const chartH = H - padTop - padBottom;

  const maxConsumed = Math.max(...DEMO_CAL_DATA.map((d) => d.cumConsumed));
  const maxBudget   = Math.max(...DEMO_CAL_DATA.map((d) => d.cumBudget));
  const maxY        = Math.max(maxBudget, maxConsumed) * 1.1 || 9000;

  const toY     = (v: number) => padTop + chartH * (1 - Math.max(0, v) / maxY);
  const barSlot = chartW / 7;
  const barW    = barSlot - 7;
  const barX    = (i: number) => padLeft + i * barSlot + 3.5;
  const midX    = (i: number) => padLeft + (i + 0.5) * barSlot;

  const rampPoints = DEMO_CAL_DATA
    .map((d, i) => `${midX(i).toFixed(1)},${toY(d.cumBudget).toFixed(1)}`)
    .join(' ');

  // Summary: Fri (index 4) — consumed 1480, budget 1430 → over by 50
  const diff   = 50;

  return (
    <>
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-hidden="true">
      <defs>
        <style>{`
          @keyframes ob_barGrow {
            from { transform: scaleY(0); }
            to   { transform: scaleY(1); }
          }
        `}</style>
      </defs>

      {/* Budget ramp — dashed */}
      <polyline points={rampPoints} fill="none"
        stroke="var(--color-border-strong)" strokeWidth={1.5}
        strokeDasharray="4 4" strokeLinejoin="round" />

      {DEMO_CAL_DATA.map(({ cumConsumed, cumBudget, hasData }, i) => {
        const isFuture = i > TODAY_CAL_IDX;
        const isToday  = i === TODAY_CAL_IDX;
        const x        = barX(i);

        if (isFuture) {
          return (
            <g key={i}>
              <rect x={x} y={padTop + chartH - 4} width={barW} height={4}
                rx={2} fill="var(--color-border-subtle)" />
              <text x={x + barW / 2} y={H - 7} textAnchor="middle"
                fontSize="12" fill="var(--color-content-muted)">
                {DAY_LABELS_CAL[i]}
              </text>
            </g>
          );
        }

        const ratio     = cumConsumed > 0 ? Math.min(1, cumConsumed / maxY) : 0;
        const barH      = Math.max(ratio * chartH, hasData ? 5 : 0);
        const barY      = padTop + chartH - barH;
        const fillColor = cumConsumed > cumBudget
          ? 'var(--color-content)'
          : 'var(--color-accent)';

        return (
          <g key={i}>
            <rect x={x} y={barY} width={barW} height={Math.max(barH, 0)}
              rx={8} fill={fillColor}
              style={visible ? {
                transformBox: 'fill-box',
                transformOrigin: '50% 100%',
                animationName: 'ob_barGrow',
                animationDuration: `${(growDuration / 1000).toFixed(2)}s`,
                animationTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                animationFillMode: 'both',
                animationDelay: `${(i * 0.07).toFixed(2)}s`,
              } : {
                // bars start at zero height until visible triggers the animation
                transformBox: 'fill-box',
                transformOrigin: '50% 100%',
                transform: 'scaleY(0)',
              }}
            />
            <text x={x + barW / 2} y={H - 7} textAnchor="middle"
              fontSize="12" fontWeight={isToday ? '700' : '400'}
              fill={isToday ? 'var(--color-content)' : 'var(--color-content-muted)'}>
              {DAY_LABELS_CAL[i]}
            </text>
          </g>
        );
      })}
    </svg>

    {/* Badge */}
    <div className="mt-3 flex justify-center">
      <Badge status="default">Over{'  ·  '}{diff.toLocaleString()} kcal</Badge>
    </div>
    </>
  );
}
