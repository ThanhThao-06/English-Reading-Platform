import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArticleCard } from '../components/ArticleCard';
import { FilterBar } from '../components/FilterBar';
import { Header } from '../components/Header';
import { SearchBar } from '../components/SearchBar';
import { ARTICLES_DATA } from '../data/articles';
import { useImportedArticles } from '../hooks/useLibraryData';
import { useProgressStatusLookup } from '../hooks/useProgressStatusLookup';
import type { ArticleCardData, FilterState, Genre } from '../types/article';
import { matchesLibraryFilters, resolveGenreParam } from '../utils/libraryBrowse';
import './GenreBrowse.css';

/**
 * Fresh filters for a genre page.
 *
 * `genre` is pinned to the route rather than left as 'All', so the shared filter
 * predicate narrows to this topic before Search, CEFR Level or Reading Time are
 * ever considered. Reset returns to exactly this state.
 */
const createInitialFilters = (genre: Genre | 'All'): FilterState => ({
  searchQuery: '',
  genre,
  level: 'All',
  readingTime: 'All',
  curiosity: 'All',
});

export const GenreBrowse: React.FC = () => {
  const { genre: genreParam } = useParams<{ genre: string }>();
  const genre = useMemo(() => resolveGenreParam(genreParam), [genreParam]);

  const { articles: importedArticles, error: importedArticlesError } = useImportedArticles();
  const getStatusFor = useProgressStatusLookup();
  const [filters, setFilters] = useState<FilterState>(() =>
    createInitialFilters(genre ?? 'All')
  );

  // Switching genres (a sibling card, the back button) starts a clean search
  // instead of carrying the previous topic's query and filters across. This is
  // React's documented "adjusting some state when a prop changes" pattern: a
  // guarded render-phase update, which lands in the same render as the route
  // change instead of one frame later in an effect.
  const [previousGenre, setPreviousGenre] = useState(genre);
  if (previousGenre !== genre) {
    setPreviousGenre(genre);
    setFilters(createInitialFilters(genre ?? 'All'));
  }

  const handleFilterChange = <K extends keyof FilterState>(
    key: K,
    value: FilterState[K]
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleResetFilters = () => {
    setFilters(createInitialFilters(genre ?? 'All'));
  };

  // Every article available to the Library: the bundled collection plus
  // whatever the production API returns. Nothing is filtered out here.
  const availableArticles = useMemo<ArticleCardData[]>(
    () => [...ARTICLES_DATA, ...importedArticles],
    [importedArticles]
  );

  /*
   * The topic is fixed by the route. Narrowing to it first - before Search,
   * CEFR Level and Reading Time - guarantees that only articles of the selected
   * genre can ever be listed here, whatever the filter state says. There is
   * deliberately no cap: a genre page lists its topic in full.
   */
  const genreArticles = useMemo(() => {
    if (!genre) return [];
    return availableArticles.filter((article) => article.genre === genre);
  }, [availableArticles, genre]);

  const visibleArticles = useMemo(
    () => genreArticles.filter((article) => matchesLibraryFilters(article, filters)),
    [genreArticles, filters]
  );

  const articleCount = genreArticles.length;
  const plural = articleCount === 1 ? 'article' : 'articles';

  const renderBackButton = (label: string) => (
    <Link className="genre-back-btn" to="/" aria-label="Back to Reading Library">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
      </svg>
      <span>{label}</span>
    </Link>
  );

  /* An unknown or mistyped topic: say so plainly and offer the way back. */
  if (!genre) {
    return (
      <div className="genre-page">
        <Header />
        <main className="genre-main">
          {renderBackButton('Back to Library')}
          <div className="genre-empty-state" role="status">
            <h1 className="genre-empty-title">Genre not found</h1>
            <p className="genre-empty-text">
              There is no genre called &ldquo;{genreParam}&rdquo; in the Reading Library.
              Head back to the Library to pick a topic from the list.
            </p>
            <Link className="genre-empty-btn" to="/">
              Go to Library
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="genre-page">
      <Header />

      <main className="genre-main">
        <nav className="genre-breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Library</Link>
          <span className="genre-breadcrumb-separator" aria-hidden="true">
            /
          </span>
          <span aria-current="page">{genre}</span>
        </nav>

        {renderBackButton('Back to Library')}

        <header className="genre-hero">
          <span className="genre-hero-badge">Genre</span>
          <h1 className="genre-hero-title">{genre}</h1>
          <p className="genre-hero-subtitle">
            {articleCount === 0
              ? `No ${genre} articles are available right now.`
              : `${articleCount} ${plural} in ${genre}.`}
          </p>
          {importedArticlesError && (
            <p className="genre-data-error" role="status">
              Imported articles could not be loaded: {importedArticlesError}
            </p>
          )}
        </header>


        {articleCount > 0 && (
          <>
            <section
              className="genre-search-section"
              aria-label={`Search ${genre} articles`}
            >
              <SearchBar
                value={filters.searchQuery}
                onChange={(value) => handleFilterChange('searchQuery', value)}
                placeholder={`Search ${genre} articles by title...`}
                label={`Search ${genre} articles by title`}
                inputId="genre-search-input"
              />
            </section>

            <FilterBar
              filters={filters}
              onFilterChange={handleFilterChange}
              onResetFilters={handleResetFilters}
              totalResults={visibleArticles.length}
              lockedGenre={genre}
            />

            {visibleArticles.length > 0 ? (
              <section
                className="articles-grid"
                aria-label={`All ${genre} articles`}
                id="genre-articles-list"
              >
                {visibleArticles.map((article) => (
                  <ArticleCard
                    key={article.id}
                    article={article}
                    progressStatus={getStatusFor(article.id)}
                  />
                ))}
              </section>
            ) : (
              <div className="genre-empty-state" role="status" aria-live="polite">
                <div className="empty-state-icon" aria-hidden="true">
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
                    <line x1="8" y1="11" x2="14" y2="11" />
                  </svg>
                </div>
                <h2 className="genre-empty-title">No matching {genre} articles</h2>
                <p className="genre-empty-text">
                  All {articleCount} {genre} {plural} are listed here except those hidden by
                  your search or filters. Try a different search term, or reset the filters to
                  see the whole topic.
                </p>
                <button
                  type="button"
                  className="genre-empty-btn"
                  onClick={handleResetFilters}
                >
                  Clear Search &amp; Filters
                </button>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="library-footer">
        <p>
          English Reading Platform &copy; {new Date().getFullYear()} — Focused on Reading
          Excellence
        </p>
      </footer>
    </div>
  );
};

