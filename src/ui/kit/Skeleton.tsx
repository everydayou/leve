/* Loading placeholder. Sunken token + pulse. Pass width/height via className
   (e.g. "h-4 w-24") or rounded-* for shape. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-control bg-surface-sunken ${className}`} />;
}
