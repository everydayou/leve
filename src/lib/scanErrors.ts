import { FoodScanError } from './foodScan';
import { requestApiKeySheet } from './apiKey';
import type { ShowToast } from '../ui/components/Toaster';

/** Shared catch-block helper for every scan/label-scan call site (Day's-log
 *  basket has two near-identical internal copies; useFoodCapture.tsx has
 *  the shared engine used by Pantry; see comments there for why they're
 *  not unified). When the failure is AI-backend related (FoodScanError:
 *  shared proxy down, network failure, or the user's own key missing or
 *  invalid), shows the error's own message with a tappable action straight
 *  into Settings → AI Food Scan. Anything else (e.g. a plain validation
 *  Error) just shows its message, same as before this existed. */
export function toastScanError(err: unknown, showToast: ShowToast | undefined, fallback: string): void {
  if (err instanceof FoodScanError) {
    showToast?.(err.message, undefined, { label: err.actionLabel, onClick: requestApiKeySheet });
    return;
  }
  showToast?.(err instanceof Error ? err.message : fallback);
}
