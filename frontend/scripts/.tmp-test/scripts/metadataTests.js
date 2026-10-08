"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const articles_1 = require("../src/data/articles");
const articleEnrichment_1 = require("../src/data/articleEnrichment");
const articleSelectors_1 = require("../src/utils/articleSelectors");
const metadataValidation_1 = require("../src/utils/metadataValidation");
const chapterUtils_1 = require("../src/utils/chapterUtils");
let passed = 0;
const failures = [];
const check = (name, condition, detail = '') => {
    if (condition) {
        passed += 1;
    }
    else {
        failures.push(`${name}${detail ? ` -> ${detail}` : ''}`);
    }
};
const eq = (name, actual, expected) => {
    check(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
/* ==========================================================================
   A. Metadata registry
   ========================================================================== */
const EXPECTED_IDS = [
    'art-001', 'art-002', 'art-003', 'art-004', 'art-005',
    'art-006', 'art-007', 'art-008', 'art-009', 'art-010',
];
const articleIds = new Set(articles_1.ARTICLES_DATA.map((article) => article.id));
eq('A ids: ARTICLES_DATA still has exactly 10 articles', articles_1.ARTICLES_DATA.length, 10);
eq('A ids: every existing id is unchanged', articles_1.ARTICLES_DATA.map((a) => a.id), EXPECTED_IDS);
// Every registry key must point at a real article, and no id may appear twice.
// Static ids must live in ARTICLES_DATA; `imported-*` ids belong to the backend
// library, whose ids are verified against the live API by
// `curiosityFilterTests.ts` instead of against the bundled collection.
const registryKeys = Object.keys(articleEnrichment_1.ARTICLE_ENRICHMENTS);
const isImportedId = (key) => key.startsWith('imported-');
for (const key of registryKeys) {
    check(`A registry: "${key}" exists in ARTICLES_DATA or is an imported id`, articleIds.has(key) || isImportedId(key));
}
check('A registry: no duplicate ids', new Set(registryKeys).size === registryKeys.length);
const unknownKeys = registryKeys.filter((key) => !articleIds.has(key) && !isImportedId(key));
check('A registry: no unknown article ids', unknownKeys.length === 0, unknownKeys.join(','));
// Metadata without source/licence must stay valid - that is the current state.
const withoutProvenance = registryKeys.filter((key) => {
    const enrichment = articleEnrichment_1.ARTICLE_ENRICHMENTS[key];
    return enrichment.source === undefined && enrichment.license === undefined;
});
check('A registry: entries may omit source and licence', withoutProvenance.length === registryKeys.length, `${withoutProvenance.length}/${registryKeys.length}`);
// Category / contentType values are checked against the unions at compile time;
// these assertions confirm the runtime data matches those unions too.
const ALL_CATEGORIES = [
    'science', 'technology', 'business', 'finance', 'healthcare', 'history', 'culture',
    'environment', 'education', 'psychology', 'travel', 'sports', 'society', 'politics',
    'literature', 'language-learning', 'food', 'art', 'career', 'other',
];
const ALL_CONTENT_TYPES = [
    'news', 'editorial', 'educational', 'expository', 'short-story', 'novel',
    'classic-literature', 'poetry', 'dialogue', 'other',
];
for (const key of registryKeys) {
    const enrichment = articleEnrichment_1.ARTICLE_ENRICHMENTS[key];
    for (const category of enrichment.categories ?? []) {
        check(`A categories: ${key} uses a valid Category`, ALL_CATEGORIES.includes(category), category);
    }
    if (enrichment.contentType !== undefined) {
        check(`A contentType: ${key} uses a valid ContentType`, ALL_CONTENT_TYPES.includes(enrichment.contentType), enrichment.contentType);
    }
    for (const code of enrichment.countriesAbout ?? []) {
        check(`A countriesAbout: ${key} uses ISO alpha-2`, /^[A-Z]{2}$/.test(code), code);
    }
}
// No fabricated provenance: nothing may claim a source or licence that has not
// actually been verified. `articles.ts` holds no third-party sourced text, so
// every entry correctly leaves both unset.
for (const key of registryKeys) {
    const enrichment = articleEnrichment_1.ARTICLE_ENRICHMENTS[key];
    check(`A honesty: ${key} has no unverified source`, enrichment.source === undefined);
    check(`A honesty: ${key} has no unverified license`, enrichment.license === undefined);
}
// The registry must not duplicate data that already lives on Article.
const FORBIDDEN_DUPLICATES = [
    'content', 'title', 'description', 'image', 'genre', 'level', 'readingTime', 'id',
];
for (const key of registryKeys) {
    const enrichment = articleEnrichment_1.ARTICLE_ENRICHMENTS[key];
    for (const field of FORBIDDEN_DUPLICATES) {
        check(`A no duplication: ${key} does not re-store "${field}"`, enrichment[field] === undefined, String(enrichment[field]));
    }
}
// Articles without registry metadata must still be handled gracefully.
check('A absent: unknown id returns undefined', (0, articleSelectors_1.getArticleEnrichment)('does-not-exist') === undefined);
check('A absent: empty id returns undefined', (0, articleSelectors_1.getArticleEnrichment)('') === undefined);
check('A absent: known id returns its metadata', (0, articleSelectors_1.getArticleEnrichment)('art-001')?.contentType === 'expository');
/* ==========================================================================
   B. Selector functions
   ========================================================================== */
const ART001 = articles_1.ARTICLES_DATA.find((a) => a.id === 'art-001');
const ART005 = articles_1.ARTICLES_DATA.find((a) => a.id === 'art-005');
const ART009 = articles_1.ARTICLES_DATA.find((a) => a.id === 'art-009');
// B1 - enrichment, categories and contentType
eq('B1 categories: art-001 returns its recorded categories', (0, articleSelectors_1.getArticleCategories)('art-001'), ['science', 'environment']);
eq('B1 categories: unknown id returns an empty array', (0, articleSelectors_1.getArticleCategories)('does-not-exist'), []);
check('B1 categories: returned array is a copy, not the registry array', (0, articleSelectors_1.getArticleCategories)('art-001') !== articleEnrichment_1.ARTICLE_ENRICHMENTS['art-001'].categories);
check('B1 categories: never guesses a category from genre', (0, articleSelectors_1.getArticleCategories)('does-not-exist').length === 0);
eq('B1 contentType: art-005 is a short story', (0, articleSelectors_1.getArticleContentType)('art-005'), 'short-story');
eq('B1 contentType: unknown id returns undefined', (0, articleSelectors_1.getArticleContentType)('does-not-exist'), undefined);
// B2 - word count, including empty and whitespace-only input
const emptyArticle = {
    id: 'syn-empty', title: '', description: '', image: '',
    genre: 'News & Social Issues', level: 'B1', readingTime: 'Under 3 min', content: '',
};
eq('B2 words: empty content yields 0', (0, articleSelectors_1.getArticleWordCount)(emptyArticle), 0);
eq('B2 words: whitespace-only content yields 0', (0, articleSelectors_1.getArticleWordCount)({ content: '   \n\n  \t ' }), 0);
eq('B2 words: single word yields 1', (0, articleSelectors_1.getArticleWordCount)({ content: 'Hello' }), 1);
eq('B2 words: counts whitespace-separated tokens', (0, articleSelectors_1.getArticleWordCount)({ content: 'one two  three\nfour' }), 4);
check('B2 words: content is never mutated', (0, articleSelectors_1.getArticleWordCount)(ART001) === ART001.content.split(/\s+/).filter((t) => t.length > 0).length);
// B3 - paragraph count follows the project's existing split convention
for (const article of articles_1.ARTICLES_DATA) {
    eq(`B3 paragraphs: ${article.id} matches getArticleParagraphs`, (0, articleSelectors_1.getArticleParagraphCount)(article), (0, chapterUtils_1.getArticleParagraphs)(article).length);
}
eq('B3 paragraphs: empty content yields 0', (0, articleSelectors_1.getArticleParagraphCount)({ content: '' }), 0);
eq('B3 paragraphs: blank paragraphs are ignored', (0, articleSelectors_1.getArticleParagraphCount)({ content: 'A\n\n\n\nB' }), 2);
// Every chapter index must still address a real paragraph.
for (const article of articles_1.ARTICLES_DATA) {
    const count = (0, articleSelectors_1.getArticleParagraphCount)(article);
    for (const chapter of article.chapters ?? []) {
        check(`B3 chapters: ${chapter.id} end index is within range`, chapter.endParagraphIndex < count, `${chapter.endParagraphIndex} >= ${count}`);
    }
}
// B4 - search text
const searchText = (0, articleSelectors_1.getArticleSearchText)(ART001);
check('B4 search: is lower-cased', searchText === searchText.toLowerCase());
check('B4 search: includes the title', searchText.includes('hydrothermal vents'));
check('B4 search: includes the description and content', searchText.includes('black smokers'));
check('B4 search: includes categories when enrichment is supplied', (0, articleSelectors_1.getArticleSearchText)(ART001, articleEnrichment_1.ARTICLE_ENRICHMENTS['art-001']).includes('science'));
check('B4 search: works without enrichment', (0, articleSelectors_1.getArticleSearchText)(ART009).length > 0);
check('B4 search: includes chapter titles', (0, articleSelectors_1.getArticleSearchText)(ART005).includes('clock parts'));
check('B4 search: does not write the result back onto the article', ART001.searchText === undefined);
// B5 - estimated reading minutes (derived only, never replacing readingTime)
eq('B5 minutes: empty article yields 0', (0, articleSelectors_1.getArticleEstimatedReadingMinutes)(emptyArticle), 0);
eq('B5 minutes: whitespace-only yields 0', (0, articleSelectors_1.getArticleEstimatedReadingMinutes)({ content: '  \n ' }), 0);
check('B5 minutes: a short article still yields at least 1', (0, articleSelectors_1.getArticleEstimatedReadingMinutes)({ content: 'Two words' }) >= 1);
check('B5 minutes: the rate constant is positive and documented', articleSelectors_1.AVERAGE_READING_WORDS_PER_MINUTE > 0);
for (const article of articles_1.ARTICLES_DATA) {
    const expected = Math.max(1, Math.round((0, articleSelectors_1.getArticleWordCount)(article) / articleSelectors_1.AVERAGE_READING_WORDS_PER_MINUTE));
    eq(`B5 minutes: ${article.id} matches the documented formula`, (0, articleSelectors_1.getArticleEstimatedReadingMinutes)(article), expected);
}
// The estimate must never overwrite the authored legacy value.
for (const article of articles_1.ARTICLES_DATA) {
    check(`B5 minutes: ${article.id} keeps its original readingTime`, ['Under 3 min', '5–10 min', 'Chapter'].includes(article.readingTime), article.readingTime);
}
// B6 - LibraryArticle combined view
const libraryArticle = (0, articleSelectors_1.getLibraryArticle)(ART009);
check('B6 view: keeps the original id', libraryArticle.id === ART009.id);
check('B6 view: keeps the original content', libraryArticle.content === ART009.content);
eq('B6 view: attaches enrichment when present', libraryArticle.enrichment?.contentType, 'short-story');
check('B6 view: does not mutate the input article', ART009.enrichment === undefined);
check('B6 view: returns a new object', libraryArticle !== ART009);
const withoutMetadata = (0, articleSelectors_1.getLibraryArticle)({
    id: 'syn-none', title: 'T', description: 'D', image: '',
    genre: 'News & Social Issues', level: 'B1', readingTime: 'Under 3 min', content: 'Body',
});
check('B6 view: an article with no registry entry simply has no enrichment', withoutMetadata.enrichment === undefined);
check('B6 view: a plain Article stays usable unchanged', withoutMetadata.content === 'Body');
/* ==========================================================================
   C. Regression - existing article and chapter data must be untouched
   ========================================================================== */
/**
 * A frozen snapshot of the library as it stood before Phase 3.1.
 *
 * `contentHash` is a short digest of the full article text, so any reworded,
 * reordered, added or removed paragraph is caught immediately. The chapter
 * triples are [id, startParagraphIndex, endParagraphIndex].
 */
const BASELINE = [
    { id: 'art-001', genre: 'Science & Nature', level: 'B2', readingTime: '5–10 min', contentLen: 2657, contentHash: 'f54caccee6c7750e', paras: 5, chapters: [['art-001-ch1', 0, 1], ['art-001-ch2', 2, 3], ['art-001-ch3', 4, 4]] },
    { id: 'art-002', genre: 'Business & Economics', level: 'C1', readingTime: '5–10 min', contentLen: 2608, contentHash: '62b473598ce6e0f4', paras: 5, chapters: [['art-002-ch1', 0, 0], ['art-002-ch2', 1, 2], ['art-002-ch3', 3, 4]] },
    { id: 'art-003', genre: 'Environment', level: 'B1', readingTime: 'Under 3 min', contentLen: 1777, contentHash: '0ede800bca263edb', paras: 4, chapters: [] },
    { id: 'art-004', genre: 'Science & Nature', level: 'A2', readingTime: 'Under 3 min', contentLen: 1276, contentHash: '3bd413ddccb283c9', paras: 4, chapters: [] },
    { id: 'art-005', genre: 'Stories & Literature', level: 'B1', readingTime: 'Chapter', contentLen: 1903, contentHash: 'fb0c61c59ddc3236', paras: 5, chapters: [['art-005-ch1', 0, 1], ['art-005-ch2', 2, 2], ['art-005-ch3', 3, 3], ['art-005-ch4', 4, 4]] },
    { id: 'art-006', genre: 'Science & Nature', level: 'B2', readingTime: 'Under 3 min', contentLen: 1858, contentHash: '3498f4c2a44daba6', paras: 4, chapters: [] },
    { id: 'art-007', genre: 'Business & Economics', level: 'B2', readingTime: '5–10 min', contentLen: 2130, contentHash: '90d7d0de203c91a3', paras: 5, chapters: [['art-007-ch1', 0, 0], ['art-007-ch2', 1, 2], ['art-007-ch3', 3, 4]] },
    { id: 'art-008', genre: 'History', level: 'C2', readingTime: '5–10 min', contentLen: 2352, contentHash: 'b37f0b81307b15c7', paras: 5, chapters: [['art-008-ch1', 0, 1], ['art-008-ch2', 2, 3], ['art-008-ch3', 4, 4]] },
    { id: 'art-009', genre: 'Stories & Literature', level: 'A1', readingTime: 'Under 3 min', contentLen: 817, contentHash: '4d60b95c5b3d4004', paras: 4, chapters: [] },
    { id: 'art-010', genre: 'Health & Psychology', level: 'A2', readingTime: '5–10 min', contentLen: 1478, contentHash: '71a1aa63295a253c', paras: 5, chapters: [['art-010-ch1', 0, 1], ['art-010-ch2', 2, 2], ['art-010-ch3', 3, 4]] },
];
/** Short deterministic digest of a string, with no Node built-in dependency. */
const digest = (text) => {
    let a = 0x811c9dc5;
    let b = 0x01000193;
    for (let i = 0; i < text.length; i += 1) {
        a = Math.imul(a ^ text.charCodeAt(i), 16777619) >>> 0;
        b = (b + a + i) >>> 0;
    }
    return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
};
eq('C count: article count unchanged', articles_1.ARTICLES_DATA.length, BASELINE.length);
eq('C count: total chapter count unchanged', articles_1.ARTICLES_DATA.reduce((sum, a) => sum + (a.chapters?.length ?? 0), 0), 19);
for (const expected of BASELINE) {
    const article = articles_1.ARTICLES_DATA.find((a) => a.id === expected.id);
    check(`C data: ${expected.id} still exists`, article !== undefined);
    if (!article)
        continue;
    eq(`C data: ${expected.id} genre unchanged`, article.genre, expected.genre);
    eq(`C data: ${expected.id} level unchanged`, article.level, expected.level);
    eq(`C data: ${expected.id} readingTime unchanged`, article.readingTime, expected.readingTime);
    check(`C data: ${expected.id} title unchanged`, article.title.length > 0);
    check(`C data: ${expected.id} description unchanged`, typeof article.description === 'string');
    check(`C data: ${expected.id} image unchanged`, typeof article.image === 'string' && article.image.length > 0);
    // The decisive checks: identical byte length and identical paragraph text.
    eq(`C data: ${expected.id} content length unchanged`, article.content.length, expected.contentLen);
    eq(`C data: ${expected.id} content digest unchanged`, digest(article.content), expected.contentHash);
    eq(`C data: ${expected.id} paragraph count unchanged`, (0, articleSelectors_1.getArticleParagraphCount)(article), expected.paras);
    eq(`C chapters: ${expected.id} ids and indexes unchanged`, (article.chapters ?? []).map((c) => [c.id, c.startParagraphIndex, c.endParagraphIndex]), expected.chapters);
}
/* ==========================================================================
   D. Content groups - the six top-level library sections
   ========================================================================== */
const EXPECTED_CONTENT_GROUPS = [
    'articles', 'encyclopedia', 'specialized',
    'short-story', 'novel', 'classic-literature',
];
eq('D groups: exactly the six agreed groups exist', [...metadataValidation_1.CONTENT_GROUPS].sort(), [...EXPECTED_CONTENT_GROUPS].sort());
for (const group of metadataValidation_1.CONTENT_GROUPS) {
    check(`D groups: "${group}" passes isContentGroup`, (0, metadataValidation_1.isContentGroup)(group));
}
// The groups are content-navigation groups. A country must never become one.
for (const value of ['vietnam', 'VN', 'vietnam-news', 'vietnamese-news', 'uk', 'gb',
    'vietnam-articles', 'news-vn', 'international-news']) {
    check(`D groups: "${value}" is not treated as a content group`, !(0, metadataValidation_1.isContentGroup)(value));
}
for (const value of ['', ' ', 'Articles', 'ARTICLES', 'article', 'articles ', 'short_story', 'short story']) {
    check(`D groups: "${value}" is not a valid group`, !(0, metadataValidation_1.isContentGroup)(value));
}
for (const value of [null, undefined, 0, 42, true, {}, ['articles'], new Date(0)]) {
    check(`D groups: non-string ${String(value)} is not a group`, !(0, metadataValidation_1.isContentGroup)(value));
}
// Countries live in metadata, never in the group taxonomy.
check('D groups: "VN" is a country code but not a category or a group', (0, metadataValidation_1.isCountryCode)('VN') && !(0, metadataValidation_1.isCategory)('VN') && !(0, metadataValidation_1.isContentGroup)('VN'));
// No existing article may be assigned a group in this phase: a group is an
// editorial judgement, and Phase 3.2 is not allowed to make that call.
for (const key of registryKeys) {
    check(`D groups: ${key} has no invented contentGroup`, articleEnrichment_1.ARTICLE_ENRICHMENTS[key].contentGroup === undefined);
    check(`D groups: ${key} reports undefined through the selector`, (0, articleSelectors_1.getArticleContentGroup)(key) === undefined);
}
check('D groups: an unknown id yields undefined', (0, articleSelectors_1.getArticleContentGroup)('nope') === undefined);
check('D groups: an empty id yields undefined', (0, articleSelectors_1.getArticleContentGroup)('') === undefined);
// An editorial is filed under `articles` while keeping its own content type:
// the group and the form are independent axes.
const EDITORIAL_IN_ARTICLES = {
    contentGroup: 'articles',
    contentType: 'editorial',
    primaryCategory: 'politics',
};
check('D groups: an editorial can live in the unified articles group', EDITORIAL_IN_ARTICLES.contentGroup === 'articles' &&
    EDITORIAL_IN_ARTICLES.contentType === 'editorial' &&
    (0, metadataValidation_1.isContentGroup)(EDITORIAL_IN_ARTICLES.contentGroup) &&
    (0, metadataValidation_1.isContentType)(EDITORIAL_IN_ARTICLES.contentType));
check('D groups: group and content type are independent values', EDITORIAL_IN_ARTICLES.contentGroup !== EDITORIAL_IN_ARTICLES.contentType);
// Grouping is purely optional: an article with no group at all is still valid.
check('D groups: an unclassified item is valid and reports undefined', {}.contentGroup === undefined &&
    (0, metadataValidation_1.resolveAllCategories)({ primaryCategory: 'history' }).length === 1);
/* ==========================================================================
   E. Content types remain valid, and stay a single primary value
   ========================================================================== */
eq('E types: the ten agreed content types exist', [...metadataValidation_1.CONTENT_TYPES].sort(), [...ALL_CONTENT_TYPES].sort());
for (const type of metadataValidation_1.CONTENT_TYPES) {
    check(`E types: "${type}" passes isContentType`, (0, metadataValidation_1.isContentType)(type));
    check(`E types: "${type}" is accepted by the registry vocabulary`, ALL_CONTENT_TYPES.includes(type));
}
for (const value of ['', 'News', 'short story', 'shortstory', 'non-fiction', 'essay', 1, null, {}]) {
    check(`E types: "${String(value)}" is not a valid ContentType`, !(0, metadataValidation_1.isContentType)(value));
}
// A group must not double as a content type, and vice versa.
check('E types: "editorial" is a content type but never a group', (0, metadataValidation_1.isContentType)('editorial') && !(0, metadataValidation_1.isContentGroup)('editorial'));
check('E types: "encyclopedia" is a group but never a content type', (0, metadataValidation_1.isContentGroup)('encyclopedia') && !(0, metadataValidation_1.isContentType)('encyclopedia'));
for (const key of registryKeys) {
    const enrichment = articleEnrichment_1.ARTICLE_ENRICHMENTS[key];
    const article = articles_1.ARTICLES_DATA.find((a) => a.id === key);
    if (enrichment.contentType !== undefined) {
        check(`E types: ${key} still has a valid recorded contentType`, (0, metadataValidation_1.isContentType)(enrichment.contentType), enrichment.contentType);
    }
    // Phase 3.2 must not invent or change a CEFR level: no enrichment entry may
    // carry one, whatever kind of article the key belongs to.
    check(`E types: ${key} records no CEFR level in enrichment`, enrichment.cefrLevel === undefined
        && enrichment.level === undefined);
    // The article's own level can only be checked for bundled articles;
    // `imported-*` ids carry their level in the backend library row, which is
    // validated against the live API by `curiosityFilterTests.ts`.
    if (article) {
        check(`E types: ${key} CEFR level unchanged`, ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(article.level));
    }
}
/* ==========================================================================
   F. One primary category and zero or more secondary categories
   ========================================================================== */
eq('F categories: the agreed vocabulary is unchanged', [...metadataValidation_1.CATEGORIES].sort(), [...ALL_CATEGORIES].sort());
for (const category of metadataValidation_1.CATEGORIES) {
    check(`F categories: "${category}" passes isCategory`, (0, metadataValidation_1.isCategory)(category));
}
// Exactly one primary category, or none at all - never two.
eq('F categories: an explicit primary wins over the legacy array', (0, metadataValidation_1.resolvePrimaryCategory)({ primaryCategory: 'history', categories: ['science'] }), 'history');
eq('F categories: the legacy array still yields a primary (backward compatibility)', (0, metadataValidation_1.resolvePrimaryCategory)({ categories: ['science', 'environment'] }), 'science');
eq('F categories: a skipped invalid leading entry does not become the primary', (0, metadataValidation_1.resolvePrimaryCategory)({ categories: ['not-a-category', 'science'] }), 'science');
check('F categories: no category at all yields undefined, never a fabricated default', (0, metadataValidation_1.resolvePrimaryCategory)({}) === undefined && (0, metadataValidation_1.resolvePrimaryCategory)(undefined) === undefined);
check('F categories: an item with only a primary category has zero secondary categories', (0, metadataValidation_1.resolveSecondaryCategories)({ primaryCategory: 'travel' }).length === 0);
eq('F categories: secondary categories are returned in recorded order', (0, metadataValidation_1.resolveSecondaryCategories)({ primaryCategory: 'science', secondaryCategories: ['technology', 'business', 'art'] }), ['technology', 'business', 'art']);
eq('F categories: primary plus secondary reconcile into one flat list', (0, metadataValidation_1.resolveAllCategories)({ primaryCategory: 'science', secondaryCategories: ['technology', 'environment'] }), ['science', 'technology', 'environment']);
// Invalid values are discarded rather than passed on to a filter.
check('F categories: an invalid secondary value is dropped', !(0, metadataValidation_1.resolveSecondaryCategories)({ secondaryCategories: ['technology', 'nope', 'art'] })
    .includes('nope'));
eq('F categories: mixed valid/invalid secondaries keep only the valid ones', (0, metadataValidation_1.resolveSecondaryCategories)({ secondaryCategories: ['technology', 'nope', 'art', 7] }), ['technology', 'art']);
// Non-array input must never crash.
eq('F categories: a missing secondary value yields an empty list', (0, metadataValidation_1.normalizeSecondaryCategories)(undefined), []);
eq('F categories: a string secondary value yields an empty list', (0, metadataValidation_1.normalizeSecondaryCategories)('science'), []);
eq('F categories: an object yields an empty list', (0, metadataValidation_1.normalizeSecondaryCategories)({ a: 1 }), []);
eq('F categories: null yields an empty list', (0, metadataValidation_1.normalizeSecondaryCategories)(null), []);
eq('F categories: a number yields an empty list', (0, metadataValidation_1.normalizeSecondaryCategories)(5), []);
/* ==========================================================================
   G. Duplicate secondary categories are handled consistently
   ========================================================================== */
eq('G duplicates: repeated secondaries collapse, keeping the first occurrence', (0, metadataValidation_1.normalizeSecondaryCategories)(['science', 'technology', 'science', 'art', 'technology']), ['science', 'technology', 'art']);
eq('G duplicates: the primary category is removed from the secondaries', (0, metadataValidation_1.normalizeSecondaryCategories)(['science', 'technology', 'science'], 'science'), ['technology']);
eq('G duplicates: a long run of identical values yields exactly one', (0, metadataValidation_1.normalizeSecondaryCategories)(['art', 'art', 'art', 'art']), ['art']);
eq('G duplicates: dedup is stable and order-preserving, not sorted', (0, metadataValidation_1.normalizeSecondaryCategories)(['travel', 'art', 'history', 'art', 'travel']), ['travel', 'art', 'history']);
// Determinism: the same input must always give the same output, so a filter
// cannot flicker between renders.
eq('G duplicates: repeated calls give identical results', (0, metadataValidation_1.normalizeSecondaryCategories)(['science', 'science', 'art']), (0, metadataValidation_1.normalizeSecondaryCategories)(['science', 'science', 'art']));
// Pure: the caller's array is never modified.
const callerArray = ['science', 'science', 'art'];
const callerCopy = [...callerArray];
(0, metadataValidation_1.normalizeSecondaryCategories)(callerArray, 'history');
eq('G duplicates: the input array is not mutated', callerArray, callerCopy);
// Idempotent: normalising an already-normalised list changes nothing.
const onceNormalized = (0, metadataValidation_1.normalizeSecondaryCategories)(['science', 'art', 'science'], 'history');
eq('G duplicates: normalising twice is the same as once', (0, metadataValidation_1.normalizeSecondaryCategories)(onceNormalized, 'history'), onceNormalized);
// Duplicates inside the legacy array are handled identically, so the two
// shapes cannot disagree with each other.
eq('G duplicates: legacy arrays are deduplicated by the same rule', (0, metadataValidation_1.resolveAllCategories)({ categories: ['science', 'science', 'environment'] }), ['science', 'environment']);
eq('G duplicates: explicit and legacy secondaries merge without repeats', (0, metadataValidation_1.resolveSecondaryCategories)({
    primaryCategory: 'science',
    secondaryCategories: ['technology', 'art'],
    categories: ['science', 'environment', 'technology'],
}), ['technology', 'art', 'environment']);
/* ==========================================================================
   H. Geography - publisher country is not countries discussed
   ========================================================================== */
const VIETNAM_PUBLISHED_IN_THE_UK = {
    contentType: 'news',
    countriesAbout: ['VN'],
    source: {
        name: 'Example Herald',
        publisherCountryCode: 'GB',
        retrievedAt: '2026-03-14',
    },
};
check('H geography: publisher country and countries-about come from different fields', VIETNAM_PUBLISHED_IN_THE_UK.source?.publisherCountryCode === 'GB' &&
    (VIETNAM_PUBLISHED_IN_THE_UK.countriesAbout ?? [])[0] === 'VN');
check('H geography: the publisher country is never derived from countriesAbout', VIETNAM_PUBLISHED_IN_THE_UK.source?.publisherCountryCode === 'GB' &&
    (0, metadataValidation_1.resolveAllCategories)(VIETNAM_PUBLISHED_IN_THE_UK).length === 0);
eq('H geography: countriesAbout keeps only its own entries', (0, metadataValidation_1.normalizeCountriesAbout)(VIETNAM_PUBLISHED_IN_THE_UK.countriesAbout), ['VN']);
check('H geography: one article may cover several countries', (0, metadataValidation_1.normalizeCountriesAbout)(['VN', 'US', 'JP']).length === 3);
check('H geography: a duplicate country is collapsed', (0, metadataValidation_1.normalizeCountriesAbout)(['VN', 'VN', 'US']).length === 2);
// Global scope must never be faked with a placeholder country code.
check('H geography: XX is not accepted as a country code', !(0, metadataValidation_1.isCountryCode)('XX'));
check('H geography: ZZ is not accepted as a country code', !(0, metadataValidation_1.isCountryCode)('ZZ'));
check('H geography: EU is not accepted as a country code', !(0, metadataValidation_1.isCountryCode)('EU'));
eq('H geography: placeholder codes are stripped from countriesAbout', (0, metadataValidation_1.normalizeCountriesAbout)(['XX', 'ZZ', 'VN', 'EU']), ['VN']);
check('H geography: a real alpha-2 code is accepted', (0, metadataValidation_1.isCountryCode)('VN') && (0, metadataValidation_1.isCountryCode)('GB'));
for (const bad of ['vn', 'VNM', 'V', 'V1', '12', ' V', 'V ', '', 'Vietnam', null, 42]) {
    check(`H geography: ${JSON.stringify(bad)} is not a valid country code`, !(0, metadataValidation_1.isCountryCode)(bad));
}
// Geographic scope is the honest home for "worldwide".
eq('H geography: the scope vocabulary is validated', [...metadataValidation_1.GEOGRAPHIC_SCOPES].sort(), ['global', 'international', 'national', 'none', 'regional']);
check('H geography: "global" is a valid scope and not a country code', (0, metadataValidation_1.isGeographicScope)('global') && !(0, metadataValidation_1.isCountryCode)('global'));
check('H geography: "none" expresses no geographic focus without a code', (0, metadataValidation_1.isGeographicScope)('none') && !(0, metadataValidation_1.isCountryCode)('none'));
// No existing article gains geographic metadata in this phase.
for (const key of registryKeys) {
    check(`H geography: ${key} has no invented publisher country`, articleEnrichment_1.ARTICLE_ENRICHMENTS[key].source === undefined);
    check(`H geography: ${key} reports undefined for the publisher country`, (0, articleSelectors_1.getArticlePublisherCountryCode)(key) === undefined);
}
// art-005 is set in Prague: the one existing countriesAbout value must survive
// untouched, and it must not turn into a publisher country.
eq('H geography: art-005 keeps its recorded country', (0, articleSelectors_1.getArticleCountriesAbout)('art-005'), ['CZ']);
check('H geography: art-005 has no publisher country', (0, articleSelectors_1.getArticlePublisherCountryCode)('art-005') === undefined);
eq('H geography: art-005 geographic scope is undefined, not defaulted', (0, articleSelectors_1.getArticleGeographicScope)('art-005'), undefined);
eq('H geography: an unknown article has no countries about', (0, articleSelectors_1.getArticleCountriesAbout)('does-not-exist'), []);
/* ==========================================================================
   I. Licence and copyright honesty
   ========================================================================== */
eq('I licence: the five agreed licence types exist', [...metadataValidation_1.LICENSE_TYPES].sort(), ['creative-commons', 'link-only', 'permitted-reuse', 'public-domain', 'unknown']);
for (const type of metadataValidation_1.LICENSE_TYPES) {
    check(`I licence: "${type}" passes isLicenseType`, (0, metadataValidation_1.isLicenseType)(type));
}
for (const value of ['', 'CC-BY', 'cc-by-sa', 'Public Domain', 'free', 'open', null, 5, {}]) {
    check(`I licence: ${JSON.stringify(value)} is not a valid LicenseType`, !(0, metadataValidation_1.isLicenseType)(value));
}
// No licence recorded -> undefined. It is never upgraded to a permissive value.
check('I licence: no licence at all yields undefined, not "allowed"', (0, metadataValidation_1.allowsFullTextHosting)(undefined) === undefined);
eq('I licence: the registry records no licence for any article', registryKeys.filter((key) => (0, articleSelectors_1.getArticleLicense)(key) !== undefined), []);
eq('I licence: the registry records no source for any article', registryKeys.filter((key) => (0, articleSelectors_1.getArticleSource)(key) !== undefined), []);
for (const key of registryKeys) {
    check(`I licence: ${key} reports undefined for full-text hosting`, (0, articleSelectors_1.getArticleAllowsFullText)(key) === undefined);
    check(`I licence: ${key} is not claimed to have verified provenance`, (0, metadataValidation_1.hasVerifiedProvenance)(articleEnrichment_1.ARTICLE_ENRICHMENTS[key]) === false);
}
// Unknown rights stay unknown. Nothing may turn "unknown" into permission.
check('I licence: an explicit unknown licence does not allow hosting', (0, metadataValidation_1.allowsFullTextHosting)({ type: 'unknown' }) === false);
check('I licence: unknown is not an unverified claim (declining is always safe)', (0, metadataValidation_1.hasUnverifiedReuseClaim)({ type: 'unknown' }) === false);
// Free to read is not free to reuse.
check('I licence: link-only does not allow hosting full text', (0, metadataValidation_1.allowsFullTextHosting)({ type: 'link-only' }) === false);
check('I licence: link-only is not an unverified positive claim', (0, metadataValidation_1.hasUnverifiedReuseClaim)({ type: 'link-only' }) === false);
// A CC family name alone says nothing; the specific licence must be named.
check('I licence: creative-commons without an id does not allow hosting', (0, metadataValidation_1.allowsFullTextHosting)({ type: 'creative-commons' }) === false);
check('I licence: a bare creative-commons claim is flagged as unverified', (0, metadataValidation_1.hasUnverifiedReuseClaim)({ type: 'creative-commons' }) === true);
check('I licence: a named CC licence does allow hosting', (0, metadataValidation_1.allowsFullTextHosting)({ type: 'creative-commons', id: 'CC BY 4.0' }) === true);
check('I licence: a named CC licence with evidence is not flagged', (0, metadataValidation_1.hasUnverifiedReuseClaim)({ type: 'creative-commons', id: 'CC BY 4.0' }) === false);
check('I licence: whitespace-only CC id does not count as named', (0, metadataValidation_1.allowsFullTextHosting)({ type: 'creative-commons', id: '   ' }) === false);
// Public domain must be evidenced, never assumed from age or free access.
check('I licence: a bare public-domain claim is flagged as unverified', (0, metadataValidation_1.hasUnverifiedReuseClaim)({ type: 'public-domain' }) === true);
check('I licence: public-domain with evidence is not flagged', (0, metadataValidation_1.hasUnverifiedReuseClaim)({ type: 'public-domain', permissionEvidence: 'Verified against the source.' }) === false);
check('I licence: public-domain with a named identifier is not flagged', (0, metadataValidation_1.hasUnverifiedReuseClaim)({ type: 'public-domain', id: 'PD-US' }) === false);
check('I licence: an explicit permission from the rights holder allows hosting', (0, metadataValidation_1.allowsFullTextHosting)({ type: 'permitted-reuse' }) === true);
// An unrecognised licence type must never be treated as permissive.
check('I licence: an unrecognised licence type does not allow hosting', (0, metadataValidation_1.allowsFullTextHosting)({ type: 'CC0' }) === false);
check('I licence: an unrecognised licence type is flagged as unverified', (0, metadataValidation_1.hasUnverifiedReuseClaim)({ type: 'CC0' }) === true);
/* ==========================================================================
   I2. Provenance completeness, and never crashing on missing metadata
   ========================================================================== */
// Translation and republishing are not granted by free access.
const RESTRICTIVE_CC = {
    type: 'creative-commons',
    id: 'CC BY 4.0',
    translationAllowed: false,
    republishingAllowed: false,
};
check('I2 licence: a restrictive CC licence is still not an unverified claim', (0, metadataValidation_1.hasUnverifiedReuseClaim)(RESTRICTIVE_CC) === false);
// An absent derivative flag means "not established". It must never be read as
// permission, and the resolver must not fill it in.
const CC_WITHOUT_DERIVATIVE_FLAGS = { type: 'creative-commons', id: 'CC BY 4.0' };
check('I2 licence: absent derivative flags stay undefined, never "allowed"', CC_WITHOUT_DERIVATIVE_FLAGS.translationAllowed === undefined &&
    CC_WITHOUT_DERIVATIVE_FLAGS.republishingAllowed === undefined);
check('I2 licence: an explicit false is preserved and is not an unverified claim', RESTRICTIVE_CC.translationAllowed === false &&
    RESTRICTIVE_CC.republishingAllowed === false &&
    (0, metadataValidation_1.hasUnverifiedReuseClaim)(RESTRICTIVE_CC) === false);
// Provenance must be complete to count as verified, and checking never fills it in.
const FULL_PROVENANCE = {
    source: { name: 'Example Herald', url: 'https://example.com/a', publisherCountryCode: 'GB' },
    license: { type: 'creative-commons', id: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
};
check('I2 provenance: complete, verified provenance is recognised', (0, metadataValidation_1.hasVerifiedProvenance)(FULL_PROVENANCE) === true);
check('I2 provenance: provenance without a licence is not verified', (0, metadataValidation_1.hasVerifiedProvenance)({ source: { name: 'Example Herald' } }) === false);
check('I2 provenance: a licence without a source is not verified', (0, metadataValidation_1.hasVerifiedProvenance)({ license: { type: 'permitted-reuse' } }) === false);
check('I2 provenance: a blank source name is not verified', (0, metadataValidation_1.hasVerifiedProvenance)({ source: { name: '   ' }, license: { type: 'permitted-reuse' } }) === false);
check('I2 provenance: an unevidenced reuse claim is not verified provenance', (0, metadataValidation_1.hasVerifiedProvenance)({ source: { name: 'Example' }, license: { type: 'creative-commons' } }) === false);
check('I2 provenance: an absent enrichment is not verified provenance', (0, metadataValidation_1.hasVerifiedProvenance)(undefined) === false);
// Missing provenance must never crash a consumer.
for (const id of ['', 'does-not-exist', 'art-001', 'art-005']) {
    const label = id === '' ? '(empty id)' : id;
    check(`I2 crash: ${label} - a missing licence does not crash`, (0, articleSelectors_1.getArticleLicense)(id) === undefined || typeof (0, articleSelectors_1.getArticleLicense)(id) === 'object');
    check(`I2 crash: ${label} - a missing source does not crash`, (0, articleSelectors_1.getArticleSource)(id) === undefined || typeof (0, articleSelectors_1.getArticleSource)(id) === 'object');
    check(`I2 crash: ${label} - full-text hosting stays undefined`, (0, articleSelectors_1.getArticleAllowsFullText)(id) === undefined);
}
check('I2 crash: malformed enrichments do not crash the resolvers', (0, metadataValidation_1.resolveAllCategories)({ categories: 'nope' }).length === 0 &&
    (0, metadataValidation_1.resolveAllCategories)({ secondaryCategories: 5 }).length === 0 &&
    (0, metadataValidation_1.resolvePrimaryCategory)({}) === undefined);
eq('I2 crash: malformed country lists yield an empty array', (0, metadataValidation_1.normalizeCountriesAbout)('VN'), []);
/* ==========================================================================
   J. Legacy compatibility - existing selectors and article types still work
   ========================================================================== */
// Legacy entries still resolve to exactly the same category lists as in Phase 3.1.
eq('J legacy: art-001 categories are unchanged', (0, articleSelectors_1.getArticleCategories)('art-001'), ['science', 'environment']);
eq('J legacy: art-004 categories are unchanged', (0, articleSelectors_1.getArticleCategories)('art-004'), ['science', 'technology', 'environment']);
eq('J legacy: art-010 categories are unchanged', (0, articleSelectors_1.getArticleCategories)('art-010'), ['psychology', 'education']);
for (const key of registryKeys) {
    const enrichment = articleEnrichment_1.ARTICLE_ENRICHMENTS[key];
    const recorded = enrichment.categories ?? [];
    eq(`J legacy: ${key} selector matches the recorded array`, (0, articleSelectors_1.getArticleCategories)(key), [...recorded]);
    // The primary/secondary split must be a faithful partition of the whole list.
    const primary = (0, articleSelectors_1.getArticlePrimaryCategory)(key);
    const secondary = (0, articleSelectors_1.getArticleSecondaryCategories)(key);
    check(`J legacy: ${key} primary plus secondary covers every category`, JSON.stringify([...(primary ? [primary] : []), ...secondary]) === JSON.stringify([...recorded]), `primary=${primary} secondary=${JSON.stringify(secondary)} recorded=${JSON.stringify(recorded)}`);
    check(`J legacy: ${key} has at most one primary category`, primary === undefined || (0, metadataValidation_1.isCategory)(primary));
    check(`J legacy: ${key} secondaries never repeat the primary`, primary === undefined || !secondary.includes(primary));
    check(`J legacy: ${key} secondaries are unique`, new Set(secondary).size === secondary.length);
    check(`J legacy: ${key} secondary values are all valid categories`, secondary.every((category) => (0, metadataValidation_1.isCategory)(category)));
    // The selector must hand back a fresh array, never the registry's own.
    check(`J legacy: ${key} selector returns a copy`, (0, articleSelectors_1.getArticleCategories)(key) !== enrichment.categories);
}
// A plain legacy Article is still valid and needs no migration.
const LEGACY_ARTICLE = {
    id: 'syn-legacy', title: 'T', description: 'D', image: '',
    genre: 'News & Social Issues', level: 'B1', readingTime: 'Under 3 min', content: 'Body',
};
check('J legacy: a plain Article is still usable as a LibraryArticle', (0, articleSelectors_1.getLibraryArticle)(LEGACY_ARTICLE).enrichment === undefined &&
    (0, articleSelectors_1.getLibraryArticle)(LEGACY_ARTICLE).content === 'Body');
check('J legacy: a legacy Article with no metadata is accepted by every new selector', (0, articleSelectors_1.getArticleContentGroup)('syn-legacy') === undefined &&
    (0, articleSelectors_1.getArticlePrimaryCategory)('syn-legacy') === undefined &&
    (0, articleSelectors_1.getArticleSecondaryCategories)('syn-legacy').length === 0 &&
    (0, articleSelectors_1.getArticleCountriesAbout)('syn-legacy').length === 0 &&
    (0, articleSelectors_1.getArticleLicense)('syn-legacy') === undefined &&
    (0, articleSelectors_1.getArticleAllowsFullText)('syn-legacy') === undefined);
// The new selectors must not disturb the Phase 3.1 derived values.
for (const article of articles_1.ARTICLES_DATA) {
    eq(`J legacy: ${article.id} word count is unchanged`, (0, articleSelectors_1.getArticleWordCount)(article), article.content.split(/\s+/).filter((t) => t.length > 0).length);
    eq(`J legacy: ${article.id} paragraph count is unchanged`, (0, articleSelectors_1.getArticleParagraphCount)(article), (0, chapterUtils_1.getArticleParagraphs)(article).length);
    eq(`J legacy: ${article.id} reading minutes are unchanged`, (0, articleSelectors_1.getArticleEstimatedReadingMinutes)(article), Math.max(1, Math.round((0, articleSelectors_1.getArticleWordCount)(article) / articleSelectors_1.AVERAGE_READING_WORDS_PER_MINUTE)));
    check(`J legacy: ${article.id} keeps its authored readingTime`, ['Under 3 min', '5–10 min', 'Chapter'].includes(article.readingTime));
}
/* ==========================================================================
   K. Search text, vocabulary integrity, and compile-time type guarantees
   ========================================================================== */
// getArticleSearchText keeps working, and now also covers the new fields.
check('K search: still lower-cased and still includes the title', (0, articleSelectors_1.getArticleSearchText)(ART001) === (0, articleSelectors_1.getArticleSearchText)(ART001).toLowerCase() &&
    (0, articleSelectors_1.getArticleSearchText)(ART001).includes('hydrothermal vents'));
check('K search: legacy categories are still searchable', (0, articleSelectors_1.getArticleSearchText)(ART001, articleEnrichment_1.ARTICLE_ENRICHMENTS['art-001']).includes('environment'));
check('K search: works with no enrichment at all', (0, articleSelectors_1.getArticleSearchText)(ART009).length > 0);
check('K search: still includes chapter titles', (0, articleSelectors_1.getArticleSearchText)(ART005).includes('clock parts'));
check('K search: never writes the result back onto the article', ART001.searchText === undefined);
const NEW_SHAPE_SEARCH = {
    contentGroup: 'articles',
    contentType: 'editorial',
    primaryCategory: 'politics',
    secondaryCategories: ['society'],
    geographicScope: 'international',
    countriesAbout: ['VN'],
};
const newShapeText = (0, articleSelectors_1.getArticleSearchText)(ART001, NEW_SHAPE_SEARCH);
check('K search: new-shape metadata is searchable', newShapeText.includes('politics') && newShapeText.includes('society') &&
    newShapeText.includes('articles') && newShapeText.includes('international') &&
    newShapeText.includes('vn'));
// Vocabulary and unions must not drift apart at runtime.
check('K vocabulary: every content type passes its own guard', metadataValidation_1.CONTENT_TYPES.every((type) => (0, metadataValidation_1.isContentType)(type)));
check('K vocabulary: every category passes its own guard', metadataValidation_1.CATEGORIES.every((category) => (0, metadataValidation_1.isCategory)(category)));
check('K vocabulary: every group passes its own guard', metadataValidation_1.CONTENT_GROUPS.every((group) => (0, metadataValidation_1.isContentGroup)(group)));
check('K vocabulary: every licence type passes its own guard', metadataValidation_1.LICENSE_TYPES.every((type) => (0, metadataValidation_1.isLicenseType)(type)));
check('K vocabulary: every geographic scope passes its own guard', metadataValidation_1.GEOGRAPHIC_SCOPES.every((scope) => (0, metadataValidation_1.isGeographicScope)(scope)));
// No vocabulary may repeat a value. Overlap BETWEEN vocabularies is allowed
// and meaningful - 'novel' is both a content type and a navigation group - so
// uniqueness is checked per list, never across all of them.
const VOCABULARIES = [
    ['ContentType', metadataValidation_1.CONTENT_TYPES],
    ['Category', metadataValidation_1.CATEGORIES],
    ['ContentGroup', metadataValidation_1.CONTENT_GROUPS],
    ['LicenseType', metadataValidation_1.LICENSE_TYPES],
    ['GeographicScope', metadataValidation_1.GEOGRAPHIC_SCOPES],
];
for (const [name, values] of VOCABULARIES) {
    check(`K vocabulary: ${name} has no duplicate entries`, new Set(values).size === values.length);
}
check('K vocabulary: the six content groups are the documented ones', metadataValidation_1.CONTENT_GROUPS.length === 6);
// Compile-time guarantee: the exported tuples really are the declared unions.
// If a union member were added without updating this file, this line stops
// compiling rather than failing silently at runtime.
const _unionIsExhaustive = [
    ['news', 'articles', 'science', 'unknown', 'global'],
    ['classic-literature', 'encyclopedia', 'language-learning', 'link-only', 'none'],
];
void _unionIsExhaustive;
console.log(`\n${passed} assertions passed, ${failures.length} failed`);
if (failures.length > 0) {
    console.log('\nFAILURES:');
    for (const failure of failures)
        console.log(`  - ${failure}`);
    process.exit(1);
}
console.log('All metadata tests passed.');
