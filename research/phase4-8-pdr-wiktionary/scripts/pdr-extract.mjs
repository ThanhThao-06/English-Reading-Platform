/**
 * PDR article extraction (reads only).
 *
 * Produces the exact fields the intake record needs: title, byline, publication
 * date and the article body. The body deliberately stops at the trailing
 * apparatus (bibliography, "Further Reading", site navigation) so no nav chrome
 * or source list is stored as article text.
 */
import { decodeEntities, readHtml } from './lib.mjs';

/** Site navigation, shop and footer strings that must never enter the body. */
const CHROME = [
  /^Collections\s*\/\s*Images$/,
  /^Essays\s*\/\s*\w+$/,
  /^Buy as a Print$/,
  /^Find Out More$/,
  /^Shop Our Range of Prints$/,
  /^Available as unframed or framed and ready to hang\.?$/,
  /^Free Shipping to US, UK, EU, Canada, and Australia\.?$/,
  /^Premium prints using pigment-based archival inks.*$/,
  /^Add to Cart$/,
  /^Home$/, /^Essays$/, /^Collections$/, /^Explore$/, /^Sources$/, /^Shop$/,
  /^Support PDR$/, /^About$/, /^Blog$/, /^Search$/, /^Contact$/, /^Masthead$/,
  /^Submissions$/, /^Contributors$/, /^Privacy Policy$/, /^Terms and Conditions$/,
  /^Newsletter$/, /^Subscribe to Our Newsletter$/, /^Subscribe$/, /^Unsubscribe$/,
  /^PDR Index$/, /^Our Supporters$/, /^Supporters$/, /^Shop FAQ$/, /^Returns Policy$/,
  /^More Info$/, /^Privacy info$/, /^Sign Up for Our Newsletter$/, /^Bluesky$/,
  /^X Bluesky$/, /^Related Content$/, /^Related Articles$/, /^Related Posts$/,
  /^Posted in$/, /^The Public Domain Review$/,
];

/** Headings that introduce the article's trailing apparatus. */
const APPARATUS = new RegExp([
  '^(Further Reading|Sources)$',
  '^Notes Show Notes$',
  '^Public Domain Works$',
].join('|'), 'i');

/**
 * Commercial and membership copy PDR appends after an article, in either order
 * relative to the bibliography. The body is cut at the first of these markers,
 * so none of this copy can ever be stored as article prose.
 *
 * Patterns are alternation STRINGS, not RegExp literals: `new RegExp([...])` on a
 * list of literals stringifies each source with its `/` delimiters still
 * attached, producing a pattern that never matches.
 *
 * Membership copy is sometimes merged into one line with the article's own
 * closing sentence ("...postcard packs. Enjoyed this essay?"), so a cut is also
 * made at the first sentence that contains a promotion.
 */
const SHOP = new RegExp([
  'Buy as a Print',
  'Find Out More',
  'Shop Our Range of Prints',
  'Premium prints using pigment-based archival inks',
  'Available as unframed or framed',
  'Free Shipping to US',
  'Add to Cart',
  'Support PDR',
  'Become a (?:Friend|Supporter)',
  'As a (?:Friend|Supporter)',
  'Friends also enjoy',
  'Enjoy \\d+% off',
  'Join our community of supporters',
  'themed postcard packs',
  'Join (?:us|together)',
  'Our Supporters',
  'GDPR compliant',
].join('|'), 'i');

/**
 * Text that marks the end of the article and the start of site furniture.
 *
 * Used as a backstop when no article container matches, so nav and footer copy
 * can never be stored as article text.
 */
const FOOTER_MARKER = /is registered in the UK as a Community Interest Company|We rely on donations from readers/;

/**
 * PDR serves both Essays and Collections from a Gatsby build with different
 * wrappers, so the article body is scoped to the article container rather than
 * guessed from the whole document:
 *
 *   - Collections -> <div class="collection-view"> ... up to <footer>
 *   - Essays      -> <div class="essay"> ... up to <footer>
 *
 * Everything outside that container is site furniture and is never stored.
 */
const CONTAINERS = [
  /<div[^>]*class="[^"]*\bcollection-view\b[^"]*"[^>]*>([\s\S]*?)<footer/i,
  /<div[^>]*class="[^"]*\bessay\b[^"]*"[^>]*>([\s\S]*?)<footer/i,
];

