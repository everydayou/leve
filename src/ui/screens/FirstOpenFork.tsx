import { useNavigate, useSearchParams } from 'react-router-dom';
import { markOnboardingSeen } from '../../lib/onboarding';
import { GoalIcon } from './GoalSetupScreen';
import { Icon } from '../kit';
import { hapticLight } from '../../lib/haptics';

type GoalPath = 'lose_by_date' | 'gain_by_date';

// ── Shared card ───────────────────────────────────────────────────────────────
function PathCard({
  title, description, iconEl, onClick,
}: {
  title: string; description?: React.ReactNode; iconEl: React.ReactNode; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className="flex w-full items-center gap-4 rounded-card border border-border-subtle bg-surface p-4 shadow-card text-left active:bg-surface-sunken transition-colors">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-surface-sunken text-content">
        {iconEl}
      </div>
      <div className="flex-1">
        <span className="block text-callout font-semibold text-content">{title}</span>
        {description && (
          <span className="mt-0.5 block text-subhead text-content-secondary">{description}</span>
        )}
      </div>
      <Icon name="chevronRight" size={18} strokeWidth={2} className="shrink-0 text-content-muted" />
    </button>
  );
}

function ForkShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 flex justify-center overflow-hidden bg-surface-sunken sm:items-center sm:py-[max(1.5rem,2dvh)]">
      <div className="safe-top safe-bottom flex h-[100dvh] w-full max-w-[26.25rem] flex-col overflow-y-auto bg-surface sm:h-[min(880px,94dvh)] sm:rounded-[2rem] sm:border sm:border-border-subtle sm:shadow-xl">
        {children}
      </div>
    </div>
  );
}

// ── First-open fork — 3 options ───────────────────────────────────────────────
export function FirstOpenForkScreen() {
  const nav = useNavigate();

  function pickGoal(type: GoalPath) {
    hapticLight();
    nav(`/goal-setup?type=${type}&first-open=true`);
  }

  function pickExplore() {
    hapticLight();
    markOnboardingSeen();
    nav('/today', { replace: true });
  }

  return (
    <ForkShell>
      <div className="px-6 pt-14 pb-8">
        <h1 className="text-display font-semibold text-content tracking-tight leading-tight">
          What brings you here?
        </h1>
      </div>
      <div className="px-6 space-y-3">
        <PathCard
          title="Lose weight"
          description={<>Track your <strong className="font-semibold text-content">calorie deficit</strong> daily.</>}
          iconEl={<GoalIcon type="lose_by_date" size={24} />}
          onClick={() => pickGoal('lose_by_date')}
        />
        <PathCard
          title="Build muscle"
          description={<>Fuel growth with a daily <strong className="font-semibold text-content">calorie surplus</strong>.</>}
          iconEl={<GoalIcon type="gain_by_date" size={24} />}
          onClick={() => pickGoal('gain_by_date')}
        />
        <PathCard
          title="Not sure yet — just exploring"
          iconEl={<GoalIcon type="maintain" size={24} />}
          onClick={pickExplore}
        />
      </div>
    </ForkShell>
  );
}

// ── Explorer-to-goal fork — 2 options ────────────────────────────────────────
export function GoalForkScreen() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const fromToday = searchParams.get('from') === 'today';

  function pickGoal(type: GoalPath) {
    hapticLight();
    nav(`/goal-setup?type=${type}`);
  }

  return (
    <ForkShell>
      <div className="flex items-center px-4 pt-5 pb-2">
        <button
          onClick={() => { hapticLight(); if (fromToday) { nav('/today'); } else { nav(-1 as never); } }}
          aria-label={fromToday ? 'Close' : 'Back'}
          className="-ml-2 flex h-10 w-10 items-center justify-center rounded-control text-content-muted active:bg-surface-sunken transition-colors"
        >
          {fromToday
            ? <Icon name="close" size={20} strokeWidth={2.25} />
            : <Icon name="chevronLeft" size={20} strokeWidth={2.5} />}
        </button>
      </div>
      <div className="px-6 pt-4 pb-8">
        <h1 className="text-display font-semibold text-content tracking-tight leading-tight">
          What's your goal?
        </h1>
      </div>
      <div className="px-6 space-y-3">
        <PathCard
          title="Lose weight"
          description={<>Track your <strong className="font-semibold text-content">calorie deficit</strong> daily.</>}
          iconEl={<GoalIcon type="lose_by_date" size={24} />}
          onClick={() => pickGoal('lose_by_date')}
        />
        <PathCard
          title="Build muscle"
          description={<>Fuel growth with a daily <strong className="font-semibold text-content">calorie surplus</strong>.</>}
          iconEl={<GoalIcon type="gain_by_date" size={24} />}
          onClick={() => pickGoal('gain_by_date')}
        />
      </div>
    </ForkShell>
  );
}
