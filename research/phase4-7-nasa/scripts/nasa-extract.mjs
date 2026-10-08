/**
 * Extract the article body from an official NASA page (science.nasa.gov and
 * other NASA.gov hosts).
 *
 * Every character returned here is copied from the live official page. The
 * extractor removes site furniture (navigation modules, related-content cards,
 * news teasers, figures and image credits, footers) and never rewrites,
 * summarises or completes text. It throws rather than guess.
 *
 * NASA content is "generally not subject to copyright", but NASA also states
 * that it uses third-party copyright-protected material whose rights it does not
 * convey. Figures, captions and image credits are therefore always removed, and
 * any third-party attribution remaining in the prose is reported so the item can
 * be SKIPped rather than imported.
 */

/** Only official NASA hosts are accepted. */
const NASA_HOST = /(^|\.)nasa\.gov$/i;

/**
 * Headings that begin a trailing module rather than article prose. Cutting on the
 * heading text keeps only NASA-authored explainer body copy.
 */
const SECTION_HEADINGS = [
  /^(.*\s)?news$/i,
  /^(.*\s)?news and features$/i,
  /^discover more topics from nasa$/i,
  /^discover more$/i,
  /^related (topics|articles|content|reading)$/i,
  /^more (on this topic|from|information|resources|explore)$/i,
  /^explore (more|related)$/i,
  /^latest (news|articles|missions)$/i,
  /^key publications$/i,
  /^additional resources$/i,
  /^image(s)? gallery$/i,
  /^multimedia$/i,
  /^videos$/i,
];

/** Blocks that are navigation/related-card/credit furniture, not article prose. */
const MODULE_BLOCK = [
  /^read (more|next)\b/i,
  /^explore (more|related)\b/i,
  /^download\b/i,
  /^visit our\b/i,
  /^subscribe\b/i,
  /^follow nasa\b/i,
  /^all (articles|news|missions|topics)\b/i,
  /^\s*(previous|next) (article|page)\s*$/i,
];

/**
 * Third-party / restriction markers. These are hard SKIP signals for the text
 * itself: NASA states its use of third-party copyright-protected material
 * "does not convey any rights to others to use the same material".
 */
const RIGHTS_BLOCK_MARKERS = [
  /\ball rights reserved\b/i,
  /Â©\s*\d{4}/i,
  /\bcopyright(ed)?\b\s*(Â©|\(c\)|\d{4})/i,
  /\bcourtesy of\b/i,
  /\bcredit(s|ed)?\s*:?\s*(image|photo|illustration|graphic)\b/i,
  /\bimage (by|credit)\b/i,
  /\bphoto(graph)? (by|credit)\b/i,
  /\billustration (by|credit)\b/i,
  /\bused with permission\b/i,
  /\bwith (the )?permission of\b/i,
  /\blicensed (from|by)\b/i,
  /\bcopyright (holder|owner)\b/i,
  /\bthird[- ]party (content|material|image|photo|photograph|artwork)\b/i,
  /\bmay not be (reproduced|republished|redistributed)\b/i,
  /\bdo not (copy|reproduce|republish)\b/i,
  /\bsyndicated by\b/i,
  /\bcontributed by\b/i,
  /\bguest (post|author|article)\b/i,
  /\bthis article (was|is) (provided|written|contributed) by\b/i,
  /\bassociated press\b/i,
  /\(ap\)/i,
  /\breuters\b/i,
  /\bnews agency\b/i,
  /\bafp\b/i,
  /\bnature\.com|springer|sciencedirect|elsevier|wiley|ieee\b/i,
];

/**
 * Credit lines naming a partner agency or non-NASA archive (ESA, CSA, STScI,
 * NOAA/NASA ID, partner observatories). NASA is explicit that its use of
 * third-party copyright-protected material conveys no rights to others, so a
 * credit naming anyone but NASA itself is a hard block on the text.
 */
const PARTNER_CREDIT = /\b(?:image|images|photo|photograph|illustration|graphic|visual|data|figure)\s*(?:by|credit|:)?\s*(?:credits?\s*)?([^.\n]{0,90})/gi;

/** Non-NASA third-party image/data providers commonly credited on NASA pages. */

