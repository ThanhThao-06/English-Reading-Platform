import type { ContentSourceDefinition } from '../types/source';

/**
 * Phase 3.3 - The source catalogue.
 *
 * A list of PUBLISHERS that could one day supply reading content, with the
 * access methods and reuse rights actually established for each.
 *
 * HOW TO READ THE RIGHTS COLUMNS
 * ------------------------------
 * Almost every entry is `rightsStatus: 'unknown'` and
 * `contentReuse: 'link-only'`. That is the honest state, not an oversight:
 * this phase read ONE source's terms in detail (VOA Learning English, below).
 * For the rest nobody has checked the publisher's terms yet, and being on a
 * candidate list is not permission.
 *
 * Rules applied when filling this in:
 *
 * 1. `accessMethods` lists what was OBSERVED, not what is believed to exist.
 *    Only VOA carries a `feedUrl`, because only VOA's feed was actually fetched
 *    and returned valid data in this project.
 * 2. No RSS or API URL is recorded unless it was fetched successfully. A
 *    guessed feed URL is worse than an absent one.
 * 3. `rightsStatus` is about EVIDENCE, never about permission. It is checked
 *    independently of `contentReuse` by `utils/sourceValidation.ts`.
 * 4. Where a publisher is widely believed to be freely reusable but that was
 *    not checked here, the entry says `unknown`. Popularity is not evidence.
 *
 * `officialUrl` is always the publisher's own homepage - never an article URL,
 * a feed URL or an affiliate link.
 *
 * This is plain data. Nothing in the running application imports it, so editing
 * an entry cannot change what a reader sees.
 */

/**
 * Builds an UNVERIFIED candidate entry.
 *
 * This exists so the 27 candidate rows below are one line each, and so the
 * conservative defaults are stated ONCE rather than repeated 27 times. Making a
 * source "verified" therefore requires deliberately passing different arguments
 * rather than quietly editing a default - which is the direction we want
 * mistakes to travel in.
 */
const candidate = (
  id: string,
  name: string,
  officialUrl: string,
  contentGroups: ContentSourceDefinition['contentGroups'],
  notes: string,
  publisherCountryCode?: string,
  accessMethods: ContentSourceDefinition['accessMethods'] = ['web'],
): ContentSourceDefinition => ({
  id,
  name,
  officialUrl,
  contentGroups,
  accessMethods,
  rightsStatus: 'unknown',
  contentReuse: 'link-only',
  publisherCountryCode,
  notes,
});

/**
 * The candidate sources, grouped as they were requested.
 */
