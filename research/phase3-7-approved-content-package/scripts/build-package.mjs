import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapPilotRecord } from '../../phase3-6-content-import-dry-run/scripts/dry-run.mjs';
import { validateIntake } from '../../phase3-5-content-intake/scripts/validate-intake.mjs';
import { evaluateConditionalFullTextGrant } from '../../phase3-5-content-intake/scripts/conditional-full-text-grant.mjs';
import { generateIntakeDryRun } from '../../phase3-6-content-import-dry-run/scripts/dry-run.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = resolve(SCRIPT_DIR, '..');
const PROJECT_ROOT = resolve(PACKAGE_ROOT, '..', '..');
const PILOT_ROOT = resolve(PROJECT_ROOT, 'research', 'phase3-4-pilot');
const INTAKE_ROOT = resolve(PROJECT_ROOT, 'research', 'phase3-5-content-intake');
const DRY_RUN_ROOT = resolve(PROJECT_ROOT, 'research', 'phase3-6-content-import-dry-run');
const PACKAGE_SCHEMA_PATH = resolve(PACKAGE_ROOT, 'schemas', 'approved-content-package.schema.json');
const REPORT_PATH = resolve(PACKAGE_ROOT, 'reports', 'package-report.md');
const APPROVED_CONTENT_ROOT = resolve(PACKAGE_ROOT, 'approved-content');
const INTAKE_SCHEMA_VERSION = 'phase3.5-independent-intake-v1';

const SOURCE_BASELINES = Object.freeze({
  'plos-one': { rightsStatus: 'unknown', maxReuseMode: 'link-only' },
  'voa-learning-english': { rightsStatus: 'partially-verified', maxReuseMode: 'metadata-only' },
});
const RIGHTS_STATUSES = new Set(['verified', 'partially-verified', 'unknown', 'restricted', 'not-allowed']);
const REUSE_MODES = new Set(['verified-full-text', 'metadata-only', 'link-only', 'unknown', 'restricted']);
const PACKAGE_STATUSES = new Set(['DRAFT', 'VALIDATED', 'ELIGIBLE', 'NOT_ELIGIBLE', 'REJECTED']);
const REVIEW_STATUSES = new Set(['received', 'needs-source-review', 'needs-rights-review', 'needs-quality-review', 'approved', 'rejected']);
const EVIDENCE_TYPES = new Set(['item-license', 'item-rights', 'source-policy', 'item-metadata', 'attribution', 'asset-rights']);
const RIGHTS_BASES = new Set(['public-domain', 'license', 'permission', 'conditional-source-policy']);
const EVIDENCE_SCOPES = new Set(['item', 'source', 'asset']);
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
const REUSE_RANK = new Map([['unknown', 0], ['link-only', 1], ['metadata-only', 2], ['verified-full-text', 3]]);
const DUPLICATE_CODE_BY_FIELD = Object.freeze({
  recordId: 'PACKAGE_DUPLICATE_RECORD_ID',
  externalId: 'PACKAGE_DUPLICATE_EXTERNAL_ID',
  doi: 'PACKAGE_DUPLICATE_DOI',
  canonicalUrl: 'PACKAGE_DUPLICATE_CANONICAL_URL',
  packageVersion: 'PACKAGE_DUPLICATE_VERSION',
});

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const validDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const validDateTime = (value) => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T.*Z$/.test(value)
  && !Number.isNaN(Date.parse(value));

export const normalizeHttpUrl = (value) => {
  if (!nonEmpty(value) || /\s/.test(value)) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
};

const createIssue = (code, message, field, packageId = null) => ({ code, message, field, packageId });

const checkKeys = (value, allowedKeys, field, issues, packageId) => {
  if (!isObject(value)) {
    issues.push(createIssue('PACKAGE_SCHEMA_INVALID', `${field} must be an object.`, field, packageId));
    return false;
  }
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      issues.push(createIssue('PACKAGE_SCHEMA_INVALID', `${field}.${key} is not allowed by the package schema.`, `${field}.${key}`, packageId));
    }
  }
  return true;
};

const requireFields = (value, fields, prefix, issues, packageId) => {
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) {
      issues.push(createIssue('PACKAGE_SCHEMA_INVALID', `${prefix}.${field} is required.`, `${prefix}.${field}`, packageId));
    }
  }
};

const checkEnum = (value, allowed, field, issues, packageId) => {
  if (!allowed.has(value)) {
    issues.push(createIssue('PACKAGE_SCHEMA_INVALID', `${field} has an unsupported value.`, field, packageId));
  }
};

const checkHttpUrl = (value, field, issues, packageId, nullable = false) => {
  if (nullable && value === null) return;
  if (!normalizeHttpUrl(value)) {
    issues.push(createIssue('PACKAGE_SCHEMA_INVALID', `${field} must be a valid absolute HTTP(S) URL${nullable ? ' or null' : ''}.`, field, packageId));
  }
};

