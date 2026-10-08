import { ARTICLES_DATA } from '../src/data/articles';
import { ARTICLE_ENRICHMENTS } from '../src/data/articleEnrichment';
import {
  AVERAGE_READING_WORDS_PER_MINUTE,
  getArticleAllowsFullText,
  getArticleCategories,
  getArticleContentGroup,
  getArticleContentType,
  getArticleCountriesAbout,
  getArticleEnrichment,
  getArticleEstimatedReadingMinutes,
  getArticleGeographicScope,
  getArticleLicense,
  getArticleParagraphCount,
  getArticlePrimaryCategory,
  getArticlePublisherCountryCode,
  getArticleSearchText,
  getArticleSecondaryCategories,
  getArticleSource,
  getArticleWordCount,
  getLibraryArticle,
} from '../src/utils/articleSelectors';
import {
  CATEGORIES,
  CONTENT_GROUPS,
  CONTENT_TYPES,
  GEOGRAPHIC_SCOPES,
  LICENSE_TYPES,
  allowsFullTextHosting,
  hasUnverifiedReuseClaim,
  hasVerifiedProvenance,
  isCategory,
  isContentGroup,
  isContentType,
  isCountryCode,
  isGeographicScope,
  isLicenseType,
  normalizeCountriesAbout,
  normalizeSecondaryCategories,
  resolveAllCategories,
  resolvePrimaryCategory,
  resolveSecondaryCategories,
} from '../src/utils/metadataValidation';
import { getArticleParagraphs } from '../src/utils/chapterUtils';
import type {
  Article,
  ArticleEnrichment,
  ArticleLicense,
  Category,
  ContentGroup,
  ContentType,
  GeographicScope,
  LicenseType,
} from '../src/types/article';

/**
 * Phase 3.1 tests for the metadata registry, the selectors, and the guarantee
 * that no existing article or chapter data was disturbed.
 *
 * Phase 3.2 (sections D-H) adds the content taxonomy: navigation groups, the
 * primary/secondary category model, the separation of publisher country from
 * countries discussed, and the licence-honesty rules. Sections A-C are left
 * exactly as Phase 3.1 wrote them, so they remain a genuine regression suite.
 *
 * Written with the same lightweight harness as `chapterTests.ts` and
 * `srsTests.ts` (plain Node, no test framework), so it needs no new dependency
 * and no `package.json` change.
 */
declare const console: { log: (...args: unknown[]) => void };
declare const process: { exit: (code: number) => void };

let passed = 0;
const failures: string[] = [];

const check = (name: string, condition: boolean, detail = '') => {
  if (condition) {
    passed += 1;
  } else {
    failures.push(`${name}${detail ? ` -> ${detail}` : ''}`);
  }
};

