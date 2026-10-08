import type { DueFlashcard, FlashcardMap, FlashcardProgress, ReviewRating } from '../types/flashcard';
import { getSavedWords } from './vocabularyStorage';
import { DEFAULT_SESSION_LIMIT, applyReview, createInitialProgress, isDue } from './srs';

/**
 * localStorage key for Spaced Repetition schedules.
 *
 * Separate from `english-reading-vocabulary`, `english-reading-highlights` and
 * `english-reading-progress`, none of which are read or written here. Only
 * scheduling data is stored: the word content always comes from Personal
 * Vocabulary.
 */
const STORAGE_KEY = 'english-reading-flashcards';

const isNonNegativeInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

const clampEase = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(3, Math.max(1.3, value)) : 2.5;

const isValidRating = (value: unknown): value is ReviewRating =>
  value === 'again' || value === 'hard' || value === 'good' || value === 'easy';

/**
 * Keep only entries that look like a usable schedule.
 * Anything malformed is dropped rather than thrown, so a bad write can never
 * break the review page.
 */
const isValidProgress = (value: unknown): value is FlashcardProgress => {
  if (!value || typeof value !== 'object') return false;

  const entry = value as Partial<FlashcardProgress>;
  const due = typeof entry.dueAt === 'string' ? Date.parse(entry.dueAt) : NaN;

  return (
    typeof entry.vocabularyId === 'string' &&
    entry.vocabularyId.length > 0 &&
    isNonNegativeInt(entry.repetitions) &&
    isNonNegativeInt(entry.interval) &&
    typeof entry.easeFactor === 'number' &&
    Number.isFinite(entry.easeFactor) &&
    !Number.isNaN(due)
  );
};

const normalize = (entry: FlashcardProgress): FlashcardProgress => ({
  vocabularyId: entry.vocabularyId,
  repetitions: entry.repetitions,
  interval: Math.min(365, Math.max(0, entry.interval)),
  easeFactor: clampEase(entry.easeFactor),
  dueAt: entry.dueAt,
  lastReviewedAt:
    typeof entry.lastReviewedAt === 'string' && !Number.isNaN(Date.parse(entry.lastReviewedAt))
      ? entry.lastReviewedAt
      : undefined,
  lastRating: isValidRating(entry.lastRating) ? entry.lastRating : undefined,
});

const persist = (map: FlashcardMap): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (error) {
    console.error('Failed to save flashcard progress to localStorage:', error);
  }
};

/* ==========================================================================
   Reads / writes
   ========================================================================== */

/** Every saved schedule, keyed by vocabulary id. Empty when storage is unusable. */
export const getAllFlashcards = (): FlashcardMap => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const result: FlashcardMap = {};

    for (const [vocabularyId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!isValidProgress(value)) continue;
      if (value.vocabularyId !== vocabularyId) continue;
      result[vocabularyId] = normalize(value);
    }

    return result;
  } catch {
    // Missing or corrupted storage simply means "no cards reviewed yet".
    return {};
  }
};

/** The schedule for one word, or null when it has never been reviewed. */
export const getFlashcard = (vocabularyId: string): FlashcardProgress | null =>
  vocabularyId ? getAllFlashcards()[vocabularyId] ?? null : null;

/** Record a review and return the new state (or null when it could not be saved). */
export const saveFlashcardProgress = (
  vocabularyId: string,
  rating: ReviewRating,
  now: Date = new Date()
): FlashcardProgress | null => {
  if (!vocabularyId || !isValidRating(rating)) return null;

  try {
    const all = getAllFlashcards();
    const next = applyReview(vocabularyId, rating, all[vocabularyId] ?? null, now);

    all[vocabularyId] = next;
    persist(all);

    return next;
  } catch {
    return null;
  }
};

/** Drop one card's schedule, e.g. when its vocabulary word is deleted. */
export const removeFlashcardProgress = (vocabularyId: string): boolean => {
  if (!vocabularyId) return false;

  try {
    const all = getAllFlashcards();
    if (!(vocabularyId in all)) return false;

    delete all[vocabularyId];
    persist(all);
    return true;
  } catch {
    return false;
  }
};

/** Forget every schedule. Personal Vocabulary is not affected. */
export const clearFlashcardProgress = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear flashcard progress:', error);
  }
};

/**
 * Remove schedules whose vocabulary word no longer exists.
 * Returns how many orphan entries were cleaned up.
 */
export const pruneOrphanFlashcards = (): number => {
  try {
    const all = getAllFlashcards();
    const liveIds = new Set(getSavedWords().map((item) => item.id));

    let removed = 0;
    for (const vocabularyId of Object.keys(all)) {
      if (!liveIds.has(vocabularyId)) {
        delete all[vocabularyId];
        removed += 1;
      }
    }

    if (removed > 0) persist(all);
    return removed;
  } catch {
    return 0;
  }
};

/* ==========================================================================
   Building a review session
   ========================================================================== */

/**
 * Build the queue of cards to review.
 *
 * Order of priority:
 *   1. cards already scheduled and overdue, most overdue first
 *   2. other cards that are due now
 *   3. brand new cards (no schedule yet), which are due immediately
 *
 * Words deleted from Personal Vocabulary are skipped here, so an orphaned
 * schedule can never appear as a review card. The session is capped so a large
 * backlog stays a reasonable length; the remainder simply stays due for next
 * time and is never deleted.
 */
export const buildDueCards = (
  now: Date = new Date(),
  limit: number = DEFAULT_SESSION_LIMIT
): DueFlashcard[] => {
  const progressMap = getAllFlashcards();
  const scheduled: { card: DueFlashcard; sortKey: number }[] = [];
  const fresh: DueFlashcard[] = [];

  // Only words that still exist in Personal Vocabulary are considered, which is
  // what keeps deleted words from reappearing as orphan cards.
  for (const word of getSavedWords()) {
    const progress = progressMap[word.id] ?? null;

    if (!progress) {
      // Never reviewed: a new card, ready to be learned right away.
      fresh.push({ word, progress: createInitialProgress(word.id, now) });
      continue;
    }

    if (!isDue(progress, now)) continue;
    scheduled.push({ card: { word, progress }, sortKey: Date.parse(progress.dueAt) });
  }

  // Most overdue first: the longer a card has waited, the more it needs review.
  scheduled.sort((a, b) => a.sortKey - b.sortKey);

  const combined = [...scheduled.map((item) => item.card), ...fresh];

  return Number.isFinite(limit) && limit > 0 ? combined.slice(0, limit) : combined;
};

/** How many words are waiting to be reviewed right now, ignoring the session cap. */
export const countDueCards = (now: Date = new Date()): number =>
  buildDueCards(now, Infinity).length;