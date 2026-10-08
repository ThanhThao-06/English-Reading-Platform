import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  effectiveCeilingMode,
  evaluateConditionalFullTextGrant,
  validateConditionalFullText,
} from './conditional-full-text-grant.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const INTAKE_ROOT = resolve(SCRIPT_DIR, '..');

const RIGHTS_STATUSES = new Set(['verified', 'partially-verified', 'unknown', 'restricted', 'not-allowed']);
const RIGHTS_BASES = new Set(['public-domain', 'license', 'permission']);
const REUSE_MODES = new Set(['verified-full-text', 'metadata-only', 'link-only', 'unknown', 'restricted']);
const CONTENT_TYPES = new Set(['news', 'editorial', 'educational', 'expository', 'short-story', 'novel', 'classic-literature', 'poetry', 'dialogue', 'other']);
const CONTENT_GROUPS = new Set(['articles', 'encyclopedia', 'specialized', 'short-story', 'novel', 'classic-literature']);
const CATEGORIES = new Set(['science', 'technology', 'business', 'finance', 'healthcare', 'history', 'culture', 'environment', 'education', 'psychology', 'travel', 'sports', 'society', 'politics', 'literature', 'language-learning', 'food', 'art', 'career', 'other']);
const REVIEW_STATUSES = new Set(['received', 'needs-source-review', 'needs-rights-review', 'needs-quality-review', 'approved', 'rejected']);
const LIBRARY_LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const LIBRARY_GENRES = new Set([
  'News & Social Issues',
  'Science & Nature',
  'Technology & AI',
  'Business & Economics',
  'Health & Psychology',
  'Culture, Art & Travel',
  'Stories & Literature',
  'Education',
  'History',
  'Environment',
  'Law & Politics',
]);
const LIBRARY_READING_TIMES = new Set(['Under 3 min', '5–10 min', 'Chapter']);
const ASSET_TYPES = new Set(['image', 'figure', 'table', 'audio', 'video', 'supplementary', 'other']);
const ASSET_DISPOSITIONS = new Set(['retain', 'exclude']);
const REUSE_RANK = new Map([['unknown', 0], ['restricted', -1], ['link-only', 1], ['metadata-only', 2], ['verified-full-text', 3]]);
const REQUIRED_FIELDS = ['recordId', 'sourceId', 'title', 'canonicalUrl', 'receivedAt', 'rightsStatus', 'reuseMode', 'attributionRequired', 'reviewStatus'];
const RECORD_FIELDS = new Set([
  ...REQUIRED_FIELDS, 'mediaAssets', 'testOnly', 'doi', 'externalId', 'authors', 'publishedAt', 'contentType',
  'classification', 'sourceName', 'sourceUrl', 'language', 'description', 'libraryPresentation',
  'rightsBasis', 'itemLicenseUrl', 'licenseType', 'licenseIdentifier', 'rightsEvidenceUrl', 'rightsEvidenceExcerpt',
  'attributionText', 'body', 'reviewNotes', 'rejectionReasons',
]);

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

export const normalizeHttpUrl = (value) => {
  if (typeof value !== 'string' || !value.trim() || /\s/.test(value)) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
  if (record.libraryPresentation !== undefined) {
    const presentation = record.libraryPresentation;
    if (!isObject(presentation)) {
      addIssue(issues, record, 'SCHEMA_FIELD_TYPE', 'libraryPresentation must be an object.', 'libraryPresentation');
    } else {
      for (const field of ['description', 'level', 'genre', 'readingTime']) {
        if (!isNonEmptyString(presentation[field])) {
          addIssue(issues, record, 'SCHEMA_FIELD_REQUIRED', `libraryPresentation.${field} must be supplied from recorded metadata.`, `libraryPresentation.${field}`);
        }
      }
      if (Object.hasOwn(presentation, 'imageReference')
        && presentation.imageReference !== null
        && !isNonEmptyString(presentation.imageReference)) {
        addIssue(issues, record, 'ASSET_OMITTED_INVALID', 'Invalid image reference is omitted; text eligibility is unaffected.', 'libraryPresentation.imageReference', 'warning');
      }
      if (isNonEmptyString(presentation.level) && !LIBRARY_LEVELS.has(presentation.level)) {
        addIssue(issues, record, 'SCHEMA_ENUM', 'libraryPresentation.level is unsupported.', 'libraryPresentation.level');
      }
      if (isNonEmptyString(presentation.genre) && !LIBRARY_GENRES.has(presentation.genre)) {
        addIssue(issues, record, 'SCHEMA_ENUM', 'libraryPresentation.genre is unsupported.', 'libraryPresentation.genre');
      }
      if (isNonEmptyString(presentation.readingTime) && !LIBRARY_READING_TIMES.has(presentation.readingTime)) {
        addIssue(issues, record, 'SCHEMA_ENUM', 'libraryPresentation.readingTime is unsupported.', 'libraryPresentation.readingTime');
      }
    }
  }
};

const validDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const addIssue = (issues, record, code, message, field, severity = 'error') => {
  issues.push({
    code,
    message,
    field,
    severity,
    recordId: isNonEmptyString(record?.recordId) ? record.recordId : null,
  });
};

const checkStringArray = (value, field, issues, record, { required = false, unique = false } = {}) => {
  if (value === undefined && !required) return;
  if (!Array.isArray(value)) {
    addIssue(issues, record, 'SCHEMA_FIELD_TYPE', `${field} must be an array of non-empty strings.`, field);
    return;
  }
  const seen = new Set();
  value.forEach((entry, index) => {
    if (!isNonEmptyString(entry)) {
      addIssue(issues, record, 'SCHEMA_FIELD_TYPE', `${field}[${index}] must be a non-empty string.`, `${field}[${index}]`);
    }
    if (unique && typeof entry === 'string') {
      const normalized = entry.trim().toLocaleLowerCase('en-US');
      if (seen.has(normalized)) addIssue(issues, record, 'SCHEMA_ENUM', `${field} must not contain duplicate values.`, field);
      seen.add(normalized);
    }
  });
};

const validateRecordShape = (record, issues) => {
  if (!isObject(record)) {
    addIssue(issues, null, 'SCHEMA_RECORD_TYPE', 'Each intake record must be a JSON object.', '$');
    return false;
  }
  for (const field of REQUIRED_FIELDS) {
    if (!Object.hasOwn(record, field)) {
      const mediaField = field === 'mediaAssets';
      addIssue(issues, record, mediaField ? 'ASSET_OMITTED_METADATA_MISSING' : 'SCHEMA_REQUIRED_FIELD',
        mediaField ? 'No media assets were supplied; text eligibility is unaffected.' : `Required field "${field}" is missing.`,
        field, mediaField ? 'warning' : 'error');
    }
  }
  for (const field of Object.keys(record)) {
    if (!RECORD_FIELDS.has(field)) addIssue(issues, record, 'SCHEMA_UNKNOWN_FIELD', `Field "${field}" is not defined by the intake schema.`, field);
  }
  for (const field of ['recordId', 'sourceId', 'title', 'canonicalUrl', 'receivedAt', 'rightsStatus', 'reuseMode', 'reviewStatus']) {
    if (Object.hasOwn(record, field) && !isNonEmptyString(record[field])) {
      addIssue(issues, record, 'SCHEMA_FIELD_TYPE', `${field} must be a non-empty string.`, field);
    }
  }
  for (const [field, allowed] of [
    ['rightsStatus', RIGHTS_STATUSES],
    ['reuseMode', REUSE_MODES],
    ['reviewStatus', REVIEW_STATUSES],
    ['rightsBasis', RIGHTS_BASES],
  ]) {
    if (Object.hasOwn(record, field) && !allowed.has(record[field])) {
      addIssue(issues, record, 'SCHEMA_ENUM', `${field} has an unsupported value.`, field);
    }
  }
  if (Object.hasOwn(record, 'attributionRequired') && typeof record.attributionRequired !== 'boolean') {
    addIssue(issues, record, 'SCHEMA_FIELD_TYPE', 'attributionRequired must be boolean.', 'attributionRequired');
  }
  if (Object.hasOwn(record, 'testOnly') && typeof record.testOnly !== 'boolean') {
    addIssue(issues, record, 'SCHEMA_FIELD_TYPE', 'testOnly must be boolean when supplied.', 'testOnly');
  }
  if (Object.hasOwn(record, 'mediaAssets') && !Array.isArray(record.mediaAssets)) {
    addIssue(issues, record, 'ASSET_OMITTED_INVALID', 'Invalid media metadata is omitted; text eligibility is unaffected.', 'mediaAssets', 'warning');
  }
  for (const field of ['doi', 'externalId', 'publishedAt', 'rightsBasis', 'itemLicenseUrl', 'licenseType', 'licenseIdentifier', 'rightsEvidenceUrl', 'rightsEvidenceExcerpt', 'attributionText', 'body', 'sourceName', 'language', 'description']) {
    if (Object.hasOwn(record, field) && typeof record[field] !== 'string') {
      addIssue(issues, record, 'SCHEMA_FIELD_TYPE', `${field} must be a string when supplied.`, field);
    }
  }
  checkStringArray(record.authors, 'authors', issues, record, { unique: true });
  checkStringArray(record.reviewNotes, 'reviewNotes', issues, record);
  checkStringArray(record.rejectionReasons, 'rejectionReasons', issues, record);

  if (record.contentType !== undefined && !CONTENT_TYPES.has(record.contentType)) {
    addIssue(issues, record, 'SCHEMA_ENUM', 'contentType has an unsupported value.', 'contentType');
  }
  if (record.classification !== undefined) {
    if (!isObject(record.classification)) {
      addIssue(issues, record, 'SCHEMA_FIELD_TYPE', 'classification must be an object.', 'classification');
    } else {
      for (const key of Object.keys(record.classification)) {
        if (!['contentGroup', 'primaryCategory', 'secondaryCategories'].includes(key)) {
          addIssue(issues, record, 'SCHEMA_UNKNOWN_FIELD', `classification.${key} is not supported.`, `classification.${key}`);
        }
      }
      if (record.classification.contentGroup !== undefined && !CONTENT_GROUPS.has(record.classification.contentGroup)) {
        addIssue(issues, record, 'SCHEMA_ENUM', 'classification.contentGroup has an unsupported value.', 'classification.contentGroup');
      }
      for (const field of ['primaryCategory']) {
        if (record.classification[field] !== undefined && !CATEGORIES.has(record.classification[field])) {
          addIssue(issues, record, 'SCHEMA_ENUM', `classification.${field} has an unsupported value.`, `classification.${field}`);
        }
      }
      if (record.classification.secondaryCategories !== undefined) {
        const categories = record.classification.secondaryCategories;
        if (!Array.isArray(categories) || categories.some((category) => !CATEGORIES.has(category))) {
          addIssue(issues, record, 'SCHEMA_ENUM', 'classification.secondaryCategories must contain supported categories.', 'classification.secondaryCategories');
        } else if (new Set(categories).size !== categories.length) {
          addIssue(issues, record, 'SCHEMA_ENUM', 'classification.secondaryCategories must not contain duplicates.', 'classification.secondaryCategories');
        }
      }
    }
  }

  if (Array.isArray(record.mediaAssets)) {
    record.mediaAssets.forEach((asset, index) => {
      const field = `mediaAssets[${index}]`;
      if (!isObject(asset)) {
        addIssue(issues, record, 'ASSET_OMITTED_INVALID', `${field} is omitted because it is not an object.`, field, 'warning');
        return;
      }
      for (const required of ['assetId', 'assetType', 'rightsStatus', 'disposition']) {
        if (!Object.hasOwn(asset, required)) addIssue(issues, record, 'ASSET_OMITTED_INVALID', `${field}.${required} is missing; this asset is omitted.`, `${field}.${required}`, 'warning');
      }
      for (const key of Object.keys(asset)) {
        if (!['assetId', 'assetType', 'rightsStatus', 'disposition', 'evidenceUrl', 'attributionRequired', 'attributionText'].includes(key)) {
          addIssue(issues, record, 'ASSET_OMITTED_INVALID', `${field}.${key} is unsupported; this asset is omitted.`, `${field}.${key}`, 'warning');
        }
      }
      if (!isNonEmptyString(asset.assetId)) addIssue(issues, record, 'ASSET_OMITTED_INVALID', `${field}.assetId must be a non-empty string; this asset is omitted.`, `${field}.assetId`, 'warning');
      if (!ASSET_TYPES.has(asset.assetType)) addIssue(issues, record, 'ASSET_OMITTED_INVALID', `${field}.assetType is unsupported; this asset is omitted.`, `${field}.assetType`, 'warning');
      if (!RIGHTS_STATUSES.has(asset.rightsStatus)) addIssue(issues, record, 'ASSET_OMITTED_INVALID', `${field}.rightsStatus is unsupported; this asset is omitted.`, `${field}.rightsStatus`, 'warning');
      if (!ASSET_DISPOSITIONS.has(asset.disposition)) addIssue(issues, record, 'ASSET_OMITTED_INVALID', `${field}.disposition is unsupported; this asset is omitted.`, `${field}.disposition`, 'warning');
      if (asset.attributionRequired !== undefined && typeof asset.attributionRequired !== 'boolean') {
        addIssue(issues, record, 'ASSET_OMITTED_INVALID', `${field}.attributionRequired must be boolean; this asset is omitted.`, `${field}.attributionRequired`, 'warning');
      }
      for (const optional of ['evidenceUrl', 'attributionText']) {
        if (asset[optional] !== undefined && typeof asset[optional] !== 'string') {
          addIssue(issues, record, 'ASSET_OMITTED_INVALID', `${field}.${optional} must be a string; this asset is omitted.`, `${field}.${optional}`, 'warning');
        }
      }
    });
  }
  return true;
};

