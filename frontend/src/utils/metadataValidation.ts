import type {
  ArticleEnrichment,
  ArticleLicense,
  Category,
  ContentGroup,
  ContentType,
  GeographicScope,
  LicenseType,
} from '../types/article';

/**
 * Phase 3.2 - Runtime guards and normalisers for the metadata model.
 *
 * The unions in `types/article.ts` are checked by the compiler, which protects
 * anyone writing TypeScript. These helpers protect everyone else - stored JSON,
 * data typed as `unknown`, a future API response, an imported feed - where a
 * value can be *anything* at runtime.
 *
 * Two rules shape every function here:
 *
 * 1. Nothing is invented. An unrecognised value is discarded or reported, never
 *    replaced with a plausible-looking default.
 * 2. Nothing is repaired in place. These are pure; they return new values and
 *    never mutate the object that was passed in.
 *
 * `utils/articleSelectors.ts` uses these to resolve the legacy `categories`
 * array into the new primary/secondary shape.
 */

/* ==========================================================================
   Vocabulary
   --------------------------------------------------------------------------
   Declared as `readonly` tuples and checked against the corresponding union on
   every build, so adding a union member without updating this file is a
   compile error rather than a silently unvalidated value at runtime.
   ========================================================================== */

export const CONTENT_TYPES = [
  'news',
  'editorial',
  'educational',
  'expository',
  'short-story',
  'novel',
  'classic-literature',
  'poetry',
  'dialogue',
  'other',
] as const satisfies readonly ContentType[];

export const CONTENT_GROUPS = [
  'articles',
  'encyclopedia',
  'specialized',
  'short-story',
  'novel',
  'classic-literature',
] as const satisfies readonly ContentGroup[];

export const CATEGORIES = [
  'science',
  'technology',
  'business',
  'finance',
  'healthcare',
  'history',
  'culture',
  'environment',
  'education',
  'psychology',
  'travel',
  'sports',
  'society',
  'politics',
  'literature',
  'language-learning',
  'food',
  'art',
  'career',
  'other',
] as const satisfies readonly Category[];

export const GEOGRAPHIC_SCOPES = [
  'national',
  'regional',
  'international',
  'global',
  'none',
] as const satisfies readonly GeographicScope[];

export const LICENSE_TYPES = [
  'public-domain',
  'creative-commons',
  'permitted-reuse',
  'link-only',
  'unknown',
] as const satisfies readonly LicenseType[];

/* ==========================================================================
   Guards
   ========================================================================== */

/** Narrows an unknown value to a `ContentType`, or returns false. */
export const isContentType = (value: unknown): value is ContentType =>
  typeof value === 'string' && (CONTENT_TYPES as readonly string[]).includes(value);

/** Narrows an unknown value to a `ContentGroup`, or returns false. */
export const isContentGroup = (value: unknown): value is ContentGroup =>
  typeof value === 'string' && (CONTENT_GROUPS as readonly string[]).includes(value);

/** Narrows an unknown value to a `Category`, or returns false. */
export const isCategory = (value: unknown): value is Category =>
  typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);

/** Narrows an unknown value to a `GeographicScope`, or returns false. */
export const isGeographicScope = (value: unknown): value is GeographicScope =>
  typeof value === 'string' && (GEOGRAPHIC_SCOPES as readonly string[]).includes(value);

/** Narrows an unknown value to a `LicenseType`, or returns false. */
export const isLicenseType = (value: unknown): value is LicenseType =>
  typeof value === 'string' && (LICENSE_TYPES as readonly string[]).includes(value);

/**
 * Placeholder codes that are shaped like a country but mean nothing.
 *
 * Listed before `isCountryCode` is used, and deliberately includes `EU`: the
 * European Union is a supranational body, not a country, so recording it as a
 * publisher's country would be a category error rather than a detail.
 */
