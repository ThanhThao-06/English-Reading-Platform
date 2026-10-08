"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.countDueCards = exports.buildDueCards = exports.pruneOrphanFlashcards = exports.clearFlashcardProgress = exports.removeFlashcardProgress = exports.saveFlashcardProgress = exports.getFlashcard = exports.getAllFlashcards = void 0;
const vocabularyStorage_1 = require("./vocabularyStorage");
const srs_1 = require("./srs");
/**
 * localStorage key for Spaced Repetition schedules.
 *
 * Separate from `english-reading-vocabulary`, `english-reading-highlights` and
 * `english-reading-progress`, none of which are read or written here. Only
 * scheduling data is stored: the word content always comes from Personal
 * Vocabulary.
 */
const STORAGE_KEY = 'english-reading-flashcards';
const isNonNegativeInt = (value) => typeof value === 'number' && Number.isInteger(value) && value >= 0;
const clampEase = (value) => typeof value === 'number' && Number.isFinite(value) ? Math.min(3, Math.max(1.3, value)) : 2.5;
const isValidRating = (value) => value === 'again' || value === 'hard' || value === 'good' || value === 'easy';
/**
 * Keep only entries that look like a usable schedule.
 * Anything malformed is dropped rather than thrown, so a bad write can never
 * break the review page.
 */
const isValidProgress = (value) => {
    if (!value || typeof value !== 'object')
        return false;
    const entry = value;
    const due = typeof entry.dueAt === 'string' ? Date.parse(entry.dueAt) : NaN;
    return (typeof entry.vocabularyId === 'string' &&
        entry.vocabularyId.length > 0 &&
        isNonNegativeInt(entry.repetitions) &&
        isNonNegativeInt(entry.interval) &&
        typeof entry.easeFactor === 'number' &&
        Number.isFinite(entry.easeFactor) &&
        !Number.isNaN(due));
};
const normalize = (entry) => ({
    vocabularyId: entry.vocabularyId,
    repetitions: entry.repetitions,
    interval: Math.min(365, Math.max(0, entry.interval)),
    easeFactor: clampEase(entry.easeFactor),
    dueAt: entry.dueAt,
    lastReviewedAt: typeof entry.lastReviewedAt === 'string' && !Number.isNaN(Date.parse(entry.lastReviewedAt))
        ? entry.lastReviewedAt
        : undefined,
    lastRating: isValidRating(entry.lastRating) ? entry.lastRating : undefined,
});
const persist = (map) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    }
    catch (error) {
        console.error('Failed to save flashcard progress to localStorage:', error);
    }
};
/* ==========================================================================
   Reads / writes
   ========================================================================== */
/** Every saved schedule, keyed by vocabulary id. Empty when storage is unusable. */
const getAllFlashcards = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw)
            return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
            return {};
        const result = {};
        for (const [vocabularyId, value] of Object.entries(parsed)) {
            if (!isValidProgress(value))
                continue;
            if (value.vocabularyId !== vocabularyId)
                continue;
            result[vocabularyId] = normalize(value);
        }
        return result;
    }
    catch {
        // Missing or corrupted storage simply means "no cards reviewed yet".
        return {};
    }
};
exports.getAllFlashcards = getAllFlashcards;
/** The schedule for one word, or null when it has never been reviewed. */
const getFlashcard = (vocabularyId) => vocabularyId ? (0, exports.getAllFlashcards)()[vocabularyId] ?? null : null;
exports.getFlashcard = getFlashcard;
/** Record a review and return the new state (or null when it could not be saved). */
const saveFlashcardProgress = (vocabularyId, rating, now = new Date()) => {
    if (!vocabularyId || !isValidRating(rating))
        return null;
    try {
        const all = (0, exports.getAllFlashcards)();
        const next = (0, srs_1.applyReview)(vocabularyId, rating, all[vocabularyId] ?? null, now);
        all[vocabularyId] = next;
        persist(all);
        return next;
    }
    catch {
        return null;
    }
};
exports.saveFlashcardProgress = saveFlashcardProgress;
/** Drop one card's schedule, e.g. when its vocabulary word is deleted. */
const removeFlashcardProgress = (vocabularyId) => {
    if (!vocabularyId)
        return false;
    try {
        const all = (0, exports.getAllFlashcards)();
        if (!(vocabularyId in all))
            return false;
        delete all[vocabularyId];
        persist(all);
        return true;
    }
    catch {
        return false;
    }
};
exports.removeFlashcardProgress = removeFlashcardProgress;
/** Forget every schedule. Personal Vocabulary is not affected. */
const clearFlashcardProgress = () => {
    try {
        localStorage.removeItem(STORAGE_KEY);
    }
    catch (error) {
        console.error('Failed to clear flashcard progress:', error);
    }
};
exports.clearFlashcardProgress = clearFlashcardProgress;
/**
 * Remove schedules whose vocabulary word no longer exists.
 * Returns how many orphan entries were cleaned up.
 */
const pruneOrphanFlashcards = () => {
    try {
        const all = (0, exports.getAllFlashcards)();
        const liveIds = new Set((0, vocabularyStorage_1.getSavedWords)().map((item) => item.id));
        let removed = 0;
        for (const vocabularyId of Object.keys(all)) {
            if (!liveIds.has(vocabularyId)) {
                delete all[vocabularyId];
                removed += 1;
            }
        }
        if (removed > 0)
            persist(all);
        return removed;
    }
    catch {
        return 0;
    }
};
exports.pruneOrphanFlashcards = pruneOrphanFlashcards;
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
const buildDueCards = (now = new Date(), limit = srs_1.DEFAULT_SESSION_LIMIT) => {
    const progressMap = (0, exports.getAllFlashcards)();
    const scheduled = [];
    const fresh = [];
    // Only words that still exist in Personal Vocabulary are considered, which is
    // what keeps deleted words from reappearing as orphan cards.
    for (const word of (0, vocabularyStorage_1.getSavedWords)()) {
        const progress = progressMap[word.id] ?? null;
        if (!progress) {
            // Never reviewed: a new card, ready to be learned right away.
            fresh.push({ word, progress: (0, srs_1.createInitialProgress)(word.id, now) });
            continue;
        }
        if (!(0, srs_1.isDue)(progress, now))
            continue;
        scheduled.push({ card: { word, progress }, sortKey: Date.parse(progress.dueAt) });
    }
    // Most overdue first: the longer a card has waited, the more it needs review.
    scheduled.sort((a, b) => a.sortKey - b.sortKey);
    const combined = [...scheduled.map((item) => item.card), ...fresh];
    return Number.isFinite(limit) && limit > 0 ? combined.slice(0, limit) : combined;
};
exports.buildDueCards = buildDueCards;
/** How many words are waiting to be reviewed right now, ignoring the session cap. */
const countDueCards = (now = new Date()) => (0, exports.buildDueCards)(now, Infinity).length;
exports.countDueCards = countDueCards;