const validatePackageShape = (pkg, issues) => {
  const packageId = isObject(pkg) && nonEmpty(pkg.packageId) ? pkg.packageId : null;
  if (!checkKeys(pkg, [
    'schemaVersion', 'packageId', 'version', 'createdAt', 'supersedes', 'packageStatus',
    'eligibleForPhase38', 'testOnly', 'libraryPresentation', 'content', 'source', 'rights', 'validation', 'review', 'provenance',
  ], '$', issues, packageId)) return packageId;
  requireFields(pkg, [
    'schemaVersion', 'packageId', 'version', 'createdAt', 'packageStatus', 'eligibleForPhase38',
    'content', 'source', 'rights', 'validation', 'review', 'provenance',
  ], '$', issues, packageId);

  if (pkg.schemaVersion !== 1) issues.push(createIssue('PACKAGE_SCHEMA_INVALID', 'schemaVersion must be 1.', 'schemaVersion', packageId));
  if (!nonEmpty(pkg.packageId)) issues.push(createIssue('PACKAGE_SCHEMA_INVALID', 'packageId must be a non-empty string.', 'packageId', packageId));
  if (!Number.isInteger(pkg.version) || pkg.version < 1) issues.push(createIssue('PACKAGE_SCHEMA_INVALID', 'version must be a positive integer.', 'version', packageId));
  if (!validDateTime(pkg.createdAt)) issues.push(createIssue('PACKAGE_SCHEMA_INVALID', 'createdAt must be a UTC ISO date-time.', 'createdAt', packageId));
  if (pkg.supersedes !== undefined && pkg.supersedes !== null && !nonEmpty(pkg.supersedes)) {
    issues.push(createIssue('PACKAGE_SCHEMA_INVALID', 'supersedes must be null or a non-empty package version reference.', 'supersedes', packageId));
  }
  checkEnum(pkg.packageStatus, PACKAGE_STATUSES, 'packageStatus', issues, packageId);
  if (typeof pkg.eligibleForPhase38 !== 'boolean') issues.push(createIssue('PACKAGE_SCHEMA_INVALID', 'eligibleForPhase38 must be boolean.', 'eligibleForPhase38', packageId));
  if (typeof pkg.eligibleForPhase38 === 'boolean'
    && ((pkg.packageStatus === 'ELIGIBLE') !== pkg.eligibleForPhase38)) {
    issues.push(createIssue('PACKAGE_SCHEMA_INVALID', 'packageStatus ELIGIBLE must match eligibleForPhase38=true.', 'packageStatus', packageId));
  }
  if (pkg.testOnly !== undefined && typeof pkg.testOnly !== 'boolean') issues.push(createIssue('PACKAGE_SCHEMA_INVALID', 'testOnly must be boolean when supplied.', 'testOnly', packageId));
  if (pkg.libraryPresentation !== undefined
    && checkKeys(pkg.libraryPresentation, ['description', 'imageReference', 'level', 'genre', 'readingTime'], 'libraryPresentation', issues, packageId)) {
    requireFields(pkg.libraryPresentation, ['description', 'imageReference', 'level', 'genre', 'readingTime'], 'libraryPresentation', issues, packageId);
    if (!nonEmpty(pkg.libraryPresentation.description)) {
      issues.push(createIssue('PACKAGE_SCHEMA_INVALID', 'libraryPresentation.description must be a non-empty string.', 'libraryPresentation.description', packageId));
    }
    if (pkg.libraryPresentation.imageReference !== null
      && !nonEmpty(pkg.libraryPresentation.imageReference)) {
      issues.push(createIssue('PACKAGE_SCHEMA_INVALID', 'libraryPresentation.imageReference must be a non-empty string or null.', 'libraryPresentation.imageReference', packageId));
    }
    checkEnum(pkg.libraryPresentation.level, LIBRARY_LEVELS, 'libraryPresentation.level', issues, packageId);
    checkEnum(pkg.libraryPresentation.genre, LIBRARY_GENRES, 'libraryPresentation.genre', issues, packageId);
    checkEnum(pkg.libraryPresentation.readingTime, LIBRARY_READING_TIMES, 'libraryPresentation.readingTime', issues, packageId);
  }

  if (checkKeys(pkg.content, ['recordId', 'title', 'contentType', 'contentGroup', 'categories', 'language', 'authors', 'reuseMode', 'body', 'bodyReference'], 'content', issues, packageId)) {
    requireFields(pkg.content, ['recordId', 'title', 'contentType', 'contentGroup', 'categories', 'language', 'reuseMode', 'body'], 'content', issues, packageId);
    for (const field of ['recordId', 'title']) {
      if (!nonEmpty(pkg.content[field])) issues.push(createIssue('PACKAGE_SCHEMA_INVALID', `content.${field} must be a non-empty string.`, `content.${field}`, packageId));
    }
    for (const field of ['contentType', 'contentGroup', 'language', 'body', 'bodyReference']) {
      if (pkg.content[field] !== undefined && pkg.content[field] !== null && typeof pkg.content[field] !== 'string') {
        issues.push(createIssue('PACKAGE_SCHEMA_INVALID', `content.${field} must be a string or null.`, `content.${field}`, packageId));
      }
    }
    if (pkg.content.authors !== undefined && (!Array.isArray(pkg.content.authors) || pkg.content.authors.some((author) => !nonEmpty(author)))) {
      issues.push(createIssue('PACKAGE_SCHEMA_INVALID', 'content.authors must be an array of non-empty strings.', 'content.authors', packageId));
    }
    checkEnum(pkg.content.reuseMode, REUSE_MODES, 'content.reuseMode', issues, packageId);
    if (checkKeys(pkg.content.categories, ['primary', 'secondary'], 'content.categories', issues, packageId)) {
      requireFields(pkg.content.categories, ['primary', 'secondary'], 'content.categories', issues, packageId);
      const { primary, secondary } = pkg.content.categories;
      if (primary !== null && typeof primary !== 'string') issues.push(createIssue('PACKAGE_SCHEMA_INVALID', 'content.categories.primary must be a string or null.', 'content.categories.primary', packageId));
      if (!Array.isArray(secondary) || secondary.some((category) => !nonEmpty(category)) || new Set(secondary).size !== secondary.length) {
        issues.push(createIssue('PACKAGE_SCHEMA_INVALID', 'content.categories.secondary must be a unique array of strings.', 'content.categories.secondary', packageId));
      }
    }
  }

  if (checkKeys(pkg.source, ['sourceId', 'sourceName', 'sourceUrl', 'canonicalUrl', 'externalId', 'doi'], 'source', issues, packageId)) {
    requireFields(pkg.source, ['sourceId', 'sourceName', 'sourceUrl', 'canonicalUrl', 'externalId', 'doi'], 'source', issues, packageId);
    for (const field of ['sourceId', 'sourceName']) {
      if (!nonEmpty(pkg.source[field])) issues.push(createIssue('PACKAGE_SCHEMA_INVALID', `source.${field} must be a non-empty string.`, `source.${field}`, packageId));
    }
    checkHttpUrl(pkg.source.sourceUrl, 'source.sourceUrl', issues, packageId, true);
    checkHttpUrl(pkg.source.canonicalUrl, 'source.canonicalUrl', issues, packageId, true);
    for (const field of ['externalId', 'doi']) {
      if (pkg.source[field] !== null && !nonEmpty(pkg.source[field])) issues.push(createIssue('PACKAGE_SCHEMA_INVALID', `source.${field} must be a non-empty string or null.`, `source.${field}`, packageId));
    }
  }

  if (checkKeys(pkg.rights, ['verificationStatus', 'permittedReuseMode', 'rightsBasis', 'sourcePolicy', 'license', 'attributionRequired', 'attributionText', 'evidence'], 'rights', issues, packageId)) {
    requireFields(pkg.rights, ['verificationStatus', 'permittedReuseMode', 'sourcePolicy', 'license', 'attributionRequired', 'attributionText', 'evidence'], 'rights', issues, packageId);
    checkEnum(pkg.rights.verificationStatus, RIGHTS_STATUSES, 'rights.verificationStatus', issues, packageId);
    checkEnum(pkg.rights.permittedReuseMode, REUSE_MODES, 'rights.permittedReuseMode', issues, packageId);
    if (pkg.rights.rightsBasis !== undefined && pkg.rights.rightsBasis !== null) {
      checkEnum(pkg.rights.rightsBasis, RIGHTS_BASES, 'rights.rightsBasis', issues, packageId);
    }
    if (typeof pkg.rights.attributionRequired !== 'boolean') issues.push(createIssue('PACKAGE_SCHEMA_INVALID', 'rights.attributionRequired must be boolean.', 'rights.attributionRequired', packageId));
    if (pkg.rights.attributionText !== null && typeof pkg.rights.attributionText !== 'string') {
      issues.push(createIssue('PACKAGE_SCHEMA_INVALID', 'rights.attributionText must be a string or null.', 'rights.attributionText', packageId));
    }
    if (pkg.rights.sourcePolicy !== null
      && checkKeys(pkg.rights.sourcePolicy, ['rightsStatus', 'maxReuseMode'], 'rights.sourcePolicy', issues, packageId)) {
      requireFields(pkg.rights.sourcePolicy, ['rightsStatus', 'maxReuseMode'], 'rights.sourcePolicy', issues, packageId);
      checkEnum(pkg.rights.sourcePolicy.rightsStatus, RIGHTS_STATUSES, 'rights.sourcePolicy.rightsStatus', issues, packageId);
      checkEnum(pkg.rights.sourcePolicy.maxReuseMode, REUSE_MODES, 'rights.sourcePolicy.maxReuseMode', issues, packageId);
    }
    if (checkKeys(pkg.rights.license, ['type', 'identifier', 'url'], 'rights.license', issues, packageId)) {
      requireFields(pkg.rights.license, ['type', 'identifier', 'url'], 'rights.license', issues, packageId);
      for (const field of ['type', 'identifier']) {
        if (pkg.rights.license[field] !== null && typeof pkg.rights.license[field] !== 'string') {
          issues.push(createIssue('PACKAGE_SCHEMA_INVALID', `rights.license.${field} must be a string or null.`, `rights.license.${field}`, packageId));
        }
      }
      checkHttpUrl(pkg.rights.license.url, 'rights.license.url', issues, packageId, true);
    }
    if (!Array.isArray(pkg.rights.evidence)) {
      issues.push(createIssue('PACKAGE_SCHEMA_INVALID', 'rights.evidence must be an array.', 'rights.evidence', packageId));
    } else {
      pkg.rights.evidence.forEach((evidence, index) => {
        const field = `rights.evidence[${index}]`;
        if (!checkKeys(evidence, ['evidenceId', 'evidenceType', 'sourceUrl', 'reference', 'excerpt', 'retrievedAt', 'scope', 'appliesToRecordId'], field, issues, packageId)) return;
        requireFields(evidence, ['evidenceId', 'evidenceType', 'sourceUrl', 'reference', 'retrievedAt', 'scope', 'appliesToRecordId'], field, issues, packageId);
        if (!nonEmpty(evidence.evidenceId) || !nonEmpty(evidence.reference) || !nonEmpty(evidence.appliesToRecordId)) {
          issues.push(createIssue('PACKAGE_SCHEMA_INVALID', `${field} identity/reference fields must be non-empty strings.`, field, packageId));
        }
        checkEnum(evidence.evidenceType, EVIDENCE_TYPES, `${field}.evidenceType`, issues, packageId);
        checkEnum(evidence.scope, EVIDENCE_SCOPES, `${field}.scope`, issues, packageId);
        checkHttpUrl(evidence.sourceUrl, `${field}.sourceUrl`, issues, packageId);
        if (evidence.excerpt !== undefined && evidence.excerpt !== null && typeof evidence.excerpt !== 'string') {
          issues.push(createIssue('PACKAGE_SCHEMA_INVALID', `${field}.excerpt must be a string or null.`, `${field}.excerpt`, packageId));
        }
        if (evidence.retrievedAt !== null && evidence.retrievedAt !== undefined && !validDate(evidence.retrievedAt)) {
          issues.push(createIssue('PACKAGE_SCHEMA_INVALID', `${field}.retrievedAt must be a real date or null.`, `${field}.retrievedAt`, packageId));
        }
      });
    }
  }

  if (checkKeys(pkg.validation, ['validator', 'result', 'errorCodes'], 'validation', issues, packageId)) {
    requireFields(pkg.validation, ['validator', 'result', 'errorCodes'], 'validation', issues, packageId);
    if (!nonEmpty(pkg.validation.validator)) issues.push(createIssue('PACKAGE_SCHEMA_INVALID', 'validation.validator must be a non-empty string.', 'validation.validator', packageId));
    checkEnum(pkg.validation.result, new Set(['PASS', 'BLOCKED', 'REVIEW_REQUIRED']), 'validation.result', issues, packageId);
    if (!Array.isArray(pkg.validation.errorCodes) || pkg.validation.errorCodes.some((code) => !nonEmpty(code))) {
      issues.push(createIssue('PACKAGE_SCHEMA_INVALID', 'validation.errorCodes must be an array of non-empty strings.', 'validation.errorCodes', packageId));
    } else if (new Set(pkg.validation.errorCodes).size !== pkg.validation.errorCodes.length) {
      issues.push(createIssue('PACKAGE_SCHEMA_INVALID', 'validation.errorCodes must be unique.', 'validation.errorCodes', packageId));
    }
  }

  if (checkKeys(pkg.review, ['reviewStatus', 'reviewedAt', 'reviewer', 'decision'], 'review', issues, packageId)) {
    requireFields(pkg.review, ['reviewStatus', 'reviewedAt', 'reviewer', 'decision'], 'review', issues, packageId);
    checkEnum(pkg.review.reviewStatus, REVIEW_STATUSES, 'review.reviewStatus', issues, packageId);
    if (pkg.review.reviewedAt !== null && pkg.review.reviewedAt !== undefined && !validDateTime(pkg.review.reviewedAt)) {
      issues.push(createIssue('PACKAGE_SCHEMA_INVALID', 'review.reviewedAt must be a UTC ISO date-time or null.', 'review.reviewedAt', packageId));
    }
    if (pkg.review.reviewer !== null && pkg.review.reviewer !== undefined && !nonEmpty(pkg.review.reviewer)) {
      issues.push(createIssue('PACKAGE_SCHEMA_INVALID', 'review.reviewer must be a non-empty string or null.', 'review.reviewer', packageId));
    }
    if (typeof pkg.review.decision !== 'string' || !nonEmpty(pkg.review.decision)) {
      issues.push(createIssue('PACKAGE_SCHEMA_INVALID', 'review.decision must be a non-empty recorded decision.', 'review.decision', packageId));
    }
  }

  if (checkKeys(pkg.provenance, [
    'sourceRecordId', 'intakeRecordId', 'intakeSchemaVersion', 'intakeValidationResult',
    'dryRunResult', 'dryRunRecordId', 'reviewStatus', 'packageCreatedAt', 'sourceManifest',
  ], 'provenance', issues, packageId)) {
    requireFields(pkg.provenance, [
      'sourceRecordId', 'intakeRecordId', 'intakeSchemaVersion', 'intakeValidationResult',
      'dryRunResult', 'dryRunRecordId', 'reviewStatus', 'packageCreatedAt',
    ], 'provenance', issues, packageId);
    for (const field of ['sourceRecordId', 'intakeRecordId', 'intakeSchemaVersion', 'dryRunRecordId']) {
      if (!nonEmpty(pkg.provenance[field])) issues.push(createIssue('PACKAGE_SCHEMA_INVALID', `provenance.${field} must be a non-empty string.`, `provenance.${field}`, packageId));
    }
    checkEnum(pkg.provenance.intakeValidationResult, new Set(['PASS', 'FAIL']), 'provenance.intakeValidationResult', issues, packageId);
    checkEnum(pkg.provenance.dryRunResult, new Set(['PASS', 'BLOCKED', 'REVIEW_REQUIRED']), 'provenance.dryRunResult', issues, packageId);
    checkEnum(pkg.provenance.reviewStatus, REVIEW_STATUSES, 'provenance.reviewStatus', issues, packageId);
    if (!validDateTime(pkg.provenance.packageCreatedAt)) issues.push(createIssue('PACKAGE_SCHEMA_INVALID', 'provenance.packageCreatedAt must be a UTC ISO date-time.', 'provenance.packageCreatedAt', packageId));
    if (pkg.provenance.sourceManifest !== undefined && !nonEmpty(pkg.provenance.sourceManifest)) {
      issues.push(createIssue('PACKAGE_SCHEMA_INVALID', 'provenance.sourceManifest must be non-empty when supplied.', 'provenance.sourceManifest', packageId));
    }
  }

  return packageId;
};

