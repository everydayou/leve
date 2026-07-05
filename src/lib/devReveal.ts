// Hidden Developer section on Account, revealed by triple-tapping the
// "Account" title. Persisted so it stays revealed across reloads, same
// pattern as theme.ts / haptics.ts.

const KEY = 'nutri.devRevealed';

/** True once the user has triple-tapped the Account title to reveal Developer. */
export function getDevRevealed(): boolean {
  return localStorage.getItem(KEY) === 'true';
}

/** Persist whether the Developer section is shown. */
export function setDevRevealed(on: boolean): void {
  localStorage.setItem(KEY, on ? 'true' : 'false');
}