const eq = (name: string, actual: unknown, expected: unknown) => {
  check(
    name,
    JSON.stringify(actual) === JSON.stringify(expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
};

/* ==========================================================================
   A. Metadata registry
   ========================================================================== */

const EXPECTED_IDS = [
  'art-001', 'art-002', 'art-003', 'art-004', 'art-005',
  'art-006', 'art-007', 'art-008', 'art-009', 'art-010',
];

const articleIds = new Set(ARTICLES_DATA.map((article) => article.id));

eq('A ids: ARTICLES_DATA still has exactly 10 articles', ARTICLES_DATA.length, 10);
eq('A ids: every existing id is unchanged', ARTICLES_DATA.map((a) => a.id), EXPECTED_IDS);

// Every registry key must point at a real article, and no id may appear twice.
// Static ids must live in ARTICLES_DATA; `imported-*` ids belong to the backend
// library, whose ids are verified against the live API by
// `curiosityFilterTests.ts` instead of against the bundled collection.
const registryKeys = Object.keys(ARTICLE_ENRICHMENTS);
const isImportedId = (key: string) => key.startsWith('imported-');
for (const key of registryKeys) {
  check(`A registry: "${key}" exists in ARTICLES_DATA or is an imported id`,
    articleIds.has(key) || isImportedId(key));
}
check('A registry: no duplicate ids', new Set(registryKeys).size === registryKeys.length);

const unknownKeys = registryKeys.filter((key) => !articleIds.has(key) && !isImportedId(key));
check('A registry: no unknown article ids', unknownKeys.length === 0, unknownKeys.join(','));

// Metadata without source/licence must stay valid - that is the current state.
const withoutProvenance = registryKeys.filter((key) => {
  const enrichment = ARTICLE_ENRICHMENTS[key];
  return enrichment.source === undefined && enrichment.license === undefined;
});
check(
  'A registry: entries may omit source and licence',
  withoutProvenance.length === registryKeys.length,
  `${withoutProvenance.length}/${registryKeys.length}`
);

// Category / contentType values are checked against the unions at compile time;
// these assertions confirm the runtime data matches those unions too.
const ALL_CATEGORIES: Category[] = [
  'science', 'technology', 'business', 'finance', 'healthcare', 'history', 'culture',
  'environment', 'education', 'psychology', 'travel', 'sports', 'society', 'politics',
  'literature', 'language-learning', 'food', 'art', 'career', 'other',
];
const ALL_CONTENT_TYPES: ContentType[] = [
  'news', 'editorial', 'educational', 'expository', 'short-story', 'novel',
  'classic-literature', 'poetry', 'dialogue', 'other',
];

for (const key of registryKeys) {
  const enrichment = ARTICLE_ENRICHMENTS[key];

  for (const category of enrichment.categories ?? []) {
    check(`A categories: ${key} uses a valid Category`, ALL_CATEGORIES.includes(category), category);
  }

  if (enrichment.contentType !== undefined) {
    check(
      `A contentType: ${key} uses a valid ContentType`,
      ALL_CONTENT_TYPES.includes(enrichment.contentType),
      enrichment.contentType
    );
  }

  for (const code of enrichment.countriesAbout ?? []) {
    check(`A countriesAbout: ${key} uses ISO alpha-2`, /^[A-Z]{2}$/.test(code), code);
  }
}

// No fabricated provenance: nothing may claim a source or licence that has not
// actually been verified. `articles.ts` holds no third-party sourced text, so
// every entry correctly leaves both unset.
for (const key of registryKeys) {
  const enrichment = ARTICLE_ENRICHMENTS[key];
  check(`A honesty: ${key} has no unverified source`, enrichment.source === undefined);
  check(`A honesty: ${key} has no unverified license`, enrichment.license === undefined);
}

// The registry must not duplicate data that already lives on Article.
const FORBIDDEN_DUPLICATES = [
  'content', 'title', 'description', 'image', 'genre', 'level', 'readingTime', 'id',
];
for (const key of registryKeys) {
  const enrichment = ARTICLE_ENRICHMENTS[key] as Record<string, unknown>;
  for (const field of FORBIDDEN_DUPLICATES) {
    check(
      `A no duplication: ${key} does not re-store "${field}"`,
      enrichment[field] === undefined,
      String(enrichment[field])
    );
  }
}

// Articles without registry metadata must still be handled gracefully.
check('A absent: unknown id returns undefined', getArticleEnrichment('does-not-exist') === undefined);
check('A absent: empty id returns undefined', getArticleEnrichment('') === undefined);
check(
  'A absent: known id returns its metadata',
  getArticleEnrichment('art-001')?.contentType === 'expository'
);
/* ==========================================================================
   B. Selector functions
   ========================================================================== */

const ART001 = ARTICLES_DATA.find((a) => a.id === 'art-001')!;
const ART005 = ARTICLES_DATA.find((a) => a.id === 'art-005')!;
const ART009 = ARTICLES_DATA.find((a) => a.id === 'art-009')!;

// B1 - enrichment, categories and contentType
eq('B1 categories: art-001 returns its recorded categories',
  getArticleCategories('art-001'), ['science', 'environment']);

eq('B1 categories: unknown id returns an empty array', getArticleCategories('does-not-exist'), []);

check('B1 categories: returned array is a copy, not the registry array',
  getArticleCategories('art-001') !== ARTICLE_ENRICHMENTS['art-001'].categories);

check('B1 categories: never guesses a category from genre',
  getArticleCategories('does-not-exist').length === 0);

eq('B1 contentType: art-005 is a short story', getArticleContentType('art-005'), 'short-story');
eq('B1 contentType: unknown id returns undefined', getArticleContentType('does-not-exist'), undefined);

// B2 - word count, including empty and whitespace-only input
const emptyArticle: Article = {
  id: 'syn-empty', title: '', description: '', image: '',
  genre: 'News & Social Issues', level: 'B1', readingTime: 'Under 3 min', content: '',
};

eq('B2 words: empty content yields 0', getArticleWordCount(emptyArticle), 0);
eq('B2 words: whitespace-only content yields 0', getArticleWordCount({ content: '   \n\n  \t ' }), 0);
eq('B2 words: single word yields 1', getArticleWordCount({ content: 'Hello' }), 1);
eq('B2 words: counts whitespace-separated tokens', getArticleWordCount({ content: 'one two  three\nfour' }), 4);

check('B2 words: content is never mutated',
  getArticleWordCount(ART001) === ART001.content.split(/\s+/).filter((t) => t.length > 0).length);

// B3 - paragraph count follows the project's existing split convention
for (const article of ARTICLES_DATA) {
  eq(`B3 paragraphs: ${article.id} matches getArticleParagraphs`,
    getArticleParagraphCount(article), getArticleParagraphs(article).length);
}
eq('B3 paragraphs: empty content yields 0', getArticleParagraphCount({ content: '' }), 0);
eq('B3 paragraphs: blank paragraphs are ignored', getArticleParagraphCount({ content: 'A\n\n\n\nB' }), 2);

// Every chapter index must still address a real paragraph.
for (const article of ARTICLES_DATA) {
  const count = getArticleParagraphCount(article);
  for (const chapter of article.chapters ?? []) {
    check(`B3 chapters: ${chapter.id} end index is within range`,
      chapter.endParagraphIndex < count, `${chapter.endParagraphIndex} >= ${count}`);
  }
}

// B4 - search text
const searchText = getArticleSearchText(ART001);
check('B4 search: is lower-cased', searchText === searchText.toLowerCase());
check('B4 search: includes the title', searchText.includes('hydrothermal vents'));
check('B4 search: includes the description and content', searchText.includes('black smokers'));
check('B4 search: includes categories when enrichment is supplied',
  getArticleSearchText(ART001, ARTICLE_ENRICHMENTS['art-001']).includes('science'));
check('B4 search: works without enrichment', getArticleSearchText(ART009).length > 0);
check('B4 search: includes chapter titles',
  getArticleSearchText(ART005).includes('clock parts'));
check('B4 search: does not write the result back onto the article',
  (ART001 as unknown as Record<string, unknown>).searchText === undefined);

// B5 - estimated reading minutes (derived only, never replacing readingTime)
eq('B5 minutes: empty article yields 0', getArticleEstimatedReadingMinutes(emptyArticle), 0);
eq('B5 minutes: whitespace-only yields 0', getArticleEstimatedReadingMinutes({ content: '  \n ' }), 0);
check('B5 minutes: a short article still yields at least 1',
  getArticleEstimatedReadingMinutes({ content: 'Two words' }) >= 1);
check('B5 minutes: the rate constant is positive and documented', AVERAGE_READING_WORDS_PER_MINUTE > 0);

for (const article of ARTICLES_DATA) {
  const expected = Math.max(1, Math.round(getArticleWordCount(article) / AVERAGE_READING_WORDS_PER_MINUTE));
  eq(`B5 minutes: ${article.id} matches the documented formula`,
    getArticleEstimatedReadingMinutes(article), expected);
}

// The estimate must never overwrite the authored legacy value.
for (const article of ARTICLES_DATA) {
  check(`B5 minutes: ${article.id} keeps its original readingTime`,
    ['Under 3 min', '5–10 min', 'Chapter'].includes(article.readingTime), article.readingTime);
}

// B6 - LibraryArticle combined view
const libraryArticle = getLibraryArticle(ART009);
check('B6 view: keeps the original id', libraryArticle.id === ART009.id);
check('B6 view: keeps the original content', libraryArticle.content === ART009.content);
eq('B6 view: attaches enrichment when present', libraryArticle.enrichment?.contentType, 'short-story');
check('B6 view: does not mutate the input article',
  (ART009 as unknown as Record<string, unknown>).enrichment === undefined);
check('B6 view: returns a new object', libraryArticle !== ART009);

const withoutMetadata = getLibraryArticle({
  id: 'syn-none', title: 'T', description: 'D', image: '',
  genre: 'News & Social Issues', level: 'B1', readingTime: 'Under 3 min', content: 'Body',
});
check('B6 view: an article with no registry entry simply has no enrichment',
  withoutMetadata.enrichment === undefined);
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
const BASELINE: {
  id: string; genre: string; level: string; readingTime: string;
  contentLen: number; contentHash: string; paras: number;
  chapters: [string, number, number][];
}[] = [
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
const digest = (text: string): string => {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i += 1) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619) >>> 0;
    b = (b + a + i) >>> 0;
  }
  return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
};

