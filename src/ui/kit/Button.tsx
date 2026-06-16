import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { hapticLight } from '../../lib/haptics';

type Variant = 'solid' | 'tinted' | 'outline' | 'ghost' | 'destructive' | 'subtle';
type Size = 'xs' | 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  solid:       'bg-accent text-on-accent active:bg-accent-hover',
  tinted:      'bg-accent-soft text-accent active:opacity-80',
  outline:     'border border-border-strong text-content active:bg-surface-sunken',
  ghost:       'text-accent active:bg-surface-sunken',
  destructive: 'bg-danger text-on-danger active:opacity-90',
  // Neutral secondary pill (the Account Edit/Update/Set/Manage actions).
  subtle:      'bg-surface-sunken text-content active:opacity-80',
};

const SIZE: Record<Size, string> = {
  xs: 'py-1.5 px-3 text-caption gap-1',
  sm: 'py-2 px-3.5 text-subhead gap-1.5',
  md: 'py-3 px-4 text-callout gap-2',
  lg: 'py-3.5 px-5 text-body gap-2',
};

export function Button({
  children, variant = 'solid', size = 'md', icon, fullWidth = true, className = '', onClick, ...rest
}: {
  children: ReactNode; variant?: Variant; size?: Size; icon?: IconName; fullWidth?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    hapticLight();
    onClick?.(e);
  }
  return (
    <button
      className={`inline-flex items-center justify-center rounded-control font-semibold
        transition active:scale-[0.99] disabled:opacity-40 disabled:active:scale-100
        ${fullWidth ? 'w-full' : ''} ${SIZE[size]} ${VARIANT[variant]} ${className}`}
      onClick={handleClick}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'xs' ? 15 : size === 'sm' ? 17 : 19} />}
      {children}
    </button>
  );
}

/* Square icon-only button (top-bar actions, row affordances). */
export function IconButton({
  icon, label, variant = 'ghost', size = 36, className = '', onClick, ...rest
}: {
  icon: IconName; label: string; variant?: 'ghost' | 'tinted' | 'solid'; size?: number;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles = {
    ghost:  'text-content active:bg-surface-sunken',
    tinted: 'bg-accent-soft text-accent active:opacity-80',
    solid:  'bg-accent text-on-accent active:bg-accent-hover',
  }[variant];
  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    hapticLight();
    onClick?.(e);
  }
  return (
    <button
      aria-label={label}
      style={{ width: size, height: size }}
      className={`inline-flex items-center justify-center rounded-control transition active:scale-95 ${styles} ${className}`}
      onClick={handleClick}
      {...rest}
    >
      <Icon name={icon} size={Math.round(size * 0.6)} />
    </button>
  );
}
