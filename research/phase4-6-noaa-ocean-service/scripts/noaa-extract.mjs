/**
 * Extract the article body from a NOAA Ocean Service (oceanservice.noaa.gov) page.
 *
 * Every character returned here is copied from the live official page. The
 * extractor removes site furniture (nav, breadcrumbs, footers, share buttons,
 * "More Information" link lists) and never rewrites, summarises or completes
 * text. It throws rather than guess when the expected structure is absent.
 */

/** Site furniture that is not article prose. */
const CHROME = [
  /^(home|ocean facts|topics|explore|all topics|about us|contact us|search)$/i,
  /^national ocean service$/i,
  /^(previous|next|back|top|menu)$/i,
  /^skip to main content$/i,
  /^(share|tweet|share this|print|email this page)$/i,
  /^(more information|more like this|related|links?)$/i,
  /^\s*last updated\b/i,
  /^\s*copyright.*$/i,
  /^\s*©.*$/,
  /^(how do you (find|use)|site map|sitemap)$/i,
  /^\s*an official website of the united states government\.?\s*$/i,
  /^\s*here'?s how you know we'?re official\.?\s*$/i,
];

/**
 * Footers / boilerplate that appear after the article. Cut by position so the
 * article text itself is never truncated from the front.
 */
const TAIL_CUT = [
  /^\s*more information\s*$/i,
  /^\s*additional information\s*$/i,
  /^\s*related links?\s*$/i,
  /^\s*glossary\s*$/i,
  /^\s*for more information,?\s*visit/i,
  /^\s*additional resources\s*$/i,
];

/**
 * Section markers in the NOAA templates. These HTML comments delimit the article
 * body from the trailing "More Information" link list, the social block, the
 * sidebar and the citation card. Cutting on the comments (before they are
 * stripped) is precise: cutting on rendered text would risk cutting a
 * legitimate trailing paragraph.
 *
 * NOAA Ocean Facts ships two templates. The newer one marks trailing blocks
 * with <!--MORE INFORMATION / <!--SOCIAL BLOCK / <!--CITATION. The older one
 * wraps the prose in an explicit <!--BODY TEXT ... <!--END BODY TEXT pair and
 * then marks <!--sidebar. Both are handled so neither template leaks furniture.
 */
const SECTION_STOPS = [
  '<!--END BODY TEXT',
  '<!--MORE INFORMATION',
  '<!--MORE INFO',
  '<!--SOCIAL BLOCK',
  '<!--CITATION',
  '<!--RELATED',
  '<!--sidebar',
];

/** Strip HTML comments so commented-out markup can never reach the stored body. */
const stripComments = (html) => html.replace(/<!--[\s\S]*?-->/g, ' ');

/** Cut the article region at the first template section marker after the h1. */
const cutAtSectionMarker = (html) => {
  let end = html.length;
  for (const marker of SECTION_STOPS) {
    const at = html.indexOf(marker);
    if (at !== -1 && at < end) end = at;
  }
  return html.slice(0, end);
};

/** Blocks that are image/figure furniture, not body prose. */
const MEDIA_BLOCK = [
  /^\s*(figure|fig\.|table|graph|chart)\s*\d*\s*[:.]?\s*$/i,
  /^\s*(image|photo|photograph|picture|photographer|credit|credits|source)\s*:/i,
  /^\s*(image|photo|photograph) (credit|by)\s*:/i,
  /^\s*(illustration|graphic)\s+by\s*:/i,
];

/** Copyright / third-party notice markers that disqualify a full-text item. */
const RIGHTS_BLOCK_MARKERS = [
  /\bcopyright(ed)?\b\s*(©|\(c\)|\d{4})/i,
  /©\s*\d{4}/i,
  /\ball rights reserved\b/i,
  /\bused with permission\b/i,
  /\bwith (the )?permission of\b/i,
  /\bcourtesy of\b/i,
  /\blicensed (from|by)\b/i,
  /\bthird[- ]party (content|material|photo|image)\b/i,
  /\bmay not be (reproduced|republished|redistributed)\b/i,
  /\ball images?\b[^.]{0,40}\bcopyright/i,
  /\bdo not (copy|reproduce|republish)\b/i,
  /\bsyndicated\b/i,
];