const validatePolicySet = (policies, issues) => {
  const policyBySource = new Map();
  if (!Array.isArray(policies)) {
    issues.push({ code: 'SOURCE_POLICY_INVALID', message: 'Source policies must be an array.', field: 'policies', severity: 'error', recordId: null });
    return policyBySource;
  }
  for (const [index, policy] of policies.entries()) {
    const field = `policies[${index}]`;
    if (!isObject(policy)
      || !isNonEmptyString(policy.sourceId)
      || !RIGHTS_STATUSES.has(policy.rightsStatus)
      || !REUSE_MODES.has(policy.maxReuseMode)
      || typeof policy.synthetic !== 'boolean') {
      issues.push({ code: 'SOURCE_POLICY_INVALID', message: `${field} requires sourceId, valid rightsStatus and maxReuseMode, and a synthetic boolean.`, field, severity: 'error', recordId: null });
      continue;
    }
    if (policy.maxReuseMode === 'verified-full-text' && policy.rightsStatus !== 'verified') {
      issues.push({ code: 'SOURCE_POLICY_INVALID', message: `${field} cannot declare full-text without verified source rights.`, field, severity: 'error', recordId: null });
    }
    if (policy.synthetic === true && policy.conditionalFullText) {
      issues.push({ code: 'SOURCE_POLICY_INVALID', message: `${field} cannot grant conditional full text for synthetic test data.`, field: `${field}.conditionalFullText`, severity: 'error', recordId: null });
    }
    for (const problem of validateConditionalFullText(policy)) {
      issues.push({ code: 'SOURCE_POLICY_INVALID', message: `${field}.${problem}`, field: `${field}.conditionalFullText`, severity: 'error', recordId: null });
    }
    if (policyBySource.has(policy.sourceId)) {
      issues.push({ code: 'SOURCE_POLICY_INVALID', message: `Duplicate policy for sourceId "${policy.sourceId}".`, field: `${field}.sourceId`, severity: 'error', recordId: null });
      continue;
    }
    policyBySource.set(policy.sourceId, policy);
  }
  return policyBySource;
};

