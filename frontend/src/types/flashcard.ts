import type { VocabularyWord } from './vocabulary';

/**
 * How well the user recalled a word during review.
 *
 * These are recall ratings, not a quiz verdict: there is no correct/incorrect,
 * because the user is judging their own memory.
 */
export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';

/**
 * Spaced Repetition state for ONE saved vocabulary word.
 *
 * This deliberately holds only scheduling data - no word, meaning, IPA, example
 * or audio. All of that stays in Personal Vocabulary, and the card joins the two
 * by `vocabularyId`. Deleting the vocabulary word therefore makes this entry an
 * orphan, which is simply ignored when building a review session.
 */
export interface FlashcardProgress {
  /** `VocabularyWord.id` this schedule belongs to. */
  vocabularyId: string;
  /** How many successful recalls in a row (reset to 0 by "again"). */
  repetitions: number;
  /**
   * Days until the next review.
   * `0` is the sentinel for "new" or "lapsed" - due immediately, not scheduled.
   */
  interval: number;
  /** Scheduling multiplier. Never below the minimum, never above the maximum. */
  easeFactor: number;
  /** ISO datetime (UTC) when this card becomes due again. */
  dueAt: string;
  /** ISO datetime (UTC) of the most recent review. */
  lastReviewedAt?: string;
  /** The rating given at the most recent review. */
  lastRating?: ReviewRating;
}

/** Progress for every card, keyed by vocabulary id. */
export type FlashcardMap = Record<string, FlashcardProgress>;

/** One card in a review session: the vocabulary word plus its live SRS state. */
export interface DueFlashcard {
  word: VocabularyWord;
  /** Existing schedule, or null when this word has never been reviewed. */
  progress: FlashcardProgress | null;
}
