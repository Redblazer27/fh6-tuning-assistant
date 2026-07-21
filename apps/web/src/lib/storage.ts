import type { SavedBuild } from '@fh6/shared';
import type { Feedback } from '@fh6/data';

const BUILDS_KEY = 'fh6.savedBuilds.v1';
const FEEDBACK_KEY = 'fh6.feedback.v1';
const DATASET_KEY = 'fh6.dataset.v1';

export interface StoredBuild {
  id: string;
  savedAt: string;
  label: string;
  build: SavedBuild;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full / unavailable — non-fatal */
  }
}

export function loadSavedBuilds(): StoredBuild[] {
  return read<StoredBuild[]>(BUILDS_KEY, []);
}
export function saveBuild(stored: StoredBuild): StoredBuild[] {
  const all = loadSavedBuilds().filter((b) => b.id !== stored.id);
  all.unshift(stored);
  write(BUILDS_KEY, all.slice(0, 50));
  return loadSavedBuilds();
}
export function deleteBuild(id: string): StoredBuild[] {
  write(
    BUILDS_KEY,
    loadSavedBuilds().filter((b) => b.id !== id),
  );
  return loadSavedBuilds();
}

export function loadFeedback(buildId: string): Feedback[] {
  return read<Feedback[]>(FEEDBACK_KEY, []).filter((f) => f.buildId === buildId);
}
export function addFeedback(entry: Feedback): void {
  const all = read<Feedback[]>(FEEDBACK_KEY, []);
  all.unshift(entry);
  write(FEEDBACK_KEY, all.slice(0, 500));
}

/** Raw imported dataset JSON (validated by the caller via loadDataset). */
export function loadImportedDatasetRaw(): unknown | null {
  return read<unknown | null>(DATASET_KEY, null);
}
export function saveImportedDatasetRaw(raw: unknown): void {
  write(DATASET_KEY, raw);
}
export function clearImportedDataset(): void {
  try {
    localStorage.removeItem(DATASET_KEY);
  } catch {
    /* ignore */
  }
}
