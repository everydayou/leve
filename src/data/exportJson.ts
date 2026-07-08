import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { Repositories } from './repositories';

/**
 * Account -> Export (JSON).
 * On native (iOS/Android), writes the JSON to the app's cache dir and opens
 * the native share sheet so the user can save it to Files, AirDrop it, etc.
 * A plain <a download> click never triggers anything inside the app's
 * webview (no Downloads folder, no default handler), which is why this
 * needs the Filesystem + Share plugins instead. On web, falls back to a
 * normal browser file download.
 */
export async function exportAsJson(repos: Repositories): Promise<void> {
  const bundle = await repos.exportAll();
  const json = JSON.stringify(bundle, null, 2);
  const filename = `nutrition-goal-tracker-${bundle.exportedAt.slice(0, 10)}.json`;

  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({
      path: filename,
      data: json,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ url: uri });
    return;
  }

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