eq('C count: article count unchanged', ARTICLES_DATA.length, BASELINE.length);
eq('C count: total chapter count unchanged',
  ARTICLES_DATA.reduce((sum, a) => sum + (a.chapters?.length ?? 0), 0), 19);

for (const expected of BASELINE) {
  const article = ARTICLES_DATA.find((a) => a.id === expected.id);
  check(`C data: ${expected.id} still exists`, article !== undefined);
  if (!article) continue;

  eq(`C data: ${expected.id} genre unchanged`, article.genre, expected.genre);
  eq(`C data: ${expected.id} level unchanged`, article.level, expected.level);
  eq(`C data: ${expected.id} readingTime unchanged`, article.readingTime, expected.readingTime);
  check(`C data: ${expected.id} title unchanged`, article.title.length > 0);
  check(`C data: ${expected.id} description unchanged`, typeof article.description === 'string');
  check(`C data: ${expected.id} image unchanged`,
    typeof article.image === 'string' && article.image.length > 0);

  // The decisive checks: identical byte length and identical paragraph text.
  eq(`C data: ${expected.id} content length unchanged`, article.content.length, expected.contentLen);
  eq(`C data: ${expected.id} content digest unchanged`, digest(article.content), expected.contentHash);
  eq(`C data: ${expected.id} paragraph count unchanged`, getArticleParagraphCount(article), expected.paras);

  eq(`C chapters: ${expected.id} ids and indexes unchanged`,
    (article.chapters ?? []).map((c) => [c.id, c.startParagraphIndex, c.endParagraphIndex]),
    expected.chapters);
}

/* ==========================================================================
   D. Content groups - the six top-level library sections
   ========================================================================== */

const EXPECTED_CONTENT_GROUPS: ContentGroup[] = [
  'articles', 'encyclopedia', 'specialized',
  'short-story', 'novel', 'classic-literature',
];

eq('D groups: exactly the six agreed groups exist',
  [...CONTENT_GROUPS].sort(), [...EXPECTED_CONTENT_GROUPS].sort());

for (const group of CONTENT_GROUPS) {
  check(`D groups: "${group}" passes isContentGroup`, isContentGroup(group));
}

// The groups are content-navigation groups. A country must never become one.
for (const value of ['vietnam', 'VN', 'vietnam-news', 'vietnamese-news', 'uk', 'gb',
                     'vietnam-articles', 'news-vn', 'international-news']) {
  check(`D groups: "${value}" is not treated as a content group`, !isContentGroup(value));
}
for (const value of ['', ' ', 'Articles', 'ARTICLES', 'article', 'articles ', 'short_story', 'short story']) {
  check(`D groups: "${value}" is not a valid group`, !isContentGroup(value));
}
for (const value of [null, undefined, 0, 42, true, {}, ['articles'], new Date(0)]) {
  check(`D groups: non-string ${String(value)} is not a group`, !isContentGroup(value));
}

