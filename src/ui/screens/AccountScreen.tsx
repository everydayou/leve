import { WheelPicker } from '../kit';
import { WeightLogSheet } from '../components/WeightLogSheet';
import { todayISO } from '../../data/ids';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLive } from '../../state/live';
import { useNavigate } from 'react-router-dom';
import { repos } from '../../state/repos';
import { exportAsJson } from '../../data/exportJson';
import { Card, SectionLabel, Badge, SegmentedControl, Button, NumberField, Sheet, ListRow, Skeleton, Icon, FilterPills, Divider, SlideScreen, SlideHeader } from '../kit';
import { displayWeight } from '../../domain/units';
import { getThemePref, setThemePref, type ThemePref } from '../../lib/theme';
import { hapticLight, getHapticsPref, setHapticsPref } from '../../lib/haptics';
import { getDevRevealed, setDevRevealed } from '../../lib/devReveal';
import { getWithingsService, type WithingsStatus } from '../../data/withings';
import { getHealthKitService, type HealthKitStatus } from '../../data/healthkit';
import { getApiKey, requestApiKeySheet } from '../../lib/apiKey';
import { SHARED_BETA } from '../../lib/sharedBeta';
import { DevMenu } from '../components/DevMenu';
import { mifflinStJeorBMR, canComputeBmr } from '../../domain/bmr';
import { currentWeightKg, isGainGoal, isMaintainGoal } from '../../domain/goal';
import type { User, Sex, Units, Goal } from '../../domain/types'; // Goal used in sub-components

// Goal and Connections sections are hidden (not deleted) per the Account
// redesign — Goal already lives in the Goal tab; Connections isn't needed
// for now. Flip back to true to re-enable either without restoring code.
const SHOW_GOAL_SECTION = false;
const SHOW_CONNECTIONS_SECTION = false;


