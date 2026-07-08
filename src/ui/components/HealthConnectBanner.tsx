import { useEffect, useState } from 'react';
import { repos } from '../../state/repos';
import { getHealthKitService, type HealthKitStatus } from '../../data/healthkit';
import { hapticLight } from '../../lib/haptics';
import { Button, Icon } from '../kit';

/** Small, dismissible, contextual nudge shown inline where manually logging
 *  something is exactly the moment connecting Apple Health would help —
 *  Log Activity and Log Weight. Same visual pattern as the weight reminder
 *  banner on Today. Renders nothing once connected, unavailable (web/no
 *  Health app), or previously dismissed — never nags. */
export function HealthConnectBanner({ dismissKey, message }: { dismissKey: string; message: string }) {
  const svc = getHealthKitService(repos);
  const [status, setStatus] = useState<HealthKitStatus | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(dismissKey) === '1');
  const [connecting, setConnecting] = useState(false);

  useEffect(() => { svc.getStatus().then(setStatus); }, []); // eslint-disable-line

  async function connect() {
    setConnecting(true);
    await svc.connect();
    await svc.sync();
    setStatus(await svc.getStatus());
    setConnecting(false);
  }

  function dismiss() {
    localStorage.setItem(dismissKey, '1');
    setDismissed(true);
  }

  if (!status?.available || status.connected || dismissed) return null;

  return (
    <div className="flex items-center gap-3 rounded-card border border-border-subtle bg-surface-sunken px-4 py-3">
      <Icon name="health" size={20} className="shrink-0 text-content-muted" />
      <div className="min-w-0 flex-1">
        <p className="text-subhead font-medium text-content">Connect Apple Health</p>
        <p className="text-caption text-content-secondary">{message}</p>
      </div>
      <Button variant="subtle" size="xs" fullWidth={false} onClick={() => void connect()} disabled={connecting}>
        {connecting ? 'Connecting…' : 'Connect'}
      </Button>
      <button onClick={() => { hapticLight(); dismiss(); }} aria-label="Dismiss"
        className="relative shrink-0 p-1 text-content-muted active:opacity-70 before:absolute before:content-[''] before:-inset-3">
        <Icon name="close" size={16} strokeWidth={2} />
      </button>
    </div>
  );
}
