"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLibraryArticle = exports.getArticleEstimatedReadingMinutes = exports.getArticleSearchText = exports.getArticleParagraphCount = exports.getArticleWordCount = exports.getArticleAllowsFullText = exports.getArticleSource = exports.getArticleLicense = exports.getArticlePublisherCountryCode = exports.getArticleGeographicScope = exports.getArticleCountriesAbout = exports.getArticleSecondaryCategories = exports.getArticlePrimaryCategory = exports.getArticleContentGroup = exports.getArticleContentType = exports.getArticleCategories = exports.getArticleEnrichment = exports.AVERAGE_READING_WORDS_PER_MINUTE = void 0;
const articleEnrichment_1 = require("../data/articleEnrichment");
const chapterUtils_1 = require("./chapterUtils");
const metadataValidation_1 = require("./metadataValidation");
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
exports.AVERAGE_READING_WORDS_PER_MINUTE = 200;
/** Metadata for one article id, or `undefined` when none is recorded. */
const getArticleEnrichment = (articleId) => (0, articleEnrichment_1.getArticleEnrichment)(articleId);
exports.getArticleEnrichment = getArticleEnrichment;
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
const getArticleCategories = (articleId) => {
    const enrichment = (0, articleEnrichment_1.getArticleEnrichment)(articleId);
    return (0, metadataValidation_1.resolveAllCategories)(enrichment);
};
exports.getArticleCategories = getArticleCategories;
/** The content form for one article, or `undefined` when not recorded. */
const getArticleContentType = (articleId) => (0, articleEnrichment_1.getArticleEnrichment)(articleId)?.contentType;
exports.getArticleContentType = getArticleContentType;
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
const getArticleContentGroup = (articleId) => (0, articleEnrichment_1.getArticleEnrichment)(articleId)?.contentGroup;
exports.getArticleContentGroup = getArticleContentGroup;
/**
 * The single primary category for one article, or `undefined`.
 *
 * Derived from `primaryCategory` when present, otherwise from the first entry
 * of the legacy `categories` array. Never more than one, and `undefined` when
 * nothing valid is recorded.
 */
const getArticlePrimaryCategory = (articleId) => (0, metadataValidation_1.resolvePrimaryCategory)((0, articleEnrichment_1.getArticleEnrichment)(articleId));
exports.getArticlePrimaryCategory = getArticlePrimaryCategory;
/**
 * The secondary categories for one article: zero or more, in recorded order,
 * with duplicates and any repeat of the primary category removed.
 */
const getArticleSecondaryCategories = (articleId) => (0, metadataValidation_1.resolveSecondaryCategories)((0, articleEnrichment_1.getArticleEnrichment)(articleId));
exports.getArticleSecondaryCategories = getArticleSecondaryCategories;
/* ==========================================================================
   Geography
   ========================================================================== */
/**
 * The countries an article is genuinely about, ISO 3166-1 alpha-2, or `[]`.
 *
 * A filtered copy: malformed codes and duplicates are dropped, nothing is ever
 * added, and the publisher's country is never inserted here.
 */
const getArticleCountriesAbout = (articleId) => (0, metadataValidation_1.normalizeCountriesAbout)((0, articleEnrichment_1.getArticleEnrichment)(articleId)?.countriesAbout);
exports.getArticleCountriesAbout = getArticleCountriesAbout;
/**
 * The recorded geographic scope, or `undefined` when not recorded.
 *
 * This is where "worldwide" belongs. It is deliberately a separate concept from
 * `countriesAbout`, so a global article never needs a fake country code.
 */
const getArticleGeographicScope = (articleId) => (0, articleEnrichment_1.getArticleEnrichment)(articleId)?.geographicScope;
exports.getArticleGeographicScope = getArticleGeographicScope;
/**
 * The publisher's country code, or `undefined` when not recorded.
 *
 * Read only from `ArticleSource.publisherCountryCode`, and deliberately NOT
 * derived from `countriesAbout`, the article's language or the content itself.
 * A UK publisher writing about Vietnam yields `'GB'` here and `['VN']` from
 * `getArticleCountriesAbout` - the two never collapse into each other.
 */
const getArticlePublisherCountryCode = (articleId) => (0, articleEnrichment_1.getArticleEnrichment)(articleId)?.source?.publisherCountryCode;
exports.getArticlePublisherCountryCode = getArticlePublisherCountryCode;
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
const getArticleLicense = (articleId) => (0, articleEnrichment_1.getArticleEnrichment)(articleId)?.license;
exports.getArticleLicense = getArticleLicense;
/**
 * The recorded source for one article, or `undefined` when none is recorded.
 */
