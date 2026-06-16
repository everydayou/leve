import type { ReactNode } from 'react';

/* Uppercase group heading above a list/card group (iOS grouped-list style). */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-1 pt-4 pb-2 text-caption font-semibold uppercase tracking-wide text-content-secondary">
      {children}
    </p>
  );
}
