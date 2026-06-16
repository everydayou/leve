import type { IconName } from './Icon';
import { Icon } from './Icon';

/* Floating action button — the primary "+" Add affordance. Accent fill,
   circular, elevated. Size + icon tunable. */
export function Fab({
  icon = 'plus', label, size = 56, onClick,
}: { icon?: IconName; label: string; size?: number; onClick?: () => void }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      style={{ width: size, height: size }}
      className="flex items-center justify-center rounded-pill bg-accent text-on-accent
        shadow-lg transition active:scale-95 active:bg-accent-hover"
    >
      <Icon name={icon} size={Math.round(size * 0.5)} strokeWidth={2.25} />
    </button>
  );
}
