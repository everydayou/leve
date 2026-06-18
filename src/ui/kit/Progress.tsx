/* Progress atoms — token-driven. `status` colours the fill (e.g. the weekly
   deficit verdict). value is 0..1, clamped. */
type Status = 'accent' | 'success' | 'warn' | 'danger';

const FILL: Record<Status, string> = {
  accent:  'bg-accent',
  success: 'bg-success',
  warn:    'bg-warn',
  danger:  'bg-danger',
};
const STROKE: Record<Status, string> = {
  accent:  'var(--color-accent)',
  success: 'var(--color-success)',
  warn:    'var(--color-warn)',
  danger:  'var(--color-danger)',
};
const clamp = (v: number) => Math.max(0, Math.min(1, v));

export function ProgressBar({ value, status = 'accent' }: { value: number; status?: Status }) {
  return (
    <div className="h-[6px] w-full overflow-hidden rounded-pill bg-progress-track">
      <div
        className={`h-full rounded-pill transition-[width] duration-500 ${FILL[status]}`}
        style={{ width: `${clamp(value) * 100}%` }}
      />
    </div>
  );
}

/** Open-bottom radial gauge (a partial ProgressRing). `value` 0..1 fills the
 *  arc clockwise from the lower-left; `sweep` is the fraction of the full circle
 *  the arc covers (default 0.7 ≈ 252°, a ~108° gap centered at the bottom).
 *  Children are centered on the gauge (e.g. a big number + label).
 *
 *  `bidirectional` mode: `value` is in range [-1, 1], anchored at 12 o'clock
 *  (the goal position). Positive → green clockwise arc (ahead of goal).
 *  Negative → red counter-clockwise arc (over budget). */
export function GaugeArc({
  value, status = 'accent', size = 224, stroke = 22, sweep = 0.7,
  bidirectional = false, transitionMs = 600, disabled = false, children,
}: {
  value: number; status?: Status; size?: number; stroke?: number; sweep?: number;
  bidirectional?: boolean; transitionMs?: number; disabled?: boolean; children?: React.ReactNode;
}) {
  const r       = (size - stroke) / 2;
  const c       = 2 * Math.PI * r;
  const arcLen  = sweep * c;
  const rotate  = 90 + (1 - sweep) * 180;
  const h       = Math.ceil(size / 2 + r * Math.sin(Math.PI / 4) + stroke);
  const easing  = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
  const trans   = `stroke-dasharray ${transitionMs}ms ${easing}, stroke-dashoffset ${transitionMs}ms ${easing}`;

  const cx = size / 2;
  const cy = size / 2;

  if (bidirectional) {
    // Both fill arcs are anchored at the 12 o'clock position (midpoint of the track).
    // strokeDashoffset math:
    //   green: dash starts at arcLen/2 → offset = c - arcLen/2
    //   red:   dash ends   at arcLen/2 → offset = c - arcLen/2 + redLen
    //
    // Both circles are ALWAYS in the DOM (no conditional mount/unmount) so CSS
    // transitions fire smoothly across the 0 boundary. Opacity fades the
    // inactive arc to 0 — this also hides the tiny dot that strokeLinecap="round"
    // would render for a zero-length dash.
    const bidiValue = disabled ? 0 : value;
    const greenFrac = Math.max(0, bidiValue);
    const redFrac   = Math.max(0, -bidiValue);
    const greenLen  = greenFrac * arcLen / 2;
    const redLen    = redFrac   * arcLen / 2;
    const fullTrans = `${trans}, opacity 300ms ease`;

    return (
      <div className="relative mx-auto" style={{ width: size, height: h }}>
        <svg width={size} height={size} className="absolute left-0 top-0" style={{ opacity: disabled ? 0.45 : 1 }}>
          <g transform={`rotate(${rotate} ${cx} ${cy})`}>
            {/* Track */}
            <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={stroke}
              stroke="var(--color-surface-sunken)" strokeLinecap="round"
              strokeDasharray={`${arcLen} ${c}`} />
            {/* Mint arc — counter-clockwise from 12 o'clock (remaining, fills LEFT) */}
            <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={stroke}
              stroke="var(--color-accent)" strokeLinecap="round"
              strokeDasharray={`${greenLen} ${c - greenLen}`}
              strokeDashoffset={c - arcLen / 2 + greenLen}
              opacity={greenFrac > 0 ? 1 : 0}
              style={{ transition: fullTrans }} />
            {/* Dark arc — clockwise from 12 o'clock (over budget, fills RIGHT) */}
            <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={stroke}
              stroke="var(--color-content)" strokeLinecap="round"
              strokeDasharray={`${redLen} ${c - redLen}`}
              strokeDashoffset={c - arcLen / 2}
              opacity={redFrac > 0 ? 1 : 0}
              style={{ transition: fullTrans }} />
          </g>
        </svg>
        <div className="absolute left-1/2 flex flex-col items-center"
          style={{ top: cy, transform: 'translate(-50%, -50%)' }}>
          {children}
        </div>
      </div>
    );
  }

  // ── Original unidirectional mode ────────────────────────────────────────
  const v = disabled ? 0 : clamp(value);
  const trackStroke = 'var(--color-surface-sunken)';
  return (
    <div className="relative mx-auto" style={{ width: size, height: h }}>
      <svg width={size} height={size} className="absolute left-0 top-0" style={{ opacity: disabled ? 0.45 : 1 }}>
        <g transform={`rotate(${rotate} ${cx} ${cy})`}>
          <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={stroke}
            stroke={trackStroke} strokeLinecap="round"
            strokeDasharray={`${arcLen} ${c}`} />
          {!disabled && (
            <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={stroke}
              stroke={STROKE[status]} strokeLinecap="round"
              strokeDasharray={`${v * arcLen} ${c}`}
              style={{ transition: `stroke-dasharray ${transitionMs}ms ${easing}` }} />
          )}
        </g>
      </svg>
      <div className="absolute left-1/2 flex flex-col items-center"
        style={{ top: cy, transform: 'translate(-50%, -50%)' }}>
        {children}
      </div>
    </div>
  );
}

export function ProgressRing({
  value, status = 'accent', size = 64, stroke = 6, children,
}: {
  value: number; status?: Status; size?: number; stroke?: number; children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
          stroke="var(--color-surface-sunken)" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
          stroke={STROKE[status]} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - clamp(value))}
          style={{ transition: 'stroke-dashoffset 500ms' }} />
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  );
}