const decodeEntities = (s) => s
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&apos;|&#039;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&ndash;/gi, '\u2013')
  .replace(/&mdash;/gi, '\u2014')
  .replace(/&rsquo;|&#8217;/gi, '\u2019')
  .replace(/&lsquo;|&#8216;/gi, '\u2018')
  .replace(/&ldquo;|&#8220;/gi, '\u201C')
  .replace(/&rdquo;|&#8221;/gi, '\u201D')
  .replace(/&hellip;|&#8230;/gi, '\u2026')
  .replace(/&middot;/gi, '\u00B7')
  .replace(/&#8212;/g, '\u2014')
  .replace(/&[a-z]+;/gi, ' ')
  .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
  .replace(/<[^>]*>?/g, '')
  .replace(/[ \t\u00a0]+/g, ' ')
  .trim();

/** Strip HTML comments so commented-out markup can never reach the stored body. */
const stripComments = (html) => html.replace(/<!--[\s\S]*?-->/g, ' ');

/** Remove figures, captions and credit lines: NASA images are never reused here. */
const stripMedia = (html) => html
  .replace(/<\s*figure\b[\s\S]*?<\s*\/\s*figure\s*>/gi, '\n')
  .replace(/<\s*figcaption\b[\s\S]*?<\s*\/\s*figcaption\s*>/gi, '\n')
  .replace(/<\s*img\b[^>]*>/gi, '')
  .replace(/<\s*(picture|svg|video|iframe)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '\n');

/** Block-level text from container HTML. */
const toBlocks = (containerHtml) => decodeEntities(
  containerHtml
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*table\b[\s\S]*?<\s*\/\s*table\s*>/gi, '\n')
    .replace(/<\s*script\b[\s\S]*?<\s*\/\s*script\s*>/gi, '\n')
    .replace(/<\s*style\b[\s\S]*?<\s*\/\s*style\s*>/gi, '\n')
    .replace(/<\s*(ul|ol)\b[^>]*>/gi, '\n')
    .replace(/<\/\s*li\s*>/gi, '\n')
    .replace(/<\s*li\b[^>]*>/gi, '\n')
    .replace(/<\/\s*(p|h[1-6]|div|section|blockquote|dd|dt)\s*>/gi, '\n')
    .replace(/<\s*(p|h[1-6]|div|section|blockquote|dd|dt)\b[^>]*>/gi, '\n')
).split('\n').map((l) => l.trim()).filter(Boolean);

/** Inner HTML of the first <article> element (NASA WordPress templates). */
const articleRegion = (html) => {
  const open = /<article\b/i.exec(html);
  if (!open) return null;
  const tag = open[0];
  const start = open.index + tag.length;
  const name = /<([a-z]+)/i.exec(tag)[1].toLowerCase();
  const scanner = new RegExp(`<${name}\\b|</${name}>`, 'gi');
  scanner.lastIndex = start;
  let depth = 1;
  let m;
  while ((m = scanner.exec(html))) {
    depth += m[0][1] === '/' ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index);
  }
  return null;
};

/**
 * The article region still contains the page's own trailing modules (news
 * teasers, related-topic cards). The first heading that names one of those
 * modules ends the prose, so everything after it is dropped by position.
 */
const cutAtTrailingModule = (html) => {
  for (const m of html.matchAll(/<h[23]\b[^>]*>([\s\S]{0,200}?)<\/h[23]>/gi)) {
    const text = decodeEntities(m[1]);
    if (SECTION_HEADINGS.some((re) => re.test(text))) return html.slice(0, m.index);
  }
  return html;
};

const isModuleFurniture = (line) => MODULE_BLOCK.some((re) => re.test(line));

/** Rights / third-party markers found in the visible article prose. */
const detectRightsMarkers = (blocks) => {
  const text = blocks.join('\n');
  const found = [];
  for (const re of RIGHTS_BLOCK_MARKERS) {
    const m = re.exec(text);
    if (m) found.push({ pattern: String(re), match: m[0].trim().slice(0, 120) });
  }
  return found;
};

/**
 * Explicit credit lines in the prose. A credit naming only NASA and its centres
 * is NASA content; anything else is third-party material NASA has explicitly said
 * it cannot pass on, so it blocks the item.
 */
const NASA_CENTRES = /\b(NASA|JPL|Goddard|Marshall|Ames|Langley|Kennedy|Johnson|Stennis|LaRC|GISS|GSFC|NRDC|CSSC|KSC|JSC|NSSC|AFRC|IPO|SUOM|APL|MIT|JHU|SwRI|Ball|Aerospace)\b/i;
const THIRD_PARTY_NAMES = /\b(ESA|CSA|STSci|JAXA|ISRO|SpaceX|Blue Origin|Boeing|Northrop|Lockheed|Uber|Airbus|Academie|Academia|University|Universit|institute of|laborator|observator|CERN|ESO|ALMA|NOAA|Smithsonian|National Geographic|Shutterstock|Getty|Reuters|Associated Press|AFP)\b/i;

const detectThirdPartyCredits = (blocks) => {
  const text = blocks.join('\n');
  const found = [];
  for (const m of text.matchAll(PARTNER_CREDIT)) {
    const credit = (m[1] ?? '').replace(/\s+/g, ' ').trim();
    if (credit.length < 3) continue;
    if (THIRD_PARTY_NAMES.test(credit) && !NASA_CENTRES.test(credit)) {
      found.push({ match: `${m[0].replace(/\s+/g, ' ').trim()}`.slice(0, 140) });
    }
  }
  return found;
};

/** NASA page provenance recorded in the site footer of every NASA page. */
const extractPageMeta = (html) => {
  const editor = /id="page-editor"[\s\S]{0,300}?hds-footer-meta-value[^>]*>([^<]+)</i.exec(html)?.[1]?.trim() ?? null;
  const official = /Responsible NASA Official[^:]*:[\s\S]{0,300}?hds-footer-meta-value[^>]*>([^<]+)/i.exec(html)?.[1]?.trim() ?? null;
  const updated = /id="page-last-updated"[\s\S]{0,300}?hds-footer-meta-value[^>]*>([^<]+)/i.exec(html)?.[1]?.trim() ?? null;
  return { editor: editor || null, official: official || null, lastUpdated: updated || null };
};

/** Convert "Aug 12, 2026" / "August 12, 2026" to YYYY-MM-DD. */
export const normalizeNasaDate = (value) => {
  const s = String(value ?? '').trim();
  const m = /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  if (!m) return null;
  const MONTHS = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
    aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
    nov: 11, november: 11, dec: 12, december: 12,
  };
  const month = MONTHS[m[1].toLowerCase().replace(/\.$/, '')];
  if (!month) return null;
  const day = Number(m[2]);
  const year = Number(m[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

export const fetchNasaArticle = async (url) => {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !NASA_HOST.test(parsed.hostname)) {
    throw new Error(`Refusing non-NASA URL: ${url}`);
  }
  const response = await fetch(url, { headers: { 'user-agent': 'english-reading-platform/1.0 (content rights review)' } });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const html = await response.text();
  if (/Page Not Found/i.test(html)) throw new Error(`NASA 404 page returned for ${url}`);

  const headline =
    /<h1\b[^>]*>([\s\S]{0,300}?)<\/h1>/i.exec(html) ??
    /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']*)["']/i.exec(html);
  let title = headline ? decodeEntities(headline[1]) : null;
  if (!title) throw new Error(`no title found for ${url}`);
  // og:title carries the site suffix ("... - NASA Science"); the article title does not.
  title = title.replace(/\s*[-|\u2013\u2014]\s*NASA(\s+Science)?\s*$/i, '').trim();

  const region = articleRegion(html);
  if (!region) throw new Error(`no article element found for ${url}`);

  // The article element opens with a secondary-navigation module. Start at the
  // page heading so site navigation can never reach the stored body.
  const h1 = /<h1\b/i.exec(region);
  const bodyRegion = h1 ? region.slice(h1.index) : region;

  const cleaned = cutAtTrailingModule(stripMedia(stripComments(bodyRegion)));
  let blocks = toBlocks(cleaned).filter((line) => !isModuleFurniture(line));

  // Drop the headline (and a caption variant of it) from the prose.
  const key = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const titleKey = key(title);
  while (
    blocks.length && blocks[0].length > 9 &&
    (key(blocks[0]) === titleKey ||
      (titleKey.startsWith(key(blocks[0])) || key(blocks[0]).startsWith(titleKey)))
  ) blocks.shift();

  if (blocks.length < 3) throw new Error(`only ${blocks.length} usable blocks extracted for ${url} - refusing to guess`);

  const body = blocks.join('\n\n');
  const wordCount = body.split(/\s+/).filter((w) => w.length).length;
  if (wordCount < 120) throw new Error(`only ${wordCount} words extracted for ${url} - refusing to guess`);

  const meta = extractPageMeta(html);

  /**
   * Landing/index pages ("topics", hubs, portals) are mostly navigation links,
   * not prose. Anchor density separates them far more reliably than block
   * length: an explainer has almost no in-body links, a hub is mostly links.
   */
  const anchorCount = (cleaned.match(/<a\b[^>]*>/gi) ?? []).length;
  const anchorsPerBlock = Number((anchorCount / Math.max(1, blocks.length)).toFixed(3));

  return {
    url,
    title,
    body,
    blocks: blocks.length,
    wordCount,
    anchorCount,
    anchorsPerBlock,
    pageEditor: meta.editor,
    nasaOfficial: meta.official,
    lastUpdatedAt: normalizeNasaDate(meta.lastUpdated),
    lastUpdatedText: meta.lastUpdated,
    rightsMarkers: detectRightsMarkers(blocks),
    thirdPartyCredits: detectThirdPartyCredits(blocks),
  };
};

