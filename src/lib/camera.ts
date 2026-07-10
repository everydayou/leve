import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { downscaleDataUrl, MAX_SCAN_PX } from './image';

/** Returns true when running as a native Capacitor app (iOS or Android). */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform?.() === true;
}

/** Shared options for all native camera captures. */
const BASE_OPTIONS = {
  resultType: CameraResultType.DataUrl,
  quality: 90,
  allowEditing: false,
} as const;

async function getPhoto(source: CameraSource): Promise<string | null> {
  try {
    const result = await Camera.getPhoto({ ...BASE_OPTIONS, source });
    if (!result.dataUrl) return null;
    return downscaleDataUrl(result.dataUrl, MAX_SCAN_PX);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.toLowerCase().includes('cancel')) return null;
    throw err;
  }
}

/**
 * Opens the native camera (no "Retake/Use Photo" workaround — iOS always shows
 * it; we skip OUR custom confirmation screen for this path instead).
 * Returns a downscaled data URL or null on cancel.
 */
export async function captureFromCamera(): Promise<string | null> {
  if (!isNativeApp()) return null;
  return getPhoto(CameraSource.Camera);
}

/**
 * Opens the native photo library picker.
 * Returns a downscaled data URL or null on cancel.
 */
export async function captureFromLibrary(): Promise<string | null> {
  if (!isNativeApp()) return null;
  return getPhoto(CameraSource.Photos);
}
