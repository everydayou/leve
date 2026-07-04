import { Icon } from './Icon';

/** Displays 1 photo as a wide hero, or 2–3 photos as a rotating collage.
 *  Meal/Food item views always show an image slot (round 162) — when
 *  `photos` is empty, renders a flat muted placeholder instead of nothing,
 *  since Marco doesn't yet have a real default-image asset to drop in.
 *  No shadow on the placeholder (it's not real content); no shadow on a
 *  real photo either now that ImageHero sits nested inside the new
 *  meal/food-item card's own shadow-card-lg (round 162) — one elevated
 *  surface per card, not a shadow inside a shadow.
 *
 *  Figma x/y values are bounding-box positions (top-left of the axis-aligned
 *  rect around the rotated element). CSS left/top is the unrotated box position,
 *  so each coordinate is offset inward by (bbox_size − image_size) / 2. */
export function ImageHero({ photos, className }: { photos: string[]; className?: string }) {
  if (photos.length === 0) {
    return (
      <div className={`flex justify-center ${className ?? ''}`}>
        <div className="flex h-64 w-64 items-center justify-center rounded-[20px] bg-surface-muted">
          <Icon name="foodIcon" size={32} className="text-content-muted" />
        </div>
      </div>
    );
  }

  if (photos.length === 1) {
    return (
      <div className={`flex justify-center ${className ?? ''}`}>
        {/* Round 141 tried moving rounding onto the <img> directly (removing
           this overflow-hidden wrapper) to test a GPU-compositing-layer
           theory for reported photo brightness — reverted (round 142):
           border-radius directly on an object-fit:cover <img> doesn't clip
           reliably in WebKit, which caused a real regression (square white
           corners). The brightness theory is also disproven — see round 142
           notes — so this reverts to the plain, correct overflow-hidden
           pattern with no loss. Round 162: dropped shadow-card-lg — this now
           lives nested inside the meal/food-item card's own shadow. */}
        <div className="h-64 w-64 overflow-hidden rounded-[20px]">
          <img src={photos[0]} alt="Meal" className="h-full w-full object-cover" />
        </div>
      </div>
    );
  }

  // 2–3 photos: stacked collage inside a 256×256 container.
  // left/top are CSS positions (bounding-box-corrected from Figma spec).
  const cfg2 = [
    { w: 145, h: 145, left: 12, top: 12, rotate: -10, z: 1 },
    { w: 174, h: 174, left: 72, top: 72, rotate:   5, z: 2 },
  ];

  const cfg3 = [
    { w: 120, h: 120, left:  34, top: 15, rotate: -10, z: 1 },
    { w: 144, h: 144, left:  98, top: 34, rotate:   5, z: 2 },
    { w: 150, h: 150, left:   6, top: 84, rotate:  -4, z: 3 },
  ];

  const cfg4 = [
    { w: 120, h: 120, left:  34, top: 15, rotate: -10, z: 1 },
    { w: 144, h: 144, left:  98, top: 34, rotate:   5, z: 2 },
    { w: 144, h: 144, left:   3, top: 57, rotate:  -4, z: 3 },
    { w: 150, h: 150, left:  74, top: 97, rotate:   3, z: 4 },
  ];

  const cfg = photos.length === 2 ? cfg2 : photos.length === 4 ? cfg4 : cfg3;

  return (
    <div className={`flex justify-center ${className ?? ''}`}>
      <div className="relative" style={{ width: 256, height: 256 }}>
        {photos.slice(0, 4).map((photo, i) => {
          const c = cfg[i];
          return (
            <div
              key={i}
              className="absolute overflow-hidden rounded-[20px]"
              style={{
                width: c.w,
                height: c.h,
                left: c.left,
                top: c.top,
                transform: `rotate(${c.rotate}deg)`,
                zIndex: c.z,
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
