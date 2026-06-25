import { WheelPicker } from '../kit';
import { useEffect, useMemo, useState } from 'react';
import { useLive } from '../../state/live';
import { useNavigate } from 'react-router-dom';
import { repos } from '../../state/repos';
import { exportAsJson } from '../../data/exportJson';
import { Card, SectionLabel, Badge, SegmentedControl, Button, LabeledInput, Sheet, ListRow, Skeleton, Icon } from '../kit';
import { displayWeight } from '../../domain/units';
import { getThemePref, setThemePref, type ThemePref } from '../../lib/theme';
import { hapticLight, getHapticsPref, setHapticsPref } from '../../lib/haptics';
import { getWithingsService, type WithingsStatus } from '../../data/withings';
import { DevMenu } from '../components/DevMenu';
import { mifflinStJeorBMR, canComputeBmr } from '../../domain/bmr';
import { currentWeightKg } from '../../domain/goal';
import type { User, Sex, Units, Goal } from '../../domain/types'; // Goal used in sub-components


export function AccountScreen() {
  const nav = useNavigate();
  const [editingProfile, setEditingProfile] = useState(false);
  const [managingGoal, setManagingGoal] = useState(false);
  const [showBmrInfo, setShowBmrInfo] = useState(false);
  const [editingProtein, setEditingProtein] = useState(false);
  const data = useLive(async () => {
    const [user, goal, weights] = await Promise.all([
      repos.user.get(), repos.goals.getActive(), repos.weights.all(),
    ]);
    return { user, goal, weightKg: currentWeightKg(weights) };
  }, []);

  if (!data?.user) return (
    <div className="space-y-3 p-4" aria-busy>
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
  const { user, goal, weightKg } = data;

  return (
    <div className="px-6 pb-6">
      <h1 className="pt-4 text-title font-semibold">Account</h1>

      <SectionLabel>Profile</SectionLabel>
      <Card padded={false} className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <ProfileRow label="Height" value={user.heightCm > 0 ? `${user.heightCm} cm` : 'Not set'} />
            <ProfileRow label="Age" value={user.age != null ? `${user.age}` : 'Not set'} />
            <ProfileRow label="Sex" value={user.sex ? cap(user.sex) : 'Not set'} />
            <ProfileRow label="Units" value={user.units} />
          </div>
          <Button variant="subtle" size="xs" fullWidth={false} onClick={() => setEditingProfile(true)}>Edit</Button>
        </div>
      </Card>

      <SectionLabel>Energy</SectionLabel>
      <Card padded={false} className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-label font-medium text-content-secondary">BMR (resting burn)</p>
            <p className="text-title font-semibold">
              {user.bmr > 0
                ? <>{user.bmr} <span className="text-subhead font-normal text-content-secondary">kcal / day</span></>
                : <span className="text-content-muted">—</span>}
            </p>
            {user.bmr <= 0 && (
              <p className="mt-1 text-caption text-content-secondary">
                Set height, age &amp; sex in your profile to enable auto-calculation.
              </p>
            )}
          </div>
          <button onClick={() => setShowBmrInfo(true)} className="shrink-0 p-1 text-content-muted active:opacity-70" aria-label="BMR info">
            <Icon name="info" size={20} strokeWidth={1.75} />
          </button>
        </div>
      </Card>

      <SectionLabel>Goal</SectionLabel>
      <Card padded={false} className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold">{goal?.name ?? 'No active goal'}</p>
            {goal && <p className="text-label text-content-secondary">Active · lose {displayWeight(goal.startWeightKg - goal.targetWeightKg, user.units ?? 'kg')}</p>}
          </div>
          {goal ? (
            <Button variant="subtle" size="xs" fullWidth={false} onClick={() => setManagingGoal(true)}>Manage</Button>
          ) : (
            <Button variant="subtle" size="xs" fullWidth={false} onClick={() => nav('/goal-setup')}>Set</Button>
          )}
        </div>
        {/* Protein target sub-section */}
        <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3">
          <div>
            <p className="text-label font-medium text-content-secondary">Daily protein target</p>
            <p className="text-subhead font-semibold">
              {user.proteinGoalG ? `${user.proteinGoalG} g` : <span className="text-content-muted">Not set</span>}
            </p>
          </div>
          <Button variant="subtle" size="xs" fullWidth={false} onClick={() => setEditingProtein(true)}>
            {user.proteinGoalG ? 'Edit' : 'Set'}
          </Button>
        </div>
      </Card>
      {!goal && (
        <button onClick={() => nav('/goal-setup')} className="mt-2 w-full rounded-control border border-border-subtle py-3 text-subhead font-medium text-content-secondary">+ Set a goal</button>
      )}
      {goal && (
        <button onClick={() => nav('/goal-setup?new=true')} className="mt-2 w-full rounded-control border border-border-subtle py-3 text-subhead font-medium text-content-secondary">+ Start a new goal</button>
      )}

      <SectionLabel>Connections</SectionLabel>
      <WithingsCard />

      <SectionLabel>Tracking</SectionLabel>
      <WeightCadenceCard user={user} />
      {goal?.macroStyle && (
        <div className="mt-2">
          <MacroDiaryCard goal={goal} />
        </div>
      )}

      <SectionLabel>Appearance</SectionLabel>
      <AppearanceCard />

      <SectionLabel>Data</SectionLabel>
      <Card padded={false} className="overflow-hidden">
        <ListRow title="Export all data (JSON)" chevron onClick={() => exportAsJson(repos)} />
      </Card>

      <SectionLabel>Developer</SectionLabel>
      <Card padded={false} className="p-4">
        <DevMenu />
      </Card>

      <p className="mt-8 text-center text-micro text-content-muted">v0.1.0</p>

      {editingProfile && <ProfileSheet user={user} currentWeightKg={weightKg} onClose={() => setEditingProfile(false)} />}
      {managingGoal && goal && <GoalManageSheet goal={goal} onClose={() => setManagingGoal(false)} onNavigate={(path) => { setManagingGoal(false); nav(path); }} />}
      {showBmrInfo && <BmrInfoSheet onClose={() => setShowBmrInfo(false)} />}
      {editingProtein && <ProteinGoalSheet current={user.proteinGoalG} onClose={() => setEditingProtein(false)} />}
    </div>
  );
}

function ProfileSheet({ user, currentWeightKg: weightKg, onClose }: { user: User; currentWeightKg: number | null; onClose: () => void }) {
  const [height, setHeight] = useState(String(user.heightCm));
  const [age, setAge] = useState(user.age != null ? String(user.age) : '');
  const [sex, setSex] = useState<Sex | undefined>(user.sex);
  const [units, setUnits] = useState<Units>(user.units ?? 'kg');
  async function save() {
    const heightCm = Number(height) || user.heightCm;
    const ageNum   = age ? Number(age) : undefined;
    const wKg      = weightKg ?? (user.heightCm > 0 ? user.bmr : 0); // use current weight if available
    const newBmr   = (heightCm > 0 && ageNum && sex && weightKg)
      ? (canComputeBmr({ weightKg, heightCm, age: ageNum, sex })
          ? mifflinStJeorBMR({ weightKg, heightCm, age: ageNum, sex })
          : user.bmr)
      : user.bmr;
    void wKg; // suppress unused warning when weightKg is null
    await repos.user.save({
      ...user,
      heightCm,
      age: ageNum,
      sex,
      units,
      bmr: newBmr,
    });
    onClose();
  }
  return (
    <Sheet title="Edit profile" onClose={onClose} forceExpanded footer={<Button size="lg" onClick={save}>Save profile</Button>}>
      <div className="space-y-3 pb-2">
        <WheelPicker label="Height (cm)" value={height} onChange={setHeight} min={100} max={250} step={1} unit="cm" centerAt={170} />
        <WheelPicker label="Age" value={age} onChange={setAge} min={10} max={100} step={1} centerAt={30} />
        <div>
          <span className="text-subhead font-normal text-content-secondary">Sex</span>
          <div className="mt-1">
            <SegmentedControl<Sex>
              value={(sex ?? '') as Sex}
              onChange={setSex}
              options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]}
            />
          </div>
        </div>
        <div>
          <span className="text-subhead font-normal text-content-secondary">Units</span>
          <div className="mt-1">
            <SegmentedControl<Units>
              value={units}
              onChange={setUnits}
              options={[{ value: 'kg', label: 'kg' }, { value: 'lbs', label: 'lbs' }]}
            />
          </div>
        </div>
      </div>
    </Sheet>
  );
}

