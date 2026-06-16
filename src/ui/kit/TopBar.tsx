import type { ReactNode } from 'react';
import { IconButton } from './Button';

/* Glass top bar / flow header. Per the project's top-bar rule: a back (‹) OR
   close (✕) lives on the LEFT, never both. Title is centred; one optional
   trailing action on the right. */
export function TopBar({
  title, leading, onBack, onClose, trailing,
}: {
  title?: ReactNode;
  leading?: 'back' | 'close' | 'none';
  onBack?: () => void; onClose?: () => void; trailing?: ReactNode;
}) {
  const lead = leading ?? (onBack ? 'back' : onClose ? 'close' : 'none');
  return (
    <div className="glass safe-top sticky top-0 z-30 border-x-0 border-t-0 shadow-card">
      <div className="flex h-12 items-center px-2">
        <div className="flex w-12 justify-start">
          {lead === 'back' && <IconButton icon="back" label="Back" onClick={onBack} size={44} />}
          {lead === 'close' && <IconButton icon="close" label="Close" onClick={onClose} size={44} />}
        </div>
        <div className="flex-1 text-center text-headline font-semibold text-content">{title}</div>
        <div className="flex w-12 justify-end">{trailing}</div>
      </div>
    </div>
  );
}
