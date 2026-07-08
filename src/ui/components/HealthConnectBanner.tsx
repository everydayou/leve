import { useEffect, useState } from 'react';
import { repos } from '../../state/repos';
import { getHealthKitService, type HealthKitStatus } from '../../data/healthkit';
import { hapticLight } from '../../lib/haptics';
import { Button, Icon } from '../kit';

/** "5m ago" / "2h ago" / "Jul 6" — kept local to this component, nowhere
 *  else in the app needs relative-time formatting. */
function relativeSync(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Contextual Apple Health status, shown inline where manually logging
 *  something is exactly the moment it's relevant — Log Activity and Log
 *  Weight. Two states:
 *  - Not connected yet: a dismissible "Connect Apple Health" nudge (same
 *    visual pattern as the weight reminder banner on Today).
 *  - Connected: a persistent (non-dismissible) status line confirming
 *    what's being tracked and when it last synced — connecting shouldn't
 *    feel like it did nothing just because the nudge quietly disappeared.
 *  Renders nothing when Health isn't available on this device/build. */
export function HealthConnectBanner({
  dismissKey, pendingMessage, connectedMessage,
}: { dismissKey: string; pendingMessage: string; connectedMessage: string }) {
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

  if (!status?.available) return null;

  if (status.connected) {
    return (
      <div className="flex items-center gap-3 rounded-card border border-border-subtle bg-surface-sunken px-4 py-3">
        <Icon name="health" size={20} className="shrink-0 text-content-muted" />
        <div className="min-w-0 flex-1">
          <p className="text-subhead font-medium text-content">Apple Health connected</p>
          <p className="text-caption text-content-secondary">
            {connectedMessage}{status.lastSyncAt ? ` · Synced ${relativeSync(status.lastSyncAt)}` : ''}
          </p>
        </div>
      </div>
    );
  }

  if (dismissed) return null;

  return (
    <div className="flex items-center gap-3 rounded-card border border-border-subtle bg-surface-sunken px-4 py-3">
      <Icon name="health" size={20} className="shrink-0 text-content-muted" />
      <div className="min-w-0 flex-1">
        <p className="text-subhead font-medium text-content">Connect Apple Health</p>
        <p className="text-caption text-content-secondary">{pendingMessage}</p>
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
