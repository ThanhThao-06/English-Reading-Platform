/**
 * Shared HTML helpers for the Phase 4.8 source audits.
 *
 * Both PDR and Wiktionary serve a mix of encodings, so the response buffer is
 * decoded with the charset the server declares rather than assuming UTF-8.
 */

/** Decode numeric and named HTML entities that appear in article prose. */
export const decodeEntities = (value) => value
  .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
  .replace(/&rsquo;/g, '\u2019').replace(/&lsquo;/g, '\u2018')
  .replace(/&ldquo;/g, '\u201c').replace(/&rdquo;/g, '\u201d')
  .replace(/&mdash;/g, '\u2014').replace(/&ndash;/g, '\u2013')
  .replace(/&hellip;/g, '\u2026').replace(/&middot;/g, '\u00b7')
  .replace(/&copy;/g, '\u00a9').replace(/&sect;/g, '\u00a7')
  .replace(/&pound;/g, '\u00a3').replace(/&deg;/g, '\u00b0')
  .replace(/&times;/g, '\u00d7').replace(/&amp;amp;/g, '&amp;');

/** Fetch a URL and decode its body using the declared (or sniffed) charset. */
export const readHtml = async (url) => {
  const response = await fetch(url, { redirect: 'follow' });
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') || '';

  // The header charset wins; otherwise sniff the document. Both `charset` and
  // React's `charSet` attribute forms are recognised, and a `charSet="utf-8"`
  // declaration must not be missed, or typographic characters are corrupted.
  const fromHeader = (/charset=["']?([\w-]+)/i.exec(contentType) || [])[1];
  const head = buffer.subarray(0, 8192).toString('latin1');
  const fromMeta = (/<meta[^>]+charset=["']?([\w-]+)/i.exec(head) || [])[1];
  const charset = (fromHeader || fromMeta || 'utf-8').toLowerCase();

  let html;
  try {
    html = new TextDecoder(charset).decode(buffer);
  } catch {
    html = buffer.toString('utf8');
  }
  return { response, status: response.status, url: response.url, charset, html };
};

/** Strip markup to plain text lines, dropping scripts, styles and nav chrome. */
export const toLines = (html) => decodeEntities(
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' '),
)
  .replace(/<[^>]+>/g, '\n')
  .split('\n')
  .map((line) => line.replace(/\s+/g, ' ').trim())
  .filter((line) => line.length > 1 && !/^normalize\.css/.test(line));