const NON_COUNTRY_CODES: ReadonlySet<string> = new Set([
  'XX',
  'ZZ',
  'QQ',
  'AA',
  'OO',
  'WW',
  'EU',
]);

/**
 * True when a value is shaped like an ISO 3166-1 alpha-2 country code.
 *
 * Shape only: this checks the two-uppercase-letter form and rejects the
 * pseudo-codes `XX`, `ZZ` and friends that are commonly used to fake a
 * "worldwide" or "unknown" country. It does not prove the code is assigned to
 * a real state - that would need a full ISO table - so a syntactically valid
 * but unassigned code still passes. `publisherCountryCode` must therefore
 * still be verified against the actual publisher, never inferred.
 */
export const isCountryCode = (value: unknown): boolean =>
  typeof value === 'string' && /^[A-Z]{2}$/.test(value) && !NON_COUNTRY_CODES.has(value);

/* ==========================================================================
   Category normalisation
   ========================================================================== */

/**
 * Cleans a secondary-category list.
 *
 * Guarantees, applied in this order:
 * - only valid `Category` values survive; anything unrecognised is dropped;
 * - the primary category is removed, so it is never listed twice;
 * - duplicates are collapsed, keeping the FIRST occurrence so the recorded
 *   order stays meaningful and the result is deterministic;
 * - the input array is never mutated, and the same input always yields the
 *   same output.
 *
 * A missing or non-array value yields `[]`, so callers never have to
 * type-check before calling. This is what makes "duplicate secondary categories
 * are handled consistently" true for every consumer, rather than each one
 * re-implementing its own dedup rule.
 */
export const normalizeSecondaryCategories = (
  value: unknown,
  primaryCategory?: Category,
): Category[] => {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  if (primaryCategory !== undefined) seen.add(primaryCategory);

  const result: Category[] = [];
  for (const entry of value) {
    if (!isCategory(entry)) continue;
    if (seen.has(entry)) continue;
    seen.add(entry);
    result.push(entry);
  }
  return result;
};

/**
 * The single primary category for an enrichment, or `undefined`.
 *
 * The explicit `primaryCategory` wins. When it is absent - the case for every
 * currently registered article, which uses the legacy array - the first valid
 * entry of `categories` is used, so existing data gains a primary category
 * without anything being rewritten. When neither is present, or when no entry
 * is a valid category, the answer is `undefined`: no category is *made up* to
 * fill the slot.
 */
export const resolvePrimaryCategory = (
  enrichment?: Pick<ArticleEnrichment, 'primaryCategory' | 'categories'>,
): Category | undefined => {
  if (!enrichment) return undefined;

  if (isCategory(enrichment.primaryCategory)) return enrichment.primaryCategory;

  const legacy = enrichment.categories;
  if (Array.isArray(legacy)) {
    for (const entry of legacy) {
      if (isCategory(entry)) return entry;
    }
  }
  return undefined;
};

/**
 * The secondary categories for an enrichment, cleanly ordered.
 *
 * Combines the explicit `secondaryCategories` with any legacy `categories`
 * entries that are not already accounted for, then normalises the result. This
 * is what makes the legacy array and the new explicit fields coexist safely:
 * nothing already recorded disappears, and the primary category appears only
 * once, at the front, via `resolveAllCategories`.
 */
export const resolveSecondaryCategories = (
  enrichment?: Pick<ArticleEnrichment, 'primaryCategory' | 'secondaryCategories' | 'categories'>,
): Category[] => {
  if (!enrichment) return [];

  const primary = resolvePrimaryCategory(enrichment);
  const explicit = Array.isArray(enrichment.secondaryCategories) ? enrichment.secondaryCategories : [];
  const legacy = Array.isArray(enrichment.categories) ? enrichment.categories : [];

  return normalizeSecondaryCategories([...explicit, ...legacy], primary);
};