// Countries live in metadata, never in the group taxonomy.
check('D groups: "VN" is a country code but not a category or a group',
  isCountryCode('VN') && !isCategory('VN') && !isContentGroup('VN'));

// No existing article may be assigned a group in this phase: a group is an
// editorial judgement, and Phase 3.2 is not allowed to make that call.
for (const key of registryKeys) {
  check(`D groups: ${key} has no invented contentGroup`,
    ARTICLE_ENRICHMENTS[key].contentGroup === undefined);
  check(`D groups: ${key} reports undefined through the selector`,
    getArticleContentGroup(key) === undefined);
}
check('D groups: an unknown id yields undefined', getArticleContentGroup('nope') === undefined);
check('D groups: an empty id yields undefined', getArticleContentGroup('') === undefined);

// An editorial is filed under `articles` while keeping its own content type:
// the group and the form are independent axes.
const EDITORIAL_IN_ARTICLES: ArticleEnrichment = {
  contentGroup: 'articles',
  contentType: 'editorial',
  primaryCategory: 'politics',
};
check('D groups: an editorial can live in the unified articles group',
  EDITORIAL_IN_ARTICLES.contentGroup === 'articles' &&
  EDITORIAL_IN_ARTICLES.contentType === 'editorial' &&
  isContentGroup(EDITORIAL_IN_ARTICLES.contentGroup) &&
  isContentType(EDITORIAL_IN_ARTICLES.contentType));
check('D groups: group and content type are independent values',
  EDITORIAL_IN_ARTICLES.contentGroup !== EDITORIAL_IN_ARTICLES.contentType);

// Grouping is purely optional: an article with no group at all is still valid.
check('D groups: an unclassified item is valid and reports undefined',
  ({} as ArticleEnrichment).contentGroup === undefined &&
  resolveAllCategories({ primaryCategory: 'history' }).length === 1);

/* ==========================================================================
   E. Content types remain valid, and stay a single primary value
   ========================================================================== */

eq('E types: the ten agreed content types exist',
  [...CONTENT_TYPES].sort(), [...ALL_CONTENT_TYPES].sort());

for (const type of CONTENT_TYPES) {
  check(`E types: "${type}" passes isContentType`, isContentType(type));
  check(`E types: "${type}" is accepted by the registry vocabulary`,
    ALL_CONTENT_TYPES.includes(type));
}
for (const value of ['', 'News', 'short story', 'shortstory', 'non-fiction', 'essay', 1, null, {}]) {
  check(`E types: "${String(value)}" is not a valid ContentType`, !isContentType(value));
}

// A group must not double as a content type, and vice versa.
check('E types: "editorial" is a content type but never a group',
  isContentType('editorial') && !isContentGroup('editorial'));
check('E types: "encyclopedia" is a group but never a content type',
  isContentGroup('encyclopedia') && !isContentType('encyclopedia'));

for (const key of registryKeys) {
  const enrichment = ARTICLE_ENRICHMENTS[key];
  const article = ARTICLES_DATA.find((a) => a.id === key);
  if (enrichment.contentType !== undefined) {
    check(`E types: ${key} still has a valid recorded contentType`,
      isContentType(enrichment.contentType), enrichment.contentType);
  }
  // Phase 3.2 must not invent or change a CEFR level: no enrichment entry may
  // carry one, whatever kind of article the key belongs to.
  check(`E types: ${key} records no CEFR level in enrichment`,
    (enrichment as Record<string, unknown>).cefrLevel === undefined
    && (enrichment as Record<string, unknown>).level === undefined);
  // The article's own level can only be checked for bundled articles;
  // `imported-*` ids carry their level in the backend library row, which is
  // validated against the live API by `curiosityFilterTests.ts`.
  if (article) {
    check(`E types: ${key} CEFR level unchanged`,
      ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(article.level));
  }
}

/* ==========================================================================
   F. One primary category and zero or more secondary categories
   ========================================================================== */

eq('F categories: the agreed vocabulary is unchanged',
  [...CATEGORIES].sort(), [...ALL_CATEGORIES].sort());

for (const category of CATEGORIES) {
  check(`F categories: "${category}" passes isCategory`, isCategory(category));
}

// Exactly one primary category, or none at all - never two.
eq('F categories: an explicit primary wins over the legacy array',
  resolvePrimaryCategory({ primaryCategory: 'history', categories: ['science'] }), 'history');

eq('F categories: the legacy array still yields a primary (backward compatibility)',
  resolvePrimaryCategory({ categories: ['science', 'environment'] }), 'science');

eq('F categories: a skipped invalid leading entry does not become the primary',
  resolvePrimaryCategory({ categories: ['not-a-category', 'science'] as Category[] }), 'science');

check('F categories: no category at all yields undefined, never a fabricated default',
  resolvePrimaryCategory({}) === undefined && resolvePrimaryCategory(undefined) === undefined);

check('F categories: an item with only a primary category has zero secondary categories',
  resolveSecondaryCategories({ primaryCategory: 'travel' }).length === 0);

eq('F categories: secondary categories are returned in recorded order',
  resolveSecondaryCategories({ primaryCategory: 'science', secondaryCategories: ['technology', 'business', 'art'] }),
  ['technology', 'business', 'art']);

