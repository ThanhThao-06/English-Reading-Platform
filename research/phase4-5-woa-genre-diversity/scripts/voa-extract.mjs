/**
 * Extract the article body from a VOA Learning English page.
 *
 * Every character returned here is copied from the live official page. The
 * extractor only removes non-story furniture (audio-player chrome, share
 * buttons, the "Words in This Story" glossary and site navigation). It never
 * rewrites, summarises or completes text, and it throws rather than guess when
 * the expected structure is absent.
 */

/** Player / sharing / navigation furniture that is not part of the story. */
const CHROME = [
  /^no media source currently available$/i,
  /^\s*[►>]?\s*listen to this story in\b/i,
  /right-?click\s*\/?\s*option-?click to save/i,
  /^direct link\b/i,
  /^pop-?out player$/i,
  /^\s*embed share\s*$/i,
  /^share$/i,
  /^copy link$/i,
  /^(facebook|twitter|telegram|whatsapp|email)$/i,
  /^(x\s*\(twitter\)|youtube|instagram|print)$/i,
  /^the (code|url) has been copied to your clipboard\.?$/i,
  /^_{5,}$/,
  /^follow us\b/i,
  /^about learning english$/i,
  /^contact us$/i,
  /^terms of use and privacy notice$/i,
  /^sign up for our newsletter$/i,
  /^subscribe to podcast\/rss$/i,
  /^find us on satellite tv$/i,
  /^learning english word book$/i,
  /^our policy$/i,
  /^about comments$/i,
  /^see comments$/i,
  /^forum$/i,
  /^please enable javascript to view the comments powered by disqus\.?$/i,
  /^what do you think of this story\?$/i,
  /^we want to hear from you\.?$/i,
  // audio player furniture
  /^\d{1,2}:\d{2}(:\d{2})?(\.\d+)?$/,
  /^\d+\s*kbps\b/i,
  /\|\s*mp3$/i,
  // trailing social / series furniture
  /^this item is part of /i,
  /^related$/i,
  /^links$/i,
  /^download pdf\b/i,
  /^quiz\s*[-–]/i,
  /^start the quiz to find out$/i,
  /^start quiz$/i,
];

/** Furniture that only ever appears after the story has finished. */
const TAIL = [
  /^this item is part of /i,
  /^related$/i,
  /^links$/i,
  /^download pdf\b/i,
  /^quiz\s*[-–]/i,
  /^start the quiz to find out$/i,
  /^start quiz$/i,
  /^(x\s*\(twitter\)|youtube|instagram|print|facebook)$/i,
  /^follow us\b/i,
];

/**
 * Glossary headings, matched against raw HTML with tags allowed between the
 * words, so inline markup cannot hide the heading.
 */
const glossaryPatterns = (marker) => {
  const words = marker.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(words.join('[\\s\\S]{0,200}?'), 'i');
};

/**
 * Glossary headings, matched against raw HTML with tags allowed between the
 * words so inline markup cannot hide the heading. The pages spell the heading
 * both "Words in This Story" and "Words in This Stories", hence Stor(?:y|ies).
 */
const GLOSSARY_MARKERS = [
  /Words[\s\S]{0,120}?in[\s\S]{0,120}?This[\s\S]{0,120}?Stor(?:y|ies)/i,
  /Words[\s\S]{0,120}?in[\s\S]{0,120}?the[\s\S]{0,120}?News/i,
  /Dictionary[\s\S]{0,60}?word[\s\S]{0,60}?lookup/i,
];

/**
 * Block-level fallback. The heading is not always its own block - VOA sometimes
 * renders it inline with the first definition - so this anchors at the start
 * and the caller truncates everything from there on.
 */
const isGlossaryBlock = (line) =>
  /^words\s+in\s+(?:this|the)\s+stor(?:y|ies)\b/i.test(line) ||
  /^words\s+in\s+the\s+news\b/i.test(line) ||
  /^dictionary\s+word\s+lookup\b/i.test(line);