const normalizeDoi = (value) => value.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').toLocaleLowerCase('en-US');
const sourceScopedExternalId = (record) => {
  const sourceId = isNonEmptyString(record.sourceId) ? record.sourceId.trim().toLocaleLowerCase('en-US') : '';
  return `${sourceId}\u0000${record.externalId.trim().toLocaleLowerCase('en-US')}`;
};

export const validateIntake = (records, policies) => {
  const issues = [];
  const policyBySource = validatePolicySet(policies, issues);
  if (!Array.isArray(records)) {
    issues.push({ code: 'SCHEMA_RECORD_TYPE', message: 'Intake batch must contain a records array.', field: 'records', severity: 'error', recordId: null });
    return { valid: false, errors: issues, warnings: [], summary: { recordsChecked: 0, errorCount: issues.length, warningCount: 0 } };
  }

  const identifiers = new Map();
  const canonicalUrls = new Map();
  const recordIds = new Map();
  const perRecordIssues = [];

  records.forEach((record, index) => {
    const before = issues.length;
    const isRecord = validateRecordShape(record, issues);
    if (!isRecord) {
      perRecordIssues.push(issues.slice(before));
      return;
    }

    if (isNonEmptyString(record.recordId)) {
      if (recordIds.has(record.recordId)) addIssue(issues, record, 'DUPLICATE_RECORD_ID', 'recordId is duplicated in this intake batch.', 'recordId');
      else recordIds.set(record.recordId, index);
    }

    const canonical = normalizeHttpUrl(record.canonicalUrl);
    if (!canonical) {
      addIssue(issues, record, 'URL_INVALID', 'canonicalUrl must be an absolute HTTP(S) URL without credentials or whitespace.', 'canonicalUrl');
    } else if (canonicalUrls.has(canonical)) {
      addIssue(issues, record, 'URL_DUPLICATE', 'canonicalUrl duplicates another record after safe URL normalization.', 'canonicalUrl');
    } else {
      canonicalUrls.set(canonical, index);
    }

    for (const field of ['itemLicenseUrl', 'rightsEvidenceUrl', 'sourceUrl']) {
      if (record[field] !== undefined && !normalizeHttpUrl(record[field])) {
        addIssue(issues, record, 'URL_INVALID', `${field} must be an absolute HTTP(S) URL without credentials or whitespace.`, field);
      }
    }

    for (const field of ['doi', 'externalId']) {
      if (!isNonEmptyString(record[field])) continue;
      const normalized = field === 'doi' ? normalizeDoi(record[field]) : sourceScopedExternalId(record);
      const key = `${field}\u0000${normalized}`;
      if (identifiers.has(key)) addIssue(issues, record, 'IDENTIFIER_DUPLICATE', `${field} duplicates another record in this batch.`, field);
      else identifiers.set(key, index);
    }

    if (typeof record.receivedAt === 'string') {
      if (!validDate(record.receivedAt)) {
        addIssue(issues, record, 'DATE_INVALID', 'receivedAt must be a real calendar date in YYYY-MM-DD form.', 'receivedAt');
      } else if (Number(record.receivedAt.slice(0, 4)) < 1800) {
        addIssue(issues, record, 'DATE_UNREASONABLE', 'receivedAt is earlier than the supported historical range (1800).', 'receivedAt');
      } else if (record.receivedAt > new Date().toISOString().slice(0, 10)) {
        addIssue(issues, record, 'DATE_UNREASONABLE', 'receivedAt must not be in the future.', 'receivedAt');
      }
    }
    if (record.publishedAt !== undefined) {
      if (!validDate(record.publishedAt)) {
        addIssue(issues, record, 'DATE_INVALID', 'publishedAt must be a real calendar date in YYYY-MM-DD form.', 'publishedAt');
      } else if (Number(record.publishedAt.slice(0, 4)) < 1800
        || (validDate(record.receivedAt) && record.publishedAt > record.receivedAt)) {
        addIssue(issues, record, 'DATE_UNREASONABLE', 'publishedAt must be on or after 1800 and no later than receivedAt.', 'publishedAt');
      }
    }

    const policy = policyBySource.get(record.sourceId);
    const grant = evaluateConditionalFullTextGrant({
      policy,
      sourceId: record.sourceId,
      canonicalUrl: record.canonicalUrl,
      title: record.title,
      authors: record.authors,
      attributionRequired: record.attributionRequired,
      attributionText: record.attributionText,
      rightsEvidenceUrl: record.rightsEvidenceUrl,
      rightsEvidenceExcerpt: record.rightsEvidenceExcerpt,
      reuseMode: record.reuseMode,
      reviewStatus: record.reviewStatus,
    });
    const ceilingMode = effectiveCeilingMode(policy, grant);

    if (grant.thirdPartyBlocked) {
      const labels = [...new Set(grant.thirdParty.map((finding) => finding.label))].join(', ');
      addIssue(issues, record, 'THIRD_PARTY_CONTENT_BLOCKED', `Third-party copyrighted content is present (${labels}); a publisher-domain reuse policy cannot override another publisher's rights. This record must be rejected.`, 'authors');
    }

    if (record.rightsStatus === 'restricted'
      || record.rightsStatus === 'not-allowed'
      || record.reuseMode === 'restricted') {
      addIssue(issues, record, 'ITEM_RIGHTS_RESTRICTED', 'Item rights explicitly prohibit the requested reuse.', 'rightsStatus');
    }

    if (policy && (REUSE_RANK.get(policy.maxReuseMode) === -1
      || policy.rightsStatus === 'restricted'
      || policy.rightsStatus === 'not-allowed')) {
      addIssue(issues, record, 'SOURCE_POLICY_RESTRICTED', 'Source policy is restricted or not allowed and cannot be overridden by item evidence.', 'sourceId');
    } else if (policy && REUSE_RANK.has(record.reuseMode)
      && REUSE_RANK.get(record.reuseMode) > REUSE_RANK.get(ceilingMode)) {
      // When a conditional grant exists for this source and simply was not satisfied,
      // keep the stable SOURCE_POLICY_EXCEEDED code and add the specific reason.
      addIssue(issues, record, 'SOURCE_POLICY_EXCEEDED', 'Requested item reuse is broader than the source-policy ceiling.', 'reuseMode');
      if (grant.appliesToSource && record.reuseMode === 'verified-full-text' && !grant.thirdPartyBlocked) {
        addIssue(issues, record, 'CONDITIONAL_RIGHTS_NOT_MET', `The conditional full-text grant does not apply: ${grant.reasons.join(' ')}`, 'reuseMode');
      }
    }

    const hasBody = Object.hasOwn(record, 'body');
    if (record.reuseMode !== 'verified-full-text' || record.rightsStatus !== 'verified') {
      if (hasBody) addIssue(issues, record, 'BODY_NOT_ALLOWED', 'Body is not allowed unless item rights are verified and reuseMode is verified-full-text.', 'body');
      if (record.reuseMode === 'verified-full-text' && record.rightsStatus !== 'verified') {
        addIssue(issues, record, 'RIGHTS_STATUS_INSUFFICIENT', 'verified-full-text requires verified item-level rights status.', 'rightsStatus');
      }
    }
    if (record.reuseMode === 'verified-full-text') {
      const hasItemRightsBasis = RIGHTS_BASES.has(record.rightsBasis);
      if (!grant.granted && !hasItemRightsBasis) {
        addIssue(issues, record, 'RIGHTS_BASIS_REQUIRED', 'Full-text requires recorded item-level public-domain, reusable-license, or documented-permission basis.', 'rightsBasis');
      }
      const licenseFieldsMissing = record.rightsBasis === 'license'
        && (!isNonEmptyString(record.itemLicenseUrl)
          || !isNonEmptyString(record.licenseType)
          || !isNonEmptyString(record.licenseIdentifier));
      if ((licenseFieldsMissing)
        || !isNonEmptyString(record.rightsEvidenceUrl)
        || !isNonEmptyString(record.rightsEvidenceExcerpt)) {
        const evidenceMessage = grant.granted
          ? 'A conditional publisher grant still requires rightsEvidenceUrl and a captured excerpt naming the official source policy.'
          : licenseFieldsMissing
            ? 'A license-based full-text claim requires its item license URL, type, identifier, rights evidence URL, and captured excerpt.'
            : 'Full-text requires a rights evidence URL and captured excerpt supporting the recorded item-rights basis.';
        addIssue(issues, record, 'ITEM_RIGHTS_EVIDENCE_REQUIRED', evidenceMessage, 'rightsEvidenceUrl');
      }
      if (record.rightsBasis === 'license' && (!normalizeHttpUrl(record.itemLicenseUrl)
        || !isNonEmptyString(record.licenseType)
        || !isNonEmptyString(record.licenseIdentifier))) {
        addIssue(issues, record, 'FULL_TEXT_LICENSE_REQUIRED', 'License-based full-text requires a valid item-level license URL, type, and identifier.', 'itemLicenseUrl');
      }
      if (record.attributionRequired === true && !isNonEmptyString(record.attributionText)) {
        addIssue(issues, record, 'ATTRIBUTION_REQUIRED', 'Attribution text is required when the item license requires attribution.', 'attributionText');
      }
      if (!isNonEmptyString(record.body)) {
        addIssue(issues, record, 'FULL_TEXT_BODY_REQUIRED', 'verified-full-text intake requires a non-empty body supplied in the record.', 'body');
      }
    }

    if (record.reviewStatus === 'rejected'
      && (!Array.isArray(record.rejectionReasons) || record.rejectionReasons.length === 0)) {
      addIssue(issues, record, 'REJECTION_REASON_REQUIRED', 'Rejected records require at least one rejection reason.', 'rejectionReasons');
    }

    if (Array.isArray(record.mediaAssets)) {
      const seenAssets = new Set();
      record.mediaAssets.forEach((asset, assetIndex) => {
        if (!isObject(asset) || !isNonEmptyString(asset.assetId)) return;
        if (seenAssets.has(asset.assetId)) {
          addIssue(issues, record, 'ASSET_OMITTED_DUPLICATE', 'Duplicate assetId makes this media reference ambiguous; omit the duplicate asset.', `mediaAssets[${assetIndex}].assetId`, 'warning');
        }
        seenAssets.add(asset.assetId);
        if (asset.disposition === 'retain') {
          if (asset.rightsStatus !== 'verified') {
            addIssue(issues, record, 'ASSET_OMITTED_UNVERIFIED', 'Media without verified rights must be omitted; this does not block otherwise eligible text.', `mediaAssets[${assetIndex}].rightsStatus`, 'warning');
          }
          if (!normalizeHttpUrl(asset.evidenceUrl)) {
            addIssue(issues, record, 'ASSET_OMITTED_EVIDENCE_MISSING', 'Media without valid item-level evidence must be omitted; this does not block otherwise eligible text.', `mediaAssets[${assetIndex}].evidenceUrl`, 'warning');
          }
          if (asset.attributionRequired === true && !isNonEmptyString(asset.attributionText)) {
            addIssue(issues, record, 'ASSET_OMITTED_ATTRIBUTION_MISSING', 'Media missing required attribution must be omitted; this does not block otherwise eligible text.', `mediaAssets[${assetIndex}].attributionText`, 'warning');
          }
        }
      });
    }

    perRecordIssues.push(issues.slice(before));
  });

  records.forEach((record, index) => {
    if (isObject(record) && record.reviewStatus === 'approved' && perRecordIssues[index]?.some((issue) => issue.severity === 'error')) {
      addIssue(issues, record, 'APPROVAL_BLOCKED', 'approved is blocked while this record has validation errors.', 'reviewStatus');
    }
  });

  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  const configurationErrors = errors.filter((issue) => issue.recordId === null
    && (issue.field === 'policies' || issue.field.startsWith('policies[')));
  const recordResults = records.map((record) => {
    const recordErrors = errors.filter((issue) => issue.recordId === record?.recordId);
    const rejectedCodes = new Set([
      'THIRD_PARTY_CONTENT_BLOCKED',
      'SOURCE_POLICY_RESTRICTED',
      'SOURCE_POLICY_EXCEEDED',
      'URL_DUPLICATE',
      'IDENTIFIER_DUPLICATE',
      'DUPLICATE_RECORD_ID',
      'DATA_DUPLICATE',
      'SCHEMA_RECORD_TYPE',
      'SCHEMA_FIELD_TYPE',
      'SCHEMA_ENUM',
      'SCHEMA_UNKNOWN_FIELD',
      'URL_INVALID',
      'DATE_INVALID',
      'DATE_UNREASONABLE',
      'ITEM_RIGHTS_RESTRICTED',
      'REJECTION_REASON_REQUIRED',
    ]);
    return {
      recordId: isNonEmptyString(record?.recordId) ? record.recordId : null,
      status: configurationErrors.length > 0
        ? 'SKIPPED'
        : recordErrors.length === 0
          ? 'PASS'
          : recordErrors.some((issue) => rejectedCodes.has(issue.code)
            || (issue.code === 'SCHEMA_REQUIRED_FIELD' && ['recordId', 'sourceId'].includes(issue.field)))
            ? 'REJECTED'
            : 'SKIPPED',
      errorCodes: [...new Set([
        ...configurationErrors.map((issue) => issue.code),
        ...recordErrors.map((issue) => issue.code),
      ])],
      warningCodes: [...new Set(warnings.filter((issue) => issue.recordId === record?.recordId).map((issue) => issue.code))],
    };
  });
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    recordResults,
    summary: {
      recordsChecked: records.length,
      pass: recordResults.filter((record) => record.status === 'PASS').length,
      skipped: recordResults.filter((record) => record.status === 'SKIPPED').length,
      rejected: recordResults.filter((record) => record.status === 'REJECTED').length,
      errorCount: errors.length,
      warningCount: warnings.length,
    },
  };
};

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const loadJsonInputs = (path) => {
  const resolved = resolve(path);
  const files = extname(resolved).toLocaleLowerCase('en-US') === '.json'
    ? [resolved]
    : readdirSync(resolved, { withFileTypes: true })
      .filter((entry) => entry.isFile() && extname(entry.name).toLocaleLowerCase('en-US') === '.json')
      .map((entry) => resolve(resolved, entry.name))
      .sort();
  return files.map(readJson);
};

