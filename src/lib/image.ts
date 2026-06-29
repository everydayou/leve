/** Downscale a picked photo before storing it.
 *  A camera shot can be several MB; we only ever show a tiny thumbnail, so we
 *  shrink to a small max dimension and re-encode as JPEG. Result is a data URL
 *  of a few KB. No external library — just a canvas. */
const MAX_THUMB_PX = 256; // 256px — matches the 256×256 photo display in edit/pantry views
export const MAX_SCAN_PX  = 768; // large enough for AI food analysis, small enough for cheap API calls
const JPEG_QUALITY = 0.72;

/** Downscale a File (from file picker or web camera) before storing.
 *  Constrains the LARGER dimension to maxPx so portrait and landscape are
 *  treated equally. PNG inputs keep PNG encoding to preserve transparency;
 *  everything else becomes JPEG. */
export function downscaleImage(file: File, maxPx = MAX_THUMB_PX): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      URL.revokeObjectURL(url);
      if (!ctx) { reject(new Error('no 2d context')); return; }
      // For PNG inputs: keep PNG encoding to preserve transparency.
      // For everything else: fill white before drawing so any semi-transparent
      // pixels composite against white (not the default canvas black) before
      // being re-encoded as JPEG.
      if (file.type === 'image/png') {
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
    img.src = url;
  });
}

/** Downscale a data URL (e.g. from Capacitor Camera) before sending to the
 *  AI scan API. Always re-encodes as JPEG (smaller payload, no transparency
 *  needed for food photos). Constrains the larger dimension to maxPx. */
export function downscaleDataUrl(dataUrl: string, maxPx = MAX_SCAN_PX): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('no 2d context')); return; }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
    };
    img.onerror = () => reject(new Error('image load failed'));
    img.src = dataUrl;
  });
}
