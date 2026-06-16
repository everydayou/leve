import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/* Transient feedback pill (glass), shown over content. `status` tints the
   leading icon. Presentational — visibility/timeout handled by the caller. */
type Status = 'success' | 'danger' | 'info';

const ICON: Record<Status, IconName> = { success: 'check', danger: 'info', info: 'info' };
const TONE: Record<Status, string> = {
  success: 'text-success', danger: 'text-danger', info: 'text-accent',
};

export function Toast({ children, status = 'info' }: { children: ReactNode; status?: Status }) {
  return (
    <div className="glass-strong inline-flex items-center gap-2 rounded-pill px-4 py-2.5">
      <Icon name={ICON[status]} size={18} className={TONE[status]} />
      <span className="text-subhead font-medium text-content">{children}</span>
    </div>
  );
}