/** Article body as HTML, scoped to the article container. */
const articleHtml = (html) => {
  for (const pattern of CONTAINERS) {
    const match = pattern.exec(html);
    if (match) return match[1];
  }
  return null;
};

const clean = (value) => decodeEntities(value).replace(/\s+/g, ' ').trim();

/** Strip the site-name suffix and repair the dash PDR puts in titles. */
const cleanTitle = (value) => clean(value)
  .replace(/\s*[\u2013\u2014|-]\s*The Public Domain Review\s*$/i, '')
  .trim();

export const extractPdrArticle = async (url) => {
  const { status, html } = await readHtml(url);
  if (status !== 200) {
    return { ok: false, reason: `HTTP ${status}` };
  }

  const title = cleanTitle((html.match(/<title[^>]*>([^<]*)<\/title>/) || [])[1] || '');
  if (!title) return { ok: false, reason: 'NO_TITLE' };

  // Byline: PDR prints the contributor as "by <a href="/contributor/...">Name</a>".
  const author = clean(/by\s*<a[^>]*href="\/contributor\/[^"]*"[^>]*>([^<]{2,80})<\/a>/i.exec(html)?.[1]
    || /by\s*<a[^>]*>([^<]{2,80})<\/a>/i.exec(html)?.[1]
    || '');

  // Publication date: JSON-LD or a visible date on the page.
  const datePublished = (
    html.match(/"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})/i)?.[1]
    || html.match(/<time[^>]*datetime="(\d{4}-\d{2}-\d{2})"/i)?.[1]
    // PDR prints e.g. "30 Sep 2026" next to the byline.
    || (() => {
      const m = /\b(\d{1,2}\s+[A-Z][a-z]{2}\s+\d{4})\b/.exec(
        decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' '),
      );
      if (!m) return null;
      const parsed = new Date(m[1]);
      return Number.isNaN(parsed.getTime())
        ? null
        : parsed.toISOString().slice(0, 10);
    })()
  );

  // Body text is scoped to the article container, so nav, footer and shop
  // modules cannot leak in.
  const scoped = articleHtml(html);
  if (!scoped) return { ok: false, reason: 'NO_ARTICLE_CONTAINER' };

  // Block boundaries are emitted by closing tags, but a commercial module
  // concatenates several sentences into one node, so sentence-ish splits are
  // applied as well to stop shop copy trailing the article.
  const text = decodeEntities(
    scoped
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<\/(?:p|div|h[1-6]|li|section|article|figcaption)>/gi, '\n'),
  ).replace(/<[^>]+>/g, ' ');

  const rawLines = [];
  for (const line of text.split('\n')) {
    const collapsed = line.replace(/\s+/g, ' ').trim();
    if (!collapsed) continue;
    // Split a merged node into sentence-sized lines.
    const parts = collapsed
      .split(/(?<=[.?!])\s+(?=[A-Z0-9"'“‘])/)
      .map((part) => part.trim())
      .filter(Boolean);
    rawLines.push(...(parts.length ? parts : [collapsed]));
  }

  // PDR closes every post with a shared "Enjoyed this piece? / Become a Friend"
// block. It is engagement furniture, not article prose, so it is dropped.
const CALL_TO_ACTION = /^Enjoyed this (?:piece|essay|post)\?/i;
const callToActionAt = rawLines.findIndex((line) => CALL_TO_ACTION.test(line));

  // The article ends before its trailing apparatus. PDR's Essays put a "Sources"
  // run of library/archive entries first, then a "Further Reading" list, then the
  // closing call to action and the licence line. So the body is cut at the first
  // line belonging to that apparatus.
  //
  // Membership copy is sometimes merged into one line with the article's own
  // closing sentence, so a line containing a promotion is truncated to the text
  // before the promotion rather than kept whole.
  const shopAt = rawLines.findIndex((line) => SHOP.test(line));

  // Lines that make up a citation entry: the repository name plus the short
  // title/date/publisher lines that sit beside it.
  const isCitationLine = (line) =>
    /^(Texts|Images|Audio)$/.test(line)
    || /^(Internet Archive|Google Books|Project Gutenberg|Wikimedia Commons|Biodiversity Heritage Library|Wellcome Collection|Europeana|Smithsonian|British Library|Internet Archive)$/.test(line)
    || /^Ca\.$/.test(line)
    || /^\d{3,4}$/.test(line)
    || /^\d+\s+volumes?$/i.test(line)
    || /^Vol\.? [IVXLC]+$/i.test(line);

  const isSourceEntry = (line) =>
    /^(Texts|Images|Audio)$/.test(line)
    || /^(Internet Archive|Google Books|Project Gutenberg|Wikimedia Commons|Biodiversity Heritage Library|Wellcome Collection|Europeana|Smithsonian|British Library)$/.test(line);

  const bibliographyAt = (() => {
    // An explicit apparatus heading: footnotes, public-domain works, further
    // reading. The FIRST such heading is the article's own.
    for (let i = 9; i < rawLines.length; i += 1) {
      if (APPARATUS.test(rawLines[i])) return i;
    }

    // Otherwise the first citation entry: on Essays the entries are interleaved
    // with titles, dates and publishers, so the start of the block is found by
    // extending backwards over contiguous citation lines.
    for (let i = 9; i < rawLines.length; i += 1) {
      if (!isSourceEntry(rawLines[i])) continue;
      let start = i;
      while (start > 0 && isCitationLine(rawLines[start - 1])) start -= 1;
      return start;
    }
    return -1;
  })();

  const cutCandidates = [shopAt, bibliographyAt, callToActionAt].filter((index) => index > 8);
  const cutAt = cutCandidates.length ? Math.min(...cutCandidates) : -1;
  const articleLines = cutAt > 0 ? rawLines.slice(0, cutAt) : rawLines;

  const kept = [];
  for (const line of articleLines) {
    if (!line || line.length < 3) continue;
    if (CHROME.some((pattern) => pattern.test(line))) continue;
    // The site name and breadcrumbs are chrome, not article text.
    if (/^[\u2013\u2014|-]\s*The Public Domain Review$/.test(line)) continue;
    // Image-caption source credits are asset metadata, never article prose.
    if (/^Source\s*:\s*/i.test(line)) continue;

    // A line can be the article's closing sentence fused with a promotion, so
    // it is truncated at the first promotional phrase.
    const promotionAt = line.search(SHOP);
    const text = promotionAt > 8 ? line.slice(0, promotionAt).trim().replace(/[.,;:-]+$/, '') : line;
    if (text.length < 3) continue;
    kept.push(text);
  }

  while (kept.length && CHROME.some((pattern) => pattern.test(kept.at(-1)))) {
    kept.pop();
  }

  // Pagination counters ("17", "91") and other bare numeric chrome survive the
  // container cut on some templates; they are never article prose.
  const purged = kept.filter((line) => !/^\d{1,3}$/.test(line));

  /**
   * Per-item rights evidence, read from THIS article's own page.
   *
   * The publisher's site-wide statement is not used to decide the item; the two
   * forms below are what PDR itself prints on the article:
   *   - Essays:     "The text of this essay is published under a CC BY-SA license"
   *   - Collections: the rights label "Digital Copy Rights ... Labelled CC BY-SA"
   *
   * Restrictions ("All rights reserved", "Reprinted by permission") are captured
   * too, so the caller can exclude an item rather than assume it is covered.
   */
  const wholeText = rawLines.join(' ');
  const essayStatement = /the text of this (?:essay|post|article) is published under a\s*([^.,]{0,40}?)license[^.]*\./i.exec(wholeText);
  const rightsLabel = /Digital Copy Rights[^.]*?Labelled\s*(CC[\s-]?BY(?:-NC)?(?:-SA)?(?:\s?\d\.\d)?)\s*license/i.exec(wholeText);
  const allRightsReserved = /all rights reserved/i.test(wholeText);
  const reprintedByPermission = /reprinted by permission/i.test(wholeText);

  const rightsEvidence = {
    licenceToken: essayStatement?.[1]?.trim() ?? rightsLabel?.[1]?.trim() ?? null,
    evidenceForm: essayStatement ? 'essay-licence-statement' : (rightsLabel ? 'rights-label' : null),
    evidenceText: (essayStatement?.[0] ?? rightsLabel?.[0] ?? '').trim(),
    allRightsReserved,
    reprintedByPermission,
  };

  // The trailing rights sentence is recorded separately, not stored as body text.
  const rightsIndex = purged.findIndex((line) =>
    /the text of this (?:essay|post|article) is published under a/i.test(line));
  if (rightsIndex >= 0) {
    purged.splice(rightsIndex, 2);
  }

  const body = purged.join('\n\n');
  return {
    ok: true,
    url,
    title,
    author: author || null,
    datePublished,
    body,
    wordCount: body.split(/\s+/).filter(Boolean).length,
    rightsEvidence,
  };
};