const sourcePolicyMap = (policies) => new Map((Array.isArray(policies) ? policies : [])
  .filter((policy) => isObject(policy) && nonEmpty(policy.sourceId))
  .map((policy) => [policy.sourceId, policy]));

export const validatePackage = (pkg, policies, { allowSyntheticForTests = false } = {}) => {
  const issues = [];
  const packageId = validatePackageShape(pkg, issues);
  if (!isObject(pkg)) {
    return { eligible: false, packageStatus: 'NOT_ELIGIBLE', errors: issues, warnings: [] };
  }

  const policy = sourcePolicyMap(policies).get(pkg.source?.sourceId);
  if (policy?.synthetic === true && !(allowSyntheticForTests && pkg.testOnly === true)) {
    issues.push(createIssue('PACKAGE_SOURCE_MISSING', 'Synthetic source policies cannot authorize production packages.', 'source.sourceId', packageId));
  }
  if (!nonEmpty(pkg.source?.sourceId) || !nonEmpty(pkg.source?.sourceName)) {
    issues.push(createIssue('PACKAGE_SOURCE_MISSING', 'Source ID and name are required.', 'source', packageId));
  }
  // The conditional VOA grant still needs its official policy evidence; other sources
  // qualify only from their item-scoped license evidence.
  const pkgEvidence = Array.isArray(pkg.rights?.evidence) ? pkg.rights.evidence : [];
  const pkgSourcePolicyEvidence = pkgEvidence.find((item) =>
    item.scope === 'source'
      && item.appliesToRecordId === pkg.source?.sourceId
      && item.evidenceType === 'source-policy'
      && nonEmpty(item.reference)
      && normalizeHttpUrl(item.sourceUrl)) ?? null;
  const pkgGrant = evaluateConditionalFullTextGrant({
    policy,
    sourceId: pkg.source?.sourceId,
    canonicalUrl: pkg.source?.canonicalUrl,
    title: pkg.content?.title,
    authors: pkg.content?.authors,
    attributionRequired: pkg.rights?.attributionRequired,
    attributionText: pkg.rights?.attributionText,
    rightsEvidenceUrl: pkgSourcePolicyEvidence?.sourceUrl ?? null,
    rightsEvidenceExcerpt: pkgSourcePolicyEvidence?.excerpt ?? null,
    reuseMode: pkg.rights?.permittedReuseMode,
    reviewStatus: pkg.review?.reviewStatus,
  });

  if (policy && pkg.rights?.sourcePolicy
    && (pkg.rights.sourcePolicy.rightsStatus !== policy.rightsStatus
      || pkg.rights.sourcePolicy.maxReuseMode !== policy.maxReuseMode)) {
    issues.push(createIssue('PACKAGE_PROVENANCE_INCOMPLETE', 'Package source policy must exactly match the supplied unchanged policy fixture.', 'rights.sourcePolicy', packageId));
  }
  if (!policy && pkg.rights?.sourcePolicy !== null) {
    issues.push(createIssue('PACKAGE_PROVENANCE_INCOMPLETE', 'A package without a registered source policy must record rights.sourcePolicy as null.', 'rights.sourcePolicy', packageId));
  } else if (policy && (policy.rightsStatus === 'restricted' || policy.rightsStatus === 'not-allowed'
    || policy.maxReuseMode === 'restricted')) {
    issues.push(createIssue('PACKAGE_POLICY_RESTRICTED', 'Restricted/not-allowed source policy is a hard veto.', 'rights.sourcePolicy', packageId));
  } else if (policy && REUSE_RANK.has(pkg.rights?.permittedReuseMode)
    && REUSE_RANK.get(pkg.rights.permittedReuseMode) > REUSE_RANK.get(pkgGrant?.granted === true ? 'verified-full-text' : policy.maxReuseMode)) {
    issues.push(createIssue('PACKAGE_POLICY_EXCEEDED', 'Package reuse exceeds the source-policy ceiling.', 'rights.permittedReuseMode', packageId));
  }

  const requiredMetadata = [
    ['content.recordId', pkg.content?.recordId],
    ['content.title', pkg.content?.title],
    ['source.canonicalUrl', pkg.source?.canonicalUrl],
  ];
  for (const [field, value] of requiredMetadata) {
    if (!nonEmpty(value)) issues.push(createIssue('PACKAGE_METADATA_INCOMPLETE', `${field} is required for package eligibility and must come from recorded evidence.`, field, packageId));
  }

  const reuseMode = pkg.rights?.permittedReuseMode;
  const isFullText = reuseMode === 'verified-full-text';
  const bodyPresent = nonEmpty(pkg.content?.body) || nonEmpty(pkg.content?.bodyReference);
  if (isFullText && pkg.rights?.verificationStatus !== 'verified') {
    issues.push(createIssue('PACKAGE_RIGHTS_INSUFFICIENT', 'Full-text requires verified item-level rights.', 'rights.verificationStatus', packageId));
  }
  if (!isFullText && bodyPresent) {
    issues.push(createIssue('PACKAGE_BODY_NOT_ALLOWED', 'Body and body reference are forbidden unless full-text reuse is verified and policy-permitted.', 'content.body', packageId));
  }
  if (isFullText && !bodyPresent) {
    issues.push(createIssue('PACKAGE_METADATA_INCOMPLETE', 'Full-text package requires body or a local body reference.', 'content.body', packageId));
  }
  if (pkg.rights?.verificationStatus === 'restricted' || pkg.rights?.verificationStatus === 'not-allowed'
    || ['unknown', 'restricted'].includes(reuseMode)) {
    issues.push(createIssue('PACKAGE_RIGHTS_INSUFFICIENT', 'Rights status/reuse mode is not sufficient for an eligible content package.', 'rights', packageId));
  }

  const recordId = pkg.content?.recordId;
  const evidence = Array.isArray(pkg.rights?.evidence) ? pkg.rights.evidence : [];
  const appliesToItem = evidence.filter((item) => item.scope === 'item' && item.appliesToRecordId === recordId);
  const hasSourceEvidence = evidence.some((item) =>
    item.scope === 'source'
      && item.appliesToRecordId === pkg.source?.sourceId
      && item.evidenceType === 'source-policy'
      && nonEmpty(item.reference)
      && normalizeHttpUrl(item.sourceUrl));
  const sourcePolicyEvidence = evidence.find((item) =>
    item.scope === 'source'
      && item.appliesToRecordId === pkg.source?.sourceId
      && item.evidenceType === 'source-policy'
      && nonEmpty(item.reference)
      && normalizeHttpUrl(item.sourceUrl)) ?? null;
  if (pkgGrant.appliesToSource && !hasSourceEvidence) {
    issues.push(createIssue('PACKAGE_EVIDENCE_REQUIRED', 'Source-policy evidence must be explicitly referenced and scoped to this source.', 'rights.evidence', packageId));
  }
  if (!appliesToItem.some((item) => item.evidenceType === 'item-metadata')) {
    issues.push(createIssue('PACKAGE_EVIDENCE_REQUIRED', 'Item-scoped metadata evidence must identify this record.', 'rights.evidence', packageId));
  }
  const rightsBasis = pkg.rights?.rightsBasis;
  if (isFullText) {
    const licenseEvidence = appliesToItem.some((item) =>
      item.evidenceType === 'item-license'
        && nonEmpty(item.reference)
        && nonEmpty(item.excerpt)
        && normalizeHttpUrl(item.sourceUrl));
    const itemRightsEvidence = appliesToItem.some((item) =>
      item.evidenceType === 'item-rights'
        && nonEmpty(item.reference)
        && nonEmpty(item.excerpt)
        && normalizeHttpUrl(item.sourceUrl));
    if (!pkgGrant.granted && !['public-domain', 'license', 'permission'].includes(rightsBasis)) {
      issues.push(createIssue('PACKAGE_RIGHTS_BASIS_REQUIRED', 'Full-text requires a recorded item-level rights basis.', 'rights.rightsBasis', packageId));
    } else if (!pkgGrant.granted && rightsBasis === 'license'
      && (!licenseEvidence || !nonEmpty(pkg.rights?.license?.identifier) || !normalizeHttpUrl(pkg.rights?.license?.url))) {
      issues.push(createIssue('PACKAGE_EVIDENCE_REQUIRED', 'License-based full-text requires an item-scoped license record, evidence statement, license identifier, and license URL.', 'rights.evidence', packageId));
    } else if (!pkgGrant.granted && ['public-domain', 'permission'].includes(rightsBasis) && !itemRightsEvidence) {
      issues.push(createIssue('PACKAGE_EVIDENCE_REQUIRED', 'Public-domain or permission-based full-text requires item-scoped rights evidence and a captured excerpt.', 'rights.evidence', packageId));
    }
    if (!pkgGrant.appliesToSource) {
      // Sources without a conditional grant keep the original item-license requirement.
    } else if (!pkgGrant.thirdPartyBlocked && !pkgGrant.granted) {
      issues.push(createIssue('PACKAGE_CONDITIONAL_RIGHTS_NOT_MET', `The conditional full-text grant does not apply: ${pkgGrant.reasons.join(' ')}`, 'rights.permittedReuseMode', packageId));
    }
  }
  if (pkgGrant.thirdPartyBlocked) {
    const labels = [...new Set(pkgGrant.thirdParty.map((finding) => finding.label))].join(', ');
    issues.push(createIssue('PACKAGE_THIRD_PARTY_CONTENT_BLOCKED', `Third-party copyrighted content is present (${labels}); a publisher-domain reuse policy cannot override another publisher's rights. This package cannot be eligible.`, 'content.authors', packageId));
  }
  if (pkg.rights?.attributionRequired === true && !nonEmpty(pkg.rights.attributionText)) {
    issues.push(createIssue('PACKAGE_ATTRIBUTION_REQUIRED', 'Required attribution text is missing.', 'rights.attributionText', packageId));
  }

  if (pkg.validation?.result !== 'PASS' || !Array.isArray(pkg.validation?.errorCodes) || pkg.validation.errorCodes.length > 0) {
    issues.push(createIssue('PACKAGE_INTAKE_NOT_PASS', 'Phase 3.5 intake validation must be PASS with no blocking error codes.', 'validation', packageId));
  }
  if (pkg.provenance?.intakeValidationResult !== 'PASS') {
    issues.push(createIssue('PACKAGE_INTAKE_NOT_PASS', 'Provenance must record a PASS intake validation.', 'provenance.intakeValidationResult', packageId));
  }
  if (pkg.provenance?.dryRunResult !== 'PASS') {
    issues.push(createIssue('PACKAGE_DRY_RUN_NOT_PASS', 'Phase 3.6 dry-run result must be PASS.', 'provenance.dryRunResult', packageId));
  }
  if (pkg.review?.reviewStatus !== 'approved'
    || pkg.provenance?.reviewStatus !== 'approved'
    || !nonEmpty(pkg.review?.decision)
    || !validDateTime(pkg.review?.reviewedAt)
    || !nonEmpty(pkg.review?.reviewer)) {
    issues.push(createIssue('PACKAGE_REVIEW_INCOMPLETE', 'A recorded human approval decision, reviewer, and review timestamp are required for Phase 3.7 eligibility.', 'review', packageId));
  }
  if (!pkg.eligibleForPhase38 || pkg.packageStatus !== 'ELIGIBLE') {
    issues.push(createIssue('PACKAGE_REVIEW_INCOMPLETE', 'Candidate is not explicitly marked eligible; the builder will not promote it automatically.', 'packageStatus', packageId));
  }
  if (!nonEmpty(pkg.provenance?.sourceRecordId)
    || pkg.provenance.sourceRecordId !== recordId
    || pkg.provenance?.intakeRecordId !== recordId
    || pkg.provenance?.dryRunRecordId !== recordId
    || !nonEmpty(pkg.provenance?.intakeSchemaVersion)
    || !nonEmpty(pkg.provenance?.sourceManifest)
    || !validDateTime(pkg.provenance?.packageCreatedAt)
    || pkg.provenance?.packageCreatedAt !== pkg.createdAt
    || pkg.provenance?.reviewStatus !== pkg.review?.reviewStatus) {
    issues.push(createIssue('PACKAGE_PROVENANCE_INCOMPLETE', 'Package provenance must consistently link the source, intake, dry-run record, schema version, manifest, review, and creation time.', 'provenance', packageId));
  }
  if (pkg.testOnly === true && !allowSyntheticForTests) {
    issues.push(createIssue('PACKAGE_SYNTHETIC_NOT_ELIGIBLE', 'Synthetic/test-only content cannot be eligible or written as a real package.', 'testOnly', packageId));
  }
  if (pkg.testOnly === true && pkg.eligibleForPhase38 === true && !allowSyntheticForTests) {
    issues.push(createIssue('PACKAGE_SYNTHETIC_NOT_ELIGIBLE', 'Synthetic/test-only content cannot set eligibleForPhase38.', 'eligibleForPhase38', packageId));
  }

  const errors = issues;
  return { eligible: errors.length === 0, packageStatus: errors.length === 0 ? 'ELIGIBLE' : 'NOT_ELIGIBLE', errors, warnings: [] };
};