eq('F categories: primary plus secondary reconcile into one flat list',
  resolveAllCategories({ primaryCategory: 'science', secondaryCategories: ['technology', 'environment'] }),
  ['science', 'technology', 'environment']);

// Invalid values are discarded rather than passed on to a filter.
check('F categories: an invalid secondary value is dropped',
  !resolveSecondaryCategories({ secondaryCategories: ['technology', 'nope', 'art'] as Category[] })
    .includes('nope' as Category));
eq('F categories: mixed valid/invalid secondaries keep only the valid ones',
  resolveSecondaryCategories({ secondaryCategories: ['technology', 'nope', 'art', 7] as unknown as Category[] }),
  ['technology', 'art']);

// Non-array input must never crash.
eq('F categories: a missing secondary value yields an empty list', normalizeSecondaryCategories(undefined), []);
eq('F categories: a string secondary value yields an empty list', normalizeSecondaryCategories('science'), []);
eq('F categories: an object yields an empty list', normalizeSecondaryCategories({ a: 1 }), []);
eq('F categories: null yields an empty list', normalizeSecondaryCategories(null), []);
eq('F categories: a number yields an empty list', normalizeSecondaryCategories(5), []);

/* ==========================================================================
   G. Duplicate secondary categories are handled consistently
   ========================================================================== */

eq('G duplicates: repeated secondaries collapse, keeping the first occurrence',
  normalizeSecondaryCategories(['science', 'technology', 'science', 'art', 'technology']),
  ['science', 'technology', 'art']);

eq('G duplicates: the primary category is removed from the secondaries',
  normalizeSecondaryCategories(['science', 'technology', 'science'], 'science'),
  ['technology']);

eq('G duplicates: a long run of identical values yields exactly one',
  normalizeSecondaryCategories(['art', 'art', 'art', 'art']), ['art']);

eq('G duplicates: dedup is stable and order-preserving, not sorted',
  normalizeSecondaryCategories(['travel', 'art', 'history', 'art', 'travel']),
  ['travel', 'art', 'history']);

// Determinism: the same input must always give the same output, so a filter
// cannot flicker between renders.
eq('G duplicates: repeated calls give identical results',
  normalizeSecondaryCategories(['science', 'science', 'art']),
  normalizeSecondaryCategories(['science', 'science', 'art']));

// Pure: the caller's array is never modified.
const callerArray: Category[] = ['science', 'science', 'art'];
const callerCopy = [...callerArray];
normalizeSecondaryCategories(callerArray, 'history');
eq('G duplicates: the input array is not mutated', callerArray, callerCopy);

// Idempotent: normalising an already-normalised list changes nothing.
const onceNormalized = normalizeSecondaryCategories(['science', 'art', 'science'], 'history');
eq('G duplicates: normalising twice is the same as once',
  normalizeSecondaryCategories(onceNormalized, 'history'), onceNormalized);

// Duplicates inside the legacy array are handled identically, so the two
// shapes cannot disagree with each other.
eq('G duplicates: legacy arrays are deduplicated by the same rule',
  resolveAllCategories({ categories: ['science', 'science', 'environment'] }),
  ['science', 'environment']);

eq('G duplicates: explicit and legacy secondaries merge without repeats',
  resolveSecondaryCategories({
    primaryCategory: 'science',
    secondaryCategories: ['technology', 'art'],
    categories: ['science', 'environment', 'technology'],
  }),
  ['technology', 'art', 'environment']);

/* ==========================================================================
   H. Geography - publisher country is not countries discussed
   ========================================================================== */

const VIETNAM_PUBLISHED_IN_THE_UK: ArticleEnrichment = {
  contentType: 'news',
  countriesAbout: ['VN'],
  source: {
    name: 'Example Herald',
    publisherCountryCode: 'GB',
    retrievedAt: '2026-03-14',
  },
};

check('H geography: publisher country and countries-about come from different fields',
  VIETNAM_PUBLISHED_IN_THE_UK.source?.publisherCountryCode === 'GB' &&
  (VIETNAM_PUBLISHED_IN_THE_UK.countriesAbout ?? [])[0] === 'VN');

check('H geography: the publisher country is never derived from countriesAbout',
  VIETNAM_PUBLISHED_IN_THE_UK.source?.publisherCountryCode === 'GB' &&
  resolveAllCategories(VIETNAM_PUBLISHED_IN_THE_UK).length === 0);

eq('H geography: countriesAbout keeps only its own entries',
  normalizeCountriesAbout(VIETNAM_PUBLISHED_IN_THE_UK.countriesAbout), ['VN']);

check('H geography: one article may cover several countries',
  normalizeCountriesAbout(['VN', 'US', 'JP']).length === 3);

check('H geography: a duplicate country is collapsed',
  normalizeCountriesAbout(['VN', 'VN', 'US']).length === 2);

// Global scope must never be faked with a placeholder country code.
check('H geography: XX is not accepted as a country code', !isCountryCode('XX'));
check('H geography: ZZ is not accepted as a country code', !isCountryCode('ZZ'));
check('H geography: EU is not accepted as a country code', !isCountryCode('EU'));
eq('H geography: placeholder codes are stripped from countriesAbout',
  normalizeCountriesAbout(['XX', 'ZZ', 'VN', 'EU']), ['VN']);

check('H geography: a real alpha-2 code is accepted', isCountryCode('VN') && isCountryCode('GB'));
for (const bad of ['vn', 'VNM', 'V', 'V1', '12', ' V', 'V ', '', 'Vietnam', null, 42]) {
  check(`H geography: ${JSON.stringify(bad)} is not a valid country code`, !isCountryCode(bad));
}

