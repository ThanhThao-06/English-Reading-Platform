import type { ProgressStatus, ReadingProgress, ReadingProgressMap } from '../types/readingProgress';

/**
 * localStorage key for reading progress.
 * Separate from the vocabulary key (`english-reading-vocabulary`), which is
 * left untouched.
 */
const STORAGE_KEY = 'english-reading-progress';

/** An article counts as finished once the reader reaches this percentage. */
export const COMPLETION_THRESHOLD = 90;

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
};

const clampScroll = (value: number): number => {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value);
};

/**
 * Keep only entries that look like valid progress records. Anything else is
 * dropped so a corrupted value can never crash the app.
 */
const isValidEntry = (value: unknown): value is ReadingProgress => {
  if (!value || typeof value !== 'object') return false;

  const entry = value as Partial<ReadingProgress>;

  return (
    typeof entry.articleId === 'string' &&
    entry.articleId.length > 0 &&
    typeof entry.progress === 'number' &&
    typeof entry.scrollTop === 'number' &&
    typeof entry.completed === 'boolean'
  );
};

const normalizeEntry = (entry: ReadingProgress): ReadingProgress => ({
  articleId: entry.articleId,
  progress: clampPercent(entry.progress),
  scrollTop: clampScroll(entry.scrollTop),
  updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : new Date().toISOString(),
  completed: entry.completed === true,
});

/**
 * Read every saved progress record.
 * Returns an empty object when storage is unavailable or malformed.
 */
export const getAllProgress = (): ReadingProgressMap => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const result: ReadingProgressMap = {};

    for (const [articleId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!isValidEntry(value)) continue;
      if (value.articleId !== articleId) continue;
      result[articleId] = normalizeEntry(value);
    }

    return result;
  } catch {
    // Unavailable or corrupted storage behaves the same as "no progress".
    return {};
  }
};

/** Saved progress for one article, or null when nothing is stored. */
export const getProgress = (articleId: string): ReadingProgress | null => {
  if (!articleId) return null;
  return getAllProgress()[articleId] ?? null;
};

/**
 * Save progress for a single article, leaving every other article untouched.
 *
 * Completion is sticky: once an article is finished it stays finished even if
 * the reader scrolls back up and reopens it later.
 */
export const saveProgress = (input: {
  articleId: string;
  progress: number;
  scrollTop: number;
  completed?: boolean;
}): ReadingProgress | null => {
  if (!input.articleId) return null;

  try {
    const all = getAllProgress();
    const existing = all[input.articleId];

    const completed =
      Boolean(existing?.completed) ||
      Boolean(input.completed) ||
      input.progress >= COMPLETION_THRESHOLD;

    const entry: ReadingProgress = normalizeEntry({
      articleId: input.articleId,
      // A finished article always reports 100%, even if the reader scrolled back up.
      progress: completed ? 100 : input.progress,
      scrollTop: input.scrollTop,
      updatedAt: new Date().toISOString(),
      completed,
    });

    all[input.articleId] = entry;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));

    return entry;
  } catch {
    // Writing failed (private mode, quota, ...): reading must still work.
    return null;
  }
};

/** Remove the saved progress for one article. */
export const clearProgress = (articleId: string): void => {
  try {
    const all = getAllProgress();
    if (!(articleId in all)) return;

    delete all[articleId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Ignore: clearing progress is a convenience, not a requirement.
  }
};

/**
 * Summarise an article's progress for the UI.
 * `none` is returned for unknown articles and for untouched articles.
 */
export const getProgressStatus = (articleId: string): ProgressStatus => {
  const entry = getProgress(articleId);
  if (!entry) return { kind: 'none' };

  // Ignore entries that were saved but never actually moved.
  if (!entry.completed && entry.progress <= 0) return { kind: 'none' };

  if (entry.completed) {
    return { kind: 'completed', progress: 100 };
  }

  return { kind: 'in-progress', progress: clampPercent(entry.progress) };
};