const normalizeDoi = (value) => value.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').toLocaleLowerCase('en-US');
const normalizeExternal = (value) => value.trim().toLocaleLowerCase('en-US');

export const validatePackageBatch = (packages, policies, options = {}) => {
  const errors = [];
  const seen = {
    recordId: new Map(),
    externalId: new Map(),
    doi: new Map(),
    canonicalUrl: new Map(),
    packageVersion: new Map(),
  };
  for (const pkg of packages) {
    const result = validatePackage(pkg, policies, options);
    errors.push(...result.errors);
    const recordId = pkg?.content?.recordId;
    const sourceId = pkg?.source?.sourceId;
    const packageVersion = `${pkg?.packageId ?? ''}@${pkg?.version ?? ''}`;
    const identifiers = [
      ['recordId', recordId],
      ['externalId', nonEmpty(pkg?.source?.externalId) ? `${sourceId}\u0000${normalizeExternal(pkg.source.externalId)}` : null],
      ['doi', nonEmpty(pkg?.source?.doi) ? normalizeDoi(pkg.source.doi) : null],
      ['canonicalUrl', normalizeHttpUrl(pkg?.source?.canonicalUrl)],
      ['packageVersion', pkg?.packageId && Number.isInteger(pkg.version) ? packageVersion : null],
    ];
    for (const [field, value] of identifiers) {
      if (value === null || value === undefined) continue;
      const packagesForValue = seen[field].get(value) ?? [];
      packagesForValue.push(pkg);
      seen[field].set(value, packagesForValue);
    }
  }
  for (const [field, values] of Object.entries(seen)) {
    for (const duplicates of values.values()) {
      if (duplicates.length < 2) continue;
      for (const pkg of duplicates) {
        errors.push(createIssue(DUPLICATE_CODE_BY_FIELD[field], `${field} duplicates another package in this batch.`, field, pkg.packageId ?? null));
      }
    }
  }
  return { eligible: errors.length === 0, errors };
};

