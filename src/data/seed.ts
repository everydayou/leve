import { db } from './db';

/** Clean first-run setup. Creates ONLY a blank user record so the app can
 *  render; no goal, no pantry, no entries, no weight history. You set your
 *  profile (height/age/sex/BMR) in Account and create your first goal from
 *  the Goal tab. Idempotent. */
export async function seedIfEmpty(): Promise<void> {
  const userCount = await db.users.count();
  if (userCount > 0) return;
  await db.users.put({ id: 'me', heightCm: 0, units: 'kg', bmr: 0 });
}