export const runCli = (args = process.argv.slice(2)) => {
  let inputPath = resolve(INTAKE_ROOT, 'fixtures', 'valid');
  let policiesPath = resolve(INTAKE_ROOT, 'fixtures', 'source-policies');
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--input' && args[index + 1]) inputPath = args[++index];
    else if (args[index] === '--policies' && args[index + 1]) policiesPath = args[++index];
    else {
      console.error('Usage: node scripts/validate-intake.mjs [--input <json-file-or-directory>] [--policies <json-file-or-directory>]');
      return 2;
    }
  }

  try {
    const loadedRecords = loadJsonInputs(isAbsolute(inputPath) ? inputPath : resolve(process.cwd(), inputPath));
    const records = loadedRecords.flatMap((value) => Array.isArray(value) ? value : (Array.isArray(value?.records) ? value.records : [value]));
    const loadedPolicies = loadJsonInputs(isAbsolute(policiesPath) ? policiesPath : resolve(process.cwd(), policiesPath));
    const policies = loadedPolicies.flatMap((value) => Array.isArray(value) ? value : [value]);
    const result = validateIntake(records, policies);
    console.log(JSON.stringify(result, null, 2));
    return result.valid ? 0 : 1;
  } catch (error) {
    console.error(`Unable to read local intake JSON: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli();
}
