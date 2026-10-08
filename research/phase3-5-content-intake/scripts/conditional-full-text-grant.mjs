/**
 * VOA Learning English producer-grant rights rule (Phase 3.5 -> Phase 4.0).
 *
 * Purpose
 * -------
 * The official VOA Learning English reuse policy
 * (https://learningenglish.voanews.com/p/6861.html, mirrored in this repository's
 * source-policy fixture) grants public-domain reuse of Learning English material
 * *produced by VOA*, with credit to learningenglish.voanews.com, and separately
 * excludes copyrighted AP / Reuters / AFP and other agency material.
 *
 * Before this module the pipeline demanded a separate item-level license or rights
 * document for every article, so VOA-produced Learning English articles were blocked
 * only because no per-article rights document exists for them. This module encodes
 * the narrower, evidence-based rule instead:
 *
 *     official VOA reuse policy
 *   + the article is produced by VOA Learning English
 *   + the article carries no third-party copyright attribution
 *   => rights are sufficient for verified full-text reuse
 *
 * Hard safety properties (unchanged by this rule)
 * -----------------------------------------------
 * - The source-policy ceiling is NOT removed. The grant is additive and applies
 *   only on top of a source policy that carries `conditionalFullText`.
 * - `restricted` / `not-allowed` source policies still veto everything.
 * - Third-party attribution is never overridden by the VOA domain. It is a hard
 *   block: the record must be `rejected`, never merely awaiting review.
 * - No source other than the one named by the policy grant receives this rule.
 * - Nothing here contacts the network, fabricates evidence, or repairs input.
 */

export const VOA_LEARNING_ENGLISH_HOST = 'learningenglish.voanews.com';

/**
 * Attribution surfaces scanned for third-party copyright credit. The captured policy
 * excerpt is deliberately excluded: the official VOA policy statement itself names
 * AP, Reuters and AFP as excluded agencies, so scanning it would be meaningless.
 * The article body is also excluded here; body-level credit review stays a human
 * step recorded through `reviewStatus: rejected` with rejection reasons.
 */
export const ATTRIBUTION_SURFACE_FIELDS = Object.freeze(['authors', 'title', 'attributionText']);

/**
 * Third-party sources that hold their own copyright over republished material.
 * Patterns are matched against the normalized attribution surfaces above.
 * The bare token "AP" is only matched in unambiguous credit forms
 * (for example "(AP)", "AP Photo", "AP News", "AP wire") because VOA Learning
 * English itself publishes an "AP English" course series.
 */
export const THIRD_PARTY_ATTRIBUTION_SOURCES = Object.freeze([
  {
    id: 'associated-press',
    label: 'Associated Press (AP)',
    patterns: [/\bassociated\s+press\b/i, /\(ap\)/i, /\bap\s+(?:photo|photos|news|wire|reporter|staff)\b/i, /^ap$/i],
  },
  {
    id: 'reuters',
    label: 'Reuters',
    patterns: [/\breuters\b/i, /\bthomson\s+reuters\b/i],
  },
  {
    id: 'afp',
    label: 'AFP / Agence France-Presse',
    patterns: [/\bafp\b/i, /\bagence\s+france[-\s]?presse?\b/i],
  },
  {
    id: 'upi',
    label: 'United Press International',
    patterns: [/\bunited\s+press\s+international\b/i, /\bupi\b/i],
  },
  {
    id: 'epa-news',
    label: 'EPA (news agency)',
    patterns: [/\(epa\)/i, /\bepa\s+(?:photo|news|wire)\b/i],
  },
  {
    id: 'xinhua',
    label: 'Xinhua',
    patterns: [/\bxinhua\b/i],
  },
  {
    id: 'getty-images',
    label: 'Getty Images',
    patterns: [/\bgetty\s+images\b/i, /\bgettyimages\b/i],
  },
  {
    id: 'bloomberg',
    label: 'Bloomberg',
    patterns: [/\bbloomberg\b/i],
  },
  {
    id: 'third-party-credit-line',
    label: 'third-party credit line',
    patterns: [/\bcourtesy\s+of\b/i, /\blicensed\s+(?:from|by)\b/i, /\bwith\s+permission\s+from\b/i],
  },
]);

const nonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

export const normalizeText = (value) => (typeof value === 'string'
  ? value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()
  : '');

export const parseHttpUrl = (value) => {
  if (!nonEmptyString(value) || /\s/.test(value)) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    url.hash = '';
    return url;
  } catch {
    return null;
  }
};

export const normalizeHttpUrl = (value) => {
  const url = parseHttpUrl(value);
  return url ? url.href : null;
};

const hostIsWithin = (value, allowedHosts) => {
  const url = parseHttpUrl(value);
  if (!url) return false;
  const host = url.hostname.toLowerCase();
  return (Array.isArray(allowedHosts) ? allowedHosts : []).some((allowed) => {
    const normalized = String(allowed).toLowerCase();
    return host === normalized || host.endsWith(`.${normalized}`);
  });
};
/**
 * Report every third-party copyright credit found on the supplied attribution
 * surfaces. Returns one finding per (source, field, value) so a reviewer can see
 * exactly which byline or credit line caused the block.
 */
export const detectThirdPartyAttribution = ({ authors, title, attributionText } = {}) => {
  const findings = [];
  const surfaces = [
    { field: 'authors', values: Array.isArray(authors) ? authors : [] },
    { field: 'title', values: nonEmptyString(title) ? [title] : [] },
    { field: 'attributionText', values: nonEmptyString(attributionText) ? [attributionText] : [] },
  ];
  for (const { field, values } of surfaces) {
    for (const value of values) {
      if (!nonEmptyString(value)) continue;
      const haystack = normalizeText(value);
      for (const source of THIRD_PARTY_ATTRIBUTION_SOURCES) {
        if (source.patterns.some((pattern) => pattern.test(haystack))) {
          findings.push({ sourceId: source.id, label: source.label, field, value });
        }
      }
    }
  }
  return findings;
};

