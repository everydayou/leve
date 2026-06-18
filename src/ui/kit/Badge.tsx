import type { ReactNode } from 'react';

/* Status badge — the on-track / behind verdict and similar. `status` maps to a
   soft-tinted background + matching foreground token. */
type Status = 'success' | 'warn' | 'danger' | 'neutral' | 'accent' | 'default';

const STATUS: Record<Status, string> = {
  success: 'bg-success-soft text-success-fg',
  warn:    'bg-warn-soft text-warn',
  danger:  'bg-danger-soft text-danger',
  accent:  'bg-accent-soft text-accent',
  neutral: 'bg-surface-sunken text-content-secondary',
  default: 'bg-surface-sunken text-content',
};

export function Badge({
  children, status = 'neutral', size = 'sm', className = '',
}: { children: ReactNode; status?: Status; size?: 'sm' | 'lg'; className?: string }) {
  const sizeClass = size === 'lg' ? 'text-subhead px-3 py-1' : 'text-footnote px-2.5 py-1';
  return (
    <span className={`inline-flex items-center gap-1 rounded-pill font-semibold ${sizeClass} ${STATUS[status]} ${className}`.trimEnd()}>
      {children}
    </span>
  );
}
