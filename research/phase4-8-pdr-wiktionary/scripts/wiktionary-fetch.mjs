/**
 * Read-only MediaWiki access helpers for the Wiktionary audit.
 *
 * Kept separate from the audit so that importing these helpers never executes a
 * batch, and so request pacing lives in exactly one place.
 */
import { decodeEntities } from './lib.mjs';

export const API = 'https://en.wiktionary.org/w/api.php';
export const UA = 'EnglishReadingPlatform-Phase4.8-Audit/1.0 (rights verification; contact: local)';

/**
 * Serialised, rate-limited API access.
 *
 * Wiktionary returns HTTP 429 when requests arrive too quickly, and a failed
 * fetch must never be mistaken for "no content": an audit that cannot read the
 * page has no evidence and must report SKIP, never a clean result.
 */
const MIN_INTERVAL_MS = 2500;
let lastRequestAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const fetchJson = async (params) => {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  const headers = { 'User-Agent': UA, 'Accept': 'application/json' };

  let lastError;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    try {
      const response = await fetch(url, { headers });
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`HTTP ${response.status}`);
        await sleep(4000 * attempt); // exponential backoff
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (!/HTTP (429|5\d\d)/.test(String(error?.message))) throw error;
      await sleep(4000 * attempt);
    }
  }
  throw lastError ?? new Error('request failed');
};

/** Raw wikitext of one page. */
export const fetchWikitext = async (title) => {
  const data = await fetchJson({
    action: 'query',
    prop: 'revisions',
    rvprop: 'content',
    rvslots: 'main',
    titles: title,
    redirects: '1',
  });
  const page = data?.query?.pages?.[0];
  const text = page?.revisions?.[0]?.slots?.main?.content;
  return {
    title: page?.title ?? title,
    wikitext: typeof text === 'string' ? text : null,
    missing: !page || page.missing,
  };
};

/* ==========================================================================
   Wikitext section parsing
   ========================================================================== */

/**
 * Split wikitext into `== Language ==` blocks and their `=== Heading ===`
 * subsections, respecting MediaWiki heading depth rather than assuming it.
 */
export const splitSections = (wikitext) => {
  const sections = [];
  let current = null;
  for (const line of wikitext.split('\n')) {
    const heading = /^(={2,6})\s*(.+?)\s*\1$/.exec(line);
    if (heading) {
      if (current) sections.push(current);
      current = { depth: heading[1].length, heading: heading[2], lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) sections.push(current);
  return sections;
};