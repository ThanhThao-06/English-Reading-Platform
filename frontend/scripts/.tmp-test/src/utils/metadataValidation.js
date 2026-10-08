"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasVerifiedProvenance = exports.hasUnverifiedReuseClaim = exports.allowsFullTextHosting = exports.normalizeCountriesAbout = exports.resolveAllCategories = exports.resolveSecondaryCategories = exports.resolvePrimaryCategory = exports.normalizeSecondaryCategories = exports.isCountryCode = exports.isLicenseType = exports.isGeographicScope = exports.isCategory = exports.isContentGroup = exports.isContentType = exports.LICENSE_TYPES = exports.GEOGRAPHIC_SCOPES = exports.CATEGORIES = exports.CONTENT_GROUPS = exports.CONTENT_TYPES = void 0;
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
exports.CONTENT_TYPES = [
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
];
exports.CONTENT_GROUPS = [
    'articles',
    'encyclopedia',
    'specialized',
    'short-story',
    'novel',
    'classic-literature',
];
exports.CATEGORIES = [
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
];
exports.GEOGRAPHIC_SCOPES = [
    'national',
    'regional',
    'international',
    'global',
    'none',
];
exports.LICENSE_TYPES = [
    'public-domain',
    'creative-commons',
    'permitted-reuse',
    'link-only',
    'unknown',
];
/* ==========================================================================
   Guards
   ========================================================================== */
/** Narrows an unknown value to a `ContentType`, or returns false. */
const isContentType = (value) => typeof value === 'string' && exports.CONTENT_TYPES.includes(value);
exports.isContentType = isContentType;
/** Narrows an unknown value to a `ContentGroup`, or returns false. */
const isContentGroup = (value) => typeof value === 'string' && exports.CONTENT_GROUPS.includes(value);
exports.isContentGroup = isContentGroup;
/** Narrows an unknown value to a `Category`, or returns false. */
const isCategory = (value) => typeof value === 'string' && exports.CATEGORIES.includes(value);
exports.isCategory = isCategory;
/** Narrows an unknown value to a `GeographicScope`, or returns false. */
const isGeographicScope = (value) => typeof value === 'string' && exports.GEOGRAPHIC_SCOPES.includes(value);
exports.isGeographicScope = isGeographicScope;
/** Narrows an unknown value to a `LicenseType`, or returns false. */
const isLicenseType = (value) => typeof value === 'string' && exports.LICENSE_TYPES.includes(value);
exports.isLicenseType = isLicenseType;
/**
 * Placeholder codes that are shaped like a country but mean nothing.
 *
 * Listed before `isCountryCode` is used, and deliberately includes `EU`: the
 * European Union is a supranational body, not a country, so recording it as a
 * publisher's country would be a category error rather than a detail.
 */