const makeEvidence = (pilotRecord, manifest, policy) => {
  const evidence = [];
  const sourceEvidenceUrl = manifest.sourcePolicySnapshots?.[pilotRecord.sourceId]?.licenseUrl;
  if (normalizeHttpUrl(sourceEvidenceUrl)) {
    evidence.push({
      evidenceId: `${pilotRecord.sourceId}-policy`,
      evidenceType: 'source-policy',
      sourceUrl: sourceEvidenceUrl,
      reference: sourceEvidenceUrl,
      excerpt: null,
      retrievedAt: null,
      scope: 'source',
      appliesToRecordId: pilotRecord.sourceId,
    });
  }
  if (normalizeHttpUrl(pilotRecord.sourceUrl)) {
    evidence.push({
      evidenceId: `${pilotRecord.id}-metadata`,
      evidenceType: 'item-metadata',
      sourceUrl: pilotRecord.sourceUrl,
      reference: pilotRecord.sourceUrl,
      excerpt: null,
      retrievedAt: validDate(pilotRecord.retrievedAt) ? pilotRecord.retrievedAt : null,
      scope: 'item',
      appliesToRecordId: pilotRecord.id,
    });
  }
  if (normalizeHttpUrl(pilotRecord.itemLicense?.evidenceUrl)) {
    evidence.push({
      evidenceId: `${pilotRecord.id}-license`,
      evidenceType: 'item-license',
      sourceUrl: pilotRecord.itemLicense.evidenceUrl,
      reference: pilotRecord.itemLicense.evidenceUrl,
      excerpt: nonEmpty(pilotRecord.itemLicense.evidenceExcerpt) ? pilotRecord.itemLicense.evidenceExcerpt : null,
      retrievedAt: validDate(pilotRecord.itemLicense.verifiedAt) ? pilotRecord.itemLicense.verifiedAt : null,
      scope: 'item',
      appliesToRecordId: pilotRecord.id,
    });
  }
  if (policy?.synthetic === true) return [];
  return evidence;
};

const assemblePackageCandidate = ({ pilotRecord, intakeRecord, intakeIssues, dryRunRecord, manifest, policy, createdAt }) => {
  const intakePass = intakeIssues.length === 0;
  const dryRunPass = dryRunRecord.validationResult === 'PASS'
    && dryRunRecord.readyForPhase37Review === true;
  const reviewStatus = intakeRecord.reviewStatus;
  const completeReview = reviewStatus === 'approved'
    && nonEmpty(pilotRecord.reviewDecision)
    && validDateTime(pilotRecord.reviewedAt)
    && nonEmpty(pilotRecord.reviewer);
  const preliminarilyEligible = intakePass && dryRunPass && completeReview;
  const category = pilotRecord.categories ?? {};
  const packageId = `content-${pilotRecord.id}`;
  const packageStatus = preliminarilyEligible ? 'ELIGIBLE' : (reviewStatus === 'rejected' ? 'REJECTED' : 'NOT_ELIGIBLE');

  return {
    schemaVersion: 1,
    packageId,
    version: 1,
    createdAt,
    supersedes: null,
    packageStatus,
    eligibleForPhase38: preliminarilyEligible,
    content: {
      recordId: pilotRecord.id,
      title: pilotRecord.title,
      contentType: pilotRecord.contentType ?? null,
      contentGroup: pilotRecord.contentGroup ?? null,
      categories: {
        primary: category.primaryCategory ?? null,
        secondary: Array.isArray(category.secondaryCategories) ? [...category.secondaryCategories] : [],
      },
      language: null,
      authors: Array.isArray(pilotRecord.authors) ? [...pilotRecord.authors] : [],
      reuseMode: intakeRecord.reuseMode,
      body: Object.hasOwn(intakeRecord, 'body') ? intakeRecord.body : null,
      bodyReference: null,
    },
    source: {
      sourceId: pilotRecord.sourceId,
      sourceName: pilotRecord.publisher,
      sourceUrl: pilotRecord.sourceUrl,
      canonicalUrl: pilotRecord.canonicalUrl,
      externalId: pilotRecord.externalId ?? null,
      doi: pilotRecord.doi ?? null,
    },
    rights: {
      verificationStatus: pilotRecord.rights.verificationStatus,
      permittedReuseMode: intakeRecord.reuseMode,
      rightsBasis: pilotRecord.itemLicense?.licenseUrl
        ? 'license'
        : policy.conditionalFullText && intakeRecord.reuseMode === 'verified-full-text'
          ? 'conditional-source-policy'
          : null,
      sourcePolicy: {
        rightsStatus: policy.rightsStatus,
        maxReuseMode: policy.maxReuseMode,
      },
      license: {
        type: pilotRecord.itemLicense?.type ?? null,
        identifier: pilotRecord.itemLicense?.identifier ?? null,
        url: pilotRecord.itemLicense?.licenseUrl ?? null,
      },
      attributionRequired: pilotRecord.rights.attributionRequired,
      attributionText: pilotRecord.rights.attributionText ?? null,
      evidence: makeEvidence(pilotRecord, manifest, policy),
    },
    validation: {
      validator: 'Phase 3.5 validateIntake',
      result: intakePass ? 'PASS' : 'BLOCKED',
      errorCodes: [...new Set(intakeIssues.map((issue) => issue.code))],
    },
    review: {
      reviewStatus,
      reviewedAt: pilotRecord.reviewedAt ?? null,
      reviewer: pilotRecord.reviewer ?? null,
      decision: pilotRecord.reviewDecision ?? 'No human review decision is recorded in the source data.',
    },
    provenance: {
      sourceRecordId: pilotRecord.id,
      intakeRecordId: intakeRecord.recordId,
      intakeSchemaVersion: INTAKE_SCHEMA_VERSION,
      intakeValidationResult: intakePass ? 'PASS' : 'FAIL',
      dryRunResult: dryRunRecord.validationResult,
      dryRunRecordId: dryRunRecord.recordId,
      reviewStatus,
      packageCreatedAt: createdAt,
      sourceManifest: 'research/phase3-4-pilot/pilot-manifest.json',
    },
  };
};

