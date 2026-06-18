import { useEffect, useState } from 'react';
import { useLive } from '../../state/live';
import { repos } from '../../state/repos';
import { newId, todayISO } from '../../data/ids';
import { currentWeightKg } from '../../domain/goal';
import { mifflinStJeorBMR, canComputeBmr } from '../../domain/bmr';
import { Sheet, Button, WheelPicker } from '../kit';
import { kgToLbs, lbsToKg } from '../../domain/units';

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
  const weights  = useLive(() => repos.weights.all(), []) ?? [];
  const user     = useLive(() => repos.user.get(), []);
  const units    = user?.units ?? 'kg';
  const existing = weights.find((w) => w.date === date);
  const prefill  = existing?.weightKg ?? currentWeightKg(weights);
  // Store display value in user's units; convert to kg only on save.
  const [val, setVal] = useState('');

  useEffect(() => {
    if (prefill != null) {
      setVal(units === 'lbs' ? kgToLbs(prefill).toFixed(1) : prefill.toFixed(1)); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [prefill, units]);

  async function save() {
    const display = Number(val);
    if (!display) return;
    const weightKg = units === 'lbs' ? lbsToKg(display) : display;
    await repos.weights.upsertForDate({ id: newId(), date, weightKg, source: 'manual' });
    // Recalculate account BMR from the most-recent weight ≤ today (not always the
    // just-saved one — editing a past entry shouldn't overwrite the current BMR).
    await syncAccountBmr();
    onClose();
  }

  const isToday = date === todayISO();
  const title = isToday ? "Log today's weight" : `Weight · ${fmtDate(date)}`;

  
  const weightMin = units === 'lbs' ? 66  : 30;
  const weightMax = units === 'lbs' ? 660 : 300;
  const prevDisplay = existing
    ? (units === 'lbs' ? `${kgToLbs(existing.weightKg).toFixed(1)} lbs` : `${existing.weightKg.toFixed(1)} kg`)
    : null;

  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={<Button size="lg" onClick={save} disabled={!Number(val)}>Save weight</Button>}
    >
      <div className="space-y-3 pb-2">
        <WheelPicker
          label={`Weight (${units})`}
          value={val}
          onChange={setVal}
          min={weightMin}
          max={weightMax}
          step={0.1}
          unit={units}
        />
        {existing && (
          <p className="text-caption text-content-secondary">
            Previously {prevDisplay} — saving will update it.
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