const decodeEntities = (s) => s
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&ndash;/gi, '\u2013')
  .replace(/&mdash;/gi, '\u2014')
  .replace(/&rsquo;/gi, '\u2019')
  .replace(/&lsquo;/gi, '\u2018')
  .replace(/&ldquo;/gi, '\u201C')
  .replace(/&rdquo;/gi, '\u201D')
  .replace(/&hellip;/gi, '\u2026')
  .replace(/&middot;/gi, '\u00B7')
  .replace(/&[a-z]+;/gi, ' ')
  .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
  .replace(/<[^>]*>?/g, '')
  .replace(/[ \t\u00a0]+/g, ' ')
  .trim();


/** Block-level text from container HTML. */
const toBlocks = (containerHtml) => decodeEntities(
  containerHtml
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*(figure|figcaption)\b[\s\S]*?<\s*\/\s*(figure|figcaption)\s*>/gi, '\n')
    .replace(/<\s*table\b[\s\S]*?<\s*\/\s*table\s*>/gi, '\n')
    .replace(/<\s*script\b[\s\S]*?<\s*\/\s*script\s*>/gi, '\n')
    .replace(/<\s*style\b[\s\S]*?<\s*\/\s*style\s*>/gi, '\n')
    .replace(/<\/\s*p\s*>/gi, '\n')
    .replace(/<\s*p\b[^>]*>/gi, '\n')
    .replace(/<\/\s*h[1-6]\s*>/gi, '\n')
    .replace(/<\s*h[1-6]\b[^>]*>/gi, '\n')
    .replace(/<\/\s*li\s*>/gi, '\n')
    .replace(/<\s*li\b[^>]*>/gi, '\n')
).split('\n').map((l) => l.trim()).filter(Boolean);

/**
 * The NOAA Ocean Facts template has no <main>/<article> element. The article
 * region is reliably delimited by the page <h1> (start) and the site <footer>
 * (end). Navigation precedes the h1 and the footer follows the article, so the
 * region between them is article content plus its own "More Information" links.
 */
const sliceArticleRegion = (html) => {
  const h1 = /<h1\b/i.exec(html);
  if (!h1) return null;
  const region = cutAtSectionMarker(html.slice(h1.index));
  return stripComments(region);
};


const isChrome = (line) => CHROME.some((re) => re.test(line));

/**
 * NOAA provenance signals found on the page. Recorded as evidence for the human
 * review decision; they are never treated as a blanket permission.
 */
const detectProvenanceSignals = (html) => {
  const plain = decodeEntities(html.replace(/<[^>]+>/g, ' '));
  const signals = [];
  const push = (label, re) => { if (re.test(plain)) signals.push(label); };
  push('credits-noaa', /\b(photo|image|illustration)\s*(credit)?\s*:?\s*[^.]{0,40}\bNOAA\b/i);
  push('credits-noaa-ocean-service', /\bNOAA Ocean Service\b/i);
  push('credits-other-agency', /\bcredits?:?\s*(photo\s*)?:?[^.]{0,30}\b(NASA|USGS|USACE|OMI|Staff)\b/i);
  push('wikipedia-or-wikimedia', /\b(Wikipedia|Wikimedia|Wikisource)\b/i);
  push('public-domain-statement', /\bpublic domain\b/i);
  push('copyright-notice', /\b(copyright|all rights reserved|©)\b/i);
  push('third-party-source', /\b(courtesy of|licensed from|with permission from|used with permission)\b/i);
  push('partner-or-funded', /\b(in partnership with|funded by|sponsored by|grant from)\b/i);
  return signals;
};

/**
 * The NOAA citation card records an explicit "Author:" credit and a
 * "Last updated:" date. Both are provenance evidence for the item-level rights
 * decision and are captured verbatim.
 */
const extractCitationCard = (html) => {
  const start = /<!--CITATION/i.exec(html);
  if (!start) return { author: null, lastUpdated: null };
  const region = html.slice(start.index, start.index + 1200);
  const author = /<strong>\s*Author:\s*<\/strong>\s*([^<]+)/i.exec(region)?.[1]?.trim() ?? null;
  const lastUpdated = /Last updated:<\/strong>\s*<\/h5>\s*<h6[^>]*>\s*([\d/]+)/i.exec(region)?.[1]?.trim() ?? null;
  return { author: author || null, lastUpdated: lastUpdated || null };
};

/**
 * The older NOAA facts template has no <!--CITATION card. Its author credit and
 * "Last updated" stamp sit directly in the sidebar above the site footer. This
 * fallback reads them from that location only, and from the raw page (before
 * the article region is cut) so it works on both templates.
 */
