import type {
  ContentSourceDefinition,
  SourceArticlePreview,
} from '../types/source';
import { applyRightsPolicy } from './sourceValidation';

/**
 * Phase 3.3 - Pure normalisation of an RSS feed into rights-checked previews.
 *
 * Everything here is deterministic and side-effect free: no network, no clock,
 * no file system. The live fetch in `scripts/fetchVoaPreview.ts` supplies the
 * XML and the timestamp; this module only transforms what it is given, which is
 * what makes the behaviour testable without a network.
 *
 * It is deliberately separate from the fetch script so the deterministic tests
 * can import it without triggering a live request.
 */

/** Decodes the XML entities that appear in RSS text, and unwraps CDATA. */
export const decodeXmlEntities = (text: string): string =>
  text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();

/** Returns the decoded text of the first `<tag>` in `xml`, or `undefined`. */
export const readTag = (xml: string, tag: string): string | undefined => {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i').exec(xml);
  if (!match) return undefined;
  const value = decodeXmlEntities(match[1]);
  return value.length > 0 ? value : undefined;
};

/** Splits a feed body into its `<item>` blocks. */
export const readItems = (xml: string): string[] => {
  const matches = xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi);
  return Array.from(matches).map((match) => match[1]);
};

/**
 * Turns one raw `<item>` block into a preview candidate.
 *
 * Returns `undefined` when the item lacks a title or a usable URL: a preview
 * without those two is not worth showing, and neither is guessed at.
 *
 * Body text is intentionally NOT extracted. The rights policy would strip it
 * for any source that has not been verified for full-text reuse, and not
 * fetching it at all is strictly safer than fetching and then discarding it.
 */
export const normalizeFeedItem = (
  itemXml: string,
  sourceId: string,
  fetchedAt: string,
): Omit<SourceArticlePreview, 'rightsDecision'> | undefined => {
  const title = readTag(itemXml, 'title');
  const url = readTag(itemXml, 'link') ?? readTag(itemXml, 'guid');
  if (!title || !url) return undefined;

  const candidate: Omit<SourceArticlePreview, 'rightsDecision'> = {
    sourceId,
    // Several publishers use the article URL itself as the guid, which makes it
    // a stable external id. Fall back to the link so the field is never empty.
    externalId: readTag(itemXml, 'guid') ?? url,
    title,
    url,
    fetchedAt,
  };

  const description = readTag(itemXml, 'description');
  if (description) candidate.description = description;

  // An unparseable date is dropped rather than guessed at.
  const publishedAt = readTag(itemXml, 'pubDate');
  if (publishedAt) {
    const parsed = new Date(publishedAt);
    if (!Number.isNaN(parsed.getTime())) candidate.publishedAt = parsed.toISOString();
  }

  const author = readTag(itemXml, 'dc:creator') ?? readTag(itemXml, 'author');
  if (author) candidate.author = author;

  return candidate;
};

/**
 * Normalises a whole feed into rights-checked previews.
 *
 * The rights policy is applied to EVERY item, so a body can never reach the
 * caller by way of a source whose terms were not verified.
 */
export const normalizeFeed = (
  xml: string,
  definition: ContentSourceDefinition | undefined,
  fetchedAt: string,
): SourceArticlePreview[] =>
  readItems(typeof xml === 'string' ? xml : '')
    .map((itemXml) => normalizeFeedItem(itemXml, definition?.id ?? 'unknown-source', fetchedAt))
    .filter((item): item is Omit<SourceArticlePreview, 'rightsDecision'> => item !== undefined)
    .map((item) => applyRightsPolicy(definition, item));
