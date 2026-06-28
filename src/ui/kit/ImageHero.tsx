/** Displays 1 photo as a wide hero, or 2–3 photos as a rotating collage.
 *  Renders nothing when the array is empty. */
export function ImageHero({ photos, className }: { photos: string[]; className?: string }) {
  if (photos.length === 0) return null;

  if (photos.length === 1) {
    return (
      <div className={`w-full overflow-hidden rounded-[20px] shadow-card-lg ${className ?? ''}`}>
        <img src={photos[0]} alt="Meal" className="aspect-video w-full object-cover" />
      </div>
    );
  }

  // 2–3 photos: stacked collage with slight rotations (matches prototype).
  const cfg = [
    { top: 0,   left: 0,    transform: 'rotate(-2.5deg)', zIndex: 1 },
    { bottom: 0, right: 0,  transform: 'rotate(3deg)',    zIndex: 2 },
    { top: 20,  left: '28%', transform: 'rotate(0.5deg)', zIndex: 3 },
  ] as const;

  return (
    <div className={`relative h-52 w-full ${className ?? ''}`}>
      {photos.slice(0, 3).map((photo, i) => (
        <div
          key={i}
          className="absolute overflow-hidden rounded-[16px] shadow-card"
          style={{ width: 120, height: 120, ...cfg[i] }}
        >
          <img src={photo} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
        </div>
      ))}
    </div>
  );
}