const readPolicies = () => readdirSync(resolve(INTAKE_ROOT, 'fixtures', 'source-policies'), { withFileTypes: true })
  .filter((entry) => entry.isFile() && extname(entry.name).toLocaleLowerCase('en-US') === '.json')
  .map((entry) => readJson(resolve(INTAKE_ROOT, 'fixtures', 'source-policies', entry.name)))
  .sort((left, right) => left.sourceId.localeCompare(right.sourceId));

const verifyProtectedPolicies = (manifest, policies) => {
  const policyMap = sourcePolicyMap(policies);
  for (const [sourceId, expected] of Object.entries(SOURCE_BASELINES)) {
    const policy = policyMap.get(sourceId);
    const snapshot = manifest.sourcePolicySnapshots?.[sourceId];
    if (!policy || policy.synthetic !== false || policy.rightsStatus !== expected.rightsStatus
      || policy.maxReuseMode !== expected.maxReuseMode
      || snapshot?.rightsStatus !== expected.rightsStatus
      || snapshot?.contentReuse !== expected.maxReuseMode) {
      throw new Error(`Refusing package build: ${sourceId} Phase 3.4/3.5 policy baseline changed.`);
    }
  }
};

const resolveDryRunPath = (recordId) => {
  const resultPath = resolve(DRY_RUN_ROOT, 'reports', 'dry-run-results.json');
  const dryRun = readJson(resultPath);
  if (!Array.isArray(dryRun.recordResults)) throw new TypeError('Phase 3.6 results have no recordResults array.');
  const match = dryRun.recordResults.filter((record) => record.recordId === recordId);
  if (match.length !== 1) throw new Error(`Expected exactly one Phase 3.6 result for ${recordId}, found ${match.length}.`);
  return match[0];
};

const assertDryRunMatchesValidator = (dryRunRecord, intakeIssues) => {
  const actual = [...new Set(intakeIssues.map((issue) => issue.code))].sort();
  const recorded = [...new Set(dryRunRecord.errorCodes ?? [])].sort();
  if (JSON.stringify(actual) !== JSON.stringify(recorded)) {
    throw new Error(`Phase 3.6 validation codes for ${dryRunRecord.recordId} do not match a fresh Phase 3.5 validation.`);
  }
};

const packageDiskPath = (pkg) => resolve(APPROVED_CONTENT_ROOT, `${encodeURIComponent(pkg.packageId)}-v${pkg.version}.json`);

export const buildPackagesFromCandidates = (candidates, policies, options = {}) => {
  const validPackages = [];
  const rejectedCandidates = [];
  const batch = validatePackageBatch(candidates, policies, options);
  const batchErrorsByPackage = new Map();
  for (const issue of batch.errors) {
    if (!issue.packageId) continue;
    const list = batchErrorsByPackage.get(issue.packageId) ?? [];
    list.push(issue);
    batchErrorsByPackage.set(issue.packageId, list);
  }

  for (const candidate of candidates) {
    const packageValidation = validatePackage(candidate, policies, options);
    const combinedErrors = [
      ...packageValidation.errors,
      ...(batchErrorsByPackage.get(candidate.packageId) ?? []),
    ];
    if (combinedErrors.length === 0 && candidate.packageStatus === 'ELIGIBLE' && candidate.eligibleForPhase38 === true) {
      validPackages.push(candidate);
    } else {
      rejectedCandidates.push({
        packageId: candidate.packageId ?? null,
        recordId: candidate.content?.recordId ?? null,
        packageStatus: candidate.review?.reviewStatus === 'rejected' ? 'REJECTED' : 'NOT_ELIGIBLE',
        errorCodes: [...new Set(combinedErrors.map((issue) => issue.code))],
      });
    }
  }
  return { packages: validPackages, rejectedCandidates, duplicateErrors: batch.errors.filter((issue) => issue.code.startsWith('PACKAGE_DUPLICATE_')) };
};

const independentPackageId = (recordId) =>
  `content-${createHash('sha256').update(recordId, 'utf8').digest('hex').slice(0, 24)}`;

const evidenceForIntakeRecord = (record, policy) => {
  const evidence = [{
    evidenceId: `${record.recordId}-metadata`,
    evidenceType: 'item-metadata',
    sourceUrl: record.canonicalUrl,
    reference: 'Item metadata captured from the canonical source page.',
    excerpt: null,
    retrievedAt: record.receivedAt,
    scope: 'item',
    appliesToRecordId: record.recordId,
  }];
  if (policy?.conditionalFullText) {
    evidence.push({
      evidenceId: `${record.recordId}-source-policy`,
      evidenceType: 'source-policy',
      sourceUrl: record.rightsEvidenceUrl,
      reference: record.rightsEvidenceUrl,
      excerpt: record.rightsEvidenceExcerpt,
      retrievedAt: record.receivedAt,
      scope: 'source',
      appliesToRecordId: record.sourceId,
    });
  }
  if (record.reuseMode === 'verified-full-text' && !policy?.conditionalFullText && record.rightsBasis === 'license') {
    evidence.push({
      evidenceId: `${record.recordId}-item-license`,
      evidenceType: 'item-license',
      sourceUrl: record.itemLicenseUrl,
      reference: record.licenseIdentifier,
      excerpt: record.rightsEvidenceExcerpt,
      retrievedAt: record.receivedAt,
      scope: 'item',
      appliesToRecordId: record.recordId,
    });
  }
  if (record.reuseMode === 'verified-full-text'
    && !policy?.conditionalFullText
    && ['public-domain', 'permission'].includes(record.rightsBasis)) {
    evidence.push({
      evidenceId: `${record.recordId}-item-rights`,
      evidenceType: 'item-rights',
      sourceUrl: record.rightsEvidenceUrl,
      reference: record.rightsEvidenceUrl,
      excerpt: record.rightsEvidenceExcerpt,
      retrievedAt: record.receivedAt,
      scope: 'item',
      appliesToRecordId: record.recordId,
    });
  }
  for (const asset of Array.isArray(record.mediaAssets) ? record.mediaAssets : []) {
    if (asset.disposition !== 'retain'
      || asset.rightsStatus !== 'verified'
      || !normalizeHttpUrl(asset.evidenceUrl)
      || (asset.attributionRequired === true && !nonEmpty(asset.attributionText))) continue;
    evidence.push({
      evidenceId: `${record.recordId}-${asset.assetId}-rights`,
      evidenceType: 'asset-rights',
      sourceUrl: asset.evidenceUrl,
      reference: asset.evidenceUrl,
      excerpt: null,
      retrievedAt: record.receivedAt,
      scope: 'asset',
      appliesToRecordId: record.recordId,
    });
  }
  return evidence;
};

