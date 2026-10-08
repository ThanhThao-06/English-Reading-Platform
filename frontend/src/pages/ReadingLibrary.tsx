import React, { useMemo, useState } from 'react';
import { ArticleCard } from '../components/ArticleCard';
import { ExploreByGenre } from '../components/ExploreByGenre';
import { FilterBar } from '../components/FilterBar';
import { Header } from '../components/Header';
import { SearchBar } from '../components/SearchBar';
import { ARTICLES_DATA } from '../data/articles';
import { useImportedArticles } from '../hooks/useLibraryData';
import { useProgressStatusLookup } from '../hooks/useProgressStatusLookup';
import type { ArticleCardData, FilterState } from '../types/article';
import {
  buildGenreIndex,
  FEATURED_READ_LIMIT,
  matchesLibraryFilters,
} from '../utils/libraryBrowse';
import './ReadingLibrary.css';

const INITIAL_FILTERS: FilterState = {
  searchQuery: '',
  genre: 'All',
  level: 'All',
  readingTime: 'All',
  curiosity: 'All',
};

export const ReadingLibrary: React.FC = () => {
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const { articles: importedArticles, error: importedArticlesError } = useImportedArticles();

  // Read saved progress once instead of per card, so every card can ask for it.
  const getStatusFor = useProgressStatusLookup();

  const handleFilterChange = <K extends keyof FilterState>(
    key: K,
    value: FilterState[K]
  ) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleResetFilters = () => {
    setFilters(INITIAL_FILTERS);
  };

  // The whole collection, exactly as the Library has always assembled it.
  const availableArticles = useMemo<ArticleCardData[]>(
    () => [...ARTICLES_DATA, ...importedArticles],
    [importedArticles]
  );

  // Filter articles based on search query, genre, CEFR level, and reading time
  const filteredArticles = useMemo(
    () => availableArticles.filter((article) => matchesLibraryFilters(article, filters)),
    [availableArticles, filters]
  );

  /*
   * The Library page is a showcase: it features a handful of reads rather than
   * the entire collection. Search and the filters still shape which ones are
   * featured. Nothing is deleted or hidden from the data - every remaining
   * article stays one click away under Explore by Genre.
   */
  const featuredArticles = useMemo(
    () => filteredArticles.slice(0, FEATURED_READ_LIMIT),
    [filteredArticles]
  );

  /*
   * Built from every available article, not from the filtered subset, so the
   * genre shelf stays complete and correct while a search or filter is active.
   * Genres and counts come from the real articles; none are invented.
   */
  const genreIndex = useMemo(() => buildGenreIndex(availableArticles), [availableArticles]);

  /*
   * Genres the filter dropdown may offer: exactly those holding at least one
   * article. The taxonomy defines 11 genres, but a genre with no content is
   * never offered and so can never be selected.
   */
  const availableGenreNames = useMemo(
    () => genreIndex.map((entry) => entry.genre),
    [genreIndex]
  );

  const hiddenArticleCount = filteredArticles.length - featuredArticles.length;

  return (
    <div className="reading-library-page">
      <Header />

      <main className="library-main">
        {/* Hero & Search Area */}
        <section className="library-hero-section">
          <div className="library-hero-badge">Reading Library</div>
          <h1 className="library-hero-title">Discover English Reading Content</h1>
          <p className="library-hero-subtitle">
            Explore authentic articles across diverse topics, curated to expand your
            vocabulary and reading comprehension at every CEFR level.
          </p>

          <SearchBar
            value={filters.searchQuery}
            onChange={(value) => handleFilterChange('searchQuery', value)}
          />
          {importedArticlesError && (
            <p className="library-data-error" role="status">
              Imported articles could not be loaded: {importedArticlesError}
            </p>
          )}
        </section>

        {/* Filters */}
        <FilterBar
          filters={filters}
          onFilterChange={handleFilterChange}
          onResetFilters={handleResetFilters}
          totalResults={filteredArticles.length}
          availableGenres={availableGenreNames}
        />

        {/*
          Featured Reads: at most FEATURED_READ_LIMIT cards, never the whole
          collection. The genre shelf below is how the reader reaches the rest.
        */}
        <section className="library-section" aria-labelledby="featured-reads-title">
          <div className="library-section-header">
            <h2 className="library-section-title" id="featured-reads-title">
              Featured Reads
            </h2>
            <p className="library-section-subtitle">
              {hiddenArticleCount > 0
                ? `Showing ${featuredArticles.length} of ${filteredArticles.length} matching articles. Browse by genre below to read the rest.`
                : `A short selection from the Library. Browse by genre below for every article.`}
            </p>
          </div>

          {featuredArticles.length > 0 ? (
            <div className="articles-grid" aria-label="Featured articles" id="articles-list">
              {featuredArticles.map((article) => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  progressStatus={getStatusFor(article.id)}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state" role="status" aria-live="polite">
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
              <h2 className="empty-state-title">No articles found</h2>
              <p className="empty-state-text">
                We couldn&apos;t find any articles matching your search and filter criteria. Try
                adjusting or clearing your filters.
              </p>
              <button
                type="button"
                className="empty-state-btn"
                onClick={handleResetFilters}
              >
                Clear All Filters
              </button>
            </div>
          )}
        </section>

        {/* Explore by Genre: the way into the rest of the collection. */}
        <ExploreByGenre genres={genreIndex} />
      </main>

      <footer className="library-footer">
        <p>English Reading Platform &copy; {new Date().getFullYear()} — Focused on Reading Excellence</p>
      </footer>
    </div>
  );
};