export function AccountScreen() {
  const nav = useNavigate();
  const [editingProfile, setEditingProfile] = useState(false);
  const [managingGoal, setManagingGoal] = useState(false);
  const [showBmrInfo, setShowBmrInfo] = useState(false);
  const [editingProtein, setEditingProtein] = useState(false);

  // Triple-tap the "Account" title to reveal the hidden Developer section.
  // Persists across reloads (setDevRevealed); tapping 3x again hides it.
  const [showDeveloper, setShowDeveloper] = useState(getDevRevealed);
  // Tracking and Settings are their own full-screen sub-views now (same
  // slide-in-from-right + back-chevron pattern as Past goals), reached via
  // a small two-row menu on the main Account view rather than being shown
  // inline. See TrackingSubView / SettingsSubView below.
  const [activeSubView, setActiveSubView] = useState<'tracking' | 'settings' | null>(null);
  const titleTapCount = useRef(0);
  const titleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleTitleTap() {
    titleTapCount.current += 1;
    if (titleTapTimer.current) clearTimeout(titleTapTimer.current);
    if (titleTapCount.current >= 3) {
      titleTapCount.current = 0;
      setShowDeveloper((prev) => {
        const next = !prev;
        setDevRevealed(next);
        hapticLight();
        return next;
      });
      return;
    }
    titleTapTimer.current = setTimeout(() => { titleTapCount.current = 0; }, 500);
  }
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
      <h1 onClick={handleTitleTap} className="select-none pt-4 text-title font-semibold">Account</h1>

      <div className="mb-2 mt-6 flex items-center justify-between">
        <p className="text-headline font-semibold text-content">Profile</p>
        <button
          onClick={() => setEditingProfile(true)}
          className="text-subhead font-medium text-accent-hover active:opacity-70"
        >
          Edit
        </button>
      </div>
      {/* Gauge-card layered pattern: white profile card floats on a grey
          container; BMR sits directly on the grey reveal below (matches
          TodayScreen.tsx ~L943). Whole thing opens Edit profile on tap; the
          BMR info icon inside stops propagation so it still opens its own
          explainer sheet. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setEditingProfile(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditingProfile(true); } }}
        className="w-full rounded-sheet bg-surface-sunken text-left"
      >
        <div className="rounded-sheet border border-border-subtle bg-surface p-4 shadow-card-lg">
          <div className="space-y-3">
            <ProfileRow label="Height" value={user.heightCm > 0 ? `${user.heightCm} cm` : 'Not set'} />
            <ProfileRow label="Age" value={user.age != null ? `${user.age}` : 'Not set'} />
            <ProfileRow label="Sex" value={user.sex ? cap(user.sex) : 'Not set'} />
            <ProfileRow label="Weight" value={weightKg != null ? displayWeight(weightKg, user.units ?? 'kg') : 'Not set'} />
          </div>
        </div>
        <div className="flex items-start justify-between px-4 py-3">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-subhead font-medium text-content">BMR</span>
              <button
                onClick={(e) => { e.stopPropagation(); setShowBmrInfo(true); }}
                className="shrink-0 text-content active:opacity-70"
                aria-label="BMR info"
              >
                <Icon name="info" size={14} strokeWidth={1.75} />
              </button>
            </div>
            <p className="mt-0.5 text-subhead text-content-secondary">(resting burn)</p>
          </div>
          <div className="text-right">
            <span className="text-callout font-semibold text-content">
              {user.bmr > 0 ? user.bmr : <span className="text-content-muted">—</span>}
            </span>
            <p className="mt-0.5 text-subhead text-content-secondary">kcal / day</p>
          </div>
        </div>
        {user.bmr <= 0 && (
          <p className="px-4 pb-3 text-caption text-content-secondary">
            Set height, age &amp; sex in your profile to enable auto-calculation.
          </p>
        )}
      </div>

      {SHOW_GOAL_SECTION && (
        <>
          <SectionLabel>Goal</SectionLabel>
          <Card padded={false} className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{goal?.name ?? 'No active goal'}</p>
                {goal && (
                  <p className="text-label text-content-secondary">
                    Active ·{' '}
                    {isMaintainGoal(goal)
                      ? <>maintain {displayWeight(goal.weightRangeFloorKg ?? goal.targetWeightKg, user.units ?? 'kg')}–{displayWeight(goal.weightRangeCeilingKg ?? goal.targetWeightKg, user.units ?? 'kg')}</>
                      : isGainGoal(goal)
                        ? <>gain {displayWeight(goal.targetWeightKg - goal.startWeightKg, user.units ?? 'kg')}</>
                        : <>lose {displayWeight(goal.startWeightKg - goal.targetWeightKg, user.units ?? 'kg')}</>}
                  </p>
                )}
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
        </>
      )}

      <p className="mb-2 mt-6 text-headline font-semibold text-content">Options</p>
      <Card padded={false} className="overflow-hidden">
        <ListRow title="Tracking" chevron onClick={() => setActiveSubView('tracking')} />
        <Divider inset />
        <ListRow title="Settings" chevron onClick={() => setActiveSubView('settings')} />
      </Card>

      <p className="mt-8 text-center text-micro text-content-muted">v0.1.0</p>

      {editingProfile && <ProfileSheet user={user} currentWeightKg={weightKg} onClose={() => setEditingProfile(false)} />}
      {managingGoal && goal && <GoalManageSheet goal={goal} onClose={() => setManagingGoal(false)} onNavigate={(path) => { setManagingGoal(false); nav(path); }} />}
      {showBmrInfo && <BmrInfoSheet onClose={() => setShowBmrInfo(false)} />}
      {editingProtein && <ProteinGoalSheet current={user.proteinGoalG} onClose={() => setEditingProtein(false)} />}
      {activeSubView === 'tracking' && (
        <TrackingSubView user={user} goal={goal} onClose={() => setActiveSubView(null)} />
      )}
      {activeSubView === 'settings' && (
        <SettingsSubView showDeveloper={showDeveloper} onClose={() => setActiveSubView(null)} />
      )}
    </div>
  );
}

/* Full-screen sub-view (slide in from right, back chevron) for the
   "Tracking" row in Account's menu. Portals to document.body, same
   reasoning as PastGoalsPortal (see SlideScreen's own doc comment). */
function TrackingSubView({ user, goal, onClose }: { user: User; goal: Goal | undefined; onClose: () => void }) {
  const [exiting, setExiting] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  function goBack() {
    setExiting(true);
    setTimeout(onClose, 280);
  }
  return createPortal(
    <SlideScreen exiting={exiting} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)} onBack={goBack} muted>
      <SlideHeader title="Tracking" onBack={goBack} scrolled={scrolled} muted />
      <div className="px-6 pb-8 pt-2">
        <WeightUnitsCard user={user} />
        <div className="mt-2">
          <WeightCadenceCard user={user} />
        </div>
        {goal?.macroStyle && (
          <div className="mt-2">
            <MacroDiaryCard goal={goal} />
          </div>
        )}
      </div>
    </SlideScreen>,
    document.body,
  );
}

