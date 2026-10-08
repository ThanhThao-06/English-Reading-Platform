import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateIntake } from '../../phase3-5-content-intake/scripts/validate-intake.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const DRY_RUN_ROOT = resolve(SCRIPT_DIR, '..');
const PILOT_ROOT = resolve(DRY_RUN_ROOT, '..', 'phase3-4-pilot');
const INTAKE_ROOT = resolve(DRY_RUN_ROOT, '..', 'phase3-5-content-intake');
const REPORT_DIR = resolve(DRY_RUN_ROOT, 'reports');
const MANIFEST_PATH = resolve(PILOT_ROOT, 'pilot-manifest.json');
const POLICY_DIR = resolve(INTAKE_ROOT, 'fixtures', 'source-policies');
const OUTPUT_PATHS = Object.freeze({
  json: resolve(REPORT_DIR, 'dry-run-results.json'),
  markdown: resolve(REPORT_DIR, 'dry-run-report.md'),
});

const EXPECTED_POLICIES = Object.freeze({
  'plos-one': { rightsStatus: 'unknown', maxReuseMode: 'link-only' },
  'voa-learning-english': { rightsStatus: 'partially-verified', maxReuseMode: 'metadata-only' },
});

const DUPLICATE_CODES = new Set(['URL_DUPLICATE', 'IDENTIFIER_DUPLICATE', 'DUPLICATE_RECORD_ID', 'DATA_DUPLICATE']);
const RIGHTS_BLOCK_CODES = new Set([
  'SOURCE_POLICY_EXCEEDED',
  'SOURCE_POLICY_RESTRICTED',
  'RIGHTS_STATUS_INSUFFICIENT',
  'ITEM_RIGHTS_EVIDENCE_REQUIRED',
  'FULL_TEXT_LICENSE_REQUIRED',
  'ATTRIBUTION_REQUIRED',
  'BODY_NOT_ALLOWED',
  'FULL_TEXT_BODY_REQUIRED',
  'ASSET_RIGHTS_UNVERIFIED',
  'ASSET_EVIDENCE_REQUIRED',
  'ASSET_ATTRIBUTION_REQUIRED',
  // Conditional publisher-grant outcomes (see phase3-5 conditional-full-text-grant.mjs).
  // An unmet conditional grant and any third-party copyright content are both hard
  // blocks, never "needs review": they cannot be cleared by supplying more evidence
  // for the same item without a new rights decision.
  'CONDITIONAL_RIGHTS_NOT_MET',
  'THIRD_PARTY_CONTENT_BLOCKED',
]);

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const safeReadJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const loadPolicies = () => readdirSync(POLICY_DIR, { withFileTypes: true })
  .filter((entry) => entry.isFile() && extname(entry.name).toLocaleLowerCase('en-US') === '.json')
  .map((entry) => safeReadJson(resolve(POLICY_DIR, entry.name)))
  .sort((left, right) => left.sourceId.localeCompare(right.sourceId));

const normalizePublishedDate = (value) => {
  if (typeof value !== 'string') return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{4}-\d{2}-\d{2}T.*Z$/.test(value)) return value.slice(0, 10);
  return value;
};