// Geographic scope is the honest home for "worldwide".
eq('H geography: the scope vocabulary is validated',
  [...GEOGRAPHIC_SCOPES].sort(), ['global', 'international', 'national', 'none', 'regional']);
check('H geography: "global" is a valid scope and not a country code',
  isGeographicScope('global') && !isCountryCode('global'));
check('H geography: "none" expresses no geographic focus without a code',
  isGeographicScope('none') && !isCountryCode('none'));

// No existing article gains geographic metadata in this phase.
for (const key of registryKeys) {
  check(`H geography: ${key} has no invented publisher country`,
    ARTICLE_ENRICHMENTS[key].source === undefined);
  check(`H geography: ${key} reports undefined for the publisher country`,
    getArticlePublisherCountryCode(key) === undefined);
}

// art-005 is set in Prague: the one existing countriesAbout value must survive
// untouched, and it must not turn into a publisher country.
eq('H geography: art-005 keeps its recorded country', getArticleCountriesAbout('art-005'), ['CZ']);
check('H geography: art-005 has no publisher country',
  getArticlePublisherCountryCode('art-005') === undefined);
eq('H geography: art-005 geographic scope is undefined, not defaulted',
  getArticleGeographicScope('art-005'), undefined);
eq('H geography: an unknown article has no countries about',
  getArticleCountriesAbout('does-not-exist'), []);

/* ==========================================================================
   I. Licence and copyright honesty
   ========================================================================== */

eq('I licence: the five agreed licence types exist',
  [...LICENSE_TYPES].sort(),
  ['creative-commons', 'link-only', 'permitted-reuse', 'public-domain', 'unknown']);

for (const type of LICENSE_TYPES) {
  check(`I licence: "${type}" passes isLicenseType`, isLicenseType(type));
}
for (const value of ['', 'CC-BY', 'cc-by-sa', 'Public Domain', 'free', 'open', null, 5, {}]) {
  check(`I licence: ${JSON.stringify(value)} is not a valid LicenseType`, !isLicenseType(value));
}

// No licence recorded -> undefined. It is never upgraded to a permissive value.
check('I licence: no licence at all yields undefined, not "allowed"',
  allowsFullTextHosting(undefined) === undefined);
eq('I licence: the registry records no licence for any article',
  registryKeys.filter((key) => getArticleLicense(key) !== undefined), []);
eq('I licence: the registry records no source for any article',
  registryKeys.filter((key) => getArticleSource(key) !== undefined), []);
for (const key of registryKeys) {
  check(`I licence: ${key} reports undefined for full-text hosting`,
    getArticleAllowsFullText(key) === undefined);
  check(`I licence: ${key} is not claimed to have verified provenance`,
    hasVerifiedProvenance(ARTICLE_ENRICHMENTS[key]) === false);
}

// Unknown rights stay unknown. Nothing may turn "unknown" into permission.
check('I licence: an explicit unknown licence does not allow hosting',
  allowsFullTextHosting({ type: 'unknown' }) === false);
check('I licence: unknown is not an unverified claim (declining is always safe)',
  hasUnverifiedReuseClaim({ type: 'unknown' }) === false);

// Free to read is not free to reuse.
check('I licence: link-only does not allow hosting full text',
  allowsFullTextHosting({ type: 'link-only' }) === false);
check('I licence: link-only is not an unverified positive claim',
  hasUnverifiedReuseClaim({ type: 'link-only' }) === false);

// A CC family name alone says nothing; the specific licence must be named.
check('I licence: creative-commons without an id does not allow hosting',
  allowsFullTextHosting({ type: 'creative-commons' }) === false);
check('I licence: a bare creative-commons claim is flagged as unverified',
  hasUnverifiedReuseClaim({ type: 'creative-commons' }) === true);
check('I licence: a named CC licence does allow hosting',
  allowsFullTextHosting({ type: 'creative-commons', id: 'CC BY 4.0' }) === true);
check('I licence: a named CC licence with evidence is not flagged',
  hasUnverifiedReuseClaim({ type: 'creative-commons', id: 'CC BY 4.0' }) === false);
check('I licence: whitespace-only CC id does not count as named',
  allowsFullTextHosting({ type: 'creative-commons', id: '   ' }) === false);

// Public domain must be evidenced, never assumed from age or free access.
check('I licence: a bare public-domain claim is flagged as unverified',
  hasUnverifiedReuseClaim({ type: 'public-domain' }) === true);
check('I licence: public-domain with evidence is not flagged',
  hasUnverifiedReuseClaim({ type: 'public-domain', permissionEvidence: 'Verified against the source.' }) === false);
check('I licence: public-domain with a named identifier is not flagged',
  hasUnverifiedReuseClaim({ type: 'public-domain', id: 'PD-US' }) === false);

check('I licence: an explicit permission from the rights holder allows hosting',
  allowsFullTextHosting({ type: 'permitted-reuse' }) === true);

// An unrecognised licence type must never be treated as permissive.
check('I licence: an unrecognised licence type does not allow hosting',
  allowsFullTextHosting({ type: 'CC0' } as unknown as ArticleLicense) === false);
check('I licence: an unrecognised licence type is flagged as unverified',
  hasUnverifiedReuseClaim({ type: 'CC0' } as unknown as ArticleLicense) === true);

