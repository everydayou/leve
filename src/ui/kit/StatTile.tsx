import type { ReactNode } from 'react';

/* Compact metric tile: an eyebrow label, a big value, optional unit + footnote.
   Used for day calories / protein / deficit / weight-remaining stats.
   `size`: 'lg' (default) = hero numbers (text-display); 'sm' = the dense stat
   strips on Today/Goal (text-callout). `align`: 'left' (default) or 'center'. */
export function StatTile({
  label, value, unit, foot, tone = 'default', size = 'lg', align = 'left', labelBelow = false,
}: {
  label: string; value: ReactNode; unit?: string; foot?: ReactNode;
  tone?: 'default' | 'success' | 'warn' | 'danger' | 'accent';
  size?: 'lg' | 'sm'; align?: 'left' | 'center'; labelBelow?: boolean;
}) {
  const valueTone = {
    default: 'text-content', success: 'text-success', warn: 'text-warn',
    danger: 'text-danger', accent: 'text-accent',
  }[tone];
  const valueCls = size === 'sm' ? 'text-callout font-semibold' : 'text-display font-bold tracking-tight';
  const labelCls = size === 'sm'
    ? 'text-micro text-content-secondary'
    : 'text-caption font-semibold uppercase tracking-wide text-content-secondary';
  const alignCls = align === 'center' ? 'items-center text-center' : '';
  return (
    <div className={`flex flex-col ${alignCls}`}>
      {!labelBelow && <span className={labelCls}>{label}</span>}
      <span className={`${labelBelow ? '' : 'mt-0.5'} flex items-baseline gap-1`}>
        <span className={`${valueCls} ${valueTone}`}>{value}</span>
        {unit && <span className="text-subhead font-medium text-content-secondary">{unit}</span>}
      </span>
      {labelBelow && <span className={`mt-0.5 ${labelCls}`}>{label}</span>}
      {foot && <span className="mt-0.5 text-footnote text-content-secondary">{foot}</span>}
    </div>
  );
}
