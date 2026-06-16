import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { repos } from '../../state/repos';
import { newId } from '../../data/ids';
import { mifflinStJeorBMR, canComputeBmr } from '../../domain/bmr';
import { markOnboardingSeen } from '../../lib/onboarding';
import { Button, Icon, GaugeArc, FilterPills } from '../kit';
import type { Sex } from '../../domain/types';
import OnboardingFlow from './OnboardingFlow';

// ── Native picker helpers ─────────────────────────────────────────────────────

const HEIGHT_OPTIONS: number[] = Array.from({ length: 81 }, (_, i) => 140 + i); // 140–220 cm
const AGE_OPTIONS:    number[] = Array.from({ length: 81 }, (_, i) => 10  + i); // 10–90 yrs

function NativePicker({
  label, value, onChange, options, unit,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  options: number[];
  unit: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption text-content-secondary">{label}</span>
      <div className="relative">
        <select
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="w-full appearance-none rounded-control border border-border-subtle bg-surface px-4 py-3 text-subhead text-content pr-10 focus:outline-none"
        >
          <option value="">—</option>
          {options.map((n) => (
            <option key={n} value={n}>{n} {unit}</option>
          ))}
        </select>
        {/* Chevron */}
        <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-content-muted">
          <Icon name="chevronDown" size={16} strokeWidth={2} />
        </div>
      </div>
    </div>
  );
}

type Step = 'welcome' | 'daily' | 'profile';

export function OnboardingScreen() {
  const [step, setStep] = useState<Step>('daily');
  const nav = useNavigate();

  function finish() {
    markOnboardingSeen();
    nav('/today', { replace: true });
  }

  if (step === 'daily') {
    return <OnboardingFlow onDone={() => setStep('profile')} onSkip={finish} />;
  }

  return (
    <FullScreen>
      {step === 'welcome'
        ? <WelcomeStep onNext={() => setStep('daily')} onSkip={finish} />
        : <ProfileStep onDone={finish} onBack={() => setStep('daily')} onSkip={finish} />
      }
    </FullScreen>
  );
}

// ── Welcome ───────────────────────────────────────────────────────────────────

function WelcomeStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <div className="flex flex-1 flex-col px-7">
      {/* Skip — top right */}
      <div className="flex justify-end pt-5 pb-2">
        <button onClick={onSkip} className="text-subhead text-content-secondary px-1 py-2">
          Skip
        </button>
      </div>

      {/* Illustration area */}
      <div className="flex flex-1 flex-col items-center justify-center gap-8">
        {/* Mini gauge as a visual anchor */}
        <div className="relative flex h-44 w-44 items-center justify-center">
          <GaugeArc value={68} size={176} stroke={10}>
            <div className="flex flex-col items-center">
              <span className="text-display font-semibold text-content">68</span>
              <span className="text-caption text-content-secondary whitespace-nowrap">kcal remaining</span>
            </div>
          </GaugeArc>
        </div>

        {/* Copy */}
        <div className="text-center space-y-3">
          <h1 className="text-title font-semibold text-content leading-tight">
            Know if you're<br />on track.
          </h1>
          <p className="text-body text-content-secondary leading-relaxed">
            Log what you eat. Set a weight goal.<br />
            See your daily budget — at a glance.
          </p>
        </div>
      </div>

      {/* CTA */}
      <div className="pb-10 pt-6">
        <Button size="lg" onClick={onNext}>Get started</Button>
      </div>
    </div>
  );
}

// ── Profile ───────────────────────────────────────────────────────────────────

function ProfileStep({
  onDone, onBack, onSkip,
}: {
  onDone: () => void; onBack: () => void; onSkip: () => void;
}) {
  const [height, setHeight] = useState<number | null>(null);
  const [age,    setAge]    = useState<number | null>(null);
  const [sex,    setSex]    = useState<Sex | null>(null);

  const canSave = height !== null || age !== null || sex !== null;

  async function save() {
    const heightCm = height ?? undefined;
    const ageNum   = age    ?? undefined;
    const sexVal   = sex    ?? undefined;

    const existing = await repos.user.get();
    const base = existing ?? { id: newId(), bmr: 0, units: 'kg' as const, heightCm: 0 };
    const updated = {
      ...base,
      heightCm: heightCm ?? base.heightCm,
      ...(ageNum !== undefined && { age: ageNum }),
      ...(sexVal !== undefined && { sex: sexVal }),
    };

    // Auto-calculate BMR if we have enough data
    const weightKg = (await repos.weights.all())
      .sort((a, b) => b.date.localeCompare(a.date))[0]?.weightKg;
    if (canComputeBmr({ weightKg, heightCm: updated.heightCm, age: updated.age, sex: updated.sex })) {
      updated.bmr = mifflinStJeorBMR({
        weightKg: weightKg!,
        heightCm: updated.heightCm!,
        age: updated.age!,
        sex: updated.sex!,
      });
    }

    await repos.user.save(updated);
    onDone();
  }

  return (
    <div className="flex flex-1 flex-col px-7">
      {/* Header */}
      <div className="flex items-center pt-5 pb-6">
        <button onClick={onBack} aria-label="Back" className="-ml-2 flex h-10 w-10 items-center justify-center text-content-muted">
          <Icon name="chevronLeft" size={20} strokeWidth={2.5} />
        </button>
        <div className="flex-1" />
        <button onClick={onSkip} className="text-subhead text-content-secondary px-1 py-2">
          Skip
        </button>
      </div>

      {/* Copy */}
      <div className="mb-7 space-y-2">
        <h2 className="text-title font-semibold text-content">A couple of details.</h2>
        <p className="text-body text-content-secondary leading-relaxed">
          These help calculate your daily calorie burn, so your goals and targets actually make sense.
        </p>
      </div>

      {/* Fields */}
      <div className="space-y-4">
        <NativePicker
          label="Height"
          value={height}
          onChange={setHeight}
          options={HEIGHT_OPTIONS}
          unit="cm"
        />
        <NativePicker
          label="Age"
          value={age}
          onChange={setAge}
          options={AGE_OPTIONS}
          unit="yrs"
        />
        <div>
          <p className="text-caption text-content-secondary mb-2">Sex</p>
          <FilterPills<Sex>
            value={sex}
            onChange={setSex}
            options={[
              { value: 'male',   label: 'Male'   },
              { value: 'female', label: 'Female' },
            ]}
          />
        </div>
      </div>

      <div className="mt-auto pb-10 pt-8">
        <Button size="lg" onClick={save} disabled={!canSave}>
          Done
        </Button>
      </div>
    </div>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 flex justify-center overflow-hidden bg-surface-sunken sm:items-center sm:py-[max(1.5rem,2dvh)]">
      <div className="safe-top safe-bottom flex h-[100dvh] w-full max-w-[26.25rem] flex-col overflow-x-hidden overflow-y-auto bg-surface sm:h-[min(880px,94dvh)] sm:rounded-[2rem] sm:border sm:border-border-subtle sm:shadow-xl">
        {children}
      </div>
    </div>
  );
}
