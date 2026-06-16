import { useEffect, useRef, useState } from 'react';
import { Icon } from '../kit';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ShowToast = (message: string, undoFn?: () => Promise<void>) => void;

export interface ToastData {
  id: number;
  message: string;
  undoFn?: () => Promise<void>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

const AUTO_DISMISS_MS = 4000;

// eslint-disable-next-line react-refresh/only-export-components -- hook intentionally co-located with Toast component it drives
export function useToast() {
  const [toast, setToast] = useState<ToastData | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast: ShowToast = (message, undoFn) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ id: Date.now(), message, undoFn });
    timerRef.current = setTimeout(() => setToast(null), AUTO_DISMISS_MS);
  };

  const dismissToast = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast(null);
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return { toast, showToast, dismissToast };
}

// ── Bubble (keyed per toast so each re-mounts and re-animates) ────────────────

function ToastBubble({ toast, onDismiss }: { toast: ToastData; onDismiss: () => void }) {
  const [entered, setEntered] = useState(false);
  const [dragY,   setDragY]   = useState(0);
  const startY = useRef(0);

  // Wait one tick so the browser paints the initial state, then animate in.
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 10);
    return () => clearTimeout(t);
  }, []);

  async function handleUndo() {
    if (toast.undoFn) { await toast.undoFn(); onDismiss(); }
  }

  function onTouchStart(e: React.TouchEvent) {
    startY.current = e.touches[0].clientY;
  }
  function onTouchMove(e: React.TouchEvent) {
    const delta = Math.max(0, e.touches[0].clientY - startY.current);
    setDragY(delta);
  }
  function onTouchEnd() {
    if (dragY > 60) { onDismiss(); } else { setDragY(0); }
  }

  const isDragging  = dragY > 0;
  const yOffset     = isDragging ? dragY : (entered ? 0 : 20);
  const transition  = isDragging
    ? 'none'
    : 'transform 0.3s cubic-bezier(0.32,0.72,0,1), opacity 0.25s ease';

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        transform: `translateY(${yOffset}px)`,
        opacity: entered ? 1 : 0,
        transition,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 14px',
        background: 'var(--color-content)',
        borderRadius: '14px',
        // eslint-disable-next-line no-restricted-syntax -- toast always has dark bg (var(--color-content)); shadow must be a fixed dark value regardless of theme
        boxShadow: '0 4px 20px rgba(0,0,0,0.22)',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
    >
      <span style={{ fontSize: '0.9375rem', fontWeight: 500, color: 'var(--color-content-inverse)' }}>
        {toast.message}
      </span>
      {toast.undoFn && (
        <button
          onClick={handleUndo}
          style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-accent)' }}
        >
          Undo
        </button>
      )}
      <button
        onClick={onDismiss}
        // eslint-disable-next-line no-restricted-syntax -- muted dismiss icon on inverted (dark) toast bg; no token maps to this inverted-muted role
        style={{ display: 'flex', alignItems: 'center', color: 'rgba(150,150,150,0.9)' }}
      >
        <Icon name="close" size={15} strokeWidth={2} />
      </button>
    </div>
  );
}

// ── Toaster (rendered inside the phone frame as position:absolute) ────────────

export function Toaster({ toast, onDismiss }: { toast: ToastData | null; onDismiss: () => void }) {
  if (!toast) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.25rem)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 200,
        maxWidth: 'calc(100% - 2.5rem)',
        pointerEvents: 'none',
      }}
    >
      <div style={{ pointerEvents: 'all' }}>
        <ToastBubble key={toast.id} toast={toast} onDismiss={onDismiss} />
      </div>
    </div>
  );
}
