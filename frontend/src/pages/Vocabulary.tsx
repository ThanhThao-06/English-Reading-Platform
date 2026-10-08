import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import type { VocabularyFilter, VocabularyWord } from '../types/vocabulary';
import { getSavedWords, removeWord, toggleWordStatus } from '../utils/vocabularyStorage';
import { countDueCards, removeFlashcardProgress } from '../utils/flashcardStorage';
import './Vocabulary.css';

export const Vocabulary: React.FC = () => {
  const navigate = useNavigate();
  const [words, setWords] = useState<VocabularyWord[]>(() => getSavedWords());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<VocabularyFilter>('All');

  const handleToggleStatus = (id: string) => {
    const updated = toggleWordStatus(id);
    setWords(updated);
  };

  const handleRemoveWord = (id: string) => {
    const updated = removeWord(id);
    // The word is gone, so its review schedule is now an orphan: drop it too,
    // keeping the two stores consistent.
    removeFlashcardProgress(id);
    setWords(updated);
  };

  /**
   * Cards waiting to be reviewed, derived on each render from the saved
   * vocabulary rather than memoised: it is cheap (one localStorage read), and
   * `words` is the signal that storage changed - removing a word must
   * immediately drop its card, and adding one must make it reviewable.
   *
   * Orphans are skipped when the queue is built, so a deleted word can never
   * reappear as a review card even before its schedule is cleaned up.
   */
  const dueCount = countDueCards(new Date());

  const handlePlayAudio = (wordText: string, audioUrl?: string) => {
    if (audioUrl) {
      try {
        const audio = new Audio(audioUrl);
        audio.play().catch(() => speakWord(wordText));
        return;
      } catch {
        speakWord(wordText);
        return;
      }
    }
    speakWord(wordText);
  };

  const speakWord = (text: string) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  const totalCount = words.length;
  const learningCount = words.filter((w) => w.status === 'learning').length;
  const learnedCount = words.filter((w) => w.status === 'learned').length;

  // Filter words by search query and status
  const filteredWords = useMemo(() => {
    return words.filter((item) => {
      // Search matching (word, meaning, or meaningVi)
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchesWord = item.word.toLowerCase().includes(query);
        const matchesMeaning = item.meaning.toLowerCase().includes(query);
        const matchesMeaningVi = item.meaningVi
          ? item.meaningVi.toLowerCase().includes(query)
          : false;
        if (!matchesWord && !matchesMeaning && !matchesMeaningVi) return false;
      }

      // Status filtering
      if (statusFilter === 'Learning' && item.status !== 'learning') {
        return false;
      }
      if (statusFilter === 'Learned' && item.status !== 'learned') {
        return false;
      }

      return true;
    });
  }, [words, searchQuery, statusFilter]);

  return (
    <div className="vocab-page">
      <Header />

      <main className="vocab-main">
        {/* Hero Section */}
        <section className="vocab-hero">
          <div className="vocab-hero-badge">Personal Vocabulary</div>
          <h1 className="vocab-title">My Vocabulary</h1>
          <p className="vocab-subtitle">
            Review and master words you&apos;ve collected while reading English articles.
          </p>

          {/* Flashcard review entry point (Phase 2.4) */}
          {totalCount > 0 && (
            <div className="vocab-review-panel">
              <div className="vocab-review-panel-stats">
                <span className="vocab-review-panel-count">{totalCount} words</span>
                <span className="vocab-review-panel-dot" aria-hidden="true">
                  ·
                </span>
                <span
                  className={`vocab-review-panel-due${dueCount > 0 ? ' has-due' : ''}`}
                >
                  {dueCount} due for review
                </span>
              </div>

              <button
                type="button"
                className="vocab-review-start-btn"
                onClick={() => navigate('/vocabulary/review')}
                disabled={dueCount === 0}
                aria-label={
                  dueCount === 0
                    ? 'No words are due for review'
                    : `Start reviewing ${dueCount} words`
                }
              >
                {dueCount === 0 ? 'Nothing due yet' : 'Start Review'}
              </button>
            </div>
          )}
        </section>

        {/* Controls Bar: Search & Status Filters */}
        <section className="vocab-controls" aria-label="Vocabulary controls">
          <div className="vocab-search-wrapper">
            <span className="vocab-search-icon" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="text"
              className="vocab-search-input"
              placeholder="Search saved words or definitions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search saved words"
            />
          </div>

          <div className="vocab-filter-group" role="group" aria-label="Status filter">
            <button
              type="button"
              className={`vocab-filter-pill ${statusFilter === 'All' ? 'active' : ''}`}
              onClick={() => setStatusFilter('All')}
            >
              All <span className="vocab-pill-count">{totalCount}</span>
            </button>
            <button
              type="button"
              className={`vocab-filter-pill ${statusFilter === 'Learning' ? 'active' : ''}`}
              onClick={() => setStatusFilter('Learning')}
            >
              Learning <span className="vocab-pill-count">{learningCount}</span>
            </button>
            <button
              type="button"
              className={`vocab-filter-pill ${statusFilter === 'Learned' ? 'active' : ''}`}
              onClick={() => setStatusFilter('Learned')}
            >
              Learned <span className="vocab-pill-count">{learnedCount}</span>
            </button>
          </div>
        </section>

        {/* Vocabulary Cards Grid or Empty State */}
        {words.length === 0 ? (
          <div className="vocab-empty-state">
            <div className="vocab-empty-icon" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </div>
            <h2 className="vocab-empty-title">Your vocabulary is empty</h2>
            <p className="vocab-empty-text">
              Select any unfamiliar word while reading an article and click &ldquo;Save Word&rdquo; to build your personal vocabulary list.
            </p>
            <button
              type="button"
              className="vocab-start-btn"
              onClick={() => navigate('/')}
            >
              Start Reading →
            </button>
          </div>
        ) : filteredWords.length === 0 ? (
          <div className="vocab-empty-state">
            <h2 className="vocab-empty-title">No matching words found</h2>
            <p className="vocab-empty-text">
              No words match your current search &ldquo;{searchQuery}&rdquo; and filter settings.
            </p>
            <button
              type="button"
              className="vocab-start-btn"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('All');
              }}
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="vocab-grid" aria-label="Saved vocabulary list">
            {filteredWords.map((item) => (
              <article key={item.id} className="vocab-card" id={`vocab-${item.id}`}>
                <div className="vocab-card-header">
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h3 className="vocab-word-title">{item.word}</h3>
                      <button
                        type="button"
                        className="vocab-audio-btn"
                        onClick={() => handlePlayAudio(item.word, item.audioUrl)}
                        aria-label={`Play pronunciation for ${item.word}`}
                        title="Play pronunciation"
                      >
                        🔊
                      </button>
                    </div>
                    {item.phonetic && (
                      <div className="vocab-phonetic-row">
                        <span className="vocab-phonetic">{item.phonetic}</span>
                      </div>
                    )}
                  </div>
                  {item.partOfSpeech && (
                    <span className="vocab-part-of-speech">{item.partOfSpeech}</span>
                  )}
                </div>

                <p className="vocab-meaning">{item.meaning}</p>

                {item.meaningVi && (
                  <p className="vocab-meaning-vi">
                    <strong>Tiếng Việt:</strong> {item.meaningVi}
                  </p>
                )}

                {item.example && (
                  <div className="vocab-example-box">
                    <p className="vocab-example">&ldquo;{item.example}&rdquo;</p>
                    {item.exampleVi && (
                      <p className="vocab-example-vi">{item.exampleVi}</p>
                    )}
                  </div>
                )}

                <div className="vocab-source">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                  </svg>
                  <span>
                    Source:{' '}
                    <Link
                      to={`/article/${item.sourceArticleId}`}
                      className="vocab-source-link"
                      title={`View article: ${item.sourceArticleTitle}`}
                    >
                      {item.sourceArticleTitle}
                    </Link>
                  </span>
                </div>

                <div className="vocab-card-actions">
                  <button
                    type="button"
                    className={`vocab-status-btn ${item.status}`}
                    onClick={() => handleToggleStatus(item.id)}
                    aria-label={`Toggle learning status for ${item.word}`}
                  >
                    {item.status === 'learned' ? '✓ Learned' : '○ Learning'}
                  </button>

                  <button
                    type="button"
                    className="vocab-remove-btn"
                    onClick={() => handleRemoveWord(item.id)}
                    aria-label={`Remove ${item.word} from vocabulary`}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Vocabulary;
