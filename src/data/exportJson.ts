import type { Repositories } from './repositories';

/** Account → Export (JSON). Triggers a file download in the browser. */
export async function exportAsJson(repos: Repositories): Promise<void> {
  const bundle = await repos.exportAll();
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nutrition-goal-tracker-${bundle.exportedAt.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
