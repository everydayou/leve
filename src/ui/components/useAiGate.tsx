import { useState } from 'react';
import { Sheet, Button } from '../kit';
import { getCachedApiKey, requestApiKeySheet } from '../../lib/apiKey';

/** Gates any AI-feature trigger (Camera, Photo, Describe, Nutri-scan) behind
 *  an upfront check for a personal Claude key, shown immediately on tap
 *  instead of letting the action proceed and surfacing a failure later.
 *  Wrap the tap handler: `onCamera={withAiGate(() => void handleCamera())}`.
 *  If no key is saved, the wrapped action never runs; a short sheet opens
 *  instead with "View more" (jumps to Settings → AI Food Scan, the same
 *  sheet used everywhere else) or "Cancel" (just closes; the user taps the
 *  original button again once they've added a key; nothing is retried
 *  automatically). Relies on lib/apiKey.ts's in-memory cache, which
 *  AppShell warms on boot; see getCachedApiKey's own doc comment. */
export function useAiGate() {
  const [open, setOpen] = useState(false);

  /** Returns true if the caller should proceed (a key is set); false if the
   *  gate sheet was shown instead; the caller should bail out immediately,
   *  same contract as an early-return guard clause. Useful inside an
   *  existing async function body (handleCamera, handlePhoto) where
   *  wrapping every call site with withAiGate would mean wrapping the same
   *  function three times over (JSX taps + the FAB's auto-scan effect). */
  function checkAiGate(): boolean {
    if (getCachedApiKey()) return true;
    setOpen(true);
    return false;
  }

  function withAiGate<A extends unknown[]>(action: (...args: A) => void): (...args: A) => void {
    return (...args: A) => { if (checkAiGate()) action(...args); };
  }

  const gateSheet = open ? (
    <Sheet title="Connect AI to use this" onClose={() => setOpen(false)}>
      <div className="space-y-3 pb-2">
        <p className="text-subhead text-content-secondary">
          Scanning photos and describing meals uses AI. Connect your own Claude API key to use it.
        </p>
        <Button onClick={() => { setOpen(false); requestApiKeySheet(); }}>View more</Button>
        <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </Sheet>
  ) : null;

  return { withAiGate, checkAiGate, gateSheet };
}
