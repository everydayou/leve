import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/* Chip / Tag — used for frequent-food quick-log pills and filters.
   `selected` raises it to the accent tint. */
export function Chip({
  children, icon, selected = false, onClick,
}: {
  children: ReactNode; icon?: IconName; selected?: boolean; onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-subhead font-medium
        transition ${onClick ? 'active:scale-95' : ''}
        ${selected
          ? 'bg-accent text-on-accent'
          : 'bg-surface-sunken text-content border border-border-subtle'}`}
    >
      {icon && <Icon name={icon} size={15} />}
      {children}
    </Tag>
  );
}
