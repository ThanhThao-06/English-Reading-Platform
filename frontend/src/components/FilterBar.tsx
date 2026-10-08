import React, { useEffect, useRef, useState } from 'react';
import type { CEFRLevel, CuriosityTopic, FilterState, Genre, ReadingTimeCategory } from '../types/article';
import './FilterBar.css';

interface FilterBarProps {
  filters: FilterState;
  onFilterChange: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  onResetFilters: () => void;
  totalResults: number;
  /**
   * Set on a single-genre page, where the genre is decided by the route and
   * must not be changed or cleared from here. The Genre group then renders as
   * a fixed, read-only value instead of a dropdown, and the remaining filters
   * keep working exactly as they do on the Library.
   */
  lockedGenre?: Genre;
  /**
   * Genres that actually hold at least one article right now.
   *
   * When supplied, the Genre dropdown lists only these, so a genre that exists
   * in the taxonomy but has no real content (for example a brand-new shelf)
   * can never be offered and can never be selected. 'All' is always kept.
   *
   * Omitted on a single-genre page, where the genre is locked anyway.
   */
  availableGenres?: readonly Genre[];
}

export type OpenFilter = 'genre' | 'level' | 'readingTime' | 'curiosity' | null;

const GENRE_OPTIONS: (Genre | 'All')[] = [
  'All',
  'News & Social Issues',
  'Science & Nature',
  'Technology & AI',
  'Business & Economics',
  'Health & Psychology',
  'Culture, Art & Travel',
  'Stories & Literature',
  'Education',
  'History',
  'Environment',
  'Law & Politics',
];

const LEVEL_OPTIONS: (CEFRLevel | 'All')[] = [
  'All',
  'A1',
  'A2',
  'B1',
  'B2',
  'C1',
  'C2',
];

const READING_TIME_OPTIONS: (ReadingTimeCategory | 'All')[] = [
  'All',
  'Under 3 min',
  '5–10 min',
  'Chapter',
];

/**
 * The "Curiosities & Deep Dives" shelves, in the order they are shown.
 *
 * These are NOT genres. They sit beside the Genre dropdown as a separate
 * cross-genre axis, so `GENRE_OPTIONS` and `Genre` are left exactly as they were.
 * Unlike Genre, every shelf is always offered: the list is a fixed editorial
 * taxonomy rather than a set derived from whatever content happens to exist, so
 * there is no `availableCuriosities` prop to mirror `availableGenres`.
 */
const CURIOSITY_OPTIONS: (CuriosityTopic | 'All')[] = [
  'All',
  'Philosophy & Thought Experiments',
  'Unsolved Mysteries & Fringe Science',
  'Linguistics & Etymology',
  'True Crime & Forensic Science',
  'Gastronomy & Food History',
  'Mythology, Folklore & Dark History',
  'Urbanism & Everyday Objects',
];

