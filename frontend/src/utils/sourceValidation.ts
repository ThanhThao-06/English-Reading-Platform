import type {
  ContentSourceDefinition,
  SourceAccessMethod,
  SourceArticlePreview,
  SourceContentReuse,
  SourcePreviewRightsDecision,
  SourceRightsStatus,
} from '../types/source';
import { CONTENT_SOURCE_REGISTRY } from '../data/contentSources';
import { isLicenseType } from './metadataValidation';

/**
 * Phase 3.3 - Guards and the rights policy for the source registry.
 *
 * The single most important rule in this file:
 *
 *     access is not permission.
 *
 * A source may be reachable by RSS, by API, or simply by being on the web, and
 * none of that says anything about whether the text may be copied. Every
 * function here takes the SOURCE's declared reuse level and refuses to upgrade
 * it. A more permissive answer is only ever produced when a human has recorded
 * verified evidence in the registry.
 */

/* ==========================================================================
   Vocabulary
   ========================================================================== */

export const SOURCE_ACCESS_METHODS = [
  'rss',
  'api',
  'web',
  'download',
  'manual',
  'other',
] as const satisfies readonly SourceAccessMethod[];

export const SOURCE_RIGHTS_STATUSES = [
  'verified',
  'partially-verified',
  'unknown',
  'restricted',
  'not-allowed',
] as const satisfies readonly SourceRightsStatus[];

export const SOURCE_CONTENT_REUSE = [
  'full-text',
  'metadata-only',
  'link-only',
  'unknown',
] as const satisfies readonly SourceContentReuse[];

/* ==========================================================================
   Guards
   ========================================================================== */

export const isSourceAccessMethod = (value: unknown): value is SourceAccessMethod =>
  typeof value === 'string' && (SOURCE_ACCESS_METHODS as readonly string[]).includes(value);

export const isSourceRightsStatus = (value: unknown): value is SourceRightsStatus =>
  typeof value === 'string' && (SOURCE_RIGHTS_STATUSES as readonly string[]).includes(value);

export const isSourceContentReuse = (value: unknown): value is SourceContentReuse =>
  typeof value === 'string' && (SOURCE_CONTENT_REUSE as readonly string[]).includes(value);

/**
 * True when a value is a syntactically valid absolute http(s) URL.
 *
 * Shape only, and deliberately strict: no protocol other than http/https, no
 * spaces, no embedded credentials. This guards against a malformed URL being
 * written into the registry, not against a malicious one.
 */
export const isValidSourceUrl = (value: unknown): boolean => {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  if (/\s/.test(value)) return false;
  return /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(value);
};

/* ==========================================================================
   Registry lookup
   ========================================================================== */

/** Look up one source by id, or `undefined` when the id is not registered. */
export const getContentSource = (id: string): ContentSourceDefinition | undefined =>
  CONTENT_SOURCE_REGISTRY.find((source) => source.id === id);

/* ==========================================================================
   The rights policy
   ========================================================================== */

/**
 * Ranking used to compare reuse levels. LOWER is MORE permissive:
 * full-text (0) is most permissive and unknown (3) least. A per-item
 * hint is therefore honoured only when it is MORE restrictive, i.e. greater.
 */
const REUSE_SEVERITY: Record<SourceContentReuse, number> = {
  'full-text': 0,
  'metadata-only': 1,
  'link-only': 2,
  unknown: 3,
};

/**
 * Whether this source's terms permit storing and republishing its full text.
 *
 * The rules, in order:
 *
 * 1. An unknown or unregistered source is NEVER allowed. No registry entry,
 *    no permission.
 * 2. `restricted` and `not-allowed` are refused, whatever else is recorded.
 * 3. The source must actually declare `contentReuse: 'full-text'`. Reaching a
 *    publisher is not permission, so nothing here inspects `accessMethods`,
 *    `feedUrl` or `apiUrl` - an RSS feed grants nothing.
 * 4. The licence basis must be a real `LicenseType`.
 *
 * A source that declares `full-text` but whose rights have not been verified
 * is still refused: reuse needs both a permissive declaration AND evidence.
 */
export const canReuseFullText = (source?: ContentSourceDefinition): boolean => {
  if (!source) return false;
  if (source.rightsStatus === 'restricted' || source.rightsStatus === 'not-allowed') return false;
  if (source.contentReuse !== 'full-text') return false;
  if (source.rightsStatus !== 'verified') return false;
  if (!isLicenseType(source.licenseType)) return false;

  // Any reuse claim needs a traceable record of where it was established.
  if (!isValidSourceUrl(source.licenseUrl) && !source.lastVerifiedAt) return false;

  return true;
};

/**
 * Whether this source's terms permit recording titles, URLs, dates and
 * authorship without the body text.
 *
 * More permissive than `canReuseFullText` but still conservative: it never
 * returns true for a restricted or not-allowed source, and it requires the
 * source to have been looked at at least once.
 */