/**
 * Report every third-party copyright credit found on the supplied attribution
 * surfaces. Returns one finding per (source, field, value) so a reviewer can see
 * exactly which byline or credit line caused the block.
 */
/** A byline credit that names VOA / VOA Learning English / Voice of America. */
export const detectVoaProducerCredit = ({ authors } = {}) => {
  const credits = (Array.isArray(authors) ? authors : []).filter(nonEmptyString).map(normalizeText).filter(Boolean);
  return credits.some((credit) => (
    credit === 'voa'
    || credit === 'voa learning english'
    || credit === 'voice of america'
    || /\bvoa\s+learning\s+english\b/.test(credit)
    || /\bvoice\s+of\s+america\b/.test(credit)
    || /\bvoa\s+(?:staff|correspondent|news)\b/.test(credit)
    || /\bfor\s+voa\b/.test(credit)
  ));
};

/** Structural validation of the optional `conditionalFullText` policy block. */
export const validateConditionalFullText = (policy) => {
  const problems = [];
  const grant = policy?.conditionalFullText;
  if (grant === undefined || grant === null) return problems;
  if (typeof grant !== 'object' || Array.isArray(grant)) {
    problems.push('conditionalFullText must be an object.');
    return problems;
  }
  if (!nonEmptyString(grant.grantId)) problems.push('conditionalFullText.grantId must be a non-empty string.');
  if (!normalizeHttpUrl(grant.policyEvidenceUrl)) {
    problems.push('conditionalFullText.policyEvidenceUrl must be an absolute HTTP(S) URL.');
  }
  if (!Array.isArray(grant.allowedHosts) || grant.allowedHosts.length === 0
    || grant.allowedHosts.some((host) => !nonEmptyString(host))) {
    problems.push('conditionalFullText.allowedHosts must be a non-empty array of non-empty host strings.');
  }
  if (!nonEmptyString(grant.requiredAttributionText)) {
    problems.push('conditionalFullText.requiredAttributionText must be a non-empty string.');
  }
  return problems;
};

/**
 * Evaluate the conditional producer grant for one record.
 *
 * `appliesToSource`  the source policy actually declares a conditional grant.
 * `requestedFullText` the record asks for verified full-text reuse.
 * `thirdParty`      third-party copyright credit found on attribution surfaces.
 * `granted`         every grant condition holds and no third-party credit exists.
 *
 * `granted` only ever widens the ceiling the source policy already permits. It never
 * bypasses the source-policy check itself and never invents evidence.
 */
export const evaluateConditionalFullTextGrant = ({
  policy,
  sourceId,
  canonicalUrl,
  title,
  authors,
  attributionRequired,
  attributionText,
  rightsEvidenceUrl,
  rightsEvidenceExcerpt,
  reuseMode,
  reviewStatus,
} = {}) => {
  const declared = policy && typeof policy === 'object' && !Array.isArray(policy)
    ? policy.conditionalFullText
    : undefined;
  const appliesToSource = Boolean(declared) && sourceId === policy.sourceId;
  const requestedFullText = reuseMode === 'verified-full-text';
  const thirdParty = detectThirdPartyAttribution({ authors, title, attributionText });
  const result = {
    appliesToSource,
    requestedFullText,
    grantId: appliesToSource ? declared.grantId : null,
    policyEvidenceUrl: appliesToSource && nonEmptyString(declared.policyEvidenceUrl) ? declared.policyEvidenceUrl : null,
    thirdParty,
    thirdPartyBlocked: appliesToSource && thirdParty.length > 0 && reviewStatus !== 'rejected',
    granted: false,
    reasons: [],
  };
  if (!appliesToSource || !requestedFullText) return result;

  const allowedHosts = Array.isArray(declared.allowedHosts) ? declared.allowedHosts : [];
  const reasons = [];
  if (!hostIsWithin(canonicalUrl, allowedHosts)) {
    reasons.push(`canonicalUrl is not on an approved host (${allowedHosts.join(', ') || 'none declared'}).`);
  }
  if (!detectVoaProducerCredit({ authors })) {
    reasons.push('no byline/author credit identifies VOA Learning English or VOA as the producer.');
  }
  if (thirdParty.length > 0) {
    const labels = [...new Set(thirdParty.map((finding) => finding.label))].join(', ');
    reasons.push(`third-party copyright attribution detected (${labels}); the VOA domain cannot override it.`);
  }
  if (!hostIsWithin(rightsEvidenceUrl, allowedHosts)) {
    reasons.push('rightsEvidenceUrl must be recorded on an approved host as the official source-policy evidence.');
  }
  if (!nonEmptyString(rightsEvidenceExcerpt)) {
    reasons.push('rightsEvidenceExcerpt must record the captured official source-policy statement.');
  }
  if (attributionRequired !== true || !nonEmptyString(attributionText)) {
    reasons.push('the official policy requires credit; attributionRequired must be true with attribution text.');
  }

  result.reasons = reasons;
  result.granted = reasons.length === 0;
  return result;
};

/**
 * The reuse ceiling that applies to one record. The conditional grant can raise the
 * ceiling to verified full text for a qualifying record; it can never lower the
 * policy's own ceiling and never applies to a policy without the grant block.
 */
export const effectiveCeilingMode = (policy, grant) => (
  grant?.granted === true && policy?.maxReuseMode !== 'restricted' ? 'verified-full-text' : policy?.maxReuseMode
);