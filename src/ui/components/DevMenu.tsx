import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Icon, SegmentedControl, Sheet } from '../kit';
import type { IconName } from '../kit';
import {
  applyDevOverrides, loadDevOverrides,
  setTokenOverride, clearTokenOverride, resetDevOverrides,
  resolveColorToken, readRawToken, exportCss,
} from '../../lib/devTokens';
import { PROFILE_KEY, TEST_PROFILE, REAL_PROFILE, DB_NAMES, activeProfile } from '../../data/db';
import { resetOnboarding } from '../../lib/onboarding';
import { ScanResults, type ResultItem } from './AddEntrySheet';
import { repos } from '../../state/repos';
import { newId, todayISO, addDays } from '../../data/ids';
import type { GoalStatus } from '../../domain/types';

// ── Dev scan-preview data ─────────────────────────────────────────────────────

/* eslint-disable no-restricted-syntax -- dev-only dummy SVG image data, not UI colours */
const DUMMY_SCAN_PHOTO = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
    <rect width="256" height="256" fill="#FFF4E6"/>
    <circle cx="128" cy="128" r="108" fill="#F5DEB3" opacity="0.5"/>
    <circle cx="128" cy="128" r="80" fill="#E8C98A"/>
    <ellipse cx="115" cy="118" rx="32" ry="22" fill="#F4A460" transform="rotate(-15,115,118)"/>
    <ellipse cx="138" cy="128" rx="24" ry="18" fill="#C0392B"/>
    <ellipse cx="110" cy="140" rx="14" ry="9" fill="#27AE60"/>
    <ellipse cx="148" cy="114" rx="10" ry="7" fill="#27AE60"/>
    <circle cx="138" cy="128" r="5" fill="#922B21" opacity="0.6"/>
    <text x="128" y="218" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="#B0855A">dummy scan photo</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
})();
/* eslint-enable no-restricted-syntax */

const DUMMY_SCAN_ITEMS_INITIAL: ResultItem[] = [
  {
    name: 'Avocado Toast',
    description: 'Toasted sourdough topped with mashed avocado, olive oil and chilli flakes',
    estimatedGrams: 180,
    calories: 320,
    protein: 8,
    carbs: 38,
    fiber: 7,
    fat: 16,
    confidence: 'high',
    selected: true,
  },
  {
    name: 'Poached Egg',
    description: 'Single poached egg placed on top',
    estimatedGrams: 55,
    calories: 78,
    protein: 6,
    carbs: 0,
    fiber: 0,
    fat: 5,
    confidence: 'medium',
    selected: true,
  },
  {
    name: 'Cherry Tomatoes',
    estimatedGrams: 60,
    calories: 18,
    protein: 1,
    carbs: 4,
    fiber: 1,
    fat: 0,
    confidence: 'low',
    selected: false,
  },
];

// ── Flows data + helper ───────────────────────────────────────────────────────

type GoalStateId = 'active' | 'final-day' | 'final-day-weight' | 'final-day-hit' | 'early-complete' | 'overdue' | 'completed' | 'ended' | 'no-goal';

const SCREEN_ROWS: { id: string; label: string; desc: string; icon: IconName; path: string }[] = [
  { id: 'today',      label: 'Today',      desc: 'Diary view for the current day',  icon: 'today',   path: '/today' },
  { id: 'goal',       label: 'Goal',       desc: 'Goal progress dashboard',         icon: 'goal',    path: '/goal' },
  { id: 'pantry',     label: 'Pantry',     desc: 'Food items list',                 icon: 'pantry',  path: '/pantry' },
  { id: 'account',    label: 'Account',    desc: 'Profile, settings, integrations', icon: 'account', path: '/account' },
  { id: 'goal-setup', label: 'Goal setup', desc: 'Full-screen goal creation flow',  icon: 'edit',    path: '/goal-setup?new=true' },
  { id: 'onboarding', label: 'Onboarding', desc: 'First-launch welcome + profile',  icon: 'sun',     path: '/onboarding' },
];

const GOAL_STATE_ROWS: { id: GoalStateId; label: string; desc: string; badge?: string }[] = [
  { id: 'active',    label: 'Active',        desc: 'Goal running, 28 days remaining' },
  { id: 'final-day',        label: 'Final day · no weight', desc: 'Final day, no weight logged today',              badge: 'final day' },
  { id: 'final-day-weight',  label: 'Final day · weight in',  desc: 'Final day, weight logged but target not hit',   badge: 'final day' },
  { id: 'final-day-hit',  label: 'Final day · goal hit', desc: 'Final day, target weight already reached', badge: 'final day' },
  { id: 'early-complete', label: 'Completed early',    desc: 'Target weight reached before deadline', badge: 'early' },
  { id: 'overdue',   label: 'Overdue',        desc: 'Target date passed 4 days ago', badge: 'overdue' },
  { id: 'completed', label: 'Completed',      desc: 'Goal marked as complete',       badge: 'done' },
  { id: 'ended',     label: 'Ended',          desc: 'Stopped without completing',    badge: 'ended' },
  { id: 'no-goal',   label: 'No active goal', desc: 'Goal tab empty state' },
];

