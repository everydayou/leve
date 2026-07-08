import { useEffect, useState } from 'react';
import { Sheet, Button, LabeledInput } from '../kit';
import { getApiKey, setApiKey, clearApiKey } from '../../lib/apiKey';

/** Settings → AI Food Scan. Lets a user paste their own Anthropic API key so
 *  scan/describe calls go straight from their device to Anthropic (see
 *  lib/foodScan.ts) instead of through the shared Vercel proxy. Includes
 *  copy on where to get a key since most users won't have a Claude Console
 *  account already. */
export function ApiKeySheet({ onClose }: { onClose: () => void }) {
  const [existing, setExisting] = useState<string | null>(null);
  const [val, setVal] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getApiKey().then((k) => { setExisting(k); setVal(k ?? ''); });
  }, []);

  async function save() {
    if (!val.trim()) return;
    setSaving(true);
    await setApiKey(val);
    setSaving(false);
    onClose();
  }

  async function remove() {
    setSaving(true);
    await clearApiKey();
    setSaving(false);
    onClose();
  }

  return (
    <Sheet
      title="AI Food Scan"
      onClose={onClose}
      footer={
        <div className="space-y-2">
          <Button size="lg" onClick={() => void save()} disabled={!val.trim() || saving}>
            {saving ? 'Saving…' : existing ? 'Update key' : 'Save key'}
          </Button>
          {existing && (
            <Button variant="destructive" size="lg" onClick={() => void remove()} disabled={saving}>
              Remove key
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4 pb-2">
        <p className="text-subhead text-content-secondary">
          By default, food scanning uses a shared preview key. Add your own Anthropic API key to use your own account instead — usage from then on is billed to you directly by Anthropic.
        </p>
        <LabeledInput
          label="API key"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="sk-ant-..."
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="font-mono"
        />
        <div className="rounded-card border border-border-subtle bg-surface-sunken p-3">
          <p className="mb-2 text-subhead font-medium text-content">How to get a key</p>
          <ol className="space-y-1.5 text-caption text-content-secondary">
            <li>1. Go to <span className="font-medium text-content">console.anthropic.com</span> and sign up or log in.</li>
            <li>2. Open <span className="font-medium text-content">Settings → API Keys</span>.</li>
            <li>3. Create a new key and copy it — Anthropic only shows it once.</li>
            <li>4. Paste it above and save.</li>
          </ol>
        </div>
      </div>
    </Sheet>
  );
}
