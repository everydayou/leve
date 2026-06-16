import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { PREVIEW, memoryBus } from './repos';

/** Dexie variant: tracks IndexedDB tables automatically via useLiveQuery. */
function useLiveDexie<T>(fn: () => Promise<T>, deps: unknown[] = []): T | undefined {
  return useLiveQuery(fn, deps);
}

/** Preview/memory variant: re-runs whenever the in-memory store emits a change. */
function useLiveMemory<T>(fn: () => Promise<T>, deps: unknown[] = []): T | undefined {
  const [val, setVal] = useState<T>();
  useEffect(() => {
    let alive = true;
    const run = () => { void fn().then((v) => { if (alive) setVal(v); }); };
    run();
    const off = memoryBus.subscribe(run);
    return () => { alive = false; off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return val;
}

/** Reactive query — re-renders the caller whenever the underlying data changes.
 *  Dexie build: backed by useLiveQuery (tracks IndexedDB tables).
 *  Preview build: backed by the in-memory change bus.
 *  PREVIEW is a build-time constant so `useLive` is always the same function. */
export const useLive: <T>(fn: () => Promise<T>, deps?: unknown[]) => T | undefined =
  PREVIEW ? useLiveMemory : useLiveDexie;