function ProteinGoalSheet({ current, onClose }: { current?: number; onClose: () => void }) {
  const [val, setVal] = useState(current ? String(current) : '');
  async function save() {
    const user = await repos.user.get();
    if (user) {
      await repos.user.save({ ...user, proteinGoalG: val ? (Number(val) || undefined) : undefined });
    }
    onClose();
  }
  return (
    <Sheet title="Daily protein target" onClose={onClose} forceExpanded footer={<Button size="lg" onClick={save}>Save</Button>}>
      <div className="space-y-3 pb-2">
        <LabeledInput
          label="Target (g / day)"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          inputMode="numeric"
          placeholder="e.g. 120"
        />
        <p className="text-caption text-content-secondary">
          When set, your Diary shows a protein progress bar tracking grams consumed each day.
          Leave blank to remove the target.
        </p>
      </div>
    </Sheet>
  );
}

function BmrInfoSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="About BMR" onClose={onClose}>
      <div className="space-y-3 text-subhead text-content-secondary">
        <p>Your <strong className="text-content">Basal Metabolic Rate (BMR)</strong> is the number of calories your body burns at rest — just to keep you alive.</p>
        <p>It is calculated automatically using the <strong className="text-content">Mifflin–St Jeor formula</strong> from your current weight, height, age, and sex. It updates every time you log a new weight.</p>
        <p>Active calories (e.g. from exercise) are added on top of your BMR to get your total daily burn.</p>
        <p className="text-caption text-content-muted">Make sure your height, age, and sex are set in your profile to enable auto-calculation.</p>
      </div>
    </Sheet>
  );
}

