import { dexieRepositories } from '../data/dexieRepositories';
import { memoryRepositories, memoryBus } from '../data/memoryRepositories';
import type { Repositories } from '../data/repositories';

// VITE_PREVIEW=true builds the double-click demo (in-memory, no IndexedDB),
// which runs reliably from a file:// URL in any browser.
export const PREVIEW = import.meta.env.VITE_PREVIEW === 'true';

export const repos: Repositories = PREVIEW ? memoryRepositories : dexieRepositories;
export { memoryBus };
