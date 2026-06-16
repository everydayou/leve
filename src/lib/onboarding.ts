import { activeProfile } from '../data/db';

const key = () => `ngt-onboarding-seen-${activeProfile}`;

export function hasSeenOnboarding(): boolean {
  return localStorage.getItem(key()) === 'true';
}

export function markOnboardingSeen(): void {
  localStorage.setItem(key(), 'true');
}

export function resetOnboarding(): void {
  localStorage.removeItem(key());
}