/* ==========================================================================
   I2. Provenance completeness, and never crashing on missing metadata
   ========================================================================== */

// Translation and republishing are not granted by free access.
const RESTRICTIVE_CC: ArticleLicense = {
  type: 'creative-commons',
  id: 'CC BY 4.0',
  translationAllowed: false,
  republishingAllowed: false,
};
check('I2 licence: a restrictive CC licence is still not an unverified claim',
  hasUnverifiedReuseClaim(RESTRICTIVE_CC) === false);
// An absent derivative flag means "not established". It must never be read as
// permission, and the resolver must not fill it in.
const CC_WITHOUT_DERIVATIVE_FLAGS: ArticleLicense = { type: 'creative-commons', id: 'CC BY 4.0' };
check('I2 licence: absent derivative flags stay undefined, never "allowed"',
  CC_WITHOUT_DERIVATIVE_FLAGS.translationAllowed === undefined &&
  CC_WITHOUT_DERIVATIVE_FLAGS.republishingAllowed === undefined);
check('I2 licence: an explicit false is preserved and is not an unverified claim',
  RESTRICTIVE_CC.translationAllowed === false &&
  RESTRICTIVE_CC.republishingAllowed === false &&
  hasUnverifiedReuseClaim(RESTRICTIVE_CC) === false);