export const CONTENT_SOURCE_REGISTRY: ContentSourceDefinition[] = [
  /* ----------------------------------------------------------------
     THE ONE VERIFIED SOURCE

     VOA states (learningenglish.voanews.com/p/6861.html) that its
     Learning English texts, MP3s, photos and videos "are in the public
     domain" and may be reprinted with credit - AND, in the same
     paragraph, that "stories, photos and video images from news agencies
     such as AP, Reuters and AFP are copyrighted, so you are not allowed
     to republish them."

     That second sentence is why this is 'partially-verified' rather than
     'verified', and why rightsCaveats exists at all. An RSS item cannot
     be assumed to be first-party just because the site is public-domain.
     ---------------------------------------------------------------- */
  {
    id: 'voa-learning-english',
    name: 'VOA Learning English',
    officialUrl: 'https://learningenglish.voanews.com/',
    contentGroups: ['articles'],
    accessMethods: ['rss', 'web', 'download'],
    // Verified by an actual fetch on 2026-10-02 that returned valid RSS with
    // 20 items. The path is opaque but is published on VOA's own /rssfeeds
    // page; it was confirmed by fetching, never guessed.
    feedUrl: 'https://learningenglish.voanews.com/api/z_riqtl-vomx-tpevtmqr',
    rightsStatus: 'partially-verified',
    // Full text is deliberately NOT granted. The agency carve-out means an
    // individual item cannot be cleared from the source record alone, so the
    // registry stops at metadata until item provenance can be shown.
    contentReuse: 'metadata-only',
    licenseType: 'public-domain',
    licenseUrl: 'https://learningenglish.voanews.com/p/6861.html',
    attributionRequired: true,
    attributionText: 'Credit to learningenglish.voanews.com',
    publisherCountryCode: 'US',
    rightsCaveats: [
      'VOA-produced Learning English texts, MP3s, photos and videos are stated to be public domain and may be reprinted with credit.',
      'Stories, photos and video images from news agencies such as AP, Reuters and AFP are copyrighted and may NOT be republished (VOA p/6861.html; Terms of Use p/6021.html).',
      'Feed items therefore cannot be assumed first-party. Until an item is shown to be VOA-produced, treat it as link-only.',
    ],
    notes:
      'Feed fetched successfully on 2026-10-02: 20 items carrying title, link, guid, pubDate, category and enclosure. Body text was NOT extracted.',
    lastVerifiedAt: '2026-10-02',
  },

  /* ----------------------------------------------------------------
     News / Articles - candidates only
     ---------------------------------------------------------------- */
  candidate('bbc-news', 'BBC News', 'https://www.bbc.com/news', ['articles'],
    'Candidate only. No terms read and no feed verified in this project.', 'GB'),
  candidate('the-guardian', 'The Guardian', 'https://www.theguardian.com/', ['articles'],
    'Candidate only. The Guardian publishes an open platform and content API, but neither was called here, so no access method or licence is claimed.', 'GB'),
  candidate('npr', 'NPR', 'https://www.npr.org/', ['articles'],
    'Candidate only. No terms read, no endpoint verified.', 'US'),
  candidate('vn-express-international', 'VnExpress International', 'https://e.vnexpress.net/', ['articles'],
    'Candidate only. No terms read, no endpoint verified.', 'VN'),
  candidate('vietnamnet-global', 'VietNamNet Global', 'https://vietnamnet.vn/', ['articles'],
    'Candidate only. No terms read, no endpoint verified.', 'VN'),
  candidate('tuoi-tre-news', 'Tuoi Tre News', 'https://tuoitre.vn/', ['articles'],
    'Candidate only. No terms read, no endpoint verified.', 'VN'),

  /* ----------------------------------------------------------------
     Encyclopedia / General Knowledge - candidates only
     ---------------------------------------------------------------- */
  candidate('simple-english-wikipedia', 'Simple English Wikipedia', 'https://simple.wikipedia.org/', ['encyclopedia'],
    'Candidate only. Wikimedia text is widely understood to be CC BY-SA 4.0, but the site terms were not read in this phase, so no licence is recorded. Verify before any reuse.', 'US'),
  candidate('kiddle', 'Kiddle', 'https://www.kiddle.co/', ['encyclopedia'],
    'Candidate only. No terms read.'),
  candidate('dk-findout', 'DK Findout!', 'https://www.dkfindout.com/', ['encyclopedia'],
    'Candidate only. No terms read.', 'GB'),
  candidate('national-geographic-kids', 'National Geographic Kids', 'https://www.nationalgeographickids.com/', ['encyclopedia'],
    'Candidate only. No terms read.', 'US'),

  /* ----------------------------------------------------------------
     Specialized - candidates only
     ---------------------------------------------------------------- */
  candidate('the-conversation', 'The Conversation', 'https://theconversation.com/', ['specialized'],
    'Candidate only. The Conversation does publish under a republishing licence, but it was not read here, so nothing is claimed.', 'AU'),
  candidate('world-economic-forum', 'World Economic Forum', 'https://www.weforum.org/', ['specialized'],
    'Candidate only. No terms read.', 'CH'),
  candidate('mckinsey-insights', 'McKinsey Insights', 'https://www.mckinsey.com/', ['specialized'],
    'Candidate only. No terms read.', 'US'),
  candidate('science-daily', 'ScienceDaily', 'https://www.sciencedaily.com/', ['specialized'],
    'Candidate only. ScienceDaily republishes third-party press releases, which would need per-item provenance checks even after its own terms are read.', 'US'),
  candidate('plos-one', 'PLOS ONE', 'https://journals.plos.org/plosone/', ['specialized'],
    'Candidate only. PLOS is open access, but each article carries its own licence, so reuse would be an article-level decision rather than a source-level one.', 'US'),
  candidate('phys-org', 'Phys.org', 'https://phys.org/', ['specialized'],
    'Candidate only. No terms read.', 'GB'),
  candidate('nasa', 'NASA', 'https://www.nasa.gov/', ['specialized'],
    'Candidate only. US federal works are often not copyrighted, but that rule has limits (notably third-party and contractor material) and was not verified here.', 'US'),
  candidate('medical-news-today', 'Medical News Today', 'https://www.medicalnewstoday.com/', ['specialized'],
    'Candidate only. No terms read.', 'GB'),
  candidate('who', 'World Health Organization', 'https://www.who.int/', ['specialized'],
    'Candidate only. No terms read.', 'CH'),
  candidate('greater-good-magazine', 'Greater Good Magazine', 'https://greatergood.berkeley.edu/', ['specialized'],
    'Candidate only. No terms read.', 'US'),
  candidate('psychology-today', 'Psychology Today', 'https://www.psychologytoday.com/', ['specialized'],
    'Candidate only. No terms read.', 'US'),
  candidate('oyez', 'Oyez', 'https://www.oyez.org/', ['specialized'],
    'Candidate only. No terms read.', 'US'),
  candidate('un-news', 'UN News', 'https://news.un.org/en/', ['specialized'],
    'Candidate only. No terms read.', 'US'),
  candidate('archdaily', 'ArchDaily', 'https://www.archdaily.com/', ['specialized'],
    'Candidate only. No terms read.'),
  candidate('smarthistory', 'Smarthistory', 'https://smarthistory.org/', ['specialized'],
    'Candidate only. Smarthistory content is generally CC BY-NC-SA, which was not verified here and in any case forbids commercial reuse.', 'US'),
  candidate('bbc-travel', 'BBC Travel', 'https://www.bbc.com/travel', ['specialized'],
    'Candidate only. No terms read.', 'GB'),
  candidate('national-geographic-travel', 'National Geographic Travel', 'https://www.nationalgeographic.com/travel/', ['specialized'],
    'Candidate only. No terms read.', 'US'),

  /* ----------------------------------------------------------------
     Literature - candidates only
     ---------------------------------------------------------------- */
  candidate('project-gutenberg', 'Project Gutenberg', 'https://www.gutenberg.org/', ['classic-literature'],
    'Candidate only. Public-domain status is region-dependent and the site footer carries specific conditions; none were read here. Treat as link-only until verified.', 'US',
    ['web', 'download']),
  candidate('standard-ebooks', 'Standard Ebooks', 'https://standardebooks.org/', ['classic-literature'],
    'Candidate only. Standard Ebooks publishes under CC0, but its terms were not read in this phase, so nothing is claimed.', 'US',
    ['web', 'download']),
  candidate('american-literature', 'American Literature', 'https://www.americanliterature.com/', ['classic-literature', 'encyclopedia'],
    'Candidate only. Hosts public-domain texts, but the site terms and any editorial material were not read here.', 'US'),
];

/**
 * The registry keyed by id, derived once from the array.
 *
 * An array remains the source of truth because it preserves order and cannot
 * silently swallow a duplicate key the way an object literal would.
 */
export const CONTENT_SOURCES_BY_ID: Record<string, ContentSourceDefinition> =
  CONTENT_SOURCE_REGISTRY.reduce<Record<string, ContentSourceDefinition>>((byId, source) => {
    byId[source.id] = source;
    return byId;
  }, {});
