import type { ReactNode, UIEventHandler } from 'react';
import { Icon } from './Icon';

/* Full-screen right-to-left push, for a sub-page that isn't a bottom Sheet
   (e.g. Past goals, Account > Tracking/Settings). Render via createPortal
   into document.body from the owning screen — a plain in-tree render can
   end up positioned against the wrong containing block if any ancestor has
   an active CSS transform (Sheet's own OverlayLayer has this exact issue;
   see useKeyboardDoneBar.tsx's doc comment for the root cause), and portaling
   straight to the body sidesteps it entirely, same as PastGoalsPortal does.
   Pair with SlideHeader below. Drive `exiting` from the caller: set it true,
   then setTimeout the actual close/unmount by ~280ms to let slide-out-right
   finish before the component disappears. */
export function SlideScreen({ children, exiting, onScroll }: {
  children: ReactNode; exiting: boolean; onScroll?: UIEventHandler<HTMLDivElement>;
}) {
  return (
    <div
      className={`fixed inset-0 z-[150] flex justify-center overflow-hidden bg-surface-sunken ${exiting ? 'slide-out-right' : 'slide-in-right'}`}
      style={{ touchAction: 'manipulation' }}
    >
      <div
        className="safe-top safe-bottom flex h-[100dvh] w-full max-w-[26.25rem] flex-col overflow-x-hidden overflow-y-auto bg-surface"
        style={{ touchAction: 'pan-y' }}
        onScroll={onScroll}
      >
        {children}
      </div>
    </div>
  );
}

/* Sticky nav header for a SlideScreen: back chevron, centered title, optional
   trailing action. `scrolled` adds a shadow once the content scrolls under it
   (pass through onScroll from SlideScreen). */
export function SlideHeader({ title, onBack, scrolled = false, rightAction }: {
  title: string; onBack: () => void; scrolled?: boolean; rightAction?: ReactNode;
}) {
  return (
    <div className={`sticky top-0 z-20 bg-surface transition-[box-shadow] duration-200${scrolled ? ' shadow-nav' : ''}`}>
      <div className="pointer-events-none absolute left-0 right-0 bg-surface" style={{ bottom: '100%', height: 'env(safe-area-inset-top, 0px)' }} />
      <div className="relative flex items-center px-4 pt-5 pb-4">
        <button onClick={onBack} aria-label="Back" className="-ml-2 flex h-10 w-10 flex-shrink-0 items-center justify-center text-content-muted">
          <Icon name="chevronLeft" size={20} strokeWidth={2.5} />
        </button>
        {title ? (
          <span className="pointer-events-none absolute inset-x-0 text-center text-headline font-semibold text-content">{title}</span>
        ) : null}
        {rightAction ? (
          <div className="ml-auto -mr-2">{rightAction}</div>
        ) : null}
      </div>
    </div>
  );
}