async function applyGoalState(stateId: GoalStateId): Promise<void> {
  const today = todayISO();

  if (stateId === 'no-goal') {
    const all = await repos.goals.getAll();
    for (const g of all) await repos.goals.put({ ...g, status: 'abandoned' as GoalStatus });
    return;
  }

  // Get or create a usable goal to modify
  let goal = await repos.goals.getActive();
  if (!goal) {
    const all = await repos.goals.getAll();
    goal = all[0];
    if (!goal) {
      goal = {
        id: newId(),
        name: 'Test Goal',
        type: 'lose_by_date',
        startWeightKg: 75,
        targetWeightKg: 70,
        startDate: addDays(today, -21),
        targetDate: addDays(today, 28),
        status: 'active',
      };
    }
  }

  const patches: Record<GoalStateId, Partial<typeof goal>> = {
    'active':    { status: 'active',    startDate: addDays(today, -21), targetDate: addDays(today, 28) },
    'final-day':        { status: 'active', startDate: addDays(today, -21), targetDate: today },
    'final-day-weight': { status: 'active', startDate: addDays(today, -21), targetDate: today },
    'final-day-hit':    { status: 'active', startDate: addDays(today, -21), targetDate: today },
    'overdue':   { status: 'active',    startDate: addDays(today, -35), targetDate: addDays(today, -4) },
    'completed':      { status: 'completed' },
    'ended':          { status: 'abandoned' },
    'early-complete': { status: 'active', startDate: addDays(today, -21), targetDate: addDays(today, 28) },
    'no-goal':        {}, // handled above
  };
  const updatedGoal = { ...goal, ...patches[stateId] };
  await repos.goals.put(updatedGoal);

  // Seed today's weight based on state:
  // - final-day (no weight): delete any existing entry for today
  // - atTarget states: seed at targetWeightKg so remaining === 0
  // - all others: seed above target so weight left is visible
  const atTarget = stateId === 'early-complete' || stateId === 'final-day-hit';
  const noWeightToday = stateId === 'final-day';
  if (noWeightToday) {
    const existingWeights = await repos.weights.all();
    const todayEntry = existingWeights.find(w => w.date === today);
    if (todayEntry) await repos.weights.remove(todayEntry.id);
  } else {
    const seedWeight = atTarget ? updatedGoal.targetWeightKg : Math.max(updatedGoal.targetWeightKg + 2.5, 72.5);
    await repos.weights.upsertForDate({ id: newId(), date: today, weightKg: seedWeight, source: 'manual' });
  }

  // Ensure user has a BMR so Today's budget renders
  const user = await repos.user.get();
  if (user && !user.bmr) {
    await repos.user.save({ ...user, bmr: 1800 });
  }
}

// ── Token definitions ─────────────────────────────────────────────────────────

const COLOR_GROUPS: { group: string; tokens: { name: string; label: string }[] }[] = [
  {
    group: 'Accent',
    tokens: [
      { name: '--color-accent',       label: 'Accent' },
      { name: '--color-accent-hover', label: 'Accent hover' },
      { name: '--color-accent-soft',  label: 'Accent soft' },
      { name: '--color-on-accent',    label: 'On accent' },
    ],
  },
  {
    group: 'Status',
    tokens: [
      { name: '--color-success',      label: 'Success' },
      { name: '--color-success-soft', label: 'Success soft' },
      { name: '--color-on-success',   label: 'On success' },
      { name: '--color-warn',         label: 'Warn' },
      { name: '--color-warn-soft',    label: 'Warn soft' },
      { name: '--color-on-warn',      label: 'On warn' },
      { name: '--color-danger',       label: 'Danger' },
      { name: '--color-danger-soft',  label: 'Danger soft' },
      { name: '--color-on-danger',    label: 'On danger' },
    ],
  },
  {
    group: 'Surfaces',
    tokens: [
      { name: '--color-surface',          label: 'Surface' },
      { name: '--color-surface-elevated', label: 'Surface elevated' },
      { name: '--color-surface-sunken',   label: 'Surface sunken' },
      { name: '--color-surface-muted',    label: 'Surface muted' },
    ],
  },
  {
    group: 'Content',
    tokens: [
      { name: '--color-content',          label: 'Content' },
      { name: '--color-content-secondary',label: 'Content secondary' },
      { name: '--color-content-muted',    label: 'Content muted' },
      { name: '--color-content-inverse',  label: 'Content inverse' },
    ],
  },
  {
    group: 'Borders',
    tokens: [
      { name: '--color-border-subtle', label: 'Border subtle' },
      { name: '--color-border-field',  label: 'Border field' },
      { name: '--color-border-strong', label: 'Border strong' },
      { name: '--color-scrim',         label: 'Scrim' },
    ],
  },
  {
    group: 'Glass',
    tokens: [
      { name: '--glass-bg',        label: 'Glass bg' },
      { name: '--glass-bg-strong', label: 'Glass bg strong' },
      { name: '--glass-border',    label: 'Glass border' },
    ],
  },
  {
    group: 'Misc',
    tokens: [
      { name: '--color-progress-track', label: 'Progress track' },
    ],
  },
];

const SHADOW_DEFS = [
  { name: '--shadow-card',    label: 'Card' },
  { name: '--shadow-card-lg', label: 'Card LG' },
  { name: '--glass-shadow',   label: 'Glass' },
];