/* Full-screen sub-view for the "Settings" row in Account's menu. Same
   pattern as TrackingSubView above. Developer stays nested here (not its
   own menu row) since it's a hidden triple-tap reveal, not a normal entry
   point. */
function SettingsSubView({ showDeveloper, onClose }: { showDeveloper: boolean; onClose: () => void }) {
  const [exiting, setExiting] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  function goBack() {
    setExiting(true);
    setTimeout(onClose, 280);
  }
  return createPortal(
    <SlideScreen exiting={exiting} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)} onBack={goBack} muted>
      <SlideHeader title="Settings" onBack={goBack} scrolled={scrolled} muted />
      <div className="px-6 pb-8 pt-2">
        <AppearanceCard />
        {/* Hidden entirely in shared-beta builds — nothing for an external
            tester to configure, since the Test profile auto-connects via
            the shared key (see lib/sharedBeta.ts). */}
        {!SHARED_BETA && (
          <div className="mt-2">
            <ApiKeyCard />
          </div>
        )}

        {SHOW_CONNECTIONS_SECTION && (
          <div className="mt-2">
            <WithingsCard />
          </div>
        )}

        {showDeveloper && (
          <>
            <SectionLabel>Developer</SectionLabel>
            <Card padded={false} className="overflow-hidden">
              <ListRow
                title="Export all data (JSON)"
                chevron
                onClick={() => {
                  exportAsJson(repos).catch((err) => {
                    console.warn('Export failed', err);
                  });
                }}
              />
            </Card>
            <div className="mt-2">
              <Card padded={false} className="p-4">
                <DevMenu />
              </Card>
            </div>
          </>
        )}
      </div>
    </SlideScreen>,
    document.body,
  );
}

function ProfileSheet({ user, currentWeightKg: weightKg, onClose }: { user: User; currentWeightKg: number | null; onClose: () => void }) {
  const [height, setHeight] = useState(String(user.heightCm));
  const [age, setAge] = useState(user.age != null ? String(user.age) : '');
  const [sex, setSex] = useState<Sex | undefined>(user.sex);
  // Units now lives in Tracking > Weight units (WeightUnitsCard) — not edited here.
  const [showWeightSheet, setShowWeightSheet] = useState(false);
  async function save() {
    const heightCm = Number(height) || user.heightCm;
    const ageNum   = age ? Number(age) : undefined;
    const newBmr   = (heightCm > 0 && ageNum && sex && weightKg)
      ? (canComputeBmr({ weightKg, heightCm, age: ageNum, sex })
          ? mifflinStJeorBMR({ weightKg, heightCm, age: ageNum, sex })
          : user.bmr)
      : user.bmr;
    await repos.user.save({
      ...user,
      heightCm,
      age: ageNum,
      sex,
      bmr: newBmr,
    });
    onClose();
  }
  return (
    <>
      <Sheet title="Edit profile" onClose={onClose} forceExpanded footer={<Button size="lg" onClick={save}>Save profile</Button>}>
        <div className="space-y-3 pb-2">
          <WheelPicker label="Height (cm)" value={height} onChange={setHeight} min={100} max={250} step={1} unit="cm" centerAt={170} />
          <WheelPicker label="Age" value={age} onChange={setAge} min={10} max={100} step={1} centerAt={30} />
          <div>
            <span className="text-subhead font-normal text-content-secondary">Sex</span>
            <div className="mt-1">
              <FilterPills<Sex>
                value={sex ?? null}
                onChange={setSex}
                options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]}
              />
            </div>
          </div>
          {/* Reuses the same weight-logging sheet as Today/Goal ("Log weight"):
              pre-fills from today's entry if one exists, else the latest
              known weight; upserts by date so today stays a single entry. */}
          <div>
            <span className="text-subhead font-normal text-content-secondary">Weight</span>
            <button
              type="button"
              onClick={() => setShowWeightSheet(true)}
              className="mt-1 flex w-full items-center justify-between rounded-field bg-surface-sunken px-3 py-2.5 text-left active:opacity-70"
            >
              <span className="text-subhead font-semibold text-content">
                {weightKg != null ? displayWeight(weightKg, user.units ?? 'kg') : 'Not set'}
              </span>
              <Icon name="chevronRight" size={18} className="shrink-0 text-content-muted" />
            </button>
          </div>
        </div>
      </Sheet>
      {showWeightSheet && <WeightLogSheet date={todayISO()} onClose={() => setShowWeightSheet(false)} />}
    </>
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
        <NumberField
          label="Target"
          unit="g / day"
          value={val}
          set={setVal}
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