export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  onFilterChange,
  onResetFilters,
  totalResults,
  lockedGenre,
  availableGenres,
}) => {
  const [openFilter, setOpenFilter] = useState<OpenFilter>(null);
  const filterBarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !filterBarRef.current?.contains(event.target)) {
        setOpenFilter(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenFilter(null);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // A locked genre is decided by the route, so it never counts as a user-applied
  // filter and can never be what "Reset Filters" clears.
  const isAnyFilterActive =
    filters.searchQuery.trim() !== '' ||
    (!lockedGenre && filters.genre !== 'All') ||
    filters.level !== 'All' ||
    filters.readingTime !== 'All' ||
    filters.curiosity !== 'All';

  const toggleFilter = (filter: Exclude<OpenFilter, null>) => {
    setOpenFilter((current) => current === filter ? null : filter);
  };

  /*
   * Only offer genres that really hold content. `availableGenres` comes from
   * the articles themselves, so an empty shelf can never appear here. The
   * currently selected genre is kept even if it is somehow absent from the
   * list, otherwise the trigger would render an empty value.
   */
  const genreOptions = (
    availableGenres ? GENRE_OPTIONS.filter(
      (option) => option === 'All' || availableGenres.includes(option)
    ) : GENRE_OPTIONS
  );

  return (
    <section
      ref={filterBarRef}
      className="filter-bar-container"
      aria-label="Article Filters"
    >
      <div className="filter-select-row">
        <div className="filter-select-group">
          <span className="filter-group-label" id="genre-filter-label">Genre</span>
          {lockedGenre ? (
            <p
              className="filter-locked-value"
              id="genre-filter-value"
              title={`Locked to the ${lockedGenre} genre`}
            >
              <span className="filter-locked-dot" aria-hidden="true" />
              <span className="filter-locked-text">{lockedGenre}</span>
            </p>
          ) : (
            <>
              <button
                type="button"
                className="filter-select-trigger"
                aria-labelledby="genre-filter-label genre-filter-value"
                aria-haspopup="listbox"
                aria-expanded={openFilter === 'genre'}
                aria-controls="genre-filter-options"
                onClick={() => toggleFilter('genre')}
              >
                <span id="genre-filter-value">{filters.genre}</span>
                <span className="filter-select-chevron" aria-hidden="true" />
              </button>
              {openFilter === 'genre' && (
                <div className="filter-select-options" id="genre-filter-options" role="listbox" aria-labelledby="genre-filter-label">
                  {genreOptions.map((genre) => (
                    <button
                      key={genre}
                      type="button"
                      className={`filter-select-option ${filters.genre === genre ? 'active' : ''}`}
                      role="option"
                      aria-selected={filters.genre === genre}
                      onClick={() => {
                        onFilterChange('genre', genre);
                        setOpenFilter(null);
                      }}
                    >
                      {genre}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="filter-select-group">
          <span className="filter-group-label" id="level-filter-label">CEFR Level</span>
          <button
            type="button"
            className="filter-select-trigger"
            aria-labelledby="level-filter-label level-filter-value"
            aria-haspopup="listbox"
            aria-expanded={openFilter === 'level'}
            aria-controls="level-filter-options"
            onClick={() => toggleFilter('level')}
          >
            <span id="level-filter-value">{filters.level}</span>
            <span className="filter-select-chevron" aria-hidden="true" />
          </button>
          {openFilter === 'level' && (
            <div className="filter-select-options" id="level-filter-options" role="listbox" aria-labelledby="level-filter-label">
              {LEVEL_OPTIONS.map((level) => (
                <button
                  key={level}
                  type="button"
                  data-level={level}
                  className={`filter-select-option ${filters.level === level ? 'active' : ''}`}
                  role="option"
                  aria-selected={filters.level === level}
                  onClick={() => {
                    onFilterChange('level', level);
                    setOpenFilter(null);
                  }}
                >
                  {level}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="filter-select-group">
          <span className="filter-group-label" id="time-filter-label">Reading Time</span>
          <button
            type="button"
            className="filter-select-trigger"
            aria-labelledby="time-filter-label time-filter-value"
            aria-haspopup="listbox"
            aria-expanded={openFilter === 'readingTime'}
            aria-controls="time-filter-options"
            onClick={() => toggleFilter('readingTime')}
          >
            <span id="time-filter-value">{filters.readingTime}</span>
            <span className="filter-select-chevron" aria-hidden="true" />
          </button>
          {openFilter === 'readingTime' && (
            <div className="filter-select-options filter-select-options-right" id="time-filter-options" role="listbox" aria-labelledby="time-filter-label">
              {READING_TIME_OPTIONS.map((time) => (
                <button
                  key={time}
                  type="button"
                  className={`filter-select-option ${filters.readingTime === time ? 'active' : ''}`}
                  role="option"
                  aria-selected={filters.readingTime === time}
                  onClick={() => {
                    onFilterChange('readingTime', time);
                    setOpenFilter(null);
                  }}
                >
                  {time}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="filter-select-group">
          <span className="filter-group-label" id="curiosity-filter-label">
            Curiosities &amp; Deep Dives
          </span>
          <button
            type="button"
            className="filter-select-trigger"
            aria-labelledby="curiosity-filter-label curiosity-filter-value"
            aria-haspopup="listbox"
            aria-expanded={openFilter === 'curiosity'}
            aria-controls="curiosity-filter-options"
            onClick={() => toggleFilter('curiosity')}
          >
            <span id="curiosity-filter-value">{filters.curiosity}</span>
            <span className="filter-select-chevron" aria-hidden="true" />
          </button>
          {openFilter === 'curiosity' && (
            <div className="filter-select-options filter-select-options-right" id="curiosity-filter-options" role="listbox" aria-labelledby="curiosity-filter-label">
              {CURIOSITY_OPTIONS.map((topic) => (
                <button
                  key={topic}
                  type="button"
                  className={`filter-select-option ${filters.curiosity === topic ? 'active' : ''}`}
                  role="option"
                  aria-selected={filters.curiosity === topic}
                  onClick={() => {
                    onFilterChange('curiosity', topic);
                    setOpenFilter(null);
                  }}
                >
                  {topic}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="filter-actions-row">
        <div className="active-filters-summary">
          <span>
            Found <strong>{totalResults}</strong> {totalResults === 1 ? 'article' : 'articles'}
          </span>
          {!lockedGenre && filters.genre !== 'All' && (
            <span className="active-filter-tag">Genre: {filters.genre}</span>
          )}
          {filters.level !== 'All' && (
            <span className="active-filter-tag">Level: {filters.level}</span>
          )}
          {filters.readingTime !== 'All' && (
            <span className="active-filter-tag">Time: {filters.readingTime}</span>
          )}
          {filters.curiosity !== 'All' && (
            <span className="active-filter-tag">Curiosity: {filters.curiosity}</span>
          )}
        </div>

        {isAnyFilterActive && (
          <button
            type="button"
            className="filter-reset-btn"
            onClick={onResetFilters}
            aria-label="Reset all active filters"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            Reset Filters
          </button>
        )}
      </div>
    </section>
  );
};
