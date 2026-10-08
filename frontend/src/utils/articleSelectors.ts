import { getArticleEnrichment as getRegisteredEnrichment } from '../data/articleEnrichment';
import { getArticleParagraphs } from './chapterUtils';
import type {
  Article,
  ArticleEnrichment,
  ArticleLicense,
  Category,
  ContentGroup,
  ContentType,
  GeographicScope,
  LibraryArticle,
} from '../types/article';
import {
  allowsFullTextHosting,
  normalizeCountriesAbout,
  resolveAllCategories,
  resolvePrimaryCategory,
  resolveSecondaryCategories,
} from './metadataValidation';

/**
 * Phase 3.1 / 3.2 - Read-only helpers over `Article` plus its enrichment.
 *
 * Every function here is pure: it only reads the arguments it is given, returns
 * a new value, and never mutates an article, writes to `localStorage`, calls an
 * API or changes app behaviour. That makes them safe to use from a selector,
 * from a render, or from a test.
 *
 * These functions deliberately derive rather than duplicate. There is no stored
 * word count, paragraph count or search index, because all three can be
 * computed from `content` and would otherwise be able to drift out of sync.
 *
 * Phase 3.2 added `contentGroup`, `primaryCategory` / `secondaryCategories`,
 * `geographicScope` and the geographic/licence accessors. Every Phase 3.1
 * function keeps its exact previous signature and behaviour; the new functions
 * are purely additive.
 */

/**
 * Average silent reading speed used for the estimate only.
 *
 * This is a rough, well-documented planning figure - not authoritative reading
 * data, and not a difficulty judgement. It never replaces `Article.readingTime`,
 * which stays exactly as authored.
 */
export const AVERAGE_READING_WORDS_PER_MINUTE = 200;

/** Metadata for one article id, or `undefined` when none is recorded. */
export const getArticleEnrichment = (articleId: string): ArticleEnrichment | undefined =>
  getRegisteredEnrichment(articleId);

/**
 * Subject categories for one article.
 *
 * Phase 3.1 behaviour, preserved exactly: this returns a copy of the recorded
 * `categories` array, and an empty array when nothing is recorded. It does NOT
 * guess categories from `genre`: no such mapping has been validated, and
 * guessing would quietly attach topics an article may not actually cover.
 *
 * Because Phase 3.2 added `primaryCategory` / `secondaryCategories`, an item
 * recorded only in the new shape would otherwise return `[]` here. To keep this
 * function's long-standing contract ("all categories for this article"), it now
 * also folds in the new fields, deduplicated and primary-first, which is
 * identical to the old result for every entry recorded in the legacy shape.
 * `getArticleCategories('art-001')` still returns `['science', 'environment']`,
 * and `getArticleCategories` still returns a fresh array rather than the
 * registry's own.
 */
export const getArticleCategories = (articleId: string): Category[] => {
  const enrichment = getRegisteredEnrichment(articleId);
  return resolveAllCategories(enrichment);
};

/** The content form for one article, or `undefined` when not recorded. */
export const getArticleContentType = (articleId: string): ContentType | undefined =>
  getRegisteredEnrichment(articleId)?.contentType;

/* ==========================================================================
   Phase 3.2 - navigation group and the category taxonomy
   --------------------------------------------------------------------------
   Purely additive. Nothing above this line changes behaviour.
   ========================================================================== */

/**
 * The top-level navigation group for one article, or `undefined`.
 *
 * Returns `undefined` when no group has been recorded, which is the case for
 * every article in the current registry: a group is an editorial decision, and
 * guessing one would be no more honest than guessing a category. No article is
 * ever moved into a group because of where it was published - country is not a
 * group.
 */
export const getArticleContentGroup = (articleId: string): ContentGroup | undefined =>
  getRegisteredEnrichment(articleId)?.contentGroup;

/**
 * The single primary category for one article, or `undefined`.
 *
 * Derived from `primaryCategory` when present, otherwise from the first entry
 * of the legacy `categories` array. Never more than one, and `undefined` when
 * nothing valid is recorded.
 */
export const getArticlePrimaryCategory = (articleId: string): Category | undefined =>
  resolvePrimaryCategory(getRegisteredEnrichment(articleId));

/**
 * The secondary categories for one article: zero or more, in recorded order,
 * with duplicates and any repeat of the primary category removed.
 */
export const getArticleSecondaryCategories = (articleId: string): Category[] =>
  resolveSecondaryCategories(getRegisteredEnrichment(articleId));

/* ==========================================================================
   Geography
   ========================================================================== */

/**
 * The countries an article is genuinely about, ISO 3166-1 alpha-2, or `[]`.
 *
 * A filtered copy: malformed codes and duplicates are dropped, nothing is ever
 * added, and the publisher's country is never inserted here.
 */
export const getArticleCountriesAbout = (articleId: string): string[] =>
  normalizeCountriesAbout(getRegisteredEnrichment(articleId)?.countriesAbout);

/**
 * The recorded geographic scope, or `undefined` when not recorded.
 *
 * This is where "worldwide" belongs. It is deliberately a separate concept from
 * `countriesAbout`, so a global article never needs a fake country code.
 */
export const getArticleGeographicScope = (articleId: string): GeographicScope | undefined =>
  getRegisteredEnrichment(articleId)?.geographicScope;

