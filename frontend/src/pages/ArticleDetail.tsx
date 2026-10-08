import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { useLibraryArticle } from '../hooks/useLibraryData';
import {
  formatChapterNumber,
  getChapterForProgress,
  getChapterRoute,
  getValidChapters,
} from '../utils/chapterUtils';
import { getProgressStatus } from '../utils/readingProgressStorage';
import './ArticleDetail.css';

export const ArticleDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { article, loading, error } = useLibraryArticle(id);

  // Read on every render so switching between articles never shows a stale value.
  const progressStatus = getProgressStatus(id ?? '');

  if (!article) {
    return (
      <div className="article-detail-page">
        <Header />
        <main className="article-detail-main">
          <div className="article-not-found-card">
            <h1>{loading ? 'Loading article' : error ? 'Article unavailable' : 'Article not found'}</h1>
            <p>
              {loading
                ? 'The requested reading article is loading.'
                : error ?? 'The requested reading article does not exist or may have been removed.'}
            </p>
            <button
              type="button"
              className="back-button"
              onClick={() => navigate('/')}
            >
              ← Back to Library
            </button>
          </div>
        </main>
      </div>
    );
  }

  const startButtonLabel =
    progressStatus.kind === 'completed'
      ? 'Read Again'
      : progressStatus.kind === 'in-progress'
        ? 'Continue Reading'
        : 'Start Reading';

  // Only validated chapters are offered; articles without chapters show nothing.
  const chapters = getValidChapters(article);

  /**
   * Where "Start Reading" / "Continue Reading" should open.
   *
   * For a chapterized article this is the reader's own chapter page, resuming at
   * the chapter that matches saved progress so the reader picks up where they
   * left off. Articles without chapters keep the original whole-article reader.
   */
  const startRoute = (() => {
    if (chapters.length === 0) return `/reader/${article.id}`;

    // `getChapterForProgress` can only return null for an article with no valid
    // chapters, which is already handled above, but the fallback keeps this safe
    // if the data ever changes.
    const resumeChapter =
      (progressStatus.kind === 'in-progress'
        ? getChapterForProgress(article, progressStatus.progress)
        : chapters[0]) ?? chapters[0];

    return getChapterRoute(article.id, resumeChapter.id);
  })();

  return (
    <div className="article-detail-page">
      <Header />
      <main className="article-detail-main">
        <button
          type="button"
          className="back-button"
          onClick={() => navigate('/')}
          aria-label="Back to Reading Library"
        >
          ← Back to Library
        </button>

        <article className="article-detail">
          {article.image && (
            <div className="article-detail-cover-wrapper">
              <img
                src={article.image}
                alt={article.title}
                className="article-detail-image"
              />
            </div>
          )}

          <div className="article-detail-content">
            <div className="article-detail-meta">
              <span className="detail-genre-badge">{article.genre}</span>
              <span
                className="detail-level-badge"
                data-level={article.level}
                title={`CEFR Level ${article.level}`}
              >
                Level {article.level}
              </span>
              <span className="detail-time-badge" title={`Reading time: ${article.readingTime}`}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {article.readingTime}
              </span>
            </div>

            <h1 className="article-detail-title">{article.title}</h1>

            <p className="article-description">{article.description}</p>
            {article.importMetadata?.rights.attributionRequired === true
              && typeof article.importMetadata.rights.attributionText === 'string'
              && (
                <p className="article-description">
                  Attribution: {article.importMetadata.rights.attributionText}
                </p>
              )}

            {/* Reading progress status */}
            <div className="article-progress-status" data-status={progressStatus.kind}>
              {progressStatus.kind === 'none' && <span>Not started</span>}

              {progressStatus.kind === 'in-progress' && (
                <>
                  <span>In progress</span>
                  <span className="article-progress-dot" aria-hidden="true">
                    ·
                  </span>
                  <span>{progressStatus.progress}%</span>
                </>
              )}

              {progressStatus.kind === 'completed' && (
                <>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>Completed</span>
                </>
              )}
            </div>

            <button
              type="button"
              className="start-reading-button"
              onClick={() => navigate(startRoute)}
              aria-label={`${startButtonLabel} ${article.title}`}
            >
              {startButtonLabel} →
            </button>

            {/* Chapters - only rendered for articles that actually have them */}
            {chapters.length > 0 && (
              <nav className="article-chapters" aria-label="Article chapters">
                <h2 className="article-chapters-title">In this article</h2>
                <ol className="article-chapters-list">
                  {chapters.map((chapter, index) => (
                    <li key={chapter.id} className="article-chapters-item">
                      <button
                        type="button"
                        className="article-chapter-link"
                        onClick={() => navigate(getChapterRoute(article.id, chapter.id))}
                        aria-label={`Start reading chapter ${index + 1}: ${chapter.title}`}
                      >
                        <span className="article-chapter-number" aria-hidden="true">
                          {formatChapterNumber(index)}
                        </span>
                        <span className="article-chapter-text">
                          <span className="article-chapter-name">{chapter.title}</span>
                          {chapter.summary && (
                            <span className="article-chapter-summary">{chapter.summary}</span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              </nav>
            )}
          </div>
        </article>
      </main>
    </div>
  );
};

export default ArticleDetail;