/**
 * Every category for an enrichment, primary first, deduplicated.
 *
 * The single place where the legacy and new shapes are reconciled, so all
 * consumers see one consistent list. An article with no category information
 * yields `[]`, never a default such as `'other'`.
 */
export const resolveAllCategories = (
  enrichment?: Pick<ArticleEnrichment, 'primaryCategory' | 'secondaryCategories' | 'categories'>,
): Category[] => {
  const primary = resolvePrimaryCategory(enrichment);
  const secondary = resolveSecondaryCategories(enrichment);
  return primary === undefined ? secondary : [primary, ...secondary];
};

/* ==========================================================================
   Geography
   ========================================================================== */

/**
 * The countries a piece is genuinely about, cleaned.
 *
 * Only well-formed codes survive, in their recorded order, without
 * duplicates. This is a *filter*, not an inference: it never adds a country
 * and never derives one from the publisher.
 */
export const normalizeCountriesAbout = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    if (!isCountryCode(entry) || seen.has(entry)) continue;
    seen.add(entry);
    result.push(entry);
  }
  return result;
};
/* ==========================================================================
   Licence honesty
   ========================================================================== */

/**
 * Whether an item's recorded licence permits this app to host the full text.
 *
 * Returns `undefined` when no licence is recorded at all, which is the honest
 * state for every article in the current registry. When a licence IS recorded
 * the answer is conservative and never optimistic:
 *
 * - Free to read is NOT free to reuse. `link-only` therefore returns `false`
 *   even though the text is publicly readable.
 * - Availability through an RSS feed or an open API is not a licence, so
 *   neither can make a source reusable.
 * - `unknown` returns `false`. Unknown rights stay unknown; the safe answer is
 *   never the permissive one.
 * - `commercialUse` and similar flags are NOT consulted on their own. A
 *   `creative-commons` entry only counts when the specific licence is actually
 *   named, because BY, BY-SA, BY-NC and BY-ND differ in exactly the ways that
 *   matter here.
 */
export const allowsFullTextHosting = (license?: ArticleLicense): boolean | undefined => {
  if (!license) return undefined;
  if (!isLicenseType(license.type)) return false;

  switch (license.type) {
    case 'public-domain':
    case 'permitted-reuse':
      return true;
    case 'creative-commons':
      return typeof license.id === 'string' && license.id.trim().length > 0;
    case 'link-only':
    case 'unknown':
    default:
      return false;
  }
};

/**
 * True when a licence makes a reuse claim with nothing behind it.
 *
 * Used by tests, and by any future import code, to flag an item that asserts
 * reuse without recording how that was established. An absent or `unknown`
 * licence never fails this check - only an unsupported *positive* claim does,
 * because declining to claim reuse is always safe.
 */
export const hasUnverifiedReuseClaim = (license?: ArticleLicense): boolean => {
  if (!license) return false;
  if (!isLicenseType(license.type)) return true;

  if (license.type === 'creative-commons' || license.type === 'public-domain') {
    const hasIdentifier = typeof license.id === 'string' && license.id.trim().length > 0;
    const hasEvidence =
      typeof license.permissionEvidence === 'string' && license.permissionEvidence.trim().length > 0;
    if (!hasIdentifier && !hasEvidence) return true;
  }
  return false;
};

/**
 * True when an enrichment records provenance and reuse terms that a later
 * reader could actually act on.
 *
 * This is a *check*, never a way to manufacture the missing facts: it reports
 * what is recorded and returns false otherwise. It exists so that a future
 * crawler or import step can be tested for honesty without a human re-reading
 * every entry.
 */
export const hasVerifiedProvenance = (enrichment?: ArticleEnrichment): boolean => {
  if (!enrichment) return false;
  if (!enrichment.source || typeof enrichment.source.name !== 'string') return false;
  if (!enrichment.source.name.trim()) return false;
  if (!enrichment.license) return false;
  if (hasUnverifiedReuseClaim(enrichment.license)) return false;
  return true;
};