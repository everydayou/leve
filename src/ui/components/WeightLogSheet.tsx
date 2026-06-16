import { useEffect, useState } from 'react';
import { useLive } from '../../state/live';
import { repos } from '../../state/repos';
import { newId, todayISO } from '../../data/ids';
import { currentWeightKg } from '../../domain/goal';
import { mifflinStJeorBMR, canComputeBmr } from '../../domain/bmr';
import { onDecimalChange } from '../../lib/num';
import { Sheet, Button, LabeledInput } from '../kit';

/** Recalculate and persist the account BMR using the most recent weight entry
 *  on or before today. Editing a past entry should not change the account BMR
 *  to that old value — only the latest calendar weight drives the profile BMR. */
async function syncAccountBmr() {
  const today   = todayISO();
  const weights = await repos.weights.all();
  const latest  = weights
    .filter((w) => w.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!latest) return;
  const user = await repos.user.get();
  if (user && canComputeBmr({ weightKg: latest.weightKg, heightCm: user.heightCm, age: user.age, sex: user.sex })) {
    const newBmr = mifflinStJeorBMR({ weightKg: latest.weightKg, heightCm: user.heightCm, age: user.age!, sex: user.sex! });
    await repos.user.save({ ...user, bmr: newBmr });
  }
}


/** Self-contained weight-logging bottom sheet.
 *  Used by GoalScreen and TodayScreen. Pre-fills with the logged weight for
 *  `date` (or latest weight as a starting point when no entry exists yet). */
export function WeightLogSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const weights = useLive(() => repos.weights.all(), []) ?? [];
  const existing = weights.find((w) => w.date === date);
  const prefill = existing?.weightKg ?? currentWeightKg(weights);
  const [kg, setKg] = useState('');

  // Initialise / update the field when the prefill resolves from the live query.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- populate field when async prefill resolves
    if (prefill != null) setKg(String(prefill));
  }, [prefill]);

  async function save() {
    const v = Number(kg);
    if (!v) return;
    await repos.weights.upsertForDate({ id: newId(), date, weightKg: v, source: 'manual' });
    // Recalculate account BMR from the most-recent weight ≤ today (not always the
    // just-saved one — editing a past entry shouldn't overwrite the current BMR).
    await syncAccountBmr();
    onClose();
  }

  const isToday = date === todayISO();
  const title = isToday ? "Log today's weight" : `Weight · ${fmtDate(date)}`;

  return (
    <Sheet
      title={title}
      onClose={onClose}
      forceExpanded
      footer={<Button size="lg" onClick={save} disabled={!Number(kg)}>Save weight</Button>}
    >
      <div className="space-y-3 pb-2">
        <LabeledInput
          label="Weight (kg)"
          value={kg}
          onChange={onDecimalChange(setKg)}
          inputMode="decimal"
          autoFocus
          onFocus={(e) => e.target.select()}
        />
        {existing && (
          <p className="text-caption text-content-secondary">
            Previously {existing.weightKg.toFixed(1)} kg — saving will update it.
          </p>
        )}
      </div>
    </Sheet>
  );
}

const fmtDate = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  });