const THEME_OPTS: { id: ThemePref; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

function AppearanceCard() {
  const [pref, setPref] = useState<ThemePref>(getThemePref());
  const [hapticsOn, setHapticsOn] = useState(getHapticsPref());
  function pick(p: ThemePref) { setPref(p); setThemePref(p); }
  function toggleHaptics() {
    const next = !hapticsOn;
    setHapticsOn(next);
    setHapticsPref(next);
    // Confirm with a haptic bump when turning ON so the user feels the change.
    if (next) hapticLight();
  }
  return (
    <Card padded={false} className="p-4">
      <p className="mb-2 text-label font-medium text-content-secondary">Theme</p>
      <SegmentedControl<ThemePref>
        value={pref}
        onChange={pick}
        options={THEME_OPTS.map((o) => ({ value: o.id, label: o.label }))}
      />
      <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3">
        <div>
          <p className="text-subhead font-medium">Haptic feedback</p>
          <p className="text-label text-content-secondary">Vibration on taps and interactions</p>
        </div>
        <button
          role="switch"
          aria-checked={hapticsOn}
          onClick={toggleHaptics}
          style={{
            position: 'relative',
            flexShrink: 0,
            overflow: 'hidden',
            height: 31,
            width: 51,
            borderRadius: 9999,
            transition: 'background-color 200ms',
            backgroundColor: hapticsOn ? 'var(--color-accent)' : 'var(--color-border-strong)',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 2,
              left: 2,
              width: 27,
              height: 27,
              borderRadius: '50%',
              backgroundColor: 'white',
              // eslint-disable-next-line no-restricted-syntax -- toggle thumb always needs a dark shadow against its white background
              boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
              transition: 'transform 200ms',
              transform: `translateX(${hapticsOn ? 20 : 0}px)`,
            }}
          />
        </button>
      </div>
    </Card>
  );
}

function WithingsCard() {
  // repos is a module-level singleton, so this memo only evaluates once.
  const svc = useMemo(() => getWithingsService(repos), []);
  const [status, setStatus] = useState<WithingsStatus | null>(null);
  const [busy, setBusy] = useState<null | 'connect' | 'sync' | 'disconnect'>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => { svc.getStatus().then(setStatus); }, []); // eslint-disable-line

  async function connect() {
    setBusy('connect'); setNote(null);
    setStatus(await svc.connect());
    // Pull data straight away so the connection feels useful.
    const r = await svc.sync();
    setStatus(r.status);
    setNote(r.added > 0 ? `Synced ${r.added} weigh-in${r.added === 1 ? '' : 's'}.` : 'Up to date.');
    setBusy(null);
  }
  async function sync() {
    setBusy('sync'); setNote(null);
    const r = await svc.sync();
    setStatus(r.status);
    setNote(r.added > 0 ? `Synced ${r.added} new weigh-in${r.added === 1 ? '' : 's'}.` : 'Already up to date.');
    setBusy(null);
  }
  async function disconnect() {
    setBusy('disconnect'); setNote(null);
    setStatus(await svc.disconnect());
    setBusy(null);
  }

  const connected = !!status?.connected;
  return (
    <Card padded={false} className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-subhead font-medium">Withings</p>
            <Badge status="neutral">Preview</Badge>
          </div>
          <p className="mt-0.5 text-label text-content-secondary">
            {connected
              ? `Connected${status?.account ? ` · ${status.account}` : ''}`
              : 'Sync weight automatically from your scale.'}
          </p>
        </div>
        <span role="img" aria-label={connected ? 'Connected' : 'Not connected'}
          className={`mt-0.5 h-2.5 w-2.5 rounded-pill ${connected ? 'bg-success' : 'bg-border-strong'}`} />
      </div>

      {!connected ? (
        <Button size="sm" className="mt-3" onClick={connect} disabled={busy != null}>
          {busy === 'connect' ? 'Connecting…' : 'Connect Withings'}
        </Button>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button size="sm" fullWidth={false} className="flex-1" onClick={sync} disabled={busy != null}>
            {busy === 'sync' ? 'Syncing…' : 'Sync now'}
          </Button>
          <Button variant="outline" size="sm" fullWidth={false} onClick={disconnect} disabled={busy != null}>
            Disconnect
          </Button>
        </div>
      )}

      {note && <p className="mt-2 text-label text-content-secondary">{note}</p>}
    </Card>
  );
}

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function WeightCadenceCard({ user }: { user: User }) {
  const [cadence, setCadence] = useState<'daily' | 'weekly'>(user.weightCadence ?? 'weekly');
  const [day, setDay] = useState<number>(user.weeklyWeightDay ?? 0);

  async function saveCadence(next: 'daily' | 'weekly') {
    setCadence(next);
    const u = await repos.user.get();
    if (u) await repos.user.save({ ...u, weightCadence: next, weeklyWeightDay: day });
  }

  async function saveDay(nextDay: number) {
    setDay(nextDay);
    const u = await repos.user.get();
    if (u) await repos.user.save({ ...u, weightCadence: cadence, weeklyWeightDay: nextDay });
  }

  return (
    <Card padded={false} className="p-4">
      <p className="mb-2 text-label font-medium text-content-secondary">Weigh-in frequency</p>
      <SegmentedControl<'daily' | 'weekly'>
        value={cadence}
        onChange={saveCadence}
        options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }]}
      />
      {cadence === 'weekly' && (
        <div className="mt-3">
          <p className="mb-2 text-label text-content-secondary">Which day?</p>
          <div className="flex gap-1.5" role="group" aria-label="Day of week">
            {DOW_LABELS.map((label, i) => (
              <button
                key={i}
                onClick={() => void saveDay(i)}
                aria-pressed={day === i}
                className={[
                  'flex-1 rounded-control py-1.5 text-caption font-medium transition-colors',
                  day === i
                    ? 'bg-accent text-on-accent'
                    : 'bg-surface-sunken text-content-secondary active:opacity-70',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="mt-3 text-caption text-content-secondary">
        {cadence === 'daily'
          ? "You'll see a weight reminder each evening until you log."
          : `You'll see a weight reminder on ${DOW_LABELS[day]}s.`}
      </p>
    </Card>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-14 text-label font-medium text-content-secondary">{label}</span>
      <span className="text-subhead font-semibold">{value}</span>
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function GoalManageSheet({ goal, onClose, onNavigate }: { goal: Goal; onClose: () => void; onNavigate: (path: string) => void }) {
  const [busy, setBusy] = useState<null | 'complete' | 'abandon'>(null);
  // In-sheet confirm (replaces a native confirm() dialog, which behaves poorly
  // in the Capacitor webview and clashes with the app's bottom-sheet pattern).
  const [confirmingAbandon, setConfirmingAbandon] = useState(false);

  async function markComplete() {
    setBusy('complete');
    await repos.goals.put({ ...goal, status: 'completed' });
    onClose();
  }

  async function abandon() {
    setBusy('abandon');
    await repos.goals.put({ ...goal, status: 'abandoned' });
    onClose();
  }

  return (
    <Sheet title={goal.name} onClose={onClose}>
      <div className="space-y-3 pb-2">
        <div className="mb-4 rounded-control bg-surface-sunken px-3 py-2">
          <p className="text-subhead font-medium text-content">Status: Active</p>
        </div>
        {confirmingAbandon ? (
          <>
            <p className="text-subhead text-content-secondary">End this goal? It'll stay in your history. You can start a new one anytime.</p>
            <Button size="lg" variant="destructive" onClick={abandon} disabled={busy != null}>
              {busy === 'abandon' ? 'Ending…' : 'Yes, end goal'}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmingAbandon(false)} disabled={busy != null}>Keep goal</Button>
          </>
        ) : (
          <>
            <Button size="lg" onClick={markComplete} disabled={busy != null}>
              {busy === 'complete' ? 'Marking complete…' : 'Mark as complete'}
            </Button>
            <Button variant="outline" onClick={() => onNavigate('/goal-setup')}>Edit goal</Button>
            <Button variant="outline" onClick={() => setConfirmingAbandon(true)}>End goal</Button>
          </>
        )}
      </div>
    </Sheet>
  );
}
/** Toggle card for per-macro diary visibility. Only shown when goal has macroStyle set. */
function MacroDiaryCard({ goal }: { goal: Goal }) {
  async function toggle(field: 'diaryShowProtein' | 'diaryShowCarbs' | 'diaryShowFat') {
    const current = goal[field] !== false; // default true
    await repos.goals.put({ ...goal, [field]: !current });
  }

  const macros: { label: string; field: 'diaryShowProtein' | 'diaryShowCarbs' | 'diaryShowFat' }[] = [
    { label: 'Protein', field: 'diaryShowProtein' },
    { label: 'Carbs',   field: 'diaryShowCarbs'   },
    { label: 'Fat',     field: 'diaryShowFat'      },
  ];

  return (
    <div className="overflow-hidden rounded-control border border-border-subtle bg-surface divide-y divide-border-subtle">
      <p className="px-4 pt-3 pb-2 text-label font-medium text-content-secondary">Diary macros</p>
      {macros.map(({ label, field }) => {
        const enabled = goal[field] !== false;
        return (
          <button
            key={field}
            type="button"
            onClick={() => { hapticLight(); void toggle(field); }}
            className="flex w-full items-center justify-between px-4 py-3 active:bg-surface-sunken"
          >
            <span className="text-subhead font-medium text-content">{label}</span>
            <div className={`relative h-[28px] w-[48px] rounded-full transition-colors ${enabled ? 'bg-accent' : 'bg-neutral-300'}`}>
              <div className={`absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-[23px]' : 'translate-x-[3px]'}`} />
            </div>
          </button>
        );
      })}
    </div>
  );
}