// Provenance must be complete to count as verified, and checking never fills it in.
const FULL_PROVENANCE: ArticleEnrichment = {
  source: { name: 'Example Herald', url: 'https://example.com/a', publisherCountryCode: 'GB' },
  license: { type: 'creative-commons', id: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
};
check('I2 provenance: complete, verified provenance is recognised',
  hasVerifiedProvenance(FULL_PROVENANCE) === true);
check('I2 provenance: provenance without a licence is not verified',
  hasVerifiedProvenance({ source: { name: 'Example Herald' } }) === false);
check('I2 provenance: a licence without a source is not verified',
  hasVerifiedProvenance({ license: { type: 'permitted-reuse' } }) === false);
check('I2 provenance: a blank source name is not verified',
  hasVerifiedProvenance({ source: { name: '   ' }, license: { type: 'permitted-reuse' } }) === false);
check('I2 provenance: an unevidenced reuse claim is not verified provenance',
  hasVerifiedProvenance({ source: { name: 'Example' }, license: { type: 'creative-commons' } }) === false);
check('I2 provenance: an absent enrichment is not verified provenance',
  hasVerifiedProvenance(undefined) === false);

// Missing provenance must never crash a consumer.
for (const id of ['', 'does-not-exist', 'art-001', 'art-005']) {
  const label = id === '' ? '(empty id)' : id;
  check(`I2 crash: ${label} - a missing licence does not crash`,
    getArticleLicense(id) === undefined || typeof getArticleLicense(id) === 'object');
  check(`I2 crash: ${label} - a missing source does not crash`,
    getArticleSource(id) === undefined || typeof getArticleSource(id) === 'object');
  check(`I2 crash: ${label} - full-text hosting stays undefined`,
    getArticleAllowsFullText(id) === undefined);
}
check('I2 crash: malformed enrichments do not crash the resolvers',
  resolveAllCategories({ categories: 'nope' as unknown as Category[] }).length === 0 &&
  resolveAllCategories({ secondaryCategories: 5 as unknown as Category[] }).length === 0 &&
  resolvePrimaryCategory({}) === undefined);
eq('I2 crash: malformed country lists yield an empty array',
  normalizeCountriesAbout('VN'), []);

/* ==========================================================================
   J. Legacy compatibility - existing selectors and article types still work
   ========================================================================== */

// Legacy entries still resolve to exactly the same category lists as in Phase 3.1.
eq('J legacy: art-001 categories are unchanged', getArticleCategories('art-001'), ['science', 'environment']);
eq('J legacy: art-004 categories are unchanged', getArticleCategories('art-004'),
  ['science', 'technology', 'environment']);
eq('J legacy: art-010 categories are unchanged', getArticleCategories('art-010'),
  ['psychology', 'education']);

for (const key of registryKeys) {
  const enrichment = ARTICLE_ENRICHMENTS[key];
  const recorded = enrichment.categories ?? [];
  eq(`J legacy: ${key} selector matches the recorded array`,
    getArticleCategories(key), [...recorded]);

  // The primary/secondary split must be a faithful partition of the whole list.
  const primary = getArticlePrimaryCategory(key);
  const secondary = getArticleSecondaryCategories(key);
  check(`J legacy: ${key} primary plus secondary covers every category`,
    JSON.stringify([...(primary ? [primary] : []), ...secondary]) === JSON.stringify([...recorded]),
    `primary=${primary} secondary=${JSON.stringify(secondary)} recorded=${JSON.stringify(recorded)}`);
  check(`J legacy: ${key} has at most one primary category`,
    primary === undefined || isCategory(primary));
  check(`J legacy: ${key} secondaries never repeat the primary`,
    primary === undefined || !secondary.includes(primary));
  check(`J legacy: ${key} secondaries are unique`,
    new Set(secondary).size === secondary.length);
  check(`J legacy: ${key} secondary values are all valid categories`,
    secondary.every((category) => isCategory(category)));

  // The selector must hand back a fresh array, never the registry's own.
  check(`J legacy: ${key} selector returns a copy`, getArticleCategories(key) !== enrichment.categories);
}

// A plain legacy Article is still valid and needs no migration.
const LEGACY_ARTICLE: Article = {
  id: 'syn-legacy', title: 'T', description: 'D', image: '',
  genre: 'News & Social Issues', level: 'B1', readingTime: 'Under 3 min', content: 'Body',
};
check('J legacy: a plain Article is still usable as a LibraryArticle',
  getLibraryArticle(LEGACY_ARTICLE).enrichment === undefined &&
  getLibraryArticle(LEGACY_ARTICLE).content === 'Body');
check('J legacy: a legacy Article with no metadata is accepted by every new selector',
  getArticleContentGroup('syn-legacy') === undefined &&
  getArticlePrimaryCategory('syn-legacy') === undefined &&
  getArticleSecondaryCategories('syn-legacy').length === 0 &&
  getArticleCountriesAbout('syn-legacy').length === 0 &&
  getArticleLicense('syn-legacy') === undefined &&
  getArticleAllowsFullText('syn-legacy') === undefined);

// The new selectors must not disturb the Phase 3.1 derived values.
for (const article of ARTICLES_DATA) {
  eq(`J legacy: ${article.id} word count is unchanged`,
    getArticleWordCount(article), article.content.split(/\s+/).filter((t) => t.length > 0).length);
  eq(`J legacy: ${article.id} paragraph count is unchanged`,
    getArticleParagraphCount(article), getArticleParagraphs(article).length);
  eq(`J legacy: ${article.id} reading minutes are unchanged`,
    getArticleEstimatedReadingMinutes(article),
    Math.max(1, Math.round(getArticleWordCount(article) / AVERAGE_READING_WORDS_PER_MINUTE)));
  check(`J legacy: ${article.id} keeps its authored readingTime`,
    ['Under 3 min', '5–10 min', 'Chapter'].includes(article.readingTime));
}

/* ==========================================================================
   K. Search text, vocabulary integrity, and compile-time type guarantees
   ========================================================================== */

// getArticleSearchText keeps working, and now also covers the new fields.
check('K search: still lower-cased and still includes the title',
  getArticleSearchText(ART001) === getArticleSearchText(ART001).toLowerCase() &&
  getArticleSearchText(ART001).includes('hydrothermal vents'));
check('K search: legacy categories are still searchable',
  getArticleSearchText(ART001, ARTICLE_ENRICHMENTS['art-001']).includes('environment'));
check('K search: works with no enrichment at all', getArticleSearchText(ART009).length > 0);
check('K search: still includes chapter titles',
  getArticleSearchText(ART005).includes('clock parts'));
check('K search: never writes the result back onto the article',
  (ART001 as unknown as Record<string, unknown>).searchText === undefined);

const NEW_SHAPE_SEARCH: ArticleEnrichment = {
  contentGroup: 'articles',
  contentType: 'editorial',
  primaryCategory: 'politics',
  secondaryCategories: ['society'],
  geographicScope: 'international',
  countriesAbout: ['VN'],
};
const newShapeText = getArticleSearchText(ART001, NEW_SHAPE_SEARCH);
check('K search: new-shape metadata is searchable',
  newShapeText.includes('politics') && newShapeText.includes('society') &&
  newShapeText.includes('articles') && newShapeText.includes('international') &&
  newShapeText.includes('vn'));

// Vocabulary and unions must not drift apart at runtime.
check('K vocabulary: every content type passes its own guard',
  CONTENT_TYPES.every((type) => isContentType(type)));
check('K vocabulary: every category passes its own guard',
  CATEGORIES.every((category) => isCategory(category)));
check('K vocabulary: every group passes its own guard',
  CONTENT_GROUPS.every((group) => isContentGroup(group)));
check('K vocabulary: every licence type passes its own guard',
  LICENSE_TYPES.every((type) => isLicenseType(type)));
check('K vocabulary: every geographic scope passes its own guard',
  GEOGRAPHIC_SCOPES.every((scope) => isGeographicScope(scope)));
// No vocabulary may repeat a value. Overlap BETWEEN vocabularies is allowed
// and meaningful - 'novel' is both a content type and a navigation group - so
// uniqueness is checked per list, never across all of them.
const VOCABULARIES: [string, readonly string[]][] = [
  ['ContentType', CONTENT_TYPES],
  ['Category', CATEGORIES],
  ['ContentGroup', CONTENT_GROUPS],
  ['LicenseType', LICENSE_TYPES],
  ['GeographicScope', GEOGRAPHIC_SCOPES],
];
for (const [name, values] of VOCABULARIES) {
  check(`K vocabulary: ${name} has no duplicate entries`,
    new Set(values).size === values.length);
}
check('K vocabulary: the six content groups are the documented ones',
  CONTENT_GROUPS.length === 6);

// Compile-time guarantee: the exported tuples really are the declared unions.
// If a union member were added without updating this file, this line stops
// compiling rather than failing silently at runtime.
const _unionIsExhaustive: [ContentType, ContentGroup, Category, LicenseType, GeographicScope][] = [
  ['news', 'articles', 'science', 'unknown', 'global'],
  ['classic-literature', 'encyclopedia', 'language-learning', 'link-only', 'none'],
];
void _unionIsExhaustive;

console.log(`\n${passed} assertions passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log('\nFAILURES:');
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
console.log('All metadata tests passed.');
