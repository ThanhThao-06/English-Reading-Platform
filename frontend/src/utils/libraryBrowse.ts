import type { ArticleCardData, FilterState, Genre } from '../types/article';

/**
 * Browsing helpers shared by the Library landing page and a single-genre page.
 *
 * Every function here is pure and derives from the articles it is handed.
 * Nothing is invented: a genre only exists in the index because a real article
 * carries it, and every count is the number of articles actually available at
 * that moment. No article is ever removed, re-categorised or hidden by this
 * module - it only decides which ones a page chooses to render.
 */

/**
 * The Library landing page is a showcase, not an archive.
 *
 * It never lists the whole collection: at most this many cards are rendered.
 * Every remaining article stays reachable through its genre page.
 */
export const FEATURED_READ_LIMIT = 6;

/**
 * Presentation order used only to break ties between two genres that hold the
 * same number of articles, and to keep unknown genres in a stable position.
 *
 * It is NOT a source of genres: `buildGenreIndex` reads the genres off the
 * articles, so a genre with no articles never shows up.
 */
const GENRE_PRESENTATION_ORDER: readonly Genre[] = [
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

/** One genre together with how many articles currently carry it. */
export interface GenreSummary {
  genre: Genre;
  /** Always the real number of matching articles, never a placeholder. */
  count: number;
}

/**
 * The single filter predicate used by every Library view.
 *
 * The rules are exactly the ones the Library already used - title search,
 * genre, CEFR level and reading time - plus the curiosity shelf. The shelf is a
 * SEPARATE axis, so it narrows alongside the others and never rewrites them.
 *
 * CURIOSITY SHELF ("Curiosities & Deep Dives")
 * ------------------------------------------
 * `ArticleCardData.curiosity` is an optional editorial shelf carried on the card
 * view model. It is read from that field only, and is never inferred from
 * `genre` or from categories: the shelves are an editorial judgement, not
 * something derivable from the text.
 *
 * Two consequences follow, and both are intended:
 *   - an untagged article matches every specific shelf selection except as a
 *     member of that shelf, so selecting a shelf narrows to that shelf;
 *   - with 'All' selected the clause is skipped entirely, so this filter can
 *     never remove an article that the other three filters already admitted.
 */
export const matchesLibraryFilters = (
  article: ArticleCardData,
  filters: FilterState
): boolean => {
  // 1. Search Query Filter (Title match)
  if (filters.searchQuery.trim()) {
    const query = filters.searchQuery.trim().toLowerCase();
    const matchesTitle = article.title.toLowerCase().includes(query);
    if (!matchesTitle) return false;
  }

  // 2. Genre Filter
  if (filters.genre !== 'All' && article.genre !== filters.genre) {
    return false;
  }

  // 3. CEFR Level Filter
  if (filters.level !== 'All' && article.level !== filters.level) {
    return false;
  }

  // 4. Reading Time Filter
  if (filters.readingTime !== 'All' && article.readingTime !== filters.readingTime) {
    return false;
  }

  // 5. Curiosity shelf filter. A separate axis: it narrows the result alongside
  //    the four above and never replaces or rewrites one of them.
  if (filters.curiosity !== 'All' && article.curiosity !== filters.curiosity) {
    return false;
  }

  return true;
};

/** Position of a genre in the fallback presentation order. */
const genrePresentationIndex = (genre: Genre): number => {
  const index = GENRE_PRESENTATION_ORDER.indexOf(genre);
  return index === -1 ? GENRE_PRESENTATION_ORDER.length : index;
};

/**
 * Group the supplied articles by genre.
 *
 * A genre appears only when at least one supplied article carries it, and the
 * count is that number exactly. Genres are ordered by how much content they
 * actually hold, so the biggest shelf in the library is the first one seen;
 * equal counts fall back to a fixed order so the layout never jitters.
 */
export const buildGenreIndex = (articles: readonly ArticleCardData[]): GenreSummary[] => {
  const counts = new Map<Genre, number>();

  for (const article of articles) {
    counts.set(article.genre, (counts.get(article.genre) ?? 0) + 1);
  }

  return Array.from(counts, ([genre, count]) => ({ genre, count })).sort(
    (a, b) => b.count - a.count || genrePresentationIndex(a.genre) - genrePresentationIndex(b.genre)
  );
};

/**
 * URL-safe form of a genre name, e.g. `Fiction / Stories` -> `fiction-and-stories`.
 *
 * Slugs keep the URL readable and avoid the slashes and spaces that the raw
 * genre name contains.
 */
export const toGenreSlug = (genre: Genre): string =>
  genre
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** The in-app route that lists every article of one genre. */
export const getGenreRoute = (genre: Genre): string => `/genre/${toGenreSlug(genre)}`;

/**
 * Turn a `/genre/:genre` parameter back into a real genre.
 *
 * Both the slug written by `getGenreRoute` and a hand-typed raw genre name are
 * accepted. Returns `null` for anything the Library does not recognise, which is
 * how the genre page tells a real topic apart from a mistyped URL.
 */
export const resolveGenreParam = (param: string | undefined): Genre | null => {
  if (!param) return null;

  let decoded = param;
  try {
    decoded = decodeURIComponent(param);
  } catch {
    // A malformed escape sequence is treated as a literal, unmatched value.
  }

  const normalized = decoded.trim().toLowerCase();
  if (!normalized) return null;

  const bySlug = GENRE_PRESENTATION_ORDER.find(
    (genre) => toGenreSlug(genre) === normalized
  );
  if (bySlug) return bySlug;

  const byName = GENRE_PRESENTATION_ORDER.find(
    (genre) => genre.toLowerCase() === normalized
  );
  return byName ?? null;
};