export const mapPilotRecord = (record) => {
  const intake = {
    recordId: record.id,
    sourceId: record.sourceId,
    title: record.title,
    canonicalUrl: record.canonicalUrl,
    receivedAt: record.retrievedAt,
    rightsStatus: record.rights?.verificationStatus,
    reuseMode: record.rights?.permittedReuseMode,
    attributionRequired: record.rights?.attributionRequired,
    mediaAssets: [],
    reviewStatus: record.sourceId === 'plos-one' ? 'needs-rights-review' : 'needs-source-review',
    reviewNotes: [
      'Phase 3.6 simulation only; this record was not approved or imported.',
      'Reuse mode is preserved from Phase 3.4; no automatic rights downgrade or upgrade is performed.',
    ],
  };

  if (typeof record.doi === 'string' && record.doi.length > 0) intake.doi = record.doi;
  if (typeof record.externalId === 'string' && record.externalId.length > 0) intake.externalId = record.externalId;
  if (Array.isArray(record.authors) && record.authors.length > 0) intake.authors = [...record.authors];
  const publishedAt = normalizePublishedDate(record.publishedAt);
  if (publishedAt !== undefined) intake.publishedAt = publishedAt;
  if (record.contentType !== null && record.contentType !== undefined) intake.contentType = record.contentType;

  const classification = {};
  if (record.contentGroup !== null && record.contentGroup !== undefined) classification.contentGroup = record.contentGroup;
  if (record.categories?.primaryCategory) classification.primaryCategory = record.categories.primaryCategory;
  if (Array.isArray(record.categories?.secondaryCategories)) {
    classification.secondaryCategories = [...record.categories.secondaryCategories];
  }
  if (Object.keys(classification).length > 0) intake.classification = classification;

  if (record.itemLicense?.licenseUrl) {
    intake.rightsBasis = 'license';
    intake.itemLicenseUrl = record.itemLicense.licenseUrl;
  }
  if (record.itemLicense?.type) intake.licenseType = record.itemLicense.type;
  if (record.itemLicense?.identifier) intake.licenseIdentifier = record.itemLicense.identifier;
  if (record.itemLicense?.evidenceUrl) intake.rightsEvidenceUrl = record.itemLicense.evidenceUrl;
  if (record.itemLicense?.evidenceExcerpt) intake.rightsEvidenceExcerpt = record.itemLicense.evidenceExcerpt;
  if (typeof record.rights?.attributionText === 'string') intake.attributionText = record.rights.attributionText;

  return intake;
};

const validatePolicyBaselines = (manifest, policies) => {
  const policiesById = new Map(policies.map((policy) => [policy.sourceId, policy]));
  for (const [sourceId, expected] of Object.entries(EXPECTED_POLICIES)) {
    const policy = policiesById.get(sourceId);
    const snapshot = manifest.sourcePolicySnapshots?.[sourceId];
    if (!policy || policy.synthetic !== false
      || policy.rightsStatus !== expected.rightsStatus
      || policy.maxReuseMode !== expected.maxReuseMode) {
      throw new Error(`Phase 3.5 source policy for ${sourceId} differs from the protected Phase 3.6 baseline.`);
    }
    if (!snapshot
      || snapshot.rightsStatus !== expected.rightsStatus
      || snapshot.contentReuse !== expected.maxReuseMode) {
      throw new Error(`Phase 3.4 manifest snapshot for ${sourceId} differs from the protected Phase 3.6 baseline.`);
    }
  }
  return policiesById;
};

const missingEvidenceFor = (pilotRecord) => {
  const missing = [];
  if (!pilotRecord.canonicalUrl) {
    missing.push('canonicalUrl is null in Phase 3.4; the recorded RSS/source link has not been verified as canonical.');
  }
  if (!pilotRecord.authors?.length) {
    missing.push('No author was recorded in Phase 3.4 metadata.');
  }
  if (!pilotRecord.contentType) missing.push('contentType is unassigned in Phase 3.4.');
  if (!pilotRecord.categories) missing.push('Classification categories are unassigned in Phase 3.4.');
  if (pilotRecord.rights?.permittedReuseMode === 'verified-full-text' && pilotRecord.storedContent) {
    missing.push('The Phase 3.4 artifact is abstract-only and was deliberately not supplied as intake body under the link-only source ceiling.');
  }
  if (pilotRecord.rights?.permittedReuseMode === 'metadata-only' && !pilotRecord.itemLicense?.evidenceUrl) {
    missing.push('No item-level rights/ownership evidence URL was recorded; third-party authorship clearance remains unresolved.');
  }
  return missing;
};

