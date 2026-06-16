import type { ReactNode } from 'react';
import { Icon } from './Icon';

/* Tappable list row (iOS table cell): optional leading visual, title +
   subtitle, trailing content, and an optional disclosure chevron. */
export function ListRow({
  leading, title, subtitle, trailing, chevron = false, onClick,
}: {
  leading?: ReactNode; title: ReactNode; subtitle?: ReactNode;
  trailing?: ReactNode; chevron?: boolean; onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left
        ${onClick ? 'transition active:bg-surface-sunken' : ''}`}
    >
      {leading && <span className="shrink-0 text-content-secondary">{leading}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-medium text-content">{title}</span>
        {subtitle && <span className="block truncate text-footnote text-content-secondary">{subtitle}</span>}
      </span>
      {trailing && <span className="shrink-0 text-subhead text-content-secondary">{trailing}</span>}
      {chevron && <Icon name="chevronRight" size={18} className="shrink-0 text-content-muted" />}
    </Tag>
  );
}