// ── Color helpers ─────────────────────────────────────────────────────────────

function parseColor(raw: string): { hex: string; alpha: number } {
  raw = raw.trim();
  const m = raw.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (m) {
    const hex = '#' + [m[1], m[2], m[3]].map(v => Math.round(Number(v)).toString(16).padStart(2, '0')).join('');
    return { hex, alpha: m[4] !== undefined ? Math.round(Number(m[4]) * 100) : 100 };
  }
  if (raw.startsWith('#')) {
    const full = raw.length === 4
      ? '#' + [...raw.slice(1)].map(c => c + c).join('')
      : raw.slice(0, 7);
    return { hex: full.toLowerCase(), alpha: 100 };
  }
  // eslint-disable-next-line no-restricted-syntax -- colour-math fallback, not a UI colour
  return { hex: '#000000', alpha: 100 };
}

function toColorString(hex: string, alpha: number): string {
  if (alpha >= 100) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // eslint-disable-next-line no-restricted-syntax -- builds rgba() string for colour-math output, not a UI colour
  return `rgba(${r}, ${g}, ${b}, ${(alpha / 100).toFixed(2)})`;
}

// ── Shadow helpers ────────────────────────────────────────────────────────────

interface ShadowLayer {
  x: number; y: number; blur: number; spread: number;
  hex: string; alpha: number; inset: boolean;
}