const resultForRecord = (pilotRecord, intakeRecord, validationErrors, policy) => {
  const errors = validationErrors.filter((issue) => issue.recordId === pilotRecord.id);
  const codes = [...new Set(errors.map((issue) => issue.code))];
  const hasPolicyOrRightsBlock = codes.some((code) => RIGHTS_BLOCK_CODES.has(code)
    || code === 'SOURCE_POLICY_EXCEEDED'
    || code === 'SOURCE_POLICY_RESTRICTED');
  const canonicalReviewOnly = errors.length > 0 && errors.every((issue) =>
    (issue.code === 'SCHEMA_FIELD_TYPE' || issue.code === 'URL_INVALID')
      && issue.field === 'canonicalUrl');
  let result;
  if (hasPolicyOrRightsBlock || codes.some((code) => DUPLICATE_CODES.has(code))) {
    result = 'BLOCKED';
  } else if (canonicalReviewOnly || errors.length > 0) {
    result = 'REVIEW_REQUIRED';
  } else if (missingEvidenceFor(pilotRecord).length > 0) {
    result = 'REVIEW_REQUIRED';
  } else {
    result = 'PASS';
  }

  const simulatedReviewStatus = result === 'BLOCKED'
    ? 'needs-rights-review'
    : result === 'REVIEW_REQUIRED'
      ? (canonicalReviewOnly ? 'needs-source-review' : intakeRecord.reviewStatus)
      : 'needs-quality-review';

  let nextAction;
  if (pilotRecord.sourceId === 'plos-one') {
    nextAction = 'Do not carry the abstract into intake. Keep the source at unknown/link-only; a human must decide whether to propose link-only handling in a separately reviewed next phase.';
  } else {
    nextAction = 'Keep metadata-only scope. Resolve canonical URL status and any needed metadata from recorded evidence before a Phase 3.7 review; do not fetch or retain a story body in this dry run.';
  }

  return {
    recordId: pilotRecord.id,
    sourceId: pilotRecord.sourceId,
    source: pilotRecord.publisher,
    title: pilotRecord.title,
    contentType: pilotRecord.contentType ?? null,
    rightsStatus: pilotRecord.rights?.verificationStatus ?? null,
    reuseMode: pilotRecord.rights?.permittedReuseMode ?? null,
    sourcePolicy: policy
      ? { rightsStatus: policy.rightsStatus, maxReuseMode: policy.maxReuseMode }
      : null,
    validationResult: result,
    processingStatus: codes.some((code) => [
      'THIRD_PARTY_CONTENT_BLOCKED',
      'SOURCE_POLICY_RESTRICTED',
      'SOURCE_POLICY_EXCEEDED',
      ...DUPLICATE_CODES,
    ].includes(code)) ? 'REJECTED' : result === 'PASS' ? 'PASS' : 'SKIPPED',
    validationErrors: errors.map(({ code, message, field, severity }) => ({ code, message, field, severity })),
    errorCodes: codes,
    missingEvidence: missingEvidenceFor(pilotRecord),
    simulatedReviewStatus,
    nextAction,
    readyForPhase37Review: result === 'PASS',
    readinessLabel: result === 'PASS' ? 'READY_FOR_PHASE_3_7_REVIEW' : null,
    approvedForLibraryImport: false,
    mappedBodyPresent: Object.hasOwn(intakeRecord, 'body'),
    pilotExcludedAssetCount: Array.isArray(pilotRecord.excludedAssets) ? pilotRecord.excludedAssets.length : 0,
  };
};

