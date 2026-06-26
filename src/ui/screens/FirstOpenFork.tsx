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

function ForkShell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`fixed inset-0 flex justify-center overflow-hidden bg-surface-sunken sm:items-center sm:py-[max(1.5rem,2dvh)] ${className}`}>
      <div className="safe-top safe-bottom flex h-[100dvh] w-full max-w-[26.25rem] flex-col overflow-y-auto bg-surface sm:h-[min(880px,94dvh)] sm:rounded-[2rem] sm:border sm:border-border-subtle sm:shadow-xl">
        {children}
      </div>
    </div>
  );
}

// ── Explore icon (search/magnifier SVG) ──────────────────────────────────────
function ExploreIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      <path
        d="M2.5002 19.8008C2.13186 19.8008 1.82311 19.6716 1.57395 19.4133C1.32478 19.1549 1.2002 18.8419 1.2002 18.474C1.2002 18.1062 1.32478 17.7979 1.57395 17.549C1.82311 17.3002 2.13186 17.1758 2.5002 17.1758H10.3752C10.7435 17.1758 11.0523 17.3002 11.3014 17.549C11.5506 17.7979 11.6752 18.1062 11.6752 18.474C11.6752 18.8419 11.5506 19.1549 11.3014 19.4133C11.0523 19.6716 10.7435 19.8008 10.3752 19.8008H2.5002ZM2.5002 14.4758C2.13186 14.4758 1.82311 14.3466 1.57395 14.0883C1.32478 13.8299 1.2002 13.5169 1.2002 13.149C1.2002 12.7812 1.32936 12.4729 1.5877 12.224C1.84603 11.9752 2.15853 11.8508 2.5252 11.8508H5.3252C5.69353 11.8508 6.00228 11.9752 6.25145 12.224C6.50061 12.4729 6.6252 12.7812 6.6252 13.149C6.6252 13.5169 6.50061 13.8299 6.25145 14.0883C6.00228 14.3466 5.69353 14.4758 5.3252 14.4758H2.5002ZM2.5002 9.20078C2.13186 9.20078 1.82311 9.07161 1.57395 8.81328C1.32478 8.55495 1.2002 8.24186 1.2002 7.87403C1.2002 7.5062 1.32936 7.19786 1.5877 6.94903C1.84603 6.7002 2.15853 6.57578 2.5252 6.57578H5.3252C5.69353 6.57578 6.00228 6.7002 6.25145 6.94903C6.50061 7.19786 6.6252 7.5062 6.6252 7.87403C6.6252 8.24186 6.50061 8.55495 6.25145 8.81328C6.00228 9.07161 5.69353 9.20078 5.3252 9.20078H2.5002ZM14.1002 16.6508C12.537 16.6508 11.2046 16.0924 10.1029 14.9758C9.00111 13.8591 8.4502 12.5064 8.4502 10.9178C8.4502 9.32911 9.00145 7.97495 10.1039 6.85528C11.2064 5.73561 12.5398 5.17578 14.1039 5.17578C15.6681 5.17578 16.996 5.73411 18.0877 6.85078C19.1794 7.96745 19.7252 9.32578 19.7252 10.9258C19.7252 11.4591 19.6585 11.9799 19.5252 12.4883C19.3919 12.9966 19.1835 13.4841 18.9002 13.9508L21.9002 17.0508C22.1502 17.3008 22.2752 17.6008 22.2752 17.9508C22.2752 18.3008 22.1502 18.6049 21.9002 18.8633C21.6502 19.1216 21.3419 19.2508 20.9752 19.2508C20.6085 19.2508 20.3002 19.1174 20.0502 18.8508L17.0502 15.7758C16.6169 16.0591 16.1461 16.2758 15.6379 16.4258C15.1298 16.5758 14.6172 16.6508 14.1002 16.6508ZM14.1002 14.0258C14.9335 14.0258 15.6419 13.7232 16.2252 13.118C16.8085 12.5127 17.1002 11.7778 17.1002 10.9133C17.1002 10.0486 16.8085 9.3137 16.2252 8.70853C15.6419 8.10336 14.9335 7.80078 14.1002 7.80078C13.2669 7.80078 12.5544 8.10462 11.9627 8.71228C11.371 9.31995 11.0752 10.0578 11.0752 10.9258C11.0752 11.7758 11.3693 12.5049 11.9574 13.1133C12.5456 13.7216 13.2599 14.0258 14.1002 14.0258Z"
        fill="currentColor"
      />
    </svg>
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
          description="Track your calorie deficit daily."
          iconEl={<GoalIcon type="lose_by_date" size={24} />}
          onClick={() => pickGoal('lose_by_date')}
        />
        <PathCard
          title="Build muscle"
          description="Fuel growth with a daily calorie surplus."
          iconEl={<GoalIcon type="gain_by_date" size={24} />}
          onClick={() => pickGoal('gain_by_date')}
        />
        <PathCard
          title="Not sure yet, just exploring"
          iconEl={<ExploreIcon size={24} />}
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
    <ForkShell className={fromToday ? 'slide-up-in' : ''}>
      <div className="flex items-center px-4 pt-5 pb-2">
        <button
          onClick={() => { hapticLight(); if (fromToday) { nav('/today'); } else { nav(-1 as never); } }}
          aria-label={fromToday ? 'Close' : 'Back'}
          className="-ml-2 flex h-10 w-10 items-center justify-center rounded-control text-content-muted active:bg-surface-sunken transition-colors">
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
          description="Track your calorie deficit daily."
          iconEl={<GoalIcon type="lose_by_date" size={24} />}
          onClick={() => pickGoal('lose_by_date')}
        />
        <PathCard
          title="Build muscle"
          description="Fuel growth with a daily calorie surplus."
          iconEl={<GoalIcon type="gain_by_date" size={24} />}
          onClick={() => pickGoal('gain_by_date')}
        />
      </div>
    </ForkShell>
  );
}