const getArticleSource = (articleId) => (0, articleEnrichment_1.getArticleEnrichment)(articleId)?.source;
exports.getArticleSource = getArticleSource;
/**
 * Whether an article's recorded licence permits hosting its full text here.
 *
 * `undefined` when no licence is recorded. Otherwise conservative - see
 * `allowsFullTextHosting`, which documents every branch. An unknown article,
 * a missing licence and an explicit `unknown` licence all fail safe.
 */
const getArticleAllowsFullText = (articleId) => (0, metadataValidation_1.allowsFullTextHosting)((0, articleEnrichment_1.getArticleEnrichment)(articleId)?.license);
exports.getArticleAllowsFullText = getArticleAllowsFullText;
/**
 * Word count, derived from `content`.
 *
 * Counts whitespace-separated tokens. Empty and whitespace-only content yields
 * `0` rather than throwing, and `content` is only ever read, never modified.
 */
const getArticleWordCount = (article) => {
    const content = article?.content;
    if (typeof content !== 'string' || content.trim().length === 0)
        return 0;
    return content.split(/\s+/).filter((token) => token.length > 0).length;
};
exports.getArticleWordCount = getArticleWordCount;
/**
 * Paragraph count, derived using the project's existing convention.
 *
 * This delegates to `chapterUtils.getArticleParagraphs` rather than repeating
 * the `\n\n` split, so paragraph boundaries are counted exactly the way the
 * Reader and the chapter indexes already count them. Using a second, different
 * split here would risk disagreeing with chapter `startParagraphIndex` values,
 * which are measured against the Reader's array.
 */
const getArticleParagraphCount = (article) => (0, chapterUtils_1.getArticleParagraphs)(article).length;
exports.getArticleParagraphCount = getArticleParagraphCount;
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
const getArticleSearchText = (article, enrichment) => {
    const parts = [article?.title ?? '', article?.description ?? '', article?.content ?? ''];
    for (const chapter of article?.chapters ?? []) {
        parts.push(chapter.title ?? '', chapter.summary ?? '');
    }
    if (enrichment) {
        // Phase 3.2: uses the reconciling resolver, so items recorded with
        // primaryCategory/secondaryCategories are searchable too. For an item using
        // the legacy `categories` array this produces the same tokens as before.
        parts.push(...(0, metadataValidation_1.resolveAllCategories)(enrichment));
        if (enrichment.contentType)
            parts.push(enrichment.contentType);
        if (enrichment.contentGroup)
            parts.push(enrichment.contentGroup);
        if (enrichment.geographicScope)
            parts.push(enrichment.geographicScope);
        if (enrichment.language)
            parts.push(enrichment.language);
        for (const country of (0, metadataValidation_1.normalizeCountriesAbout)(enrichment.countriesAbout))
            parts.push(country);
    }
    return parts
        .filter((part) => typeof part === 'string' && part.length > 0)
        .join(' ')
        .toLowerCase();
};
exports.getArticleSearchText = getArticleSearchText;
/**
 * Estimated reading time in whole minutes, for planning purposes only.
 *
 * An empty article yields `0`. Any article with words yields at least `1`, so a
 * very short piece never reads as "0 min". This is an estimate derived from
 * `AVERAGE_READING_WORDS_PER_MINUTE`; it never writes to, or replaces, the
 * authored `Article.readingTime`.
 */
const getArticleEstimatedReadingMinutes = (article) => {
    const words = (0, exports.getArticleWordCount)(article);
    if (words === 0)
        return 0;
    return Math.max(1, Math.round(words / exports.AVERAGE_READING_WORDS_PER_MINUTE));
};
exports.getArticleEstimatedReadingMinutes = getArticleEstimatedReadingMinutes;
/**
 * One article combined with its optional metadata.
 *
 * Returns a new object; the input article is not modified and no existing
 * `Article` field is renamed, replaced or re-interpreted. The `enrichment`
 * field is simply absent when nothing is recorded, which is why a `LibraryArticle`
 * is always safe to pass anywhere an `Article` is expected.
 */
const getLibraryArticle = (article) => {
    const enrichment = (0, articleEnrichment_1.getArticleEnrichment)(article?.id ?? '');
    return enrichment ? { ...article, enrichment } : { ...article };
};
exports.getLibraryArticle = getLibraryArticle;