const decodeEntities = (s) => {
  const decoded = s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    // numeric entities, hex and decimal: covers &#x27; &#39; &#8217; ...
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&ndash;/gi, '\u2013')
    .replace(/&mdash;/gi, '\u2014')
    .replace(/&rsquo;/gi, '\u2019')
    .replace(/&lsquo;/gi, '\u2018')
    .replace(/&ldquo;/gi, '\u201C')
    .replace(/&rdquo;/gi, '\u201D')
    .replace(/&hellip;/gi, '\u2026')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '');
  // Decoding &lt;/&gt; can reveal markup that was double-escaped in the source.
  // Strip it again so no literal tag ever reaches the stored body.
  return decoded
    .replace(/<[^>]*>?/g, '')
    .replace(/[ \t\u00a0]+/g, ' ')
    .trim();
};

/** Inner HTML of every element matched by id or class, by depth counting. */
const extractElements = (html, { id, className }) => {
  const re = id
    ? new RegExp(`<([a-z]+)[^>]*\\bid=["']${id}["'][^>]*>`, 'gi')
    : new RegExp(`<([a-z]+)[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`, 'gi');
  const results = [];
  let open;
  while ((open = re.exec(html))) {
    const tag = open[1].toLowerCase();
    const start = open.index + open[0].length;
    const scanner = new RegExp(`<${tag}\\b|</${tag}>`, 'gi');
    scanner.lastIndex = start;
    let depth = 1;
    let m;
    let inner = null;
    while ((m = scanner.exec(html))) {
      depth += m[0][1] === '/' ? -1 : 1;
      if (depth === 0) { inner = html.slice(start, m.index); break; }
    }
    if (inner !== null) results.push(inner);
  }
  return results;
};

/**
 * Pick the real story container.
 *
 * A page can contain several `wsw` elements (the audio player is one), so the
 * one holding the most prose is chosen by measurement rather than by position.
 */
const pickStoryContainer = (html) => {
  const candidates = extractElements(html, { className: 'wsw' });
  const byLength = (s) => decodeEntities(s).length;
  candidates.sort((a, b) => byLength(b) - byLength(a));
  if (candidates.length) return candidates[0];
  return extractElements(html, { id: 'article-content' })[0] ?? null;
};


/**
 * Paragraphs from the container HTML.
 *
 * Handles both VOA templates: modern articles use <p>, while the older Special
 * English / Explorations transcripts separate identical content with <br />.
 */
const toBlocks = (containerHtml) =>
  decodeEntities(
    containerHtml
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\/\s*p\s*>/gi, '\n')
      .replace(/<\s*p\b[^>]*>/gi, '\n')
      // Headings and list items are block-level too. The glossary heading is
      // not a <p>, so without this it would be invisible and its vocabulary
      // list would survive the cut.
      .replace(/<\/\s*h[1-6]\s*>/gi, '\n')
      .replace(/<\s*h[1-6]\b[^>]*>/gi, '\n')
      .replace(/<\/\s*li\s*>/gi, '\n')
      .replace(/<\s*li\b[^>]*>/gi, '\n')
  )
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

