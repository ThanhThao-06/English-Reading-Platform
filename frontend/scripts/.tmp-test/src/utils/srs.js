"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatInterval = exports.isDue = exports.applyReview = exports.createInitialProgress = exports.MAX_REQUEUES_PER_SESSION = exports.DEFAULT_SESSION_LIMIT = exports.MAX_INTERVAL_DAYS = exports.MIN_INTERVAL_DAYS = exports.MAX_EASE_FACTOR = exports.MIN_EASE_FACTOR = exports.INITIAL_EASE_FACTOR = void 0;
/**
 * Spaced Repetition scheduling (Phase 2.4).
 *
 * This module is deliberately pure: no React, no localStorage, no clock reads
 * unless a caller passes one in. Every function is deterministic, which is what
 * makes the schedule testable and easy to upgrade later.
 */
/** Starting multiplier for a word that has never been reviewed. */
exports.INITIAL_EASE_FACTOR = 2.5;
/** Lower bound for the multiplier, so a run of bad answers cannot make it useless. */
exports.MIN_EASE_FACTOR = 1.3;
/** Upper bound for the multiplier. */
exports.MAX_EASE_FACTOR = 3.0;
/** Shortest scheduled gap, in days. */
exports.MIN_INTERVAL_DAYS = 1;
/** Longest scheduled gap, in days. About a year. */
exports.MAX_INTERVAL_DAYS = 365;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** How far "Again" pushes the card back, in minutes. */
const AGAIN_DELAY_MINUTES = 10;
/** Maximum cards in one review session. */
exports.DEFAULT_SESSION_LIMIT = 20;
/**
 * How many times a card may be re-queued after "Again" within a single session.
 * Without this bound a repeatedly-failed card could loop forever.
 */
exports.MAX_REQUEUES_PER_SESSION = 2;
/** The starting state for a word that has never been reviewed. */
const createInitialProgress = (vocabularyId, now = new Date()) => ({
    vocabularyId,
    repetitions: 0,
    interval: 0,
    easeFactor: exports.INITIAL_EASE_FACTOR,
    // A new card is due immediately.
    dueAt: now.toISOString(),
});
exports.createInitialProgress = createInitialProgress;
const clampEase = (value) => Math.min(exports.MAX_EASE_FACTOR, Math.max(exports.MIN_EASE_FACTOR, value));
const clampInterval = (value) => Math.min(exports.MAX_INTERVAL_DAYS, Math.max(exports.MIN_INTERVAL_DAYS, Math.round(value)));
/**
 * Apply a rating and return the card's next state.
 *
 * `previous` is null for a word that has never been reviewed. `now` is injectable
 * so callers (and tests) control the clock.
 */
const applyReview = (vocabularyId, rating, previous, now = new Date()) => {
    const base = previous ?? (0, exports.createInitialProgress)(vocabularyId, now);
    const isNew = base.repetitions === 0 || base.interval === 0;
    const reviewedAt = now.toISOString();
    // A brand new card has no interval to grow from, so each rating picks a small
    // first step. This keeps the schedule sensible without any special-casing
    // leaking into the formulas below.
    let repetitions;
    let interval;
    let easeFactor;
    let dueAt;
    switch (rating) {
        case 'again':
            // "I don't remember this." Back to square one, and back very soon.
            repetitions = 0;
            interval = 0;
            easeFactor = clampEase(base.easeFactor - 0.2);
            dueAt = new Date(now.getTime() + AGAIN_DELAY_MINUTES * 60 * 1000).toISOString();
            break;
        case 'hard':
            // "Recalled, but slowly." A small step forward and a small penalty.
            repetitions = base.repetitions + 1;
            easeFactor = clampEase(base.easeFactor - 0.15);
            interval = isNew ? 1 : clampInterval(base.interval * 1.2);
            dueAt = new Date(now.getTime() + interval * MS_PER_DAY).toISOString();
            break;
        case 'good':
            // The normal path: grow the interval by the multiplier.
            repetitions = base.repetitions + 1;
            easeFactor = clampEase(base.easeFactor + 0.05);
            interval = isNew ? 1 : clampInterval(base.interval * base.easeFactor);
            dueAt = new Date(now.getTime() + interval * MS_PER_DAY).toISOString();
            break;
        case 'easy':
            // Remembered instantly: a bigger jump and a bigger bonus.
            repetitions = base.repetitions + 1;
            easeFactor = clampEase(base.easeFactor + 0.15);
            interval = isNew ? 4 : clampInterval(base.interval * base.easeFactor * 1.3);
            dueAt = new Date(now.getTime() + interval * MS_PER_DAY).toISOString();
            break;
    }
    return {
        vocabularyId,
        repetitions,
        interval,
        easeFactor,
        dueAt,
        lastReviewedAt: reviewedAt,
        lastRating: rating,
    };
};
exports.applyReview = applyReview;
/** Is this card due now? */
const isDue = (progress, now = new Date()) => {
    const due = Date.parse(progress.dueAt);
    if (Number.isNaN(due))
        return true;
    return due <= now.getTime();
};
exports.isDue = isDue;
/** A human label such as "10 min", "3 days", "1 year". */
const formatInterval = (days) => {
    if (days <= 0)
        return 'now';
    if (days < 1) {
        const minutes = Math.round(days * 24 * 60);
        if (minutes < 60)
            return `${Math.max(1, minutes)} min`;
        const hours = Math.round(minutes / 60);
        return `${hours} hour${hours === 1 ? '' : 's'}`;
    }
    if (days < 30)
        return `${days} day${days === 1 ? '' : 's'}`;
    if (days < 365) {
        const months = Math.round(days / 30);
        return `${months} month${months === 1 ? '' : 's'}`;
    }
    const years = Math.round(days / 365);
    return `${years} year${years === 1 ? '' : 's'}`;
};
exports.formatInterval = formatInterval;
