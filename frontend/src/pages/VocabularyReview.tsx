import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flashcard } from '../components/Flashcard';
import { Header } from '../components/Header';
import type { DueFlashcard, ReviewRating } from '../types/flashcard';
import type { VocabularyWord } from '../types/vocabulary';
import { buildDueCards, saveFlashcardProgress } from '../utils/flashcardStorage';
import { DEFAULT_SESSION_LIMIT, MAX_REQUEUES_PER_SESSION } from '../utils/srs';
import './VocabularyReview.css';

/** A card waiting in the current session, with its requeue budget. */
interface QueueItem {
  card: DueFlashcard;
  /** How many times "Again" has already sent this card back in this session. */
  requeues: number;
}

const RATINGS: { rating: ReviewRating; label: string; hint: string }[] = [
  { rating: 'again', label: 'Again', hint: 'Forgot it' },
  { rating: 'hard', label: 'Hard', hint: 'Barely' },
  { rating: 'good', label: 'Good', hint: 'Recalled' },
  { rating: 'easy', label: 'Easy', hint: 'Instantly' },
];

/** Speak the word, reusing the audio already saved with the vocabulary entry. */
const speakWord = (word: VocabularyWord) => {
  if (word.audioUrl) {
    try {
      const audio = new Audio(word.audioUrl);
      audio.play().catch(() => fallbackSpeech(word.word));
      return;
    } catch {
      fallbackSpeech(word.word);
      return;
    }
  }
  fallbackSpeech(word.word);
};

const fallbackSpeech = (text: string) => {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }
};

const startQueue = (): QueueItem[] =>
  buildDueCards(new Date(), DEFAULT_SESSION_LIMIT).map((card) => ({ card, requeues: 0 }));

export const VocabularyReview: React.FC = () => {
  const navigate = useNavigate();

  /**
   * The session queue is rebuilt from storage whenever the page mounts or is
   * restarted. Nothing about the session itself is persisted, so a refresh
   * simply starts a fresh queue from whatever is due - and the SRS results that
   * were already saved are never lost.
   */
  const [queue, setQueue] = useState<QueueItem[]>(startQueue);
  const [isRevealed, setIsRevealed] = useState<boolean>(false);
  const [reviewedCount, setReviewedCount] = useState<number>(0);

  const current = queue[0] ?? null;
  const total = queue.length + reviewedCount;

  const handleSpeak = useCallback((word: VocabularyWord) => speakWord(word), []);

  const handleRate = (rating: ReviewRating) => {
    if (!current) return;

    // Persist the schedule first: the SRS result must survive a refresh.
    saveFlashcardProgress(current.card.word.id, rating, new Date());

    setQueue((previous) => {
      const [head, ...rest] = previous;
      if (!head) return previous;

      // "Again" means the word was not recalled, so the card comes back later in
      // this same session. The requeue budget stops a hopeless card from looping
      // forever.
      if (rating === 'again' && head.requeues < MAX_REQUEUES_PER_SESSION) {
        return [...rest, { ...head, requeues: head.requeues + 1 }];
      }

      return rest;
    });

    setReviewedCount((count) => count + 1);
    setIsRevealed(false);
  };

  const restartSession = () => {
    setQueue(startQueue());
    setReviewedCount(0);
    setIsRevealed(false);
  };

  return (
    <div className="vocab-review-page">
      <Header />

      <main className="vocab-review-main">
        <button
          type="button"
          className="back-button"
          onClick={() => navigate('/vocabulary')}
          aria-label="Back to My Vocabulary"
        >
          ← Back to Vocabulary
        </button>

        <header className="vocab-review-header">
          <h1 className="vocab-review-title">Review</h1>
          <p className="vocab-review-subtitle">Recall each word before revealing the answer.</p>
        </header>

        {/* Empty state: nothing is due. No invented data, no fake countdown. */}
        {total === 0 && (
          <section className="vocab-review-empty" aria-live="polite">
            <h2>You&apos;re all caught up!</h2>
            <p>No cards are due for review.</p>
            <p className="vocab-review-empty-hint">Come back later to review new words.</p>
            <button
              type="button"
              className="vocab-review-primary-btn"
              onClick={() => navigate('/vocabulary')}
            >
              Back to Vocabulary
            </button>
          </section>
        )}

        {/* Active session */}
        {total > 0 && current && (
          <section className="vocab-review-session">
            <div className="vocab-review-progress">
              <div className="vocab-review-progress-text">
                <span>
                  {reviewedCount + 1} of {total}
                </span>
                {current.card.progress && current.card.progress.repetitions > 0 && (
                  <span className="vocab-review-progress-new">
                    Review {current.card.progress.repetitions + 1}
                  </span>
                )}
              </div>
              <div
                className="vocab-review-progress-bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={reviewedCount}
                aria-label="Review progress"
              >
                <div
                  className="vocab-review-progress-fill"
                  style={{ width: `${total === 0 ? 0 : (reviewedCount / total) * 100}%` }}
                />
              </div>
            </div>

            <Flashcard
              key={current.card.word.id}
              word={current.card.word}
              isRevealed={isRevealed}
              onReveal={() => setIsRevealed(true)}
              onSpeak={handleSpeak}
            />

            {/* Ratings appear only after the answer is shown. */}
            {isRevealed && (
              <div className="vocab-review-ratings">
                {RATINGS.map((item) => (
                  <button
                    key={item.rating}
                    type="button"
                    className={`vocab-review-rating-btn is-${item.rating}`}
                    onClick={() => handleRate(item.rating)}
                  >
                    <span className="vocab-review-rating-label">{item.label}</span>
                    <span className="vocab-review-rating-hint">{item.hint}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Completion: a plain count, with no streak, points or achievements. */}
        {total > 0 && !current && (
          <section className="vocab-review-empty" aria-live="polite">
            <h2>Review Complete</h2>
            <p>
              {reviewedCount} card{reviewedCount === 1 ? '' : 's'} reviewed
            </p>
            <div className="vocab-review-complete-actions">
              <button
                type="button"
                className="vocab-review-primary-btn"
                onClick={restartSession}
              >
                Review Again
              </button>
              <button
                type="button"
                className="vocab-review-secondary-btn"
                onClick={() => navigate('/vocabulary')}
              >
                Back to Vocabulary
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default VocabularyReview;
