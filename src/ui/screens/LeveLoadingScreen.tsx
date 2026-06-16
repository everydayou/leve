/** LeveLoadingScreen — brand loading overlay shown during bootstrap.
 *
 *  Always renders in dark mode (brand moment, independent of user theme).
 *  The gauge arc runs a 3-phase loop:
 *    1. Grow  — fills from 0 % to 60 % of the track (left side)
 *    2. Slide — the 60 % segment travels to the right end of the track
 *    3. Collapse — the segment shrinks away at the right end
 *  Then it repeats while the app finishes loading.
 *
 *  Colours are hardcoded (not CSS tokens) because this screen renders before
 *  the app's theme system is fully applied, and it is always dark by design.
 */

import leveSvg from '../../assets/leve-wordmark.svg';

// ─── Gauge geometry (mirrors GaugeArc atom in Progress.tsx) ─────────────────
const SIZE   = 160;   // SVG viewport size (px)
const STROKE = 30;    // arc stroke width — intentionally thick for the brand screen
const SWEEP  = 0.7;   // fraction of circle covered (252° arc, 108° gap at bottom)
const r      = (SIZE - STROKE) / 2;       // 65
const c      = 2 * Math.PI * r;           // ≈ 408.4
const arcLen = SWEEP * c;                 // ≈ 285.9  — track length
const fill60 = 0.6 * arcLen;             // ≈ 171.5  — 60 % of track
const slide60 = arcLen - fill60;          // ≈ 114.4  — dashoffset to put 60 % at right end
const rotate = 90 + (1 - SWEEP) * 180;   // 144°     — gap at bottom
const cx     = SIZE / 2;
const cy     = SIZE / 2;

// Hardcoded dark colours — intentional, see file header.
/* eslint-disable no-restricted-syntax -- always-dark brand loading screen; tokens cannot be used here */
const BG    = '#161618'; // --color-surface-sunken dark
const TRACK = '#2e2e30'; // --color-neutral-200 dark  (visible against bg)
const FILL  = '#00e0aa'; // --color-accent            (brand mint)
/* eslint-enable no-restricted-syntax */

export default function LeveLoadingScreen({ exiting = false }: { exiting?: boolean }) {
  return (
    <>
      {/* Keyframe lives here so it's co-located and doesn't pollute index.css.
          Three phases (loops infinitely):
            0 %  → 33 %  grow   0 → 60 % at track start        ease-in
            33 % → 67 %  slide  60 % travels to track end       ease-out
            67 % → 100 % collapse 60 % → 0 at track end         ease
          Both 0 % and 100 % are visually empty → seamless loop.
          Right edge stays fixed at arcLen during collapse (left edge closes in). */}
      <style>{`
        @keyframes leve-arc-fill {
          0% {
            stroke-dasharray: 0 ${c.toFixed(1)};
            stroke-dashoffset: 0;
            animation-timing-function: linear;
          }
          10% {
            stroke-dasharray: 0 ${c.toFixed(1)};
            stroke-dashoffset: 0;
            animation-timing-function: cubic-bezier(0.4, 0, 1, 1);
          }
          36.7% {
            stroke-dasharray: ${fill60.toFixed(1)} ${(c - fill60).toFixed(1)};
            stroke-dashoffset: 0;
            animation-timing-function: linear;
          }
          63.3% {
            stroke-dasharray: ${fill60.toFixed(1)} ${(c - fill60).toFixed(1)};
            stroke-dashoffset: -${slide60.toFixed(1)};
            animation-timing-function: ease;
          }
          90% {
            stroke-dasharray: 0 ${c.toFixed(1)};
            stroke-dashoffset: -${arcLen.toFixed(1)};
            animation-timing-function: linear;
          }
          100% {
            stroke-dasharray: 0 ${c.toFixed(1)};
            stroke-dashoffset: -${arcLen.toFixed(1)};
          }
        }
      `}</style>

      <div
        role="status"
        aria-label="Loading leve"
        style={{
          position:       'fixed',
          inset:          0,
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
          background:     BG,
          opacity:        exiting ? 0 : 1,
          transition:     exiting ? 'opacity 350ms ease' : 'none',
          zIndex:         9999,
        }}
      >
        {/* Gauge arc */}
        <svg width={SIZE} height={SIZE} aria-hidden="true">
          <g transform={`rotate(${rotate} ${cx} ${cy})`}>
            {/* Track — full horseshoe in muted dark */}
            <circle
              cx={cx} cy={cy} r={r}
              fill="none"
              strokeWidth={STROKE}
              stroke={TRACK}
              strokeLinecap="round"
              strokeDasharray={`${arcLen.toFixed(1)} ${(c - arcLen).toFixed(1)}`}
            />
            {/* Animated mint fill */}
            <circle
              cx={cx} cy={cy} r={r}
              fill="none"
              strokeWidth={STROKE}
              stroke={FILL}
              strokeLinecap="round"
              strokeDasharray={`0 ${c.toFixed(1)}`}
              style={{
                animation: 'leve-arc-fill 1.5s linear alternate infinite',
              }}
            />
          </g>
        </svg>

        {/* "leve" wordmark SVG */}
        <img
          src={leveSvg}
          alt="leve"
          aria-hidden="true"
          style={{ marginTop: '10px', height: '24px' }}
        />
      </div>
    </>
  );
}
