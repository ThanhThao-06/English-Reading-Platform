import { useEffect, useState } from 'react';
import { ARTICLES_DATA } from '../data/articles';
import { getArticleCuriosity } from '../data/articleEnrichment';
import type { Article, ArticleCardData } from '../types/article';

const GENRES = new Set<string>([
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
]);
const LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const READING_TIMES = new Set(['Under 3 min', '5–10 min', 'Chapter']);

interface ImportedArticlesState {
  articles: ArticleCardData[];
  error: string | null;
}

interface LibraryArticleState {
  id: string | undefined;
  article: Article | null;
  loading: boolean;
  error: string | null;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const hasArticleCardFields = (value: unknown): value is Record<string, unknown> =>
  isObject(value)
  && typeof value.id === 'string'
  && typeof value.title === 'string'
  && typeof value.description === 'string'
  && (typeof value.image === 'string' || value.image === null)
  && typeof value.genre === 'string'
  && GENRES.has(value.genre)
  && typeof value.level === 'string'
  && LEVELS.has(value.level)
  && typeof value.readingTime === 'string'
  && READING_TIMES.has(value.readingTime);

const isArticleCardData = (value: unknown): value is ArticleCardData =>
  hasArticleCardFields(value);

const isArticle = (value: unknown): value is Article =>
  hasArticleCardFields(value)
  && typeof value.content === 'string'
  && (value.chapters === undefined || Array.isArray(value.chapters));

const readError = (value: unknown, fallback: string) =>
  value instanceof Error ? value.message : fallback;

/**
 * Attach the "Curiosities & Deep Dives" shelf to an imported card.
 *
 * The shelf is an editorial tag held in `data/articleEnrichment.ts`, keyed by
 * article id, because it is Library metadata rather than part of the article's
 * stored content. The API deliberately does not carry it, so it is resolved here
 * - the one place imported articles enter the app - and a card with no recorded
 * shelf is returned unchanged, which is a normal state.
 *
 * The tag is read from the registry only: a value arriving in the API payload is
 * ignored rather than trusted, so the shelf can never be set by unvalidated data.
 */
const withCuriosity = (card: ArticleCardData): ArticleCardData => {
  const curiosity = getArticleCuriosity(card.id);
  return curiosity ? { ...card, curiosity } : card;
};

export const useImportedArticles = () => {
  const [state, setState] = useState<ImportedArticlesState>({ articles: [], error: null });

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/library/articles', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Library API returned HTTP ${response.status}.`);
        const result: unknown = await response.json();
        if (!isObject(result) || !Array.isArray(result.articles) || !result.articles.every(isArticleCardData)) {
          throw new Error('Library API returned an invalid article list.');
        }
        setState({ articles: result.articles.map(withCuriosity), error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          articles: [],
          error: readError(error, 'Imported Library articles could not be loaded.'),
        });
      });
    return () => controller.abort();
  }, []);

  return state;
};

export const useLibraryArticle = (id: string | undefined) => {
  const [state, setState] = useState<LibraryArticleState>(() => ({
    id,
    article: ARTICLES_DATA.find((item) => item.id === id) ?? null,
    loading: !ARTICLES_DATA.some((item) => item.id === id),
    error: null,
  }));

  useEffect(() => {
    const staticArticle = ARTICLES_DATA.find((item) => item.id === id);
    if (staticArticle || !id) return;

    const controller = new AbortController();
    fetch(`/api/library/articles/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) {
          setState({ id, article: null, loading: false, error: null });
          return;
        }
        if (!response.ok) throw new Error(`Library API returned HTTP ${response.status}.`);
        const result: unknown = await response.json();
        if (!isArticle(result)) throw new Error('Library API returned an invalid article.');
        setState({ id, article: result, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          id,
          article: null,
          loading: false,
          error: readError(error, 'Imported article could not be loaded.'),
        });
      });
    return () => controller.abort();
  }, [id]);

  return state.id === id
    ? state
    : {
        id,
        article: ARTICLES_DATA.find((item) => item.id === id) ?? null,
        loading: Boolean(id) && !ARTICLES_DATA.some((item) => item.id === id),
        error: null,
      };
};
