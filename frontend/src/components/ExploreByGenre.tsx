import React from 'react';
import { Link } from 'react-router-dom';
import type { Genre } from '../types/article';
import { getGenreRoute, type GenreSummary } from '../utils/libraryBrowse';
import './ExploreByGenre.css';

/**
 * Simple, decorative line glyphs, one per genre.
 *
 * They are presentational only (`aria-hidden` in the markup) and describe the
 * topic only - they never stand in for a cover image or any article data.
 */
const NEWS_ICON = (
  <>
    <path d="M4 5h11a1 1 0 0 1 1 1v13a1 1 0 0 0 1 1H5a1 1 0 0 1-1-1z" />
    <path d="M16 8h3a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2" />
    <line x1="7" y1="9" x2="12" y2="9" />
    <line x1="7" y1="12" x2="12" y2="12" />
    <line x1="7" y1="15" x2="10" y2="15" />
  </>
);

const BUSINESS_ICON = (
  <>
    <line x1="4" y1="20" x2="4" y2="13" />
    <line x1="10" y1="20" x2="10" y2="8" />
    <line x1="16" y1="20" x2="16" y2="4" />
    <line x1="22" y1="20" x2="22" y2="10" />
    <line x1="3" y1="20" x2="22" y2="20" />
  </>
);

const SCIENCE_ICON = (
  <>
    <path d="M9.5 3v6.2L4.3 18a2 2 0 0 0 1.7 3h12a2 2 0 0 0 1.7-3l-5.2-8.8V3" />
    <line x1="8" y1="3" x2="16" y2="3" />
    <line x1="6.8" y1="14" x2="17.2" y2="14" />
  </>
);

const TECHNOLOGY_ICON = (
  <>
    <rect x="7" y="7" width="10" height="10" rx="1.5" />
    <rect x="10.5" y="10.5" width="3" height="3" />
    <line x1="10" y1="7" x2="10" y2="4" />
    <line x1="14" y1="7" x2="14" y2="4" />
    <line x1="10" y1="20" x2="10" y2="17" />
    <line x1="14" y1="20" x2="14" y2="17" />
    <line x1="7" y1="10" x2="4" y2="10" />
    <line x1="7" y1="14" x2="4" y2="14" />
    <line x1="17" y1="10" x2="20" y2="10" />
    <line x1="17" y1="14" x2="20" y2="14" />
  </>
);

const HEALTH_ICON = (
  <>
    <path d="M20.4 5.6a5.4 5.4 0 0 0-7.6 0L12 6.4l-.8-.8a5.4 5.4 0 1 0-7.6 7.6l.8.8L12 21.6l7.6-7.6.8-.8a5.4 5.4 0 0 0 0-7.6z" />
    <polyline points="5.5 12.5 9.5 12.5 11 10 13 15 14.5 12.5 18.5 12.5" />
  </>
);

const CULTURE_ICON = (
  <>
    <circle cx="12" cy="12" r="9" />
    <ellipse cx="12" cy="12" rx="4" ry="9" />
    <line x1="3" y1="12" x2="21" y2="12" />
  </>
);

const EDUCATION_ICON = (
  <>
    <path d="M12 4 2 9l10 5 10-5z" />
    <path d="M6 11.5V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-4.5" />
    <line x1="22" y1="9" x2="22" y2="14" />
  </>
);

const HISTORY_ICON = (
  <>
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 15.5 14" />
  </>
);

const ENVIRONMENT_ICON = (
  <>
    <path d="M20 4c0 9-5.5 13-11 13a5 5 0 0 1-4-2c6-1 9-4 11-8-3 3-6 4-9 4" />
    <path d="M4 21c2-5 6-8 11-9" />
  </>
);

const LAW_ICON = (
  <>
    <line x1="12" y1="4" x2="12" y2="20" />
    <line x1="6" y1="20" x2="18" y2="20" />
    <line x1="4" y1="8" x2="20" y2="8" />
    <path d="M4 8 1.5 14a2.6 2.6 0 0 0 5 0z" />
    <path d="M20 8l-2.5 6a2.6 2.6 0 0 0 5 0z" />
  </>
);

const GENRE_ICONS: Record<Genre, React.ReactNode> = {
  'News & Social Issues': NEWS_ICON,
  'Science & Nature': SCIENCE_ICON,
  'Technology & AI': TECHNOLOGY_ICON,
  'Business & Economics': BUSINESS_ICON,
  'Health & Psychology': HEALTH_ICON,
  'Culture, Art & Travel': CULTURE_ICON,
  'Stories & Literature': (
    <>
      <path d="M12 6.5C10.5 5 8 4.4 3.5 4.4v13.2C8 17.6 10.5 18.2 12 19.7" />
      <path d="M12 6.5c1.5-1.5 4-2.1 8.5-2.1v13.2c-4.5 0-7 .6-8.5 2.1" />
      <line x1="12" y1="6.5" x2="12" y2="19.7" />
    </>
  ),
  Education: EDUCATION_ICON,
  History: HISTORY_ICON,
  Environment: ENVIRONMENT_ICON,
  'Law & Politics': LAW_ICON,
};

interface ExploreByGenreProps {
  /** Built from the real article list; never a hand-written genre list. */
  genres: readonly GenreSummary[];
}

export const ExploreByGenre: React.FC<ExploreByGenreProps> = ({ genres }) => {
  return (
    <section className="genre-explorer" aria-labelledby="genre-explorer-title">
      <div className="genre-explorer-header">
        <h2 className="genre-explorer-title" id="genre-explorer-title">
          Explore by Genre
        </h2>
        <p className="genre-explorer-subtitle">
          Pick a topic to browse every article filed under it. The Library page above only
          features a handful of reads.
        </p>
      </div>

      {genres.length === 0 ? (
        <p className="genre-explorer-empty">No articles are available to explore yet.</p>
      ) : (
        <ul className="genre-list">
          {genres.map(({ genre, count }) => (
            <li className="genre-list-item" key={genre}>
              <Link className="genre-card" to={getGenreRoute(genre)}>
                <span className="genre-card-icon" aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {GENRE_ICONS[genre]}
                  </svg>
                </span>

                <span className="genre-card-body">
                  <span className="genre-card-name">{genre}</span>
                  <span className="genre-card-count">
                    {count} {count === 1 ? 'article' : 'articles'}
                  </span>
                </span>

                <span className="genre-card-arrow" aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="13 6 19 12 13 18" />
                  </svg>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