export const generateDryRun = (manifest, policies, validator = validateIntake) => {
  if (!isObject(manifest) || !Array.isArray(manifest.records)) {
    throw new TypeError('Phase 3.4 manifest must contain a records array.');
  }
  const policiesById = validatePolicyBaselines(manifest, policies);
  const intakeRecords = manifest.records.map(mapPilotRecord);
  const validation = validator(intakeRecords, policies);
  if (!validation || !Array.isArray(validation.errors)) {
    throw new TypeError('Phase 3.5 validator returned an unexpected result.');
  }

  const recordResults = manifest.records.map((record, index) =>
    resultForRecord(record, intakeRecords[index], validation.errors, policiesById.get(record.sourceId)));
  const count = (result) => recordResults.filter((record) => record.validationResult === result).length;
  const duplicateRecordIds = new Set(validation.errors
    .filter((issue) => DUPLICATE_CODES.has(issue.code))
    .map((issue) => issue.recordId)
    .filter(Boolean));
  const schemaErrorRecordIds = new Set(validation.errors
    .filter((issue) => issue.code.startsWith('SCHEMA_'))
    .map((issue) => issue.recordId)
    .filter(Boolean));
  const rightsRestrictionIds = new Set(validation.errors
    .filter((issue) => issue.code === 'SOURCE_POLICY_EXCEEDED' || issue.code === 'SOURCE_POLICY_RESTRICTED')
    .map((issue) => issue.recordId)
    .filter(Boolean));
  const duplicateCodes = new Set(DUPLICATE_CODES);
  const summary = {
    recordsProcessed: recordResults.length,
    pass: count('PASS'),
    blocked: count('BLOCKED'),
    reviewRequired: count('REVIEW_REQUIRED'),
    skipped: recordResults.filter((record) => record.processingStatus === 'SKIPPED').length,
    rejected: recordResults.filter((record) => record.processingStatus === 'REJECTED').length,
    readyForPhase37Review: recordResults.filter((record) => record.readyForPhase37Review).length,
    approvedForLibraryImport: 0,
    schemaErrorRecords: schemaErrorRecordIds.size,
    rightsRestrictionRecords: rightsRestrictionIds.size,
    duplicateRecords: duplicateRecordIds.size,
    otherErrorRecords: new Set(validation.errors
      .filter((issue) => !issue.code.startsWith('SCHEMA_')
        && issue.code !== 'URL_INVALID'
        && !duplicateCodes.has(issue.code)
        && issue.code !== 'SOURCE_POLICY_EXCEEDED'
        && issue.code !== 'SOURCE_POLICY_RESTRICTED')
      .map((issue) => issue.recordId)
      .filter(Boolean)).size,
    totalValidationErrors: validation.errors.length,
    errorCountsByCode: validation.errors.reduce((counts, issue) => {
      counts[issue.code] = (counts[issue.code] ?? 0) + 1;
      return counts;
    }, {}),
  };

  return {
    phase: '3.6-content-import-dry-run',
    dataScope: 'Phase 3.4 source-derived pilot records only; Phase 3.5 synthetic fixtures excluded.',
    generatedAt: new Date().toISOString(),
    outcome: 'DRY_RUN_ONLY',
    summary,
    sourcePolicySnapshots: Object.fromEntries(Object.entries(EXPECTED_POLICIES).map(([sourceId, policy]) => [sourceId, { ...policy }])),
    recordResults,
  };
};

export const generateIntakeDryRun = (intakeRecords, policies, validator = validateIntake) => {
  if (!Array.isArray(intakeRecords)) {
    throw new TypeError('Independent intake dry-run input must be an array of intake records.');
  }
  const validation = validator(intakeRecords, policies);
  if (!validation || !Array.isArray(validation.errors) || !Array.isArray(validation.recordResults)) {
    throw new TypeError('Phase 3.5 validator returned an unexpected result.');
  }

  const recordResults = intakeRecords.map((record, index) => {
    const validationResult = validation.recordResults[index];
    return {
      recordId: typeof record?.recordId === 'string' ? record.recordId : null,
      sourceId: typeof record?.sourceId === 'string' ? record.sourceId : null,
      status: validationResult.status,
      errorCodes: validationResult.errorCodes,
      warningCodes: validationResult.warningCodes,
    };
  });

  return {
    phase: '3.6-independent-intake-dry-run',
    generatedAt: new Date().toISOString(),
    outcome: 'DRY_RUN_ONLY',
    summary: {
      recordsProcessed: recordResults.length,
      passed: recordResults.filter((record) => record.status === 'PASS').length,
      skipped: recordResults.filter((record) => record.status === 'SKIPPED').length,
      rejected: recordResults.filter((record) => record.status === 'REJECTED').length,
      approvedForLibraryImport: 0,
    },
    recordResults,
  };
};

const markdownEscape = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