export const buildPackagesFromIntake = (
  intakeRecords,
  policies,
  {
    reviewByRecordId = {},
    sourceManifest,
    createdAt = new Date().toISOString(),
    allowSyntheticForTests = false,
  } = {},
) => {
  if (!Array.isArray(intakeRecords)) {
    throw new TypeError('Independent package build input must be an array of intake records.');
  }
  if (!nonEmpty(sourceManifest)) {
    throw new TypeError('A source manifest reference is required for independent package provenance.');
  }
  const dryRun = generateIntakeDryRun(intakeRecords, policies);
  const policiesById = sourcePolicyMap(policies);
  const preliminary = intakeRecords.map((record, inputIndex) => {
    const intakeResult = dryRun.recordResults[inputIndex];
    const policy = policiesById.get(record?.sourceId);
    const review = reviewByRecordId[record?.recordId];
    const errors = [];
    const warningCodes = [...(intakeResult?.warningCodes ?? [])];

    if (!record || !isObject(record)) {
      return { inputIndex, recordId: null, status: 'REJECTED', errorCodes: ['SCHEMA_RECORD_TYPE'], package: null };
    }
    if (intakeResult?.status === 'REJECTED') {
      return { inputIndex, recordId: record.recordId, status: 'REJECTED', errorCodes: intakeResult.errorCodes, warningCodes, package: null };
    }
    if (intakeResult?.status !== 'PASS') {
      return { inputIndex, recordId: record.recordId, status: 'SKIPPED', errorCodes: intakeResult?.errorCodes ?? ['INTAKE_RESULT_MISSING'], warningCodes, package: null };
    }

    const presentation = record.libraryPresentation;
    const primaryCategory = record.classification?.primaryCategory;
    for (const [field, value] of [
      ['sourceName', record.sourceName],
      ['category', primaryCategory],
      ['body', record.body],
      ['libraryPresentation.description', presentation?.description],
      ['libraryPresentation.level', presentation?.level],
      ['libraryPresentation.genre', presentation?.genre],
      ['libraryPresentation.readingTime', presentation?.readingTime],
    ]) {
      if (!nonEmpty(value)) errors.push(`PACKAGE_METADATA_INCOMPLETE:${field}`);
    }
    const matchingImageAssets = (Array.isArray(record.mediaAssets) ? record.mediaAssets : []).filter((asset) =>
      asset.assetId === presentation?.imageReference);
    const imageAsset = matchingImageAssets.length === 1 ? matchingImageAssets[0] : null;
    const imageAssetHasEvidence = Boolean(presentation?.imageReference
      && imageAsset
      && ['image', 'figure'].includes(imageAsset.assetType)
      && imageAsset.disposition === 'retain'
      && imageAsset.rightsStatus === 'verified'
      && normalizeHttpUrl(imageAsset.evidenceUrl)
      && (imageAsset.attributionRequired !== true || nonEmpty(imageAsset.attributionText)));
    if (presentation?.imageReference && !imageAssetHasEvidence) {
      warningCodes.push('IMAGE_OMITTED_UNVERIFIED');
    }
    if (policy?.synthetic === true && !allowSyntheticForTests) {
      errors.push('PACKAGE_SYNTHETIC_NOT_ELIGIBLE:sourceId');
    }
    if (review?.reviewStatus !== 'approved'
      || !nonEmpty(review.reviewer)
      || !nonEmpty(review.decision)
      || !validDateTime(review.reviewedAt)) {
      errors.push('PACKAGE_REVIEW_INCOMPLETE:review');
    }
    if (errors.length > 0) {
      return {
        inputIndex,
        recordId: record.recordId,
        status: errors.some((error) => error.startsWith('PACKAGE_SYNTHETIC_NOT_ELIGIBLE'))
          ? 'REJECTED'
          : 'SKIPPED',
        errorCodes: [...new Set(errors.map((error) => error.split(':', 1)[0]))],
        package: null,
      };
    }

    const packageId = independentPackageId(record.recordId);
    const pkg = {
      schemaVersion: 1,
      packageId,
      version: 1,
      createdAt,
      supersedes: null,
      packageStatus: 'ELIGIBLE',
      eligibleForPhase38: true,
      ...(record.testOnly === true ? { testOnly: true } : {}),
      libraryPresentation: {
        ...structuredClone(presentation),
        imageReference: imageAssetHasEvidence ? presentation.imageReference : null,
      },
      content: {
        recordId: record.recordId,
        title: record.title,
        contentType: record.contentType ?? null,
        contentGroup: record.classification?.contentGroup ?? null,
        categories: {
          primary: primaryCategory,
          secondary: [...(record.classification.secondaryCategories ?? [])],
        },
        language: record.language ?? null,
        authors: [...(record.authors ?? [])],
        reuseMode: record.reuseMode,
        body: record.body,
        bodyReference: null,
      },
      source: {
        sourceId: record.sourceId,
        sourceName: record.sourceName,
        sourceUrl: record.sourceUrl ?? null,
        canonicalUrl: record.canonicalUrl,
        externalId: record.externalId ?? null,
        doi: record.doi ?? null,
      },
      rights: {
        verificationStatus: record.rightsStatus,
        permittedReuseMode: record.reuseMode,
        rightsBasis: record.rightsBasis
          ?? (policy?.conditionalFullText && record.reuseMode === 'verified-full-text' ? 'conditional-source-policy' : null),
        sourcePolicy: policy
          ? { rightsStatus: policy.rightsStatus, maxReuseMode: policy.maxReuseMode }
          : null,
        license: {
          type: record.licenseType ?? null,
          identifier: record.licenseIdentifier ?? null,
          url: record.itemLicenseUrl ?? null,
        },
        attributionRequired: record.attributionRequired,
        attributionText: record.attributionText ?? null,
        evidence: evidenceForIntakeRecord(record, policy),
      },
      validation: { validator: 'Phase 3.5 validateIntake', result: 'PASS', errorCodes: [] },
      review: structuredClone(review),
      provenance: {
        sourceRecordId: record.recordId,
        intakeRecordId: record.recordId,
        intakeSchemaVersion: INTAKE_SCHEMA_VERSION,
        intakeValidationResult: 'PASS',
        dryRunResult: 'PASS',
        dryRunRecordId: record.recordId,
        reviewStatus: review.reviewStatus,
        packageCreatedAt: createdAt,
        sourceManifest,
      },
    };
    return { inputIndex, recordId: record.recordId, status: 'READY', errorCodes: [], warningCodes, package: pkg };
  });

  const candidates = preliminary.filter((result) => result.package).map((result) => result.package);
  const batch = validatePackageBatch(candidates, policies, { allowSyntheticForTests });
  const batchErrors = new Map();
  for (const issue of batch.errors) {
    if (!issue.packageId) continue;
    const list = batchErrors.get(issue.packageId) ?? [];
    list.push(issue);
    batchErrors.set(issue.packageId, list);
  }
  const inputIndexByPackageId = new Map(preliminary
    .filter((result) => result.package)
    .map((result) => [result.package.packageId, result.inputIndex]));
  const eligibleByIndex = new Map();
  for (const pkg of candidates) {
    const result = validatePackage(pkg, policies, { allowSyntheticForTests });
    const errors = [
      ...result.errors,
      ...(batchErrors.get(pkg.packageId) ?? []),
    ];
    eligibleByIndex.set(inputIndexByPackageId.get(pkg.packageId), {
      package: errors.length === 0 ? pkg : null,
      status: errors.length === 0 ? 'ELIGIBLE' : 'REJECTED',
      errorCodes: [...new Set(errors.map((issue) => issue.code))],
    });
  }
  const packages = [];
  const recordResults = preliminary.map((result, inputIndex) => {
    const eligible = eligibleByIndex.get(inputIndex);
    if (!eligible) return { recordId: result.recordId, status: result.status, errorCodes: result.errorCodes, warningCodes: result.warningCodes ?? [] };
    if (eligible.package) packages.push(eligible.package);
    return { recordId: result.recordId, status: eligible.status, errorCodes: eligible.errorCodes, warningCodes: result.warningCodes ?? [] };
  });
  return {
    packages,
    recordResults,
    summary: {
      recordsProcessed: intakeRecords.length,
      packagesCreated: packages.length,
      skipped: recordResults.filter((result) => result.status === 'SKIPPED').length,
      rejected: recordResults.filter((result) => result.status === 'REJECTED').length,
    },
  };
};