const NON_COUNTRY_CODES = new Set([
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
const isCountryCode = (value) => typeof value === 'string' && /^[A-Z]{2}$/.test(value) && !NON_COUNTRY_CODES.has(value);
exports.isCountryCode = isCountryCode;
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
const normalizeSecondaryCategories = (value, primaryCategory) => {
    if (!Array.isArray(value))
        return [];
    const seen = new Set();
    if (primaryCategory !== undefined)
        seen.add(primaryCategory);
    const result = [];
    for (const entry of value) {
        if (!(0, exports.isCategory)(entry))
            continue;
        if (seen.has(entry))
            continue;
        seen.add(entry);
        result.push(entry);
    }
    return result;
};
exports.normalizeSecondaryCategories = normalizeSecondaryCategories;
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
const resolvePrimaryCategory = (enrichment) => {
    if (!enrichment)
        return undefined;
    if ((0, exports.isCategory)(enrichment.primaryCategory))
        return enrichment.primaryCategory;
    const legacy = enrichment.categories;
    if (Array.isArray(legacy)) {
        for (const entry of legacy) {
            if ((0, exports.isCategory)(entry))
                return entry;
        }
    }
    return undefined;
};
exports.resolvePrimaryCategory = resolvePrimaryCategory;
/**
 * The secondary categories for an enrichment, cleanly ordered.
 *
 * Combines the explicit `secondaryCategories` with any legacy `categories`
 * entries that are not already accounted for, then normalises the result. This
 * is what makes the legacy array and the new explicit fields coexist safely:
 * nothing already recorded disappears, and the primary category appears only
 * once, at the front, via `resolveAllCategories`.
 */
const resolveSecondaryCategories = (enrichment) => {
    if (!enrichment)
        return [];
    const primary = (0, exports.resolvePrimaryCategory)(enrichment);
    const explicit = Array.isArray(enrichment.secondaryCategories) ? enrichment.secondaryCategories : [];
    const legacy = Array.isArray(enrichment.categories) ? enrichment.categories : [];
    return (0, exports.normalizeSecondaryCategories)([...explicit, ...legacy], primary);
};
exports.resolveSecondaryCategories = resolveSecondaryCategories;
/**
 * Every category for an enrichment, primary first, deduplicated.
 *
 * The single place where the legacy and new shapes are reconciled, so all
 * consumers see one consistent list. An article with no category information
 * yields `[]`, never a default such as `'other'`.
 */
const resolveAllCategories = (enrichment) => {
    const primary = (0, exports.resolvePrimaryCategory)(enrichment);
    const secondary = (0, exports.resolveSecondaryCategories)(enrichment);
    return primary === undefined ? secondary : [primary, ...secondary];
};
exports.resolveAllCategories = resolveAllCategories;
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
const normalizeCountriesAbout = (value) => {
    if (!Array.isArray(value))
        return [];
    const seen = new Set();
    const result = [];
    for (const entry of value) {
        if (typeof entry !== 'string')
            continue;
        if (!(0, exports.isCountryCode)(entry) || seen.has(entry))
            continue;
        seen.add(entry);
        result.push(entry);
    }
    return result;
};
exports.normalizeCountriesAbout = normalizeCountriesAbout;
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
const allowsFullTextHosting = (license) => {
    if (!license)
        return undefined;
    if (!(0, exports.isLicenseType)(license.type))
        return false;
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
exports.allowsFullTextHosting = allowsFullTextHosting;
/**
 * True when a licence makes a reuse claim with nothing behind it.
 *
 * Used by tests, and by any future import code, to flag an item that asserts
 * reuse without recording how that was established. An absent or `unknown`
 * licence never fails this check - only an unsupported *positive* claim does,
 * because declining to claim reuse is always safe.
 */
const hasUnverifiedReuseClaim = (license) => {
    if (!license)
        return false;
    if (!(0, exports.isLicenseType)(license.type))
        return true;
    if (license.type === 'creative-commons' || license.type === 'public-domain') {
        const hasIdentifier = typeof license.id === 'string' && license.id.trim().length > 0;
        const hasEvidence = typeof license.permissionEvidence === 'string' && license.permissionEvidence.trim().length > 0;
        if (!hasIdentifier && !hasEvidence)
            return true;
    }
    return false;
};
exports.hasUnverifiedReuseClaim = hasUnverifiedReuseClaim;
/**
 * True when an enrichment records provenance and reuse terms that a later
 * reader could actually act on.
 *
 * This is a *check*, never a way to manufacture the missing facts: it reports
 * what is recorded and returns false otherwise. It exists so that a future
 * crawler or import step can be tested for honesty without a human re-reading
 * every entry.
 */
const hasVerifiedProvenance = (enrichment) => {
    if (!enrichment)
        return false;
    if (!enrichment.source || typeof enrichment.source.name !== 'string')
        return false;
    if (!enrichment.source.name.trim())
        return false;
    if (!enrichment.license)
        return false;
    if ((0, exports.hasUnverifiedReuseClaim)(enrichment.license))
        return false;
    return true;
};
exports.hasVerifiedProvenance = hasVerifiedProvenance;
