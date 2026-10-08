import type { ContentGroup, LicenseType } from './article';

/**
 * Phase 3.3 - The content source registry.
 *
 * WHAT THIS IS
 * ------------
 * A catalogue of WHERE future reading content may come from, HOW it can be
 * reached, and WHAT reuse rights have actually been verified.
 *
 * WHY IT IS NOT `ArticleSource` / `ArticleLicense`
 * -----------------------------------------------
 * Those two describe ONE article that has already been collected: its author,
 * its publication date, its licence. This file describes the PUBLISHER, once,
 * for every item that source might ever supply.
 *
 * Keeping them apart is deliberate and load-bearing:
 *
 * - a source's rights are a DEFAULT that individual items may not inherit. A
 *   page can carry agency material that the source itself may not reuse, which
 *   is exactly the VOA case documented in `data/contentSources.ts`;
 * - the registry can therefore be populated long before any article exists,
 *   which is what lets rights be checked before anything is fetched.
 *
 * Nothing in this file is imported by `articles.ts` or by any UI, so adding a
 * source can never change what a reader sees.
 */

/** How a source can be reached, in principle. */
export type SourceAccessMethod =
  | 'rss'
  | 'api'
  | 'web'
  | 'download'
  | 'manual'
  | 'other';

/**
 * How well a source's reuse rights have actually been established.
 *
 * This is a statement about EVIDENCE, never about permission. `verified` means
 * the publisher's own terms were read and they were unambiguous; it does not
 * mean the content may be used.
 */
export type SourceRightsStatus =
  | 'verified'
  | 'partially-verified'
  | 'unknown'
  | 'restricted'
  | 'not-allowed';

/**
 * What may be taken from a source.
 *
 * The four values are strictly ordered, from most to least permissive, and
 * they are checked independently of `SourceRightsStatus`:
 *
 * - `full-text` - the text itself may be stored and republished here. Only
 *   recorded when the publisher's own terms say so.
 * - `metadata-only` - titles, URLs, dates and authorship may be taken; the
 *   body text may NOT.
 * - `link-only` - nothing may be copied in; only a URL is shown.
 * - `unknown` - nothing is established, so nothing may be taken but the URL.
 *
 * IMPORTANT: a feed, an API or a public website is evidence of ACCESS, never
 * evidence of REUSE. A source with an RSS feed and `contentReuse: 'unknown'`
 * is a completely normal, self-consistent entry.
 */
export type SourceContentReuse =
  | 'full-text'
  | 'metadata-only'
  | 'link-only'
  | 'unknown';

/**
 * One catalogue entry: a publisher, not an article.
 *
 * Fields are required only where absence would be misleading. `id`, `name` and
 * `officialUrl` are always needed to identify and cite a source; everything
 * else may be unknown, and an unknown value must be recorded AS unknown rather
 * than guessed.
 */
export interface ContentSourceDefinition {
  /** Stable identifier used by fetch adapters and previews. Never reused. */
  id: string;
  /** Human-readable publisher or site name. */
  name: string;
  /** The publisher's own homepage. Never a feed or an article URL. */
  officialUrl: string;

  /** Which library group(s) this source could feed. At least one. */
  contentGroups: ContentGroup[];

  /**
   * Access methods that are KNOWN to exist and work.
   *
   * `web` means a person can read the site. `rss` or `api` must only be listed
   * once a working endpoint has actually been observed - never because a
   * source is widely believed to publish one.
   */
  accessMethods: SourceAccessMethod[];

  /** Verified feed URL, only when one has actually been fetched successfully. */
  feedUrl?: string;
  /** Verified API endpoint, only when one has actually been called. */
  apiUrl?: string;

  /** How well the reuse terms have been established. */
  rightsStatus: SourceRightsStatus;

  /** What may be taken from this source. Conservative by default. */
  contentReuse: SourceContentReuse;

  /**
   * The licence basis, when one has been verified from the publisher's terms.
   *
   * Reuses the existing `LicenseType` from `types/article.ts` rather than
   * inventing a parallel vocabulary. `public-domain` here means the PUBLISHER
   * states its own material is public domain - never that old-looking material
   * is assumed to be.
   */
  licenseType?: LicenseType;

  /** URL of the publisher's terms, when they were actually read. */
  licenseUrl?: string;

  /** Whether the publisher requires visible credit. Only when stated. */
  attributionRequired?: boolean;

  /** The exact credit line the publisher asks for, when they give one. */
  attributionText?: string;

  /**
   * ISO 3166-1 alpha-2 for the PUBLISHER's country.
   *
   * This says nothing about what the content is about - `ContentGroup` and the
   * article-level `countriesAbout` cover that.
   */
  publisherCountryCode?: string;

  /**
   * Free-text working notes: what was checked, what remains unresolved.
   *
   * This is where a source's caveats live - for example material the
   * publisher itself may not redistribute.
   */
  notes?: string;

  /** ISO 8601 date the terms above were last read. Never back-dated. */
  lastVerifiedAt?: string;

  /**
   * A per-source carve-out that survives item-level checks.
   *
   * VOA Learning English is the worked example: most of its material is public
   * domain, but stories from AP, Reuters and AFP are not, and the publisher
   * says so. Any item whose provenance cannot be shown to be first-party must
   * be treated as NOT reusable, whatever the source-level value says.
   */
  rightsCaveats?: string[];
}

/**
 * A normalised, read-only preview of ONE item seen at an external source.
 *
 * This is deliberately NOT `Article`. It is the output of the proof of concept
 * and nothing more: it is never written into `articles.ts`, never given a CEFR
 * level, a genre, chapters or a reading time, and never shown to a reader.
 */
export interface SourceArticlePreview {
  /** Which catalogue entry this came from. Always set. */
  sourceId: string;

  /** The publisher's own id for the item, when one exists. */
  externalId?: string;

  title: string;
  url: string;

  description?: string;
  publishedAt?: string;
  author?: string;

  /**
   * Body text, present ONLY when the rights check allowed it to be kept.
   *
   * Left `undefined` for metadata-only, link-only, unknown and restricted
   * items. Its absence is the normal, expected outcome - see
   * `sourceValidation.applyRightsPolicy`.
   */
  rawContent?: string;

  /** ISO 8601 timestamp for when this preview was produced. */
  fetchedAt: string;

  /**
   * Which reuse rule was applied, and why. Recorded so a human can audit the
   * decision rather than trusting that it was conservative.
   */
  rightsDecision?: SourcePreviewRightsDecision;
}

/** The audit trail for one item-level rights decision. */
export interface SourcePreviewRightsDecision {
  /** The reuse level actually applied to this item. */
  appliedReuse: SourceContentReuse;

  /** Why it was applied, in plain words. */
  reason: string;

  /** Whether full text was retained. Must be false unless explicitly allowed. */
  fullTextIncluded: boolean;

  /** The source's caveats that were considered, if any. */
  caveatsConsidered?: string[];
}
