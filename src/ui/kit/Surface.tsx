import type { HTMLAttributes, ReactNode } from 'react';

/* Surface = the one container atom. `tone` picks the background token, so cards,
   insets and the page share one definition. Glass surfaces use the .glass
   utility (tab bar / sheets) rather than a solid token. */
type Tone = 'base' | 'sunken' | 'muted' | 'glass' | 'glass-strong';

const TONE: Record<Tone, string> = {
  base:           'bg-surface border border-border-subtle shadow-card',
  sunken:         'bg-surface-sunken',
  // Same border+shadow as base but uses the page backdrop colour — keeps
  // visual weight low so the hero card above stays the focal point.
  muted:          'bg-surface-muted border border-border-subtle shadow-card',
  glass:          'glass',
  'glass-strong': 'glass-strong',
};

export function Surface({
  tone = 'base', padded = true, className = '', children, ...rest
}: {
  tone?: Tone; padded?: boolean; className?: string; children: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-card ${TONE[tone]} ${padded ? 'p-4' : ''} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

/* Card is just the common base Surface — kept as a named alias for clarity. */
export function Card(props: Parameters<typeof Surface>[0]) {
  return <Surface {...props} />;
}

/* Compact tappable tile for the Today "Quick add" frequent-food cards.
   Matches page background + soft shadow, token-driven. */
export function QuickLogCard({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative flex flex-col items-center gap-0 rounded-control border border-border-subtle bg-surface-muted p-2 text-center shadow-card transition active:scale-95"
    >
      {children}
    </button>
  );
}