const renderReport = (report) => {
  const lines = [
    '# Phase 3.7 Approved Content Package - Eligibility Report',
    '',
    `- Generated at: ${report.generatedAt}`,
    '- Scope: Phase 3.4 real/source-derived pilot records, checked using Phase 3.5 intake validation and Phase 3.5 local source policies.',
    '- This report does not authorize Library import or publication.',
    '',
    '## Current result',
    '',
    '| Measure | Count |',
    '| --- | ---: |',
    `| Source records examined | ${report.summary.recordsExamined} |`,
    `| Phase 3.6 PASS | ${report.summary.phase36Pass} |`,
    `| Phase 3.6 BLOCKED | ${report.summary.phase36Blocked} |`,
    `| Phase 3.6 REVIEW_REQUIRED | ${report.summary.phase36ReviewRequired} |`,
    `| Phase 3.6 ready for Phase 3.7 review | ${report.summary.phase36ReadyForPhase37} |`,
    `| Phase 3.6 approved for Library import | ${report.summary.phase36ApprovedForLibraryImport} |`,
    `| Phase 3.7 ELIGIBLE records | ${report.summary.eligibleRecords} |`,
    `| NOT_ELIGIBLE | ${report.summary.notEligible} |`,
    `| BLOCKED | ${report.summary.blocked} |`,
    `| REVIEW_REQUIRED | ${report.summary.reviewRequired} |`,
    `| Approved packages created | ${report.summary.packagesCreated} |`,
    `| Approved for Library import | ${report.summary.approvedForLibraryImport} |`,
    '',
    '## Per-record result',
    '',
    '| Record ID | Source | Dry-run result | Package status | Error codes | Eligible for Phase 3.8? |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const record of report.records) {
    lines.push(`| ${record.recordId} | ${record.sourceId} | ${record.dryRunResult} | ${record.packageStatus} | ${record.errorCodes.join(', ') || 'none'} | ${record.eligibleForPhase38 ? 'Yes' : 'No'} |`);
  }
  lines.push(
    '',
    '## Policy and interpretation',
    '',
    '- PLOS remains `unknown` / `link-only`; no approved PLOS full-text package was created.',
    '- VOA remains `partially-verified` / `metadata-only`; no approved VOA content package was created. Its canonical URL remains unverified.',
    '- Phase 3.6 contains no record with `readyForPhase37Review=true`; all BLOCKED and REVIEW_REQUIRED records remain ineligible.',
    '- Synthetic test-only records are not included in these real-data results and are never persisted.',
    '- `ELIGIBLE` would only indicate eligibility for a Phase 3.8 integration plan. No app import, Library modification, database write, or publish operation is implemented.',
    '',
  );
  return lines.join('\n');
};

const assertWritePath = (path) => {
  const fromRoot = relative(PACKAGE_ROOT, path);
  if (fromRoot.startsWith(`..${sep}`) || fromRoot === '..' || isAbsolute(fromRoot)) {
    throw new Error(`Refusing to write outside Phase 3.7: ${path}`);
  }
};

const persistResults = (report, packages) => {
  assertWritePath(REPORT_PATH);
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, renderReport(report), 'utf8');
  if (packages.length === 0) return;
  assertWritePath(APPROVED_CONTENT_ROOT);
  const packagePaths = packages.map(packageDiskPath);
  for (const path of packagePaths) {
    assertWritePath(path);
    if (existsSync(path)) {
      throw new Error(`Refusing to overwrite package version; increment package version: ${path}`);
    }
  }
  mkdirSync(APPROVED_CONTENT_ROOT, { recursive: true });
  for (const [index, pkg] of packages.entries()) {
    writeFileSync(packagePaths[index], `${JSON.stringify(pkg, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  }
};

export const runPackageBuild = () => {
  const manifest = readJson(resolve(PILOT_ROOT, 'pilot-manifest.json'));
  const dryRun = readJson(resolve(DRY_RUN_ROOT, 'reports', 'dry-run-results.json'));
  const policies = readPolicies();
  verifyProtectedPolicies(manifest, policies);
  if (!Array.isArray(manifest.records) || !Array.isArray(dryRun.recordResults)) {
    throw new TypeError('Phase 3.4 manifest and Phase 3.6 dry-run result must contain record arrays.');
  }
  const dryRunById = new Map(dryRun.recordResults.map((record) => [record.recordId, record]));
  if (dryRunById.size !== manifest.records.length || manifest.records.some((record) => !dryRunById.has(record.id))) {
    throw new Error('Phase 3.6 results must contain exactly one result for every Phase 3.4 record.');
  }

  const intakeRecords = manifest.records.map(mapPilotRecord);
  const intakeBatch = validateIntake(intakeRecords, policies);
  const errorsByRecord = new Map(manifest.records.map((record) => [record.id, []]));
  for (const issue of intakeBatch.errors) {
    if (errorsByRecord.has(issue.recordId)) errorsByRecord.get(issue.recordId).push(issue);
  }

  const now = new Date().toISOString();
  const candidates = manifest.records.map((pilotRecord, index) => {
    const dryRunRecord = dryRunById.get(pilotRecord.id);
    const intakeIssues = errorsByRecord.get(pilotRecord.id);
    assertDryRunMatchesValidator(dryRunRecord, intakeIssues);
    return assemblePackageCandidate({
      pilotRecord,
      intakeRecord: intakeRecords[index],
      intakeIssues,
      dryRunRecord,
      manifest,
      policy: sourcePolicyMap(policies).get(pilotRecord.sourceId),
      createdAt: now,
    });
  });
  const build = buildPackagesFromCandidates(candidates, policies);
  const rejectedByRecord = new Map(build.rejectedCandidates.map((record) => [record.recordId, record]));
  const records = manifest.records.map((pilotRecord) => {
    const dryRunRecord = dryRunById.get(pilotRecord.id);
    const rejected = rejectedByRecord.get(pilotRecord.id);
    return {
      recordId: pilotRecord.id,
      sourceId: pilotRecord.sourceId,
      dryRunResult: dryRunRecord.validationResult,
      packageStatus: rejected?.packageStatus ?? 'ELIGIBLE',
      errorCodes: [...new Set([...(dryRunRecord.errorCodes ?? []), ...(rejected?.errorCodes ?? [])])],
      eligibleForPhase38: build.packages.some((pkg) => pkg.content.recordId === pilotRecord.id),
    };
  });
  const phase36Count = (name) => dryRun.recordResults.filter((record) => record.validationResult === name).length;
  const eligibleRecords = records.filter((record) => record.packageStatus === 'ELIGIBLE').length;
  const report = {
    phase: '3.7-approved-content-package',
    generatedAt: now,
    summary: {
      recordsExamined: records.length,
      phase36Pass: phase36Count('PASS'),
      phase36Blocked: phase36Count('BLOCKED'),
      phase36ReviewRequired: phase36Count('REVIEW_REQUIRED'),
      phase36ReadyForPhase37: dryRun.recordResults.filter((record) => record.readyForPhase37Review === true).length,
      phase36ApprovedForLibraryImport: dryRun.summary.approvedForLibraryImport,
      eligibleRecords,
      notEligible: records.filter((record) => record.packageStatus === 'NOT_ELIGIBLE').length,
      blocked: records.filter((record) => record.dryRunResult === 'BLOCKED').length,
      reviewRequired: records.filter((record) => record.dryRunResult === 'REVIEW_REQUIRED').length,
      packagesCreated: build.packages.length,
      approvedForLibraryImport: 0,
      duplicateErrors: build.duplicateErrors.length,
    },
    records,
  };
  persistResults(report, build.packages);
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Package report written to ${REPORT_PATH}`);
  return { report, packages: build.packages, candidates };
};

export const getPackageOutputPaths = () => ({ report: REPORT_PATH, approvedContent: APPROVED_CONTENT_ROOT });
export const loadPackageSchema = () => readJson(PACKAGE_SCHEMA_PATH);

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runPackageBuild();
  } catch (error) {
    console.error(`Package build failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