const isChrome = (line) => CHROME.some((re) => re.test(line));
const endsSentence = (line) => /[.!?:;"'\u2019\u201D)\]]\s*$/.test(line);
const SPEAKER = /^(VOICE\s+(?:ONE|TWO)\s*:|[A-Z][A-Z ]{2,}\s*:)/i;
const DANGLING = /(I'?m|I am|by|and|or|but|the|a|an|to|of|for|with|from|that|which|in|on|at|as|is|was)$/i;

/**
 * Re-join fragments the templates split mid-clause.
 *
 * VOA wraps clickable vocabulary in inline markup, which can split one sentence
 * across two blocks ("I'm" / "Barbara Klein."). A block is merged only when it
 * lacks sentence-ending punctuation and the next block continues it, so
 * headings and speaker labels are left untouched.
 */
const rejoinFragments = (blocks) => {
  const out = [];
  for (const block of blocks) {
    const prev = out[out.length - 1];
    // Speaker labels are split across blocks by the Special English template.
    if (prev && /^VOICE$/i.test(prev) && /^(ONE|TWO)\s*:$/i.test(block)) {
      out[out.length - 1] = `${prev} ${block}`.trim();
      continue;
    }
    if (
      prev &&
      !endsSentence(prev) &&
      !SPEAKER.test(prev) &&
      !SPEAKER.test(block) &&
      (/^[a-z(]/.test(block) || DANGLING.test(prev))
    ) {
      out[out.length - 1] = `${prev} ${block}`.trim();
    } else {
      out.push(block);
    }
  }
  return out;
};

/** The VOA producer credit, verbatim from the story's closing credit lines. */
const extractProducerCredit = (paragraphs) => {
  const tail = paragraphs.slice(-12).join(' ');
  return [...tail.matchAll(/([^.]{0,140}?\b(?:wrote|adapted|reported|narrated|produced|compiled)\b[^.]{0,220}?\.)/gi)]
    .map((m) => m[1].replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 8);
};

export const fetchArticle = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const html = await response.text();

  const headline =
    /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']*)["']/i.exec(html) ??
    /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const title = headline ? decodeEntities(headline[1]) : null;
  if (!title) throw new Error(`no title found for ${url}`);

  const dateMeta = /<meta[^>]+property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i.exec(html);
  const jsonLdDate = /"datePublished"\s*:\s*"([^"]+)"/i.exec(html);
  const publishedAt = String(dateMeta?.[1] ?? jsonLdDate?.[1] ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publishedAt)) throw new Error(`no publication date for ${url}`);

  // Both templates carry the story inside a wsw / article-content container.
  const container = pickStoryContainer(html);
  if (!container) throw new Error(`no story container found for ${url}`);

  // Cut the glossary by POSITION in the HTML, tolerating inline markup, and
  // never by guessing at paragraph content.
  let cut = container;
  for (const pattern of GLOSSARY_MARKERS) {
    const hit = pattern.exec(cut);
    if (hit) cut = cut.slice(0, hit.index);
  }

  let blocks = rejoinFragments(toBlocks(cut))
    .map((line) => line.replace(/\s*\bby\s*VOA\s*[-–]\s*Voice of America.*$/i, '').trim())
    .filter((line) => line && !isChrome(line));

  // Truncate at the glossary heading wherever it survived the HTML cut.
  const glossaryAt = blocks.findIndex((line) => isGlossaryBlock(line));
  if (glossaryAt > 0) blocks = blocks.slice(0, glossaryAt);

  // The headline (and a caption variant of it) is not body prose.
  const key = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const titleKey = key(title);
  while (
    blocks.length &&
    blocks[0].length > 9 &&
    (key(blocks[0]) === titleKey ||
      (titleKey.startsWith(key(blocks[0])) || key(blocks[0]).startsWith(titleKey)))
  ) {
    blocks.shift();
  }

  // Trim the trailing run of social / series furniture.
  while (blocks.length && TAIL.some((re) => re.test(blocks.at(-1)))) blocks.pop();

  if (blocks.length < 3) {
    throw new Error(`only ${blocks.length} usable blocks extracted for ${url} - refusing to guess`);
  }

  const body = blocks.join('\n\n');
  const wordCount = body.split(/\s+/).filter((w) => w.length).length;
  if (wordCount < 150) throw new Error(`only ${wordCount} words extracted for ${url} - refusing to guess`);

  // Author credits, taken verbatim: the closing producer credit plus the page
  // byline. Both are copied from the official page, never composed. The byline
  // is matched against tag-stripped text so inline markup cannot hide it.
  const credits = extractProducerCredit(blocks);
  const plainPage = decodeEntities(html.replace(/<[^>]+>/g, ' '));
  const authors = [...credits];

  // Some Special English / Explorations pages carry no closing credit line, but
  // they open with a verbatim VOA programme identification. Use that verbatim;
  // never compose a credit.
  if (!authors.some((a) => /\bVOA\b|Voice of America/i.test(a))) {
    const opening = blocks.slice(0, 4).join(' ');
    const credit = /(^|[.!?]\s)(From\s+VOA[^.]{0,160}\.)/i.exec(opening);
    if (credit) authors.push(credit[2].trim());
  }

  if (
    /by\s*VOA\s*[-–]\s*Voice of America/i.test(plainPage) &&
    !authors.some((a) => /voice\s+of\s+america/i.test(a))
  ) {
    authors.push('VOA - Voice of America');
  }

  return {
    title,
    publishedAt,
    authors,
    body,
    blocks: blocks.length,
    wordCount,
  };
};