/** Theme + Haptic feedback + Apple Health connect, one card, three
 *  divider-separated rows. Health used to be its own card but per Marco's
 *  ask now lives alongside the other toggle-style Settings rows instead. */
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

  // repos is a module-level singleton, so this memo only evaluates once.
  const healthSvc = useMemo(() => getHealthKitService(repos), []);
  const [healthStatus, setHealthStatus] = useState<HealthKitStatus | null>(null);
  const [healthBusy, setHealthBusy] = useState<null | 'connect' | 'disconnect'>(null);
  useEffect(() => { healthSvc.getStatus().then(setHealthStatus); }, []); // eslint-disable-line
  async function connectHealth() {
    setHealthBusy('connect');
    await healthSvc.connect();
    await healthSvc.sync(); // initial import, no separate button/note needed for it
    setHealthStatus(await healthSvc.getStatus());
    setHealthBusy(null);
  }
  async function disconnectHealth() {
    setHealthBusy('disconnect');
    setHealthStatus(await healthSvc.disconnect());
    setHealthBusy(null);
  }
  const healthConnected = !!healthStatus?.connected;
  const healthAvailable = healthStatus?.available ?? true; // assume available until checked, avoids a flash of the disabled copy

  return (
    <OutlineCard>
      <p className="mb-2 text-callout font-bold text-content">Theme</p>
      <SegmentedControl<ThemePref>
        value={pref}
        onChange={pick}
        options={THEME_OPTS.map((o) => ({ value: o.id, label: o.label }))}
      />
      <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3">
        <div>
          <p className="text-callout font-bold">Haptic feedback</p>
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

      <div className="mt-3 border-t border-border-subtle pt-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-callout font-bold text-content">Apple Health</p>
            <p className="text-label text-content-secondary">
              {!healthAvailable
                ? 'Available on your iPhone (not in this preview).'
                : healthConnected
                  ? 'Importing weight + activity calories.'
                  : 'Import weight and activity calories from Health.'}
            </p>
          </div>
          {healthAvailable && (
            <span role="img" aria-label={healthConnected ? 'Connected' : 'Not connected'}
              className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-pill ${healthConnected ? 'bg-success' : 'bg-border-strong'}`} />
          )}
        </div>
        {healthAvailable && (!healthConnected ? (
          <Button size="sm" className="mt-3" onClick={connectHealth} disabled={healthBusy != null}>
            {healthBusy === 'connect' ? 'Connecting…' : 'Connect Apple Health'}
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="mt-3" onClick={disconnectHealth} disabled={healthBusy != null}>
            {healthBusy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
          </Button>
        ))}
      </div>
    </OutlineCard>
  );
}

/** Settings row for the bring-your-own-key food scan feature. Opens the
 *  single app-wide ApiKeySheet instance (mounted by AppShell) rather than
 *  its own local copy, since AI-feature error states also jump straight
 *  into that same sheet via requestApiKeySheet(). Subtitle reflects
 *  whether a key is currently set; re-checked each time the sheet closes
 *  (window focus is a cheap proxy for "the sheet may have just closed"). */
function ApiKeyCard() {
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  useEffect(() => {
    getApiKey().then((k) => setHasKey(!!k));
    const onFocus = () => { getApiKey().then((k) => setHasKey(!!k)); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  return (
    <Card padded={false} className="overflow-hidden">
      <ListRow
        leading={<Icon name="key" size={18} />}
        title="AI Food Scan"
        subtitle={hasKey ? 'Using your own API key' : 'Using the shared preview key'}
        chevron
        onClick={requestApiKeySheet}
      />
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

/** Live weight-unit toggle — same field ProfileSheet edits, surfaced here per
 *  the Account redesign so it doesn't require opening Edit profile. */
function WeightUnitsCard({ user }: { user: User }) {
  const [units, setUnits] = useState<Units>(user.units ?? 'kg');
  async function save(next: Units) {
    setUnits(next);
    const u = await repos.user.get();
    if (u) await repos.user.save({ ...u, units: next });
  }
  return (
    <OutlineCard>
      <p className="mb-2 text-callout font-bold text-content">Weight units</p>
      <FilterPills<Units>
        value={units}
        onChange={save}
        options={[{ value: 'kg', label: 'Kg' }, { value: 'lbs', label: 'Lbs' }]}
      />
    </OutlineCard>
  );
}

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// Full plural day names for the "You'll see a reminder on ___" sentence —
// DOW_LABELS stays abbreviated for the compact day-picker pills above.
const DOW_FULL_PLURAL = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];

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
    <OutlineCard>
      <p className="mb-2 text-callout font-bold text-content">Weigh-in frequency</p>
      <FilterPills<'daily' | 'weekly'>
        value={cadence}
        onChange={saveCadence}
        options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }]}
      />
      {cadence === 'weekly' && (
        <div className="mt-3">
          <p className="mb-2 text-callout font-bold text-content">Which day?</p>
          <FilterPills<string>
            value={String(day)}
            onChange={(v) => { if (v !== undefined) void saveDay(Number(v)); }}
            options={DOW_LABELS.map((label, i) => ({ value: String(i), label }))}
          />
        </div>
      )}
      <p className="mt-3 text-subhead text-content-secondary">
        {cadence === 'daily'
          ? "You'll see a weight reminder each evening until you log."
          : `You'll see a weight reminder on ${DOW_FULL_PLURAL[day]}.`}
      </p>
    </OutlineCard>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-subhead font-medium text-content">{label}</span>
      <span className="text-right text-callout font-semibold text-content">{value}</span>
    </div>
  );
}


/* Outline card used on Account only — matches GoalScreen.tsx's goal-overview
 * container: rounded-main, plain white fill, inset hairline border, no drop
 * shadow (vs. the Profile hero card above, which intentionally keeps
 * shadow-card-lg per the gauge-card pattern). */
function OutlineCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-card bg-surface p-4 ${className}`}
      style={{ boxShadow: 'inset 0 0 0 1px var(--color-border-field)' }}
    >
      {children}
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
    await repos.goals.put({ ...goal, status: 'completed', endedDate: todayISO() });
    onClose();
  }

  async function abandon() {
    setBusy('abandon');
    await repos.goals.put({ ...goal, status: 'abandoned', endedDate: todayISO() });
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
    <div
      className="overflow-hidden rounded-card bg-surface"
      style={{ boxShadow: 'inset 0 0 0 1px var(--color-border-field)' }}
    >
      <p className="px-4 pt-3 pb-2 text-callout font-bold text-content">Diary macros</p>
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
            <div className={`relative h-[28px] w-[48px] rounded-full transition-colors ${enabled ? 'bg-accent' : 'bg-border-strong'}`}>
              <div className={`absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-[23px]' : 'translate-x-[3px]'}`} />
            </div>
          </button>
        );
      })}
    </div>
  );
}