/**
 * The publisher's country code, or `undefined` when not recorded.
 *
 * Read only from `ArticleSource.publisherCountryCode`, and deliberately NOT
 * derived from `countriesAbout`, the article's language or the content itself.
 * A UK publisher writing about Vietnam yields `'GB'` here and `['VN']` from
 * `getArticleCountriesAbout` - the two never collapse into each other.
 */
export const getArticlePublisherCountryCode = (articleId: string): string | undefined =>
  getRegisteredEnrichment(articleId)?.source?.publisherCountryCode;

/* ==========================================================================
   Source and licence
   ========================================================================== */

/**
 * The recorded licence for one article, or `undefined` when none is recorded.
 *
 * `undefined` means "no licence recorded", which is the current state of the
 * whole registry and a perfectly valid answer. It is NOT the same as a recorded
 * licence whose type is `unknown`, and it is never defaulted to a permissive
 * value.
 */
export const getArticleLicense = (articleId: string): ArticleLicense | undefined =>
  getRegisteredEnrichment(articleId)?.license;

/**
 * The recorded source for one article, or `undefined` when none is recorded.
 */
export const getArticleSource = (articleId: string) =>
  getRegisteredEnrichment(articleId)?.source;

/**
 * Whether an article's recorded licence permits hosting its full text here.
 *
 * `undefined` when no licence is recorded. Otherwise conservative - see
 * `allowsFullTextHosting`, which documents every branch. An unknown article,
 * a missing licence and an explicit `unknown` licence all fail safe.
 */
export const getArticleAllowsFullText = (articleId: string): boolean | undefined =>
  allowsFullTextHosting(getRegisteredEnrichment(articleId)?.license);

/**
 * Word count, derived from `content`.
 *
 * Counts whitespace-separated tokens. Empty and whitespace-only content yields
 * `0` rather than throwing, and `content` is only ever read, never modified.
 */
export const getArticleWordCount = (article: Pick<Article, 'content'>): number => {
  const content = article?.content;
  if (typeof content !== 'string' || content.trim().length === 0) return 0;

  return content.split(/\s+/).filter((token) => token.length > 0).length;
};

/**
 * Paragraph count, derived using the project's existing convention.
 *
 * This delegates to `chapterUtils.getArticleParagraphs` rather than repeating
 * the `\n\n` split, so paragraph boundaries are counted exactly the way the
 * Reader and the chapter indexes already count them. Using a second, different
 * split here would risk disagreeing with chapter `startParagraphIndex` values,
 * which are measured against the Reader's array.
 */
export const getArticleParagraphCount = (article: Pick<Article, 'content'>): number =>
  getArticleParagraphs(article).length;

/**
 * A lower-cased search string for one article.
 *
 * Built from the fields that genuinely exist - title, description, content and
 * chapter titles - plus categories and content type when enrichment is
 * supplied. The result is returned to the caller and never stored on the article
 * or persisted.
 *
 * The enrichment argument is optional so this can be called with just an
 * article; a missing enrichment simply contributes nothing to the string.
 */
export const getArticleSearchText = (
  article: Article,
  enrichment?: ArticleEnrichment
): string => {
  const parts: string[] = [article?.title ?? '', article?.description ?? '', article?.content ?? ''];

  for (const chapter of article?.chapters ?? []) {
    parts.push(chapter.title ?? '', chapter.summary ?? '');
  }

  if (enrichment) {
    // Phase 3.2: uses the reconciling resolver, so items recorded with
    // primaryCategory/secondaryCategories are searchable too. For an item using
    // the legacy `categories` array this produces the same tokens as before.
    parts.push(...resolveAllCategories(enrichment));
    if (enrichment.contentType) parts.push(enrichment.contentType);
    if (enrichment.contentGroup) parts.push(enrichment.contentGroup);
    if (enrichment.geographicScope) parts.push(enrichment.geographicScope);
    if (enrichment.language) parts.push(enrichment.language);
    for (const country of normalizeCountriesAbout(enrichment.countriesAbout)) parts.push(country);
  }

  return parts
    .filter((part) => typeof part === 'string' && part.length > 0)
    .join(' ')
    .toLowerCase();
};

/**
 * Estimated reading time in whole minutes, for planning purposes only.
 *
 * An empty article yields `0`. Any article with words yields at least `1`, so a
 * very short piece never reads as "0 min". This is an estimate derived from
 * `AVERAGE_READING_WORDS_PER_MINUTE`; it never writes to, or replaces, the
 * authored `Article.readingTime`.
 */
export const getArticleEstimatedReadingMinutes = (article: Pick<Article, 'content'>): number => {
  const words = getArticleWordCount(article);
  if (words === 0) return 0;

  return Math.max(1, Math.round(words / AVERAGE_READING_WORDS_PER_MINUTE));
};

/**
 * One article combined with its optional metadata.
 *
 * Returns a new object; the input article is not modified and no existing
 * `Article` field is renamed, replaced or re-interpreted. The `enrichment`
 * field is simply absent when nothing is recorded, which is why a `LibraryArticle`
 * is always safe to pass anywhere an `Article` is expected.
 */
export const getLibraryArticle = (article: Article): LibraryArticle => {
  const enrichment = getRegisteredEnrichment(article?.id ?? '');

  return enrichment ? { ...article, enrichment } : { ...article };
};