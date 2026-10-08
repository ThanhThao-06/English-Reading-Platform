import {
  CONTENT_SOURCE_REGISTRY,
  CONTENT_SOURCES_BY_ID,
} from '../src/data/contentSources';
import {
  SOURCE_ACCESS_METHODS,
  SOURCE_CONTENT_REUSE,
  SOURCE_RIGHTS_STATUSES,
  applyRightsPolicy,
  canReuseFullText,
  canReuseMetadata,
  effectiveReuse,
  getContentSource,
  isSourceAccessMethod,
  isSourceContentReuse,
  isSourceRightsStatus,
  isValidSourceUrl,
} from '../src/utils/sourceValidation';
import { isContentGroup } from '../src/utils/metadataValidation';
import { normalizeFeed } from '../src/utils/feedNormalisation';
import type { ContentSourceDefinition } from '../src/types/source';

/**
 * Phase 3.3 tests for the source registry, the rights policy and fetch
 * normalisation.
 *
 * These are DETERMINISTIC: no network call is made anywhere in this file. The
 * live fetch lives in `scripts/fetchVoaPreview.ts` and is run separately and
 * manually, so a flaky network can never fail the test suite.
 *
 * Same lightweight harness as `chapterTests.ts` / `srsTests.ts` / `metadataTests.ts`
 * (plain Node, no test framework), so no dependency and no package.json change.
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
   A. Source registry integrity
   ========================================================================== */

const ids = CONTENT_SOURCE_REGISTRY.map((source) => source.id);

eq('A registry: no duplicate ids', ids.length, new Set(ids).size);
for (const source of CONTENT_SOURCE_REGISTRY) {
  check(`A registry: "${source.id}" has a non-empty id`,
    typeof source.id === 'string' && source.id.trim().length > 0);
  check(`A registry: "${source.id}" has a name`, source.name.trim().length > 0);
  check(`A registry: "${source.id}" has a valid official URL`,
    isValidSourceUrl(source.officialUrl), source.officialUrl);
  check(`A registry: "${source.id}" has at least one content group`,
    Array.isArray(source.contentGroups) && source.contentGroups.length > 0);
  check(`A registry: "${source.id}" has at least one access method`,
    Array.isArray(source.accessMethods) && source.accessMethods.length > 0);
}

// Every enum-valued field must use a real member of its union.
for (const source of CONTENT_SOURCE_REGISTRY) {
  check(`A enum: "${source.id}" rightsStatus is valid`,
    isSourceRightsStatus(source.rightsStatus), source.rightsStatus);
  check(`A enum: "${source.id}" contentReuse is valid`,
    isSourceContentReuse(source.contentReuse), source.contentReuse);
  for (const method of source.accessMethods) {
    check(`A enum: "${source.id}" accessMethod "${method}" is valid`,
      isSourceAccessMethod(method), method);
  }
  for (const group of source.contentGroups) {
    check(`A enum: "${source.id}" contentGroup "${group}" is valid`,
      isContentGroup(group), group);
  }
  check(`A enum: "${source.id}" access methods are unique`,
    new Set(source.accessMethods).size === source.accessMethods.length);
}

// A feed or API URL may only be recorded when it is syntactically real, and
// 'rss'/'api' may not be claimed without one actually having been verified.
for (const source of CONTENT_SOURCE_REGISTRY) {
  if (source.feedUrl !== undefined) {
    check(`A feed: "${source.id}" feedUrl is a valid URL`,
      isValidSourceUrl(source.feedUrl), source.feedUrl);
  }
  if (source.apiUrl !== undefined) {
    check(`A api: "${source.id}" apiUrl is a valid URL`,
      isValidSourceUrl(source.apiUrl), source.apiUrl);
  }
  if (source.accessMethods.includes('rss')) {
    check(`A feed: "${source.id}" claims rss and records a feedUrl`,
      isValidSourceUrl(source.feedUrl));
  }
  if (source.accessMethods.includes('api')) {
    check(`A api: "${source.id}" claims api and records an apiUrl`,
      isValidSourceUrl(source.apiUrl));
  }
}

/* ==========================================================================
   B. No fabricated rights anywhere in the registry
   ========================================================================== */

// The whole point of this phase: reachability is never treated as permission.
for (const source of CONTENT_SOURCE_REGISTRY) {
  if (source.rightsStatus === 'unknown') {
    check(`B honesty: "${source.id}" unverified rights do not grant full text`,
      source.contentReuse !== 'full-text', source.contentReuse);
    check(`B honesty: "${source.id}" unverified rights record no licence claim`,
      source.licenseType === undefined, String(source.licenseType));
  }
  // A source may record a licence ONLY if its terms were actually read. The
  // converse is NOT required: VOA legitimately records a verified
  // `public-domain` licence while capping `contentReuse` at `metadata-only`,
  // because the licence covers VOA-produced material only and the agency
  // carve-out still applies. A licence claim and a reuse cap are independent.
  if (source.licenseType !== undefined) {
    check(`B honesty: "${source.id}" licence claims verified, non-unknown rights`,
      source.rightsStatus !== 'unknown', source.rightsStatus);
  }
  // A licence may never be asserted without the terms it came from.
  if (source.licenseType !== undefined) {
    check(`B honesty: "${source.id}" licence has a traceable terms URL or date`,
      isValidSourceUrl(source.licenseUrl) || typeof source.lastVerifiedAt === 'string');
  }
}

// Only sources whose terms were actually read may carry a licence.
const withLicense = CONTENT_SOURCE_REGISTRY.filter((s) => s.licenseType !== undefined);
eq('B honesty: exactly one source carries a verified licence', withLicense.length, 1);
eq('B honesty: and it is VOA', withLicense[0]?.id, 'voa-learning-english');

// Only ONE source may be anything other than fully unknown, because only one
// source's terms were actually read in this phase.
const notUnknown = CONTENT_SOURCE_REGISTRY.filter((s) => s.rightsStatus !== 'unknown');
eq('B honesty: exactly one source has non-unknown rights', notUnknown.length, 1);
eq('B honesty: and it is VOA', notUnknown[0]?.id, 'voa-learning-english');

// No source may be marked verified for full-text reuse: none was verified for
// unrestricted reuse, because VOA's agency carve-out blocks that.
eq('B honesty: no source is verified for full-text reuse',
  CONTENT_SOURCE_REGISTRY.filter((s) => canReuseFullText(s)).map((s) => s.id), []);

/* ==========================================================================
   C. Registry lookup
   ========================================================================== */

check('C lookup: a known id resolves', getContentSource('voa-learning-english')?.id === 'voa-learning-english');
check('C lookup: an unknown id yields undefined', getContentSource('nope') === undefined);
check('C lookup: an empty id yields undefined', getContentSource('') === undefined);
eq('C lookup: the keyed map has the same size as the array',
  Object.keys(CONTENT_SOURCES_BY_ID).length, CONTENT_SOURCE_REGISTRY.length);
for (const source of CONTENT_SOURCE_REGISTRY) {
  check(`C lookup: "${source.id}" maps to itself`,
    CONTENT_SOURCES_BY_ID[source.id] === source);
}

/* ==========================================================================
   D. The rights policy
   ========================================================================== */

const verifiedFullText: ContentSourceDefinition = {
  id: 'synthetic-full-text',
  name: 'Synthetic verified source',
  officialUrl: 'https://example.org/',
  contentGroups: ['articles'],
  accessMethods: ['rss'],
  rightsStatus: 'verified',
  contentReuse: 'full-text',
  licenseType: 'public-domain',
  licenseUrl: 'https://example.org/terms',
  lastVerifiedAt: '2026-10-02',
};

const unknownRights: ContentSourceDefinition = {
  id: 'synthetic-unknown',
  name: 'Synthetic unknown source',
  officialUrl: 'https://example.org/',
  contentGroups: ['articles'],
  accessMethods: ['rss', 'api', 'web'],
  rightsStatus: 'unknown',
  contentReuse: 'unknown',
};

const metadataOnly: ContentSourceDefinition = {
  id: 'synthetic-metadata',
  name: 'Synthetic metadata-only source',
  officialUrl: 'https://example.org/',
  contentGroups: ['articles'],
  accessMethods: ['rss'],
  rightsStatus: 'verified',
  contentReuse: 'metadata-only',
  licenseType: 'public-domain',
  licenseUrl: 'https://example.org/terms',
  lastVerifiedAt: '2026-10-02',
};

// --- unknown rights must never become full text ---
check('D rights: unknown rights do not allow full text', canReuseFullText(unknownRights) === false);
check('D rights: unknown rights do not allow metadata reuse', canReuseMetadata(unknownRights) === false);
eq('D rights: unknown rights resolve to link-only', effectiveReuse(unknownRights), 'link-only');

// --- access is not permission ---
check('D rights: an RSS feed does not make an unknown source reusable',
  canReuseFullText(unknownRights) === false);
check('D rights: declaring full-text without verification is still refused',
  canReuseFullText({ ...unknownRights, contentReuse: 'full-text' }) === false);
check('D rights: a licence with no evidence trail is refused',
  canReuseFullText({ ...verifiedFullText, licenseUrl: undefined, lastVerifiedAt: undefined }) === false);
check('D rights: an invalid licence type is refused',
  canReuseFullText({ ...verifiedFullText, licenseType: 'free' as never }) === false);

// --- restricted / not-allowed win over everything ---
check('D rights: restricted refuses full text even when declared',
  canReuseFullText({ ...verifiedFullText, rightsStatus: 'restricted' }) === false);
check('D rights: not-allowed refuses full text even when declared',
  canReuseFullText({ ...verifiedFullText, rightsStatus: 'not-allowed' }) === false);
eq('D rights: not-allowed resolves to link-only',
  effectiveReuse({ ...verifiedFullText, rightsStatus: 'not-allowed' }), 'link-only');

// --- metadata-only and link-only reject full text ---
check('D rights: metadata-only does not allow full text', canReuseFullText(metadataOnly) === false);
check('D rights: metadata-only does allow metadata', canReuseMetadata(metadataOnly) === true);
eq('D rights: metadata-only resolves to metadata-only', effectiveReuse(metadataOnly), 'metadata-only');

// --- the one genuinely verified case is allowed ---
check('D rights: verified full-text is allowed', canReuseFullText(verifiedFullText) === true);
eq('D rights: verified full-text resolves to full-text', effectiveReuse(verifiedFullText), 'full-text');

// --- an unregistered source is never allowed ---
check('D rights: an unregistered source is refused', canReuseFullText(undefined) === false);
check('D rights: an unregistered source is refused for metadata', canReuseMetadata(undefined) === false);
eq('D rights: an unregistered source resolves to unknown', effectiveReuse(undefined), 'unknown');

// --- every registry source is safe ---
for (const source of CONTENT_SOURCE_REGISTRY) {
  check(`D rights: "${source.id}" does not allow full text`,
    canReuseFullText(source) === false);
  check(`D rights: "${source.id}" resolves to a safe level`,
    ['link-only', 'metadata-only'].includes(effectiveReuse(source)), effectiveReuse(source));
}

/* ==========================================================================
   E. applyRightsPolicy - what actually happens to a fetched item
   ========================================================================== */

const candidateItem = {
  sourceId: 'synthetic-full-text',
  externalId: 'https://example.org/a/1.html',
  title: 'Example title',
  url: 'https://example.org/a/1.html',
  rawContent: 'Body text that must be withheld when rights do not allow it.',
  fetchedAt: '2026-10-02T00:00:00.000Z',
};

// verified full-text keeps the body
const kept = applyRightsPolicy(verifiedFullText, candidateItem);
check('E policy: verified full-text retains the body', kept.rawContent !== undefined);
check('E policy: verified full-text records fullTextIncluded',
  kept.rightsDecision?.fullTextIncluded === true);
eq('E policy: verified full-text applies full-text', kept.rightsDecision?.appliedReuse, 'full-text');

// metadata-only strips the body
const metadataResult = applyRightsPolicy(metadataOnly, candidateItem);
check('E policy: metadata-only removes the body', metadataResult.rawContent === undefined);
check('E policy: metadata-only does not set an empty string',
  metadataResult.rawContent !== '');
check('E policy: metadata-only keeps the URL', metadataResult.url === candidateItem.url);
check('E policy: metadata-only keeps the title', metadataResult.title === candidateItem.title);

// link-only strips the body
const linkResult = applyRightsPolicy(unknownRights, candidateItem);
check('E policy: unknown rights remove the body', linkResult.rawContent === undefined);
eq('E policy: unknown rights apply link-only', linkResult.rightsDecision?.appliedReuse, 'link-only');

// an unregistered source strips the body too
const unregistered = applyRightsPolicy(undefined, candidateItem);
check('E policy: an unregistered source removes the body', unregistered.rawContent === undefined);

// restricted strips the body
const restricted = applyRightsPolicy({ ...verifiedFullText, rightsStatus: 'restricted' }, candidateItem);
check('E policy: restricted removes the body even though the source is otherwise verified',
  restricted.rawContent === undefined);

// A per-item hint may TIGHTEN but never LOOSEN.
const tightened = applyRightsPolicy(verifiedFullText, candidateItem, 'link-only');
check('E policy: a link-only hint tightens a full-text source',
  tightened.rawContent === undefined);
eq('E policy: a link-only hint is reflected in the decision',
  tightened.rightsDecision?.appliedReuse, 'link-only');
check('E policy: a link-only hint explains itself',
  (tightened.rightsDecision?.reason ?? '').includes('first-party'));

const loosenAttempt = applyRightsPolicy(unknownRights, candidateItem, 'full-text');
check('E policy: a full-text hint cannot loosen an unknown source',
  loosenAttempt.rawContent === undefined);
eq('E policy: the loosening hint is ignored',
  loosenAttempt.rightsDecision?.appliedReuse, 'link-only');

check('E policy: an invalid hint is ignored safely',
  applyRightsPolicy(verifiedFullText, candidateItem, 'nope' as never).rawContent !== undefined);

// The real VOA source: metadata-only, so bodies are dropped.
const voa = getContentSource('voa-learning-english');
check('E policy: the VOA source exists', voa !== undefined);
const voaResult = applyRightsPolicy(voa, { ...candidateItem, sourceId: 'voa-learning-english' });
check('E policy: VOA previews carry no body text', voaResult.rawContent === undefined);
eq('E policy: VOA applies metadata-only', voaResult.rightsDecision?.appliedReuse, 'metadata-only');
check('E policy: the VOA decision records the caveats considered',
  (voaResult.rightsDecision?.caveatsConsidered?.length ?? 0) > 0);
check('E policy: VOA never reports full text included',
  voaResult.rightsDecision?.fullTextIncluded === false);

// The policy must not mutate its input.
const inputForPurity = { ...candidateItem };
applyRightsPolicy(unknownRights, inputForPurity);
eq('E policy: the candidate object is not mutated', inputForPurity, candidateItem);

/* ==========================================================================
   F. Feed normalisation - deterministic, using a local fixture
   --------------------------------------------------------------------------
   No network. The XML below is a hand-written fixture shaped like the real VOA
   feed (same tags, same CDATA, same entity escaping) so the parser is tested
   without depending on a live site.
   ========================================================================== */

const FIXED_TIME = '2026-10-02T00:00:00.000Z';

const FEED_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <title>Everyday Grammar Video - Voice of America</title>
  <link>https://learningenglish.voanews.com/</link>
  <description>VOA Learning English</description>
  <item>
    <title><![CDATA[Ramen, A Popular Food in Japan &amp; How To Eat It]]></title>
    <description></description>
    <link>https://learningenglish.voanews.com/a/8008342.html</link>
    <guid>https://learningenglish.voanews.com/a/8008342.html</guid>
    <pubDate>Tue, 29 Apr 2025 22:05:00 +0000</pubDate>
    <category>Everyday Grammar Video</category>
  </item>
  <item>
    <title>Second &amp; Final Item</title>
    <description>A short summary &lt;b&gt;with&lt;/b&gt; markup.</description>
    <link>https://learningenglish.voanews.com/a/8008343.html</link>
    <guid>https://learningenglish.voanews.com/a/8008343.html</guid>
    <pubDate>not a real date</pubDate>
    <dc:creator>VOA Learning English</dc:creator>
  </item>
  <item>
    <description>No title here.</description>
    <link>https://learningenglish.voanews.com/a/8008344.html</link>
  </item>
  <item>
    <title>No link here</title>
  </item>
</channel>
</rss>`;

const normalized = normalizeFeed(FEED_FIXTURE, voa, FIXED_TIME);

// Only the two well-formed items survive.
eq('F normalize: malformed items are dropped, good ones kept', normalized.length, 2);

const first = normalized[0];
check('F normalize: a title is present', typeof first?.title === 'string');
eq('F normalize: CDATA is unwrapped and entities decoded',
  first?.title, 'Ramen, A Popular Food in Japan & How To Eat It');
eq('F normalize: the URL is captured', first?.url,
  'https://learningenglish.voanews.com/a/8008342.html');
eq('F normalize: the external id falls back to the guid', first?.externalId, first?.url);
check('F normalize: pubDate becomes an ISO timestamp',
  typeof first?.publishedAt === 'string' && first.publishedAt.endsWith('Z'),
  String(first?.publishedAt));

// Missing optional fields are simply absent, never invented.
check('F normalize: an empty description is omitted rather than set to ""',
  first?.description === undefined);
check('F normalize: an absent author is omitted', first?.author === undefined);

const second = normalized[1];
// The fixture encodes literal angle brackets as &lt;b&gt;. Entity decoding
// correctly turns those into real "<b>" characters; tag STRIPPING is not done
// here, because the preview stores whatever the publisher supplied.
eq('F normalize: a description is captured and entities decoded', second?.description,
  'A short summary <b>with</b> markup.');
eq('F normalize: dc:creator is captured as the author', second?.author, 'VOA Learning English');
check('F normalize: an unparseable date is dropped, not guessed',
  second?.publishedAt === undefined);

// The rights policy runs on every item, and no body is ever carried.
for (const preview of normalized) {
  check('F normalize: no preview carries full text', preview.rawContent === undefined);
  check('F normalize: every preview records a decision',
    preview.rightsDecision !== undefined);
  check('F normalize: the source id is preserved', preview.sourceId === 'voa-learning-english');
  eq('F normalize: every preview is stamped with the fetch time', preview.fetchedAt, FIXED_TIME);
}

// Duplicate external ids must be detectable by the caller.
const externalIds = normalized.map((preview) => preview.externalId);
eq('F normalize: duplicate external ids are detectable',
  externalIds.length, new Set(externalIds).size);

// Malformed feeds must not crash.
check('F normalize: an empty feed yields no previews', normalizeFeed('', voa, FIXED_TIME).length === 0);
check('F normalize: non-XML yields no previews', normalizeFeed('not xml at all', voa, FIXED_TIME).length === 0);
check('F normalize: an unclosed tag yields no previews',
  normalizeFeed('<rss><channel><item><title>x', voa, FIXED_TIME).length === 0);
check('F normalize: a feed with no items yields no previews',
  normalizeFeed('<rss><channel></channel></rss>', voa, FIXED_TIME).length === 0);
check('F normalize: an unknown source still normalises safely',
  normalizeFeed(FEED_FIXTURE, undefined, FIXED_TIME).every((p) => p.rawContent === undefined));

// URL validation.
check('F url: a valid https URL passes', isValidSourceUrl('https://example.org/a'));
check('F url: a valid http URL passes', isValidSourceUrl('http://example.org'));
for (const bad of ['', '   ', 'example.org', 'ftp://example.org', 'https://', 'https://exa mple.org', 'javascript:alert(1)', null, 42]) {
  check(`F url: ${JSON.stringify(bad)} is rejected`, !isValidSourceUrl(bad));
}

/* ==========================================================================
   G. Vocabulary integrity
   ========================================================================== */

eq('G vocab: six access methods', [...SOURCE_ACCESS_METHODS].sort(),
  ['api', 'download', 'manual', 'other', 'rss', 'web']);
eq('G vocab: five rights statuses', [...SOURCE_RIGHTS_STATUSES].sort(),
  ['not-allowed', 'partially-verified', 'restricted', 'unknown', 'verified']);
eq('G vocab: four reuse levels', [...SOURCE_CONTENT_REUSE].sort(),
  ['full-text', 'link-only', 'metadata-only', 'unknown']);

for (const value of SOURCE_ACCESS_METHODS) check(`G vocab: "${value}" is valid`, isSourceAccessMethod(value));
for (const value of SOURCE_RIGHTS_STATUSES) check(`G vocab: "${value}" is valid`, isSourceRightsStatus(value));
for (const value of SOURCE_CONTENT_REUSE) check(`G vocab: "${value}" is valid`, isSourceContentReuse(value));

for (const value of ['', 'RSS', 'Web', 'full_text', 'fulltext', null, 42, {}]) {
  check(`G vocab: ${JSON.stringify(value)} is not an access method`, !isSourceAccessMethod(value));
}
for (const value of ['', 'Verified', 'VERIFIED', 'partial', null, 7]) {
  check(`G vocab: ${JSON.stringify(value)} is not a rights status`, !isSourceRightsStatus(value));
}
for (const value of ['', 'Full Text', 'fulltext', 'metadata', null, 7]) {
  check(`G vocab: ${JSON.stringify(value)} is not a reuse level`, !isSourceContentReuse(value));
}
check('G vocab: no duplicate entries per list',
  new Set(SOURCE_ACCESS_METHODS).size === SOURCE_ACCESS_METHODS.length &&
  new Set(SOURCE_RIGHTS_STATUSES).size === SOURCE_RIGHTS_STATUSES.length &&
  new Set(SOURCE_CONTENT_REUSE).size === SOURCE_CONTENT_REUSE.length);

/* ==========================================================================
   H. Registry coverage - every requested candidate is present
   ========================================================================== */

const EXPECTED_IDS = [
  'voa-learning-english', 'bbc-news', 'the-guardian', 'npr',
  'vn-express-international', 'vietnamnet-global', 'tuoi-tre-news',
  'simple-english-wikipedia', 'kiddle', 'dk-findout', 'national-geographic-kids',
  'the-conversation', 'world-economic-forum', 'mckinsey-insights', 'science-daily',
  'plos-one', 'phys-org', 'nasa', 'medical-news-today', 'who', 'greater-good-magazine',
  'psychology-today', 'oyez', 'un-news', 'archdaily', 'smarthistory', 'bbc-travel',
  'national-geographic-travel', 'project-gutenberg', 'standard-ebooks', 'american-literature',
];

eq('H coverage: every requested source is registered',
  CONTENT_SOURCE_REGISTRY.length, EXPECTED_IDS.length);
for (const id of EXPECTED_IDS) {
  check(`H coverage: "${id}" is registered`, CONTENT_SOURCES_BY_ID[id] !== undefined);
}
eq('H coverage: no unexpected extra sources',
  ids.filter((id) => !EXPECTED_IDS.includes(id)), []);

/* ==========================================================================
   I. No application wiring
   ========================================================================== */

const voaEntry = CONTENT_SOURCES_BY_ID['voa-learning-english'];
check('I wiring: VOA records the feed that was actually fetched',
  isValidSourceUrl(voaEntry?.feedUrl));
check('I wiring: VOA documents the agency carve-out',
  (voaEntry?.rightsCaveats?.length ?? 0) >= 2);
check('I wiring: VOA requires attribution', voaEntry?.attributionRequired === true);
check('I wiring: VOA was last verified on the recorded date',
  voaEntry?.lastVerifiedAt === '2026-10-02');
check('I wiring: VOA is metadata-only, never full-text',
  voaEntry?.contentReuse === 'metadata-only');
check('I wiring: VOA is partially verified, not fully verified',
  voaEntry?.rightsStatus === 'partially-verified');

console.log(`\n${passed} assertions passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log('\nFAILURES:');
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
console.log('All source registry tests passed.');
