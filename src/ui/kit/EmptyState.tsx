import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/* Empty / first-run placeholder: tinted icon, title, supporting line, optional
   action (e.g. "Set a goal", empty pantry, empty chart range). */
export function EmptyState({
  icon, title, description, action,
}: {
  icon: IconName; title: string; description?: string; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-pill bg-accent-soft text-accent">
        <Icon name={icon} size={26} />
      </span>
      <div>
        <p className="text-headline font-semibold text-content">{title}</p>
        {description && <p className="mt-1 text-subhead text-content-secondary">{description}</p>}
      </div>
      {action && <div className="mt-1 w-full max-w-[16rem]">{action}</div>}
    </div>
  );
}