const extractLegacyCitation = (html) => {
  const author = /<strong>\s*Author:\s*<\/strong>\s*([^<]+)/i.exec(html)?.[1]?.trim() ?? null;
  const lastUpdated = /<strong>\s*Last updated:\s*<\/strong>\s*([\d/]+)/i.exec(html)?.[1]?.trim()
    ?? /\/\*\s*Last updated[^0-9]{0,80}(\d{1,2}\/\d{1,2}\/\d{2,4})/i.exec(html)?.[1]?.trim()
    ?? null;
  return { author: author || null, lastUpdated: lastUpdated || null };
};

/** Citation evidence from whichever template the page uses. */
const resolveCitation = (html) => {
  const card = extractCitationCard(html);
  if (card.author || card.lastUpdated) return card;
  return extractLegacyCitation(html);
};

/** Convert an MM/DD/YY "Last updated" stamp to YYYY-MM-DD, or null. */
export const normalizeNoaaDate = (value) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(String(value ?? '').trim());
  if (!m) return null;
  const year = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const extractProvenanceAuthors = (html, title) => {
  const authors = [];
  const byline = /<p[^>]*class=["'][^"']*lead[^"']*["'][^>]*>([\s\S]{0,300}?)<\/p>/i.exec(html);
  if (byline) {
    const text = decodeEntities(byline[1]);
    if (text) authors.push(text.slice(0, 200));
  }
  return authors.filter((a) => a.trim() && a.trim() !== title);
};

export const fetchNoaaArticle = async (url) => {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !/(^|\.)oceanservice\.noaa\.gov$/.test(parsed.hostname)) {
    throw new Error(`Refusing non-NOAA Ocean Service URL: ${url}`);
  }
  const response = await fetch(url, { headers: { 'user-agent': 'english-reading-platform/1.0 (content rights review)' } });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const html = await response.text();
  if (/Page Not Found/i.test(html)) throw new Error(`NOAA 404 page returned for ${url}`);

  const headline =
    /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']*)["']/i.exec(html) ??
    /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const title = headline ? decodeEntities(headline[1]) : null;
  if (!title) throw new Error(`no title found for ${url}`);

  const dateMeta = /<meta[^>]+property=["']article:(?:published|modified)_time["'][^>]*content=["']([^"']+)["']/i.exec(html);
  const dateText = String(dateMeta?.[1] ?? '').slice(0, 10);
  const publishedAt = /^\d{4}-\d{2}-\d{2}$/.test(dateText) ? dateText : null;

  const container = sliceArticleRegion(html);
  if (!container) throw new Error(`no article container found for ${url}`);

  let blocks = toBlocks(container).filter((line) => !isChrome(line) && !isMedia(line));

  // Cut trailing "More Information" style sections by position.
  const cutAt = blocks.findIndex((line) => TAIL_CUT.some((re) => re.test(line)));
  if (cutAt > 0) blocks = blocks.slice(0, cutAt);

  // The headline (and a caption variant) is not body prose.
  const key = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const titleKey = key(title);
  while (
    blocks.length && blocks[0].length > 9 &&
    (key(blocks[0]) === titleKey ||
      (titleKey.startsWith(key(blocks[0])) || key(blocks[0]).startsWith(titleKey)))
  ) blocks.shift();

  if (blocks.length < 3) throw new Error(`only ${blocks.length} usable blocks extracted for ${url} - refusing to guess`);

  const rightsMarkers = detectRightsMarkers(blocks);
  const body = blocks.join('\n\n');
  const wordCount = body.split(/\s+/).filter((w) => w.length).length;
  if (wordCount < 120) throw new Error(`only ${wordCount} words extracted for ${url} - refusing to guess`);

  const citation = resolveCitation(html);
  // The item's own author credit is the strongest NOAA authorship signal. When
  // the page names no author, that is recorded as a MISSING-CREDIT finding and
  // the item is not silently approved downstream.
  const noaaAuthors = citation.author && /noaa/i.test(citation.author) ? [citation.author] : [];

  return {
    url,
    title,
    publishedAt,
    lastUpdatedAt: normalizeNoaaDate(citation.lastUpdated),
    authorCredit: citation.author,
    authors: noaaAuthors,
    body,
    blocks: blocks.length,
    wordCount,
    rightsMarkers,
    provenanceSignals: detectProvenanceSignals(html),
  };
};

const isMedia = (line) => MEDIA_BLOCK.some((re) => re.test(line));

/** Rights markers found in the visible article text. */
const detectRightsMarkers = (blocks) => {
  const found = [];
  const text = blocks.join('\n');
  for (const re of RIGHTS_BLOCK_MARKERS) {
    const m = re.exec(text);
    if (m) found.push({ pattern: String(re), match: m[0].trim().slice(0, 120) });
  }
  return found;
};
