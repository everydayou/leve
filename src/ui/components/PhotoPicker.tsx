import { useRef, useState } from 'react';
import { downscaleImage } from '../../lib/image';
import { Icon } from '../kit';

/** Material Symbols "add_photo_alternate" icon — used in the empty photo picker. */
function AddPhotoIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" height="28" viewBox="0 -960 960 960" width="28" fill="currentColor" aria-hidden="true">
      <path d="M480-480ZM202.87-111.87q-37.78 0-64.39-26.61t-26.61-64.39v-554.26q0-37.78 26.61-64.39t64.39-26.61h270.91q19.15 0 32.33 13.17 13.17 13.18 13.17 32.33t-13.17 32.33q-13.18 13.17-32.33 13.17H202.87v554.26h554.26v-270.91q0-19.15 13.17-32.33 13.18-13.17 32.33-13.17t32.33 13.17q13.17 13.18 13.17 32.33v270.91q0 37.78-26.61 64.39t-64.39 26.61H202.87ZM240-280h480L570-480 450-320l-90-120-120 160Zm441.91-401.91h-40.95q-17.71 0-29.7-12.1-11.98-12.1-11.98-29.81 0-17.72 12.05-29.7t29.87-11.98h40.71v-40.96q0-17.71 12.1-29.69t29.81-11.98q17.72 0 29.7 11.98t11.98 29.69v40.96h40.96q17.71 0 29.69 11.98t11.98 29.7q0 17.71-11.98 29.81-11.98 12.1-29.69 12.1H765.5v40.95q0 17.71-11.98 29.7-11.98 11.98-29.7 11.98-17.71 0-29.81-12.05-12.1-12.05-12.1-29.87v-40.71Z"/>
    </svg>
  );
}

import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

/** Optional food photo. On a phone (PWA or the later native build) the
 *  `capture` attribute opens the camera; on desktop it's a file picker.
 *  Stores a data URL on the FoodItem. */
export function PhotoPicker({ photo, onChange, size = 56 }: {
  photo?: string;
  onChange: (dataUrl: string | undefined) => void;
  size?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Web-only: holds a processed photo awaiting confirmation before committing.
  const [pendingDataUrl, setPendingDataUrl] = useState<string | null>(null);

  async function pick(file?: File) {
    if (!file) return;
    setError(null);
    setLoading(true);
    try {
      const processed = await downscaleImage(file);
      // Show preview for confirmation instead of committing immediately.
      setPendingDataUrl(processed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to process image';
      console.error('Photo error:', msg);
      setError(msg);
      setTimeout(() => setError(null), 3000);
    } finally {
      setLoading(false);
    }
  }

  function confirmPick() {
    if (pendingDataUrl) {
      onChange(pendingDataUrl);
      setPendingDataUrl(null);
    }
  }

  function cancelPick() {
    setPendingDataUrl(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleClick() {
    if (Capacitor && Capacitor.isNativePlatform?.() && Capacitor.getPlatform() === 'ios') {
      // CameraSource.Prompt shows the native iOS action sheet:
      // "Take Photo" / "Photo Library" / "Cancel" — no custom dialogs needed.
      setError(null);
      setLoading(true);
      try {
        const result = await Camera.getPhoto({
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Prompt,
          quality: 100,
        });
        if (result.dataUrl) onChange(result.dataUrl);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to get photo';
        if (!msg.toLowerCase().includes('cancel')) {
          setError(msg);
          setTimeout(() => setError(null), 3000);
        }
      } finally {
        setLoading(false);
      }
    } else {
      // Browser: open file picker (no capture= so both camera and library are accessible)
      inputRef.current?.click();
    }
  }

  // ── Pending confirmation state ──────────────────────────────────────────────
  if (pendingDataUrl) {
    return (
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <img src={pendingDataUrl} alt="" className="h-full w-full rounded-control object-cover opacity-80" />
        {/* Confirm */}
        <button
          type="button"
          onClick={confirmPick}
          aria-label="Use photo"
          className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-pill bg-accent text-on-accent shadow-sm"
        >
          <Icon name="check" size={11} strokeWidth={2.75} />
        </button>
        {/* Cancel */}
        <button
          type="button"
          onClick={cancelPick}
          aria-label="Cancel"
          className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-pill bg-content text-content-inverse shadow-sm"
        >
          <Icon name="close" size={11} strokeWidth={2.75} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={`flex h-full w-full items-center justify-center overflow-hidden rounded-control text-content-muted transition ${
          error ? 'bg-danger-soft' : 'bg-surface-sunken'
        } ${loading ? 'opacity-60' : ''}`}
        aria-label="Add photo"
        title={error || undefined}
      >
        {photo
          ? <img src={photo} alt="" className="h-full w-full object-cover" />
          : error
          ? <span className="text-micro">⚠</span>
          : loading
          ? <span className="text-micro">…</span>
          : <AddPhotoIcon />}
      </button>
      {photo && (
        // Sits INSIDE the tile's top-right corner so it can never be clipped by
        // a scrolling sheet (it used to be offset outside the bounds and got cut
        // off). Icon stroke is a touch thicker for a crisper cross.
        <button type="button" onClick={() => onChange(undefined)} aria-label="Remove photo"
          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-pill bg-accent text-on-accent shadow-sm">
          <Icon name="close" size={12} strokeWidth={2.75} />
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { void pick(e.target.files?.[0]); }} />
    </div>
  );
}

/** Read-only thumbnail used in lists.
 *  `radius` replaces the default rounded-control — pass e.g. "rounded-[4px]". */
export function Thumb({ photo, size = 40, radius = 'rounded-control', className = '' }: { photo?: string; size?: number; radius?: string; className?: string }) {
  return (
    <span className={`block shrink-0 overflow-hidden bg-surface-sunken ${radius} ${className}`} style={{ width: size, height: size }}>
      {photo && <img src={photo} alt="" className="h-full w-full object-cover" />}
    </span>
  );
}