export const renderMarkdownReport = (result) => {
  const { summary } = result;
  const lines = [
    '# Phase 3.6 Content Import Dry Run',
    '',
    `- Generated: ${result.generatedAt}`,
    `- Input scope: ${result.dataScope}`,
    '- Outcome: dry run only; no import, approval, or publication.',
    '',
    '## Summary',
    '',
    '| Measure | Records |',
    '| --- | ---: |',
    `| Processed | ${summary.recordsProcessed} |`,
    `| PASS | ${summary.pass} |`,
    `| BLOCKED | ${summary.blocked} |`,
    `| REVIEW_REQUIRED | ${summary.reviewRequired} |`,
    `| Ready for Phase 3.7 human review | ${summary.readyForPhase37Review} |`,
    `| Approved for Library Import | ${summary.approvedForLibraryImport} |`,
    `| Records with schema errors | ${summary.schemaErrorRecords} |`,
    `| Records restricted by source policy | ${summary.rightsRestrictionRecords} |`,
    `| Records with duplicate errors | ${summary.duplicateRecords} |`,
    `| Records with other errors | ${summary.otherErrorRecords} |`,
    `| Validation error occurrences | ${summary.totalValidationErrors} |`,
    '',
    '### Error codes',
    '',
  ];
  const errorEntries = Object.entries(summary.errorCountsByCode);
  if (errorEntries.length === 0) lines.push('No validation errors.');
  else for (const [code, count] of errorEntries) lines.push(`- \`${code}\`: ${count}`);
  lines.push(
    '',
    '## Per-record results',
    '',
    '| Record ID | Source ID | Source | Content type | Reuse / rights | Validation result | Simulated review | Error codes | Missing evidence | Phase 3.7 next step | Ready for Phase 3.7? |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const record of result.recordResults) {
    lines.push(`| ${markdownEscape(record.recordId)} | ${markdownEscape(record.sourceId)} | ${markdownEscape(record.source)} | ${markdownEscape(record.contentType ?? 'unassigned')} | ${markdownEscape(`${record.reuseMode ?? 'unknown'} / ${record.rightsStatus ?? 'unknown'}`)} | ${record.validationResult} | ${record.simulatedReviewStatus} | ${markdownEscape(record.errorCodes.join(', ') || 'none')} | ${markdownEscape(record.missingEvidence.join('; ') || 'none recorded')} | ${markdownEscape(record.nextAction)} | ${record.readyForPhase37Review ? 'Yes' : 'No'} |`);
  }
  lines.push(
    '',
    '## Safety and interpretation',
    '',
    '- PLOS remains `unknown` / `link-only`; item-level evidence recorded in the pilot does not override this source ceiling in Phase 3.5 validation.',
    '- VOA remains `partially-verified` / `metadata-only`; no story body is supplied or approved.',
    '- Phase 3.4 abstract-only artifacts were not opened or passed as body. No source URLs were contacted.',
    '- `PASS` would mean eligible only for human Phase 3.7 review, never production approval. This report marks zero records approved for Library import.',
    '- Synthetic Phase 3.5 fixtures are excluded from these eight source-derived records and are not evidence.',
    '',
  );
  return lines.join('\n');
};

export const getOutputPaths = () => ({ ...OUTPUT_PATHS });

const assertOutputPathsAreLocal = () => {
  for (const path of Object.values(OUTPUT_PATHS)) {
    const fromRoot = relative(DRY_RUN_ROOT, path);
    if (fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
      throw new Error(`Refusing to write outside Phase 3.6: ${path}`);
    }
  }
};

export const writeDryRunOutputs = (result) => {
  assertOutputPathsAreLocal();
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATHS.json, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  writeFileSync(OUTPUT_PATHS.markdown, renderMarkdownReport(result), 'utf8');
  return getOutputPaths();
};

export const runDryRun = () => {
  const manifest = safeReadJson(MANIFEST_PATH);
  const policies = loadPolicies();
  const result = generateDryRun(manifest, policies);
  writeDryRunOutputs(result);
  console.log(JSON.stringify(result.summary, null, 2));
  console.log(`Reports written only under ${REPORT_DIR}`);
  return result;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runDryRun();
  } catch (error) {
    console.error(`Dry run failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