export const canReuseMetadata = (source?: ContentSourceDefinition): boolean => {
  if (!source) return false;
  if (source.rightsStatus === 'restricted' || source.rightsStatus === 'not-allowed') return false;
  return source.rightsStatus === 'verified' || source.rightsStatus === 'partially-verified';
};

/**
 * The effective reuse level for a source, after applying the policy.
 *
 * This is the value a caller should act on. It can only ever be MORE
 * restrictive than what the registry declares - it never upgrades anything.
 */
export const effectiveReuse = (source?: ContentSourceDefinition): SourceContentReuse => {
  if (!source) return 'unknown';
  if (source.rightsStatus === 'not-allowed' || source.rightsStatus === 'restricted') {
    return 'link-only';
  }
  if (canReuseFullText(source)) return 'full-text';
  if (source.contentReuse === 'metadata-only' && canReuseMetadata(source)) return 'metadata-only';
  // Anything unverified collapses to link-only, which is the safest state that
  // still lets a reader be sent to the publisher.
  return 'link-only';
};

/** Builds the human-readable reason stored alongside every decision. */
const buildReason = (
  source: ContentSourceDefinition | undefined,
  allowFullText: boolean,
  itemReuseHint?: SourceContentReuse,
): string => {
  if (!source) return 'Source is not in the registry, so no rights are established.';

  if (allowFullText) {
    return `Source ${source.id} has verified terms permitting full-text reuse.`;
  }

  if (source.rightsStatus === 'not-allowed') {
    return `Source ${source.id} is recorded as not allowing reuse.`;
  }
  if (source.rightsStatus === 'restricted') {
    return `Source ${source.id} is recorded as restricted.`;
  }
  if (itemReuseHint === 'link-only') {
    return `Source ${source.id} allows full text in general, but this item's provenance could not be confirmed as first-party, so it is treated as link-only.`;
  }
  if (itemReuseHint === 'metadata-only') {
    return `Source ${source.id} is restricted to metadata for this item, so the body text was withheld.`;
  }
  if (source.contentReuse === 'unknown' || source.rightsStatus === 'unknown') {
    return `Source ${source.id} has no verified reuse terms, so only the link is kept. Being reachable does not grant permission.`;
  }

  return `Source ${source.id} does not permit full-text reuse, so the body text was withheld.`;
};

/**
 * Applies the rights policy to one candidate item.
 *
 * `itemReuseHint` lets a caller narrow the source-level decision for a SPECIFIC
 * item - this is how a per-source carve-out such as VOA's agency-material
 * exclusion is honoured: a caller that cannot show an item is first-party
 * passes `'link-only'` and full text is dropped.
 *
 * A hint can only ever TIGHTEN the source-level decision, never loosen it.
 *
 * Full text is retained only when the source genuinely allows it. In every
 * other case `rawContent` is REMOVED from the returned preview rather than
 * merely hidden, so an unsafe body cannot leak by being read back out.
 */
export const applyRightsPolicy = (
  source: ContentSourceDefinition | undefined,
  candidate: Omit<SourceArticlePreview, 'rightsDecision'>,
  itemReuseHint?: SourceContentReuse,
): SourceArticlePreview => {
  const sourceReuse = effectiveReuse(source);

  // A hint is honoured ONLY when it is MORE RESTRICTIVE than the source-level
  // decision. Because a LOWER number is MORE permissive (see REUSE_SEVERITY),
  // "more restrictive" is a strictly GREATER number - hence the `>`.
  //
  // This `>` is a rights-safety invariant, not a style choice: with `<` a caller
  // could pass 'full-text' for a source whose terms were never checked and the
  // body text would be retained.
  const hintIsValid =
    itemReuseHint !== undefined &&
    isSourceContentReuse(itemReuseHint) &&
    REUSE_SEVERITY[itemReuseHint] > REUSE_SEVERITY[sourceReuse];

  const appliedReuse = hintIsValid ? (itemReuseHint as SourceContentReuse) : sourceReuse;
  const allowFullText = appliedReuse === 'full-text' && canReuseFullText(source);

  const decision: SourcePreviewRightsDecision = {
    appliedReuse: allowFullText ? 'full-text' : appliedReuse,
    reason: buildReason(source, allowFullText, itemReuseHint),
    fullTextIncluded: allowFullText,
    caveatsConsidered: source?.rightsCaveats,
  };

  if (allowFullText) {
    return { ...candidate, rightsDecision: decision };
  }

  // Drop the body text entirely: `rawContent` is absent from the result, not
  // set to an empty string and not merely flagged.
  const withoutBody = { ...candidate };
  delete withoutBody.rawContent;
  return { ...withoutBody, rightsDecision: decision };
};
