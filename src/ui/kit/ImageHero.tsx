/** Displays 1 photo as a wide hero, or 2–3 photos as a rotating collage.
 *  Renders nothing when the array is empty. */
export function ImageHero({ photos, className }: { photos: string[]; className?: string }) {
  if (photos.length === 0) return null;

  if (photos.length === 1) {
    return (
      <div className={`flex justify-center ${className ?? ''}`}>
        <div className="h-64 w-64 overflow-hidden rounded-[20px] shadow-card-lg">
          <img src={photos[0]} alt="Meal" className="h-full w-full object-cover" />
        </div>
      </div>
    );
  }

  // 2–3 photos: stacked collage inside a 256×256 container, per design spec.
  const cfg2 = [
    { width: 145, height: 145, left: 1,  top: 1,  rotate:  10, zIndex: 1 },
    { width: 174, height: 174, left: 65, top: 65, rotate:  -5, zIndex: 2 },
  ];

  const cfg3 = [
    { width: 120, height: 120, left: 24, top: 5,  rotate:  10, zIndex: 1 },
    { width: 144, height: 144, left: 92, top: 28, rotate:  -5, zIndex: 2 },
    { width: 150, height: 150, left: 19, top: 79, rotate:   4, zIndex: 3 },
  ];

  const cfg = photos.length === 2 ? cfg2 : cfg3;

  return (
    <div className={`flex justify-center ${className ?? ''}`}>
      <div className="relative" style={{ width: 256, height: 256 }}>
        {photos.slice(0, 3).map((photo, i) => {
          const c = cfg[i];
          return (
            <div
              key={i}
              className="absolute overflow-hidden rounded-[20px] shadow-card-lg"
              style={{
                width: c.width,
                height: c.height,
                left: c.left,
                top: c.top,
                transform: `rotate(${c.rotate}deg)`,
                zIndex: c.zIndex,
              }}
            >
              <img src={photo} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
