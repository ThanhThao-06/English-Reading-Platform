import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ArticleCardData } from '../types/article';
import type { ProgressStatus } from '../types/readingProgress';
import './ArticleCard.css';

interface ArticleCardProps {
  article: ArticleCardData;
  /** Saved reading progress for this article, looked up once by the Library. */
  progressStatus: ProgressStatus;
}

export const ArticleCard: React.FC<ArticleCardProps> = ({ article, progressStatus }) => {
  const [imageError, setImageError] = useState(false);
  const navigate = useNavigate();

  const handleCardClick = () => {
    navigate(`/article/${article.id}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCardClick();
    }
  };

  // Fallback placeholder pattern if external image fails to load
  const fallbackSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450"><rect width="800" height="450" fill="%23161b22"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui,sans-serif" font-size="24" fill="%238b949e">${encodeURIComponent(
    article.genre
  )}</text></svg>`;

  return (
    <article
      className="article-card"
      id={`article-${article.id}`}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`Read article: ${article.title}`}
    >
      <div className="article-card-cover-wrapper">
        <img
          src={imageError || !article.image ? fallbackSvg : article.image}
          alt={article.title}
          className="article-card-cover"
          loading="lazy"
          onError={() => setImageError(true)}
        />
        <span className="article-card-genre-badge">{article.genre}</span>
      </div>

      <div className="article-card-content">
        <h3 className="article-card-title" title={article.title}>
          {article.title}
        </h3>
        <p className="article-card-description">{article.description}</p>

        <div className="article-card-meta">
          <span
            className="article-level-badge"
            data-level={article.level}
            title={`CEFR Level ${article.level}`}
          >
            Level {article.level}
          </span>
          <span className="article-time-badge" title={`Reading time: ${article.readingTime}`}>
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

        {/* Small reading progress indicator - only shown once reading has begun */}
        {progressStatus.kind !== 'none' && (
          <div
            className="article-card-progress"
            data-status={progressStatus.kind}
            title={
              progressStatus.kind === 'completed'
                ? 'Completed'
                : `Reading · ${progressStatus.progress}%`
            }
          >
            <div className="article-card-progress-track" aria-hidden="true">
              <div
                className="article-card-progress-fill"
                style={{ width: `${progressStatus.progress}%` }}
              />
            </div>
            <span className="article-card-progress-text">
              {progressStatus.kind === 'completed'
                ? 'Completed'
                : `Reading · ${progressStatus.progress}%`}
            </span>
          </div>
        )}
      </div>
    </article>
  );
};