function splitLayers(s: string): string[] {
  const out: string[] = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseLayer(s: string): ShadowLayer {
  const inset = /^inset\b/.test(s);
  if (inset) s = s.replace(/^inset\s*/, '');
  // eslint-disable-next-line no-restricted-syntax -- colour-math default, not a UI colour
  let colorStr = 'rgba(0,0,0,1)';
  const rgbaM = s.match(/rgba?\([^)]+\)/);
  if (rgbaM) { colorStr = rgbaM[0]; s = s.replace(colorStr, '').trim(); }
  else {
    const hexM = s.match(/#[0-9a-fA-F]{3,8}/);
    if (hexM) { colorStr = hexM[0]; s = s.replace(colorStr, '').trim(); }
  }
  const parts = s.trim().split(/\s+/).map(p => parseFloat(p) || 0);
  const { hex, alpha } = parseColor(colorStr);
  return { inset, x: parts[0] ?? 0, y: parts[1] ?? 0, blur: parts[2] ?? 0, spread: parts[3] ?? 0, hex, alpha };
}

function serializeLayer(l: ShadowLayer): string {
  const p: string[] = [];
  if (l.inset) p.push('inset');
  p.push(`${l.x}px`, `${l.y}px`, `${l.blur}px`, `${l.spread}px`);
  p.push(toColorString(l.hex, l.alpha));
  return p.join(' ');
}

// ── Input style ───────────────────────────────────────────────────────────────

const inputCls = 'rounded-md border border-border-field bg-surface-sunken px-2 py-1 text-label text-content text-center focus:outline-none focus:border-accent';

// ── HSL helpers ───────────────────────────────────────────────────────────────

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return { h: 0, s: 0, l: 50 };
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
  const d   = max - min;
  const s   = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
    case g: h = ((b - r) / d + 2) * 60; break;
    default: h = ((r - g) / d + 4) * 60; break;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100, ln = l / 100;
  const a  = sn * Math.min(ln, 1 - ln);
  const f  = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = ln - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Background is set via inline style per-slider; only appearance is set here.
/* eslint-disable no-restricted-syntax -- injected <style> for webkit slider thumb; colours cannot use Tailwind tokens here */
const SLIDER_CSS = `
.dev-slider{-webkit-appearance:none;appearance:none;height:6px;border-radius:9999px;
cursor:pointer;border:1px solid rgba(0,0,0,0.12);}
.dev-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:18px;height:18px;
border-radius:50%;background:#fff;border:2px solid #d1d1d6;cursor:grab;
box-shadow:0 1px 3px rgba(0,0,0,0.18);}
.dark .dev-slider::-webkit-slider-thumb{background:#3a3a3c;border-color:#636366;}
`;
/* eslint-enable no-restricted-syntax */

// ── DevMenu root ──────────────────────────────────────────────────────────────

type EditMode = 'light' | 'dark';
type Tab = 'colors' | 'shadows';

export function DevMenu() {
  const [mode, setMode] = useState<EditMode>(
    () => document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  );
  const [tab, setTab] = useState<Tab>(
    () => (localStorage.getItem('nutri.dev.tab') as Tab | null) ?? 'colors',
  );
  const [showExport, setShowExport] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showScanPreview, setShowScanPreview] = useState(false);
  const [scanPreviewItems, setScanPreviewItems] = useState<ResultItem[]>(DUMMY_SCAN_ITEMS_INITIAL);
  const [showPickerPlayground, setShowPickerPlayground] = useState(false);
  // Track original theme to restore on unmount
  const origDark = useRef(document.documentElement.classList.contains('dark'));

  function changeTab(t: Tab) {
    setTab(t);
    localStorage.setItem('nutri.dev.tab', t);
  }

  // Double-tapping the Account tab in the nav bar resets the tab to Colours
  // (mirrors how double-tap resets scroll position to top).
  useEffect(() => {
    const handler = () => {
      setTab('colors');
      localStorage.setItem('nutri.dev.tab', 'colors');
    };
    window.addEventListener('devmenu:reset-tab', handler);
    return () => window.removeEventListener('devmenu:reset-tab', handler);
  }, []);

  useEffect(() => {
    const wasDark = origDark.current; // capture at mount time; ref may change before cleanup runs
    return () => {
      // Restore original theme when dev menu unmounts (if user navigates away)
      document.documentElement.classList.toggle('dark', wasDark);
      document.documentElement.style.colorScheme = wasDark ? 'dark' : 'light';
      applyDevOverrides();
    };
  }, []);

  function switchMode(m: EditMode) {
    const dark = m === 'dark';
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    applyDevOverrides();
    setMode(m);
  }

  function handleReset() {
    resetDevOverrides(mode);
    // Force re-read by toggling mode in place
    setMode(m => { setTimeout(() => setMode(m), 0); return m === 'light' ? 'dark' : 'light'; });
    setTimeout(() => switchMode(mode), 10);
  }

  function handleExport() {
    const css = exportCss();
    if (!css) return;
    setShowExport(true);
  }

  function handleCopy(css: string) {
    void navigator.clipboard?.writeText(css).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const css = exportCss();

  return (
    <div>
      <style>{SLIDER_CSS}</style>

      {/* ── Profile switcher ───────────────────────────────────────────────── */}
      <ProfileSwitcher />

      {/* ── Flows ─────────────────────────────────────────────────────────── */}
      <FlowsSection />

      {/* ── Shortcuts ─────────────────────────────────────────────────────── */}
      <div className="mb-5 overflow-hidden rounded-control border border-border-subtle">
        <div className="bg-surface px-4 py-2.5 border-b border-border-subtle">
          <p className="text-micro font-semibold uppercase tracking-wider text-content-muted">Shortcuts</p>
        </div>
        <button
          type="button"
          onClick={() => { setScanPreviewItems(DUMMY_SCAN_ITEMS_INITIAL); setShowScanPreview(true); }}
          className="flex w-full items-center gap-3 bg-surface px-4 py-3 text-left active:bg-surface-sunken transition-colors"
        >
          <Icon name="scanFood" size={18} className="shrink-0 text-content-secondary" />
          <div>
            <p className="text-subhead font-medium text-content">Preview scan results</p>
            <p className="text-caption text-content-muted">Opens the scan results modal with dummy food items</p>
          </div>
          <Icon name="chevronRight" size={16} className="ml-auto shrink-0 text-content-muted" />
        </button>
      </div>

      {/* Scan results preview sheet */}
      {showScanPreview && (
        <Sheet
          title="Add food"
          titleIcon={<Icon name="scanFood" size={18} />}
          rightAction={
            <button
              type="button"
              onClick={() => { setScanPreviewItems(DUMMY_SCAN_ITEMS_INITIAL); }}
              className="-m-1 p-1 text-content-secondary active:opacity-70"
              aria-label="Reset items"
            >
              <Icon name="retakePhoto" size={22} />
            </button>
          }
          forceExpanded
          onClose={() => setShowScanPreview(false)}
        >
          <ScanResults
            items={scanPreviewItems}
            onChange={setScanPreviewItems}
            onLog={async () => { setShowScanPreview(false); }}
            scanPhoto={DUMMY_SCAN_PHOTO}
          />
        </Sheet>
      )}

      {/* ── Native pickers ────────────────────────────────────────────────── */}
      <div className="mb-5 overflow-hidden rounded-control border border-border-subtle">
        <div className="bg-surface px-4 py-2.5 border-b border-border-subtle">
          <p className="text-micro font-semibold uppercase tracking-wider text-content-muted">Native pickers</p>
        </div>
        <button
          type="button"
          onClick={() => setShowPickerPlayground(true)}
          className="flex w-full items-center gap-3 bg-surface px-4 py-3 text-left active:bg-surface-sunken transition-colors"
        >
          <Icon name="edit" size={18} className="shrink-0 text-content-secondary" />
          <div>
            <p className="text-subhead font-medium text-content">Picker playground</p>
            <p className="text-caption text-content-muted">Compare input types for number entry on device</p>
          </div>
          <Icon name="chevronRight" size={16} className="ml-auto shrink-0 text-content-muted" />
        </button>
      </div>

      {showPickerPlayground && (
        <Sheet title="Picker playground" onClose={() => setShowPickerPlayground(false)} forceExpanded>
          <PickerPlayground />
        </Sheet>
      )}

      {/* Mode toggle */}
      <div className="mb-4">
        <SegmentedControl<EditMode>
          value={mode}
          onChange={switchMode}
          options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
        />
      </div>

      {/* Tab bar */}
      <div className="-mx-4 mb-4 flex border-b border-border-subtle px-4">
        {(['colors', 'shadows'] as Tab[]).map(t => (
          <button key={t} onClick={() => changeTab(t)}
            className={`mr-4 pb-2 text-subhead capitalize transition-colors ${
              tab === t
                ? 'border-b-2 border-accent -mb-px font-semibold text-content'
                : 'text-content-secondary'
            }`}>
            {t === 'colors' ? 'Colours' : 'Shadows'}
          </button>
        ))}
      </div>

      {/* Content — key forces remount when mode changes so local state re-reads */}
      {tab === 'colors'  && <ColorsTab  key={`c-${mode}`} mode={mode} />}
      {tab === 'shadows' && <ShadowsTab key={`s-${mode}`} mode={mode} />}

      {/* Footer */}
      <div className="mt-5 flex gap-2">
        <Button variant="outline" size="sm" onClick={handleReset}>Reset {mode}</Button>
        {css && (
          <Button variant="subtle" size="sm" onClick={handleExport}>Export CSS</Button>
        )}
      </div>

      {/* Export sheet */}
      {showExport && (
        <Sheet title="Export CSS" onClose={() => setShowExport(false)}>
          <pre className="overflow-x-auto rounded-control bg-surface-sunken p-3 text-label font-mono text-content-secondary whitespace-pre-wrap break-all">
            {css}
          </pre>
          <div className="mt-3">
            <Button size="lg" onClick={() => handleCopy(css)}>
              {copied ? '✓ Copied!' : 'Copy to clipboard'}
            </Button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

// ── Picker playground ─────────────────────────────────────────────────────────

/** Numeric range array from start to end (inclusive), step by, toFixed(decimals). */
function numRange(start: number, end: number, by: number, decimals = 0): string[] {
  const out: string[] = [];
  for (let v = start; v <= end + 1e-9; v = Math.round((v + by) * 1e6) / 1e6) {
    out.push(v.toFixed(decimals));
  }
  return out;
}

function PickerRow({ label, description, children }: {
  label: string; description: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-control border border-border-subtle bg-surface overflow-hidden">
      <div className="px-4 pt-3 pb-2">
        <p className="text-subhead font-semibold text-content">{label}</p>
        <p className="text-caption text-content-muted mt-0.5">{description}</p>
      </div>
      <div className="px-4 pb-4 pt-1">{children}</div>
    </div>
  );
}

function PickerPlayground() {
  const [numVal,     setNumVal]     = useState('69.2');
  const [telVal,     setTelVal]     = useState('69.2');
  const [selectVal,  setSelectVal]  = useState('69.2');
  const [splitWhole, setSplitWhole] = useState('69');
  const [splitDec,   setSplitDec]   = useState('2');
  const [rangeVal,   setRangeVal]   = useState('69');

  const wholeKg  = numRange(30, 200, 1);
  const decDigits = ['0','1','2','3','4','5','6','7','8','9'];
  const allKg    = numRange(30, 200, 0.1, 1);

  const inputCls  = 'w-full rounded-field border border-border-field bg-surface px-3 py-2.5 text-subhead font-semibold text-content outline-none focus:border-accent';
  const selectCls = inputCls + ' appearance-none';

  return (
    <div className="space-y-3 pb-4">
      <p className="text-caption text-content-muted">
        Tap each field on device to compare the keyboard / picker it triggers. All start at 69.2 kg.
      </p>

      <PickerRow label="1 · number + inputMode=decimal" description="Current approach — decimal keyboard on iOS.">
        <input type="number" inputMode="decimal" value={numVal} onChange={e => setNumVal(e.target.value)} className={inputCls} />
        <p className="mt-1.5 text-caption text-content-muted">Value: {numVal}</p>
      </PickerRow>

      <PickerRow label="2 · type=tel" description="Phone keypad — digits + * # only. No decimal on some devices.">
        <input type="tel" value={telVal} onChange={e => setTelVal(e.target.value)} className={inputCls} />
        <p className="mt-1.5 text-caption text-content-muted">Value: {telVal}</p>
      </PickerRow>

      <PickerRow label="3 · select — single wheel" description="Native iOS drum-roll. 30–200 kg in 0.1 steps.">
        <select value={selectVal} onChange={e => setSelectVal(e.target.value)} className={selectCls}>
          {allKg.map(v => <option key={v} value={v}>{v} kg</option>)}
        </select>
        <p className="mt-1.5 text-caption text-content-muted">Value: {selectVal}</p>
      </PickerRow>

      <PickerRow label="4 · split select — two wheels" description="Whole kg + decimal as separate drum-roll pickers.">
        <div className="flex items-center gap-2">
          <select value={splitWhole} onChange={e => setSplitWhole(e.target.value)} className={selectCls}>
            {wholeKg.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <span className="text-subhead font-semibold text-content">.</span>
          <select value={splitDec} onChange={e => setSplitDec(e.target.value)} className={selectCls + ' w-20'}>
            {decDigits.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <span className="shrink-0 text-subhead font-semibold text-content-secondary">kg</span>
        </div>
        <p className="mt-1.5 text-caption text-content-muted">Value: {splitWhole}.{splitDec} kg</p>
      </PickerRow>

      <PickerRow label="5 · range slider" description="Horizontal slider, 30–200 kg in 0.1 steps.">
        <input type="range" min={30} max={200} step={0.1} value={rangeVal} onChange={e => setRangeVal(e.target.value)} className="w-full" />
        <p className="mt-1.5 text-caption text-content-muted">Value: {Number(rangeVal).toFixed(1)} kg</p>
      </PickerRow>
    </div>
  );
}

// ── Flows section ─────────────────────────────────────────────────────────────

function FlowsSection() {
  const navigate  = useNavigate();
  const isTest    = activeProfile === TEST_PROFILE;
  const [running, setRunning] = useState<string | null>(null);

  async function runGoalState(id: GoalStateId) {
    setRunning(id);
    try {
      await applyGoalState(id);
      navigate('/goal');
    } finally {
      setRunning(null);
    }
  }

  return (
    <>
      {/* Screens */}
      <div className="mb-5 overflow-hidden rounded-control border border-border-subtle">
        <div className="bg-surface px-4 py-2.5 border-b border-border-subtle">
          <p className="text-micro font-semibold uppercase tracking-wider text-content-muted">Screens</p>
        </div>
        {SCREEN_ROWS.map((row, idx) => (
          <button
            key={row.id}
            type="button"
            onClick={() => navigate(row.path)}
            className={`flex w-full items-center gap-3 bg-surface px-4 py-3 text-left active:bg-surface-sunken transition-colors${
              idx < SCREEN_ROWS.length - 1 ? ' border-b border-border-subtle' : ''
            }`}
          >
            <Icon name={row.icon} size={18} className="shrink-0 text-content-secondary" />
            <div className="min-w-0">
              <p className="text-subhead font-medium text-content">{row.label}</p>
              <p className="text-caption text-content-muted">{row.desc}</p>
            </div>
            <Icon name="chevronRight" size={16} className="ml-auto shrink-0 text-content-muted" />
          </button>
        ))}
      </div>

      {/* Goal states */}
      <div className="mb-5 overflow-hidden rounded-control border border-border-subtle">
        <div className="flex items-center justify-between bg-surface px-4 py-2.5 border-b border-border-subtle">
          <p className="text-micro font-semibold uppercase tracking-wider text-content-muted">Goal states</p>
          {!isTest && (
            <span className="text-caption text-content-muted">test account only</span>
          )}
        </div>
        {!isTest ? (
          <div className="bg-surface-sunken px-4 py-3">
            <p className="text-caption text-content-muted">
              Switch to the test account to simulate goal states without touching your real data.
            </p>
          </div>
        ) : (
          GOAL_STATE_ROWS.map((row, idx) => (
            <button
              key={row.id}
              type="button"
              onClick={() => runGoalState(row.id)}
              disabled={running !== null}
              className={`flex w-full items-center gap-3 bg-surface px-4 py-3 text-left active:bg-surface-sunken transition-colors disabled:opacity-50${
                idx < GOAL_STATE_ROWS.length - 1 ? ' border-b border-border-subtle' : ''
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-subhead font-medium text-content">{row.label}</p>
                  {row.badge && (
                    <span className="rounded-pill border border-border-subtle bg-surface-sunken px-2 py-0.5 text-micro text-content-muted">
                      {row.badge}
                    </span>
                  )}
                </div>
                <p className="text-caption text-content-muted">{row.desc}</p>
              </div>
              {running === row.id
                ? <span className="ml-auto shrink-0 text-caption text-content-muted">•••</span>
                : <Icon name="chevronRight" size={16} className="ml-auto shrink-0 text-content-muted" />
              }
            </button>
          ))
        )}
      </div>
    </>
  );
}

// ── Profile switcher ──────────────────────────────────────────────────────────

function ProfileSwitcher() {
  const isTest = activeProfile === TEST_PROFILE;

  function switchProfile(target: string) {
    localStorage.setItem(PROFILE_KEY, target);
    window.location.reload();
  }

  async function resetTestAccount() {
    const { Dexie } = await import('dexie');
    await Dexie.delete(DB_NAMES[TEST_PROFILE]);
    // If we're currently on the test profile, reload so the fresh DB is created.
    if (isTest) window.location.reload();
  }

  return (
    <div className="mb-5 overflow-hidden rounded-control border border-border-subtle">
      <div className="flex items-center justify-between bg-surface px-4 py-3">
        <div>
          <p className="text-subhead font-semibold text-content">
            {isTest ? '🧪 Test account' : '👤 Your account'}
          </p>
          <p className="text-caption text-content-muted mt-0.5">
            {isTest ? 'Isolated database — your real data is safe' : 'Live data · nutrition-goal-tracker'}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-border-subtle bg-surface-sunken px-4 py-3">
        {isTest ? (
          <>
            <Button size="sm" variant="outline" onClick={() => switchProfile(REAL_PROFILE)}>
              Switch to your account
            </Button>
            <Button size="sm" variant="subtle" onClick={resetTestAccount}>
              Reset test data
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => switchProfile(TEST_PROFILE)}>
            Switch to test account
          </Button>
        )}
        <Button size="sm" variant="subtle" onClick={async () => {
          if (isTest) {
            // Test profile: wipe everything — complete fresh start.
            const { Dexie } = await import('dexie');
            await Dexie.delete(DB_NAMES[TEST_PROFILE]);
          } else {
            // Real profile: abandon goals so replayed onboarding starts clean.
            const allGoals = await repos.goals.getAll();
            for (const g of allGoals) await repos.goals.put({ ...g, status: 'abandoned' as GoalStatus });
          }
          resetOnboarding();
          window.location.hash = '/onboarding';
          window.location.reload();
        }}>
          Reset + replay onboarding
        </Button>
      </div>
    </div>
  );
}

// ── Colours tab ───────────────────────────────────────────────────────────────

function ColorsTab({ mode }: { mode: EditMode }) {
  return (
    <div className="space-y-5">
      {COLOR_GROUPS.map(({ group, tokens }) => (
        <div key={group}>
          <p className="mb-1.5 text-micro font-semibold uppercase tracking-wider text-content-muted">{group}</p>
          <div className="overflow-hidden rounded-control border border-border-subtle">
            {tokens.map((t, idx) => (
              <ColorRow
                key={t.name}
                tokenName={t.name}
                label={t.label}
                mode={mode}
                isLast={idx === tokens.length - 1}
                onChanged={() => {}}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ColorRow({ tokenName, label, mode, isLast, onChanged }: {
  tokenName: string; label: string; mode: EditMode;
  isLast: boolean; hasOverride?: boolean; onChanged: () => void;
}) {
  const resolved = resolveColorToken(tokenName);
  const { hex: initHex, alpha: initAlpha } = parseColor(resolved);
  const [hex,         setHex]         = useState(initHex);
  const [alpha,       setAlpha]       = useState(initAlpha);
  const [hasOverride, setHasOverride] = useState(() => tokenName in loadDevOverrides()[mode]);

  function handleHexChange(h: string) {
    setHex(h);
    if (/^#[0-9a-fA-F]{6}$/.test(h)) {
      setHasOverride(true);
      setTokenOverride(tokenName, toColorString(h, alpha), mode);
      onChanged();
    }
  }

  function handleAlphaChange(a: number) {
    setAlpha(a);
    setHasOverride(true);
    const h = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : initHex;
    setTokenOverride(tokenName, toColorString(h, a), mode);
    onChanged();
  }

  function clearOverride() {
    setHasOverride(false);
    clearTokenOverride(tokenName, mode);
    const fresh = resolveColorToken(tokenName);
    const { hex: h, alpha: a } = parseColor(fresh);
    setHex(h); setAlpha(a);
    onChanged();
  }

  return (
    <div className={`bg-surface px-4 py-3 ${!isLast ? 'border-b border-border-subtle' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="mt-1.5 shrink-0 text-subhead text-content-secondary">{label}</span>
        <div className="flex flex-col items-end gap-1">
          <InlineColorPicker hex={hex} alpha={alpha} onHexChange={handleHexChange} onAlphaChange={handleAlphaChange} />
          {hasOverride && (
            <button onClick={clearOverride} className="text-caption text-danger">
              Reset ↩
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Shadows tab ───────────────────────────────────────────────────────────────

function ShadowsTab({ mode }: { mode: EditMode }) {
  return (
    <div className="space-y-6">
      {SHADOW_DEFS.map(def => (
        <ShadowEditor key={def.name} def={def} mode={mode} />
      ))}
    </div>
  );
}

function ShadowEditor({ def, mode }: { def: { name: string; label: string }; mode: EditMode }) {
  const [layers, setLayers] = useState<ShadowLayer[]>(() =>
    splitLayers(readRawToken(def.name)).map(parseLayer),
  );
  const [hasOverride, setHasOverride] = useState(() => def.name in loadDevOverrides()[mode]);

  function applyLayers(next: ShadowLayer[]) {
    setLayers(next);
    setHasOverride(true);
    setTokenOverride(def.name, next.map(serializeLayer).join(', '), mode);
  }

  function clearOverride() {
    clearTokenOverride(def.name, mode);
    setHasOverride(false);
    setLayers(splitLayers(readRawToken(def.name)).map(parseLayer));
  }

  function update(idx: number, patch: Partial<ShadowLayer>) {
    applyLayers(layers.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function addLayer() {
    // eslint-disable-next-line no-restricted-syntax -- default hex for new shadow layer, not a UI colour
    applyLayers([...layers, { x: 0, y: 4, blur: 8, spread: 0, hex: '#000000', alpha: 10, inset: false }]);
  }

  function removeLayer(idx: number) {
    applyLayers(layers.filter((_, i) => i !== idx));
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-micro font-semibold uppercase tracking-wider text-content-muted">{def.label}</p>
        {hasOverride && (
          <button onClick={clearOverride} className="text-caption text-danger">
            Reset ↩
          </button>
        )}
      </div>
      <div className="space-y-2">
        {layers.map((layer, idx) => (
          <ShadowLayerCard
            key={idx}
            layer={layer}
            index={idx}
            isOnly={layers.length === 1}
            onUpdate={p => update(idx, p)}
            onRemove={() => removeLayer(idx)}
          />
        ))}
        <button onClick={addLayer}
          className="flex w-full items-center justify-center gap-2 rounded-control border border-border-field py-2 text-subhead text-content-secondary active:bg-surface-sunken transition-colors">
          <Icon name="addSmall" size={16} />
          Add layer
        </button>
      </div>
    </div>
  );
}

function ShadowLayerCard({ layer, index, isOnly, onUpdate, onRemove }: {
  layer: ShadowLayer; index: number; isOnly: boolean;
  onUpdate: (p: Partial<ShadowLayer>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-control border border-border-subtle">
      {/* Layer header */}
      <div className="flex items-center justify-between border-b border-border-subtle bg-surface-sunken px-4 py-2">
        <span className="text-label font-medium text-content-secondary">Layer {index + 1}</span>
        {!isOnly && (
          <button onClick={onRemove} className="text-content-muted active:text-danger">
            <Icon name="close" size={14} strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* Position */}
      <ShadowField label="Position">
        <div className="flex gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-label text-content-muted">X</span>
            <input type="number" value={layer.x} onChange={e => onUpdate({ x: Number(e.target.value) })} className={`${inputCls} w-14`} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-label text-content-muted">Y</span>
            <input type="number" value={layer.y} onChange={e => onUpdate({ y: Number(e.target.value) })} className={`${inputCls} w-14`} />
          </div>
        </div>
      </ShadowField>

      {/* Blur */}
      <ShadowField label="Blur">
        <input type="number" min={0} value={layer.blur}
          onChange={e => onUpdate({ blur: Math.max(0, Number(e.target.value)) })}
          className={`${inputCls} w-20`} />
      </ShadowField>

      {/* Spread */}
      <ShadowField label="Spread">
        <input type="number" value={layer.spread}
          onChange={e => onUpdate({ spread: Number(e.target.value) })}
          className={`${inputCls} w-20`} />
      </ShadowField>

      {/* Color */}
      <ShadowField label="Color" isLast>
        <InlineColorPicker
          hex={layer.hex}
          alpha={layer.alpha}
          onHexChange={h => { if (/^#[0-9a-fA-F]{6}$/.test(h)) onUpdate({ hex: h }); }}
          onAlphaChange={a => onUpdate({ alpha: a })}
        />
      </ShadowField>
    </div>
  );
}

function ShadowField({ label, children, isLast }: { label: string; children: ReactNode; isLast?: boolean }) {
  return (
    <div className={`flex items-center justify-between bg-surface px-4 py-2.5 ${isLast ? '' : 'border-b border-border-subtle'}`}>
      <span className="text-subhead text-content-secondary">{label}</span>
      {children}
    </div>
  );
}

// ── Inline color picker (swatch + native picker + hex field + brightness slider) ─

function InlineColorPicker({ hex, alpha, onHexChange, onAlphaChange }: {
  hex: string;
  alpha: number;
  onHexChange: (hex: string) => void;
  onAlphaChange: (a: number) => void;
}) {
  // Local state for the text field so user can type partial values.
  const [textHex, setTextHex] = useState(hex);

  // Sync text field when parent's (valid) hex changes externally.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync display field when hex prop changes (e.g. Reset clears override)
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) setTextHex(hex);
  }, [hex]);

  const isValid    = /^#[0-9a-fA-F]{6}$/.test(hex);
  // eslint-disable-next-line no-restricted-syntax -- colour-math fallback for invalid hex, not a UI colour
  const hsl        = hexToHsl(isValid ? hex : '#808080');
  // Slider: 0 = white (left / bright), 100 = black (right / dark)
  const brightness = 100 - hsl.l;
  const sliderBg   = `linear-gradient(to right, hsl(${hsl.h},${hsl.s}%,100%), hsl(${hsl.h},${hsl.s}%,50%), hsl(${hsl.h},${hsl.s}%,0%))`;
  // eslint-disable-next-line no-restricted-syntax -- colour-math fallback for invalid hex, not a UI colour
  const displayColor = isValid ? toColorString(hex, alpha) : '#808080';

  function onNativeColor(e: React.ChangeEvent<HTMLInputElement>) {
    onHexChange(e.target.value);
  }

  function onHexText(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setTextHex(v);
    if (/^#[0-9a-fA-F]{6}$/.test(v)) onHexChange(v);
  }

  function onBrightness(e: React.ChangeEvent<HTMLInputElement>) {
    const newL = 100 - Number(e.target.value);
    onHexChange(hslToHex(hsl.h, hsl.s, newL));
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        {/* Native colour picker hidden behind swatch */}
        <label className="relative h-6 w-6 shrink-0 cursor-pointer">
          <div className="absolute inset-0 rounded-full border border-border-field shadow-sm"
            style={{ background: displayColor }} />
          <input
            type="color"
            // eslint-disable-next-line no-restricted-syntax -- input value for native colour picker, not a UI colour
            value={isValid ? hex : '#000000'}
            onChange={onNativeColor}
            style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
          />
        </label>
        {/* Hex text field */}
        <input
          type="text"
          value={textHex}
          onChange={onHexText}
          // eslint-disable-next-line no-restricted-syntax -- placeholder text for hex input, not a UI colour
          placeholder="#000000"
          className={`${inputCls} w-20 font-mono`}
        />
        {/* Alpha */}
        <input
          type="number"
          value={alpha}
          min={0}
          max={100}
          onChange={e => onAlphaChange(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
          className={`${inputCls} w-10`}
        />
        <span className="text-label text-content-muted">%</span>
      </div>
      {/* Brightness slider: white (left) → pure hue → black (right) */}
      <input
        type="range"
        min={0}
        max={100}
        value={brightness}
        onChange={onBrightness}
        className="dev-slider w-full"
        style={{ background: sliderBg }}
      />
    </div>
  );
}
