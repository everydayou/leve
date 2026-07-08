import { useEffect, useState } from 'react';
import { Sheet, Button, Icon, useKeyboardDoneBar } from '../kit';
import { getApiKey, setApiKey, clearApiKey } from '../../lib/apiKey';

/** Settings → AI Food Scan. Lets a user paste their own Anthropic API key so
 *  scan/describe calls go straight from their device to Anthropic (see
 *  lib/foodScan.ts) instead of through the shared Vercel proxy. Includes
 *  copy on where to get a key since most users won't have a Claude Console
 *  account already. Opens at full height (forceExpanded) — the instructions
 *  need room to breathe and this is a deliberate, infrequent visit, not a
 *  quick glance. Also opened directly from AI-feature error states via
 *  lib/apiKey.ts's requestApiKeySheet(), so it's mounted once at AppShell
 *  level rather than owned by any one screen. */
export function ApiKeySheet({ onClose }: { onClose: () => void }) {
  const [existing, setExisting] = useState<string | null>(null);
  const [val, setVal] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const { bind, doneBar } = useKeyboardDoneBar();

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
      forceExpanded
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

        <label className="block">
          <span className="text-subhead font-normal text-content-secondary">API key</span>
          <div className="relative mt-1">
            <input
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onFocus={bind.onFocus}
              onBlur={bind.onBlur}
              type={revealed ? 'text' : 'password'}
              placeholder="sk-ant-..."
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded-field border border-transparent bg-surface-sunken py-2.5 pl-3 pr-11 text-subhead font-semibold font-mono
                text-content outline-none transition placeholder:text-content-muted placeholder:font-sans focus:border-accent"
            />
            <button
              type="button"
              onClick={() => setRevealed((r) => !r)}
              aria-label={revealed ? 'Hide key' : 'Show key'}
              className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-content-muted active:text-content"
            >
              <Icon name={revealed ? 'eyeOff' : 'eye'} size={18} />
            </button>
          </div>
        </label>

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
      {doneBar}
    </Sheet>
  );
}
