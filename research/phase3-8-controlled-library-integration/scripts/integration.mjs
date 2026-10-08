import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePackage, validatePackageBatch } from '../../phase3-7-approved-content-package/scripts/build-package.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const INTEGRATION_ROOT = resolve(SCRIPT_DIR, '..');
const PROJECT_ROOT = resolve(INTEGRATION_ROOT, '..', '..');
const PACKAGE_ROOT = resolve(PROJECT_ROOT, 'research', 'phase3-7-approved-content-package');
const APPROVED_CONTENT_ROOT = resolve(PACKAGE_ROOT, 'approved-content');
const POLICY_DIR = resolve(PROJECT_ROOT, 'research', 'phase3-5-content-intake', 'fixtures', 'source-policies');
const MANIFEST_PATH = resolve(PROJECT_ROOT, 'research', 'phase3-4-pilot', 'pilot-manifest.json');
const PHASE36_RESULTS_PATH = resolve(PROJECT_ROOT, 'research', 'phase3-6-content-import-dry-run', 'reports', 'dry-run-results.json');
const REPORT_DIR = resolve(INTEGRATION_ROOT, 'reports');

const PROTECTED_BASELINES = Object.freeze({
  'plos-one': { rightsStatus: 'unknown', maxReuseMode: 'link-only', contentReuse: 'link-only' },
  'voa-learning-english': {
    rightsStatus: 'partially-verified',
    maxReuseMode: 'metadata-only',
    contentReuse: 'metadata-only',
  },
});
const RIGHTS_CODES = new Set([
  'PACKAGE_POLICY_EXCEEDED',
  'PACKAGE_POLICY_RESTRICTED',
  'PACKAGE_RIGHTS_INSUFFICIENT',
  'PACKAGE_BODY_NOT_ALLOWED',
  // Conditional publisher-grant outcomes carried through from Phase 3.5/3.7.
  'PACKAGE_CONDITIONAL_RIGHTS_NOT_MET',
  'PACKAGE_THIRD_PARTY_CONTENT_BLOCKED',
]);
const EVIDENCE_CODES = new Set([
  'PACKAGE_EVIDENCE_REQUIRED',
  'PACKAGE_ATTRIBUTION_REQUIRED',
  'PACKAGE_CONDITIONAL_RIGHTS_NOT_MET',
]);
const PROVENANCE_CODES = new Set([
  'PACKAGE_PROVENANCE_INCOMPLETE',
  'PACKAGE_INTAKE_NOT_PASS',
  'PACKAGE_DRY_RUN_NOT_PASS',
]);
const REVIEW_CODES = new Set(['PACKAGE_REVIEW_INCOMPLETE']);
const DUPLICATE_CODES = new Set([
  'PACKAGE_DUPLICATE_RECORD_ID',
  'PACKAGE_DUPLICATE_EXTERNAL_ID',
  'PACKAGE_DUPLICATE_DOI',
  'PACKAGE_DUPLICATE_CANONICAL_URL',
  'PACKAGE_DUPLICATE_VERSION',
]);
const GENRES = new Set([
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
const LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const READING_TIMES = new Set(['Under 3 min', '5–10 min', 'Chapter']);

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;
const normalizedUrl = (value) => {
  if (!nonEmpty(value)) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
      url.port = '';
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
};
const normalizedIdentifier = (value) => nonEmpty(value) ? value.trim().toLowerCase() : null;
const normalizedDoi = (value) => {
  const normalized = normalizedIdentifier(value);
  if (!normalized) return null;
  return normalized
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '')
    .replace(/^doi:\s*/, '');
};
const normalizedTitle = (value) => nonEmpty(value)
  ? value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
  : null;

const loadPolicies = () => readdirSync(POLICY_DIR, { withFileTypes: true })
  .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.json')
  .map((entry) => readJson(resolve(POLICY_DIR, entry.name)))
  .sort((left, right) => left.sourceId.localeCompare(right.sourceId));

const assertProtectedBaselines = (manifest, policies) => {
  const policyById = new Map(policies.map((policy) => [policy.sourceId, policy]));
  for (const [sourceId, expected] of Object.entries(PROTECTED_BASELINES)) {
    const actual = policyById.get(sourceId);
    const snapshot = manifest.sourcePolicySnapshots?.[sourceId];
    if (!actual
      || actual.synthetic !== false
      || actual.rightsStatus !== expected.rightsStatus
      || actual.maxReuseMode !== expected.maxReuseMode
      || !snapshot
      || snapshot.rightsStatus !== expected.rightsStatus
      || snapshot.contentReuse !== expected.contentReuse) {
      throw new Error(`Refusing integration run: protected ${sourceId} source-policy baseline changed.`);
    }
  }
  return policyById;
};

export const summarizePhase36Results = (manifest, dryRun) => {
  if (!Array.isArray(manifest?.records) || !Array.isArray(dryRun?.recordResults)) {
    throw new TypeError('Phase 3.4 manifest and Phase 3.6 record results are required for the upstream summary.');
  }
  if (!nonEmpty(dryRun.dataScope)) throw new TypeError('Phase 3.6 dataScope must be a non-empty string.');
  const manifestRecords = new Map(manifest.records.map((record) => [record.id, record]));
  const seen = new Set();
  for (const result of dryRun.recordResults) {
    const pilot = manifestRecords.get(result.recordId);
    if (!pilot || seen.has(result.recordId) || pilot.sourceId !== result.sourceId) {
      throw new Error(`Phase 3.6 result does not uniquely match a Phase 3.4 record: ${result.recordId ?? 'unknown'}.`);
    }
    if (!['PASS', 'BLOCKED', 'REVIEW_REQUIRED'].includes(result.validationResult)
      || !nonEmpty(result.simulatedReviewStatus)
      || !Array.isArray(result.errorCodes)
      || !Array.isArray(result.missingEvidence)
      || !nonEmpty(result.nextAction)
      || typeof result.readyForPhase37Review !== 'boolean') {
      throw new TypeError(`Phase 3.6 result for ${result.recordId} is missing a valid review summary.`);
    }
    seen.add(result.recordId);
  }
  if (seen.size !== manifestRecords.size) {
    throw new Error(`Phase 3.6 covers ${seen.size} of ${manifestRecords.size} Phase 3.4 records.`);
  }
  const count = (status) => dryRun.recordResults.filter((record) => record.validationResult === status).length;
  return {
    dataScope: dryRun.dataScope,
    summary: {
      recordsProcessed: dryRun.recordResults.length,
      pass: count('PASS'),
      blocked: count('BLOCKED'),
      reviewRequired: count('REVIEW_REQUIRED'),
      readyForPhase37Review: dryRun.recordResults.filter((record) => record.readyForPhase37Review === true).length,
      approvedForLibraryImport: dryRun.recordResults.filter((record) => record.approvedForLibraryImport === true).length,
    },
    recordResults: dryRun.recordResults.map((record) => ({
      recordId: record.recordId,
      sourceId: record.sourceId,
      validationResult: record.validationResult,
      simulatedReviewStatus: record.simulatedReviewStatus,
      errorCodes: Array.isArray(record.errorCodes) ? [...record.errorCodes] : [],
      missingEvidence: Array.isArray(record.missingEvidence) ? [...record.missingEvidence] : [],
      nextAction: record.nextAction,
      readyForPhase37Review: record.readyForPhase37Review === true,
    })),
  };
};

const asIssueCodes = (issues) => [...new Set(issues.map((issue) => issue.code))];
const issueFieldsFor = (issues, codes) => issues
  .filter((issue) => codes.has(issue.code))
  .map((issue) => issue.field)
  .filter(Boolean);

const detectDuplicate = (pkg, librarySnapshot) => {
  if (!Array.isArray(librarySnapshot)) {
    return { outcome: 'NOT_CHECKED', code: 'LIBRARY_SNAPSHOT_UNAVAILABLE' };
  }
  const source = pkg?.source ?? {};
  const recordId = pkg?.content?.recordId;
  const canonicalUrl = normalizedUrl(source.canonicalUrl);
  const doi = normalizedDoi(source.doi);
  const externalId = normalizedIdentifier(source.externalId);
  for (const item of librarySnapshot) {
    const itemSource = item?.source ?? item?.enrichment?.source ?? {};
    const exact = (recordId && [item?.id, item?.recordId].includes(recordId))
      || (doi && normalizedDoi(item?.doi ?? itemSource?.doi) === doi)
      || (externalId && normalizedIdentifier(item?.externalId ?? itemSource?.externalId) === externalId)
      || (canonicalUrl && normalizedUrl(item?.canonicalUrl ?? itemSource?.url) === canonicalUrl);
    if (exact) return { outcome: 'EXACT_DUPLICATE', code: 'LIBRARY_EXACT_DUPLICATE' };
  }
  const title = normalizedTitle(pkg?.content?.title);
  if (title && librarySnapshot.some((item) => normalizedTitle(item?.title) === title)) {
    return { outcome: 'POSSIBLE_DUPLICATE', code: 'LIBRARY_POSSIBLE_DUPLICATE' };
  }
  return { outcome: 'NO_DUPLICATE', code: null };
};

const createLibraryProjection = (pkg, mapping = {}, provenanceDestinationAvailable = false) => {
  const missing = [];
  const requiredStrings = ['description', 'genre', 'level', 'readingTime'];
  for (const field of requiredStrings) {
    if (!nonEmpty(mapping[field])) missing.push(`Editorial mapping is missing ${field}.`);
  }
  if (mapping.image !== null && (!nonEmpty(mapping.image)
    || !nonEmpty(mapping.imageRightsEvidenceRef))) {
    missing.push('An image requires a valid reference and item-applicable image rights evidence.');
  }
  if (!GENRES.has(mapping.genre)) missing.push('Editorial genre is not a supported Article genre.');
  if (!LEVELS.has(mapping.level)) missing.push('Editorial CEFR level is not a supported Article level.');
  if (!READING_TIMES.has(mapping.readingTime)) missing.push('Editorial readingTime is not a supported Article value.');
  if (pkg?.content?.reuseMode !== 'verified-full-text'
    || !nonEmpty(pkg?.content?.body)
    || pkg?.rights?.verificationStatus !== 'verified') {
    missing.push('The current Article model requires body text; only verified, policy-permitted full text can be mapped.');
  }
  if (!provenanceDestinationAvailable) {
    missing.push('No destination exists for preserving package version, rights evidence, and full provenance.');
  }
  if (missing.length > 0) return { projection: null, missing };

  const article = {
    id: `${pkg.packageId}-v${pkg.version}`,
    title: pkg.content.title,
    description: mapping.description,
    image: mapping.image,
    genre: mapping.genre,
    level: mapping.level,
    readingTime: mapping.readingTime,
    content: pkg.content.body,
  };
  const projection = {
    article,
    integrationMetadata: {
      packageId: pkg.packageId,
      packageVersion: pkg.version,
      sourceId: pkg.source.sourceId,
      source: structuredClone(pkg.source),
      rights: structuredClone(pkg.rights),
      provenance: structuredClone(pkg.provenance),
      imageRightsEvidenceRef: mapping.imageRightsEvidenceRef,
    },
  };
  return { projection, missing: [] };
};

const gate = (name, status, errorCodes = []) => ({ name, status, errorCodes: [...new Set(errorCodes)] });

export const evaluatePackages = (
  packages,
  policies,
  {
    librarySnapshot = null,
    mappingByPackageId = {},
    provenanceDestinationAvailable = false,
    allowSyntheticForTests = false,
  } = {},
) => {
  if (!Array.isArray(packages)) throw new TypeError('Packages input must be an array.');
  const batch = validatePackageBatch(packages, policies, { allowSyntheticForTests });
  return packages.map((pkg) => {
    const packageId = isObject(pkg) && nonEmpty(pkg.packageId) ? pkg.packageId : null;
    const own = validatePackage(pkg, policies, { allowSyntheticForTests });
    const batchIssues = batch.errors.filter((issue) => issue.packageId === packageId);
    const issues = [...own.errors, ...batchIssues];
    const codes = asIssueCodes(issues);
    const schemaIssues = issues.filter((issue) => issue.code === 'PACKAGE_SCHEMA_INVALID');
    const policyById = new Map(policies.map((policy) => [policy.sourceId, policy]));
    const policy = policyById.get(pkg?.source?.sourceId);
    const duplicate = detectDuplicate(pkg, librarySnapshot);
    const packageDuplicateCodes = issues.filter((issue) => DUPLICATE_CODES.has(issue.code)).map((issue) => issue.code);
    const duplicateCodes = [...packageDuplicateCodes];
    if (duplicate.code) duplicateCodes.push(duplicate.code);
    const mapping = createLibraryProjection(
      pkg,
      mappingByPackageId[packageId] ?? {},
      provenanceDestinationAvailable,
    );

    const schemaGate = gate('PACKAGE_SCHEMA_VALID', schemaIssues.length === 0 ? 'PASS' : 'BLOCKED', asIssueCodes(schemaIssues));
    const sourceIssues = issues.filter((issue) => ['PACKAGE_SOURCE_MISSING', 'PACKAGE_POLICY_RESTRICTED'].includes(issue.code));
    if (policy?.synthetic === true && !allowSyntheticForTests) {
      sourceIssues.push({ code: 'PACKAGE_SOURCE_MISSING' });
    }
    const sourceGate = gate('SOURCE_VALID', sourceIssues.length === 0 ? 'PASS' : 'BLOCKED', asIssueCodes(sourceIssues));
    const rightsIssues = issues.filter((issue) => RIGHTS_CODES.has(issue.code));
    const rightsGate = gate('RIGHTS_VALID', rightsIssues.length === 0 ? 'PASS' : 'BLOCKED', asIssueCodes(rightsIssues));
    const evidenceIssues = issues.filter((issue) => EVIDENCE_CODES.has(issue.code));
    const evidenceGate = gate('EVIDENCE_VALID', evidenceIssues.length === 0 ? 'PASS' : 'BLOCKED', asIssueCodes(evidenceIssues));
    const provenanceIssues = issues.filter((issue) => PROVENANCE_CODES.has(issue.code));
    const provenanceGate = gate('PROVENANCE_VALID', provenanceIssues.length === 0 ? 'PASS' : 'BLOCKED', asIssueCodes(provenanceIssues));
    const reviewIssues = issues.filter((issue) => REVIEW_CODES.has(issue.code));
    const reviewPass = pkg?.packageStatus === 'ELIGIBLE'
      && pkg?.eligibleForPhase38 === true
      && pkg?.review?.reviewStatus === 'approved'
      && reviewIssues.length === 0;
    const reviewRejected = pkg?.packageStatus === 'REJECTED' || pkg?.review?.reviewStatus === 'rejected';
    const reviewGate = gate(
      'REVIEW_VALID',
      reviewPass ? 'PASS' : reviewRejected ? 'BLOCKED' : 'REVIEW_REQUIRED',
      asIssueCodes(reviewIssues),
    );

    let duplicateGate;
    if (packageDuplicateCodes.length > 0) {
      duplicateGate = gate('DUPLICATE_CHECK_PASS', 'BLOCKED', packageDuplicateCodes);
    } else if (duplicate.outcome === 'NOT_CHECKED') {
      duplicateGate = gate('DUPLICATE_CHECK_PASS', 'BLOCKED', [duplicate.code]);
    } else if (duplicate.outcome === 'POSSIBLE_DUPLICATE') {
      duplicateGate = gate('DUPLICATE_CHECK_PASS', 'REVIEW_REQUIRED', [duplicate.code]);
    } else {
      duplicateGate = gate('DUPLICATE_CHECK_PASS', 'PASS', duplicate.outcome === 'EXACT_DUPLICATE' ? [duplicate.code] : []);
    }
    const mappingGate = gate(
      'LIBRARY_MAPPING_VALID',
      mapping.projection ? 'PASS' : 'BLOCKED',
      mapping.missing.length > 0 ? ['LIBRARY_MAPPING_GAP'] : [],
    );
    const gates = [
      schemaGate,
      sourceGate,
      rightsGate,
      evidenceGate,
      provenanceGate,
      reviewGate,
      duplicateGate,
      mappingGate,
    ];
    const exactDuplicate = duplicate.outcome === 'EXACT_DUPLICATE' && gates
      .filter((item) => item.name !== 'DUPLICATE_CHECK_PASS')
      .every((item) => item.status === 'PASS');
    const status = exactDuplicate
      ? 'EXACT_DUPLICATE_SKIPPED'
      : gates.some((item) => item.status === 'BLOCKED')
        ? 'IMPORT_BLOCKED'
        : gates.some((item) => item.status === 'REVIEW_REQUIRED')
          ? 'REVIEW_REQUIRED'
          : 'READY_FOR_IMPORT';
    const missingEvidence = [
      ...issueFieldsFor(issues, new Set([...EVIDENCE_CODES, ...PROVENANCE_CODES])),
      ...mapping.missing,
    ];
    let nextAction = 'All simulated gates passed. No production import is performed by this phase.';
    if (status === 'EXACT_DUPLICATE_SKIPPED') nextAction = 'Skip this exact duplicate; do not merge or overwrite the existing Library record.';
    else if (status === 'REVIEW_REQUIRED') nextAction = 'Resolve the possible duplicate or incomplete human review using recorded evidence; rerun the dry run.';
    else if (status === 'IMPORT_BLOCKED') nextAction = 'Resolve blocking validation, policy, evidence, or mapping gaps; a production writer is not available.';
    const errorCodes = [...new Set([...codes, ...duplicateCodes, ...(mapping.missing.length ? ['LIBRARY_MAPPING_GAP'] : [])])];

    return {
      packageId,
      recordId: pkg?.content?.recordId ?? null,
      sourceId: pkg?.source?.sourceId ?? null,
      sourceName: pkg?.source?.sourceName ?? null,
      contentType: pkg?.content?.contentType ?? null,
      reuseMode: pkg?.rights?.permittedReuseMode ?? null,
      rightsStatus: pkg?.rights?.verificationStatus ?? null,
      status,
      duplicateOutcome: duplicate.outcome,
      gates,
      errorCodes,
      missingEvidence: [...new Set(missingEvidence)],
      nextAction,
      readyForPhase37: false,
      _projection: mapping.projection,
    };
  });
};

const publicPackageResult = ({ _projection, ...result }) => result;

const readPackageCandidates = () => {
  if (!existsSync(APPROVED_CONTENT_ROOT)) return { state: 'ABSENT', packages: [] };
  const paths = readdirSync(APPROVED_CONTENT_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.json')
    .map((entry) => resolve(APPROVED_CONTENT_ROOT, entry.name))
    .sort();
  return { state: 'PRESENT', packages: paths.map(readJson) };
};

const summarize = (results) => ({
  packagesDiscovered: results.length,
  readyForImport: results.filter((item) => item.status === 'READY_FOR_IMPORT').length,
  blocked: results.filter((item) => item.status === 'IMPORT_BLOCKED').length,
  reviewRequired: results.filter((item) => item.status === 'REVIEW_REQUIRED').length,
  exactDuplicates: results.filter((item) => item.duplicateOutcome === 'EXACT_DUPLICATE').length,
  possibleDuplicates: results.filter((item) => item.duplicateOutcome === 'POSSIBLE_DUPLICATE').length,
  recordsImported: 0,
  approvedForLibraryImport: 0,
});

export const generateIntegrationRun = ({
  mode = 'DRY_RUN',
  packages = [],
  packageDirectoryState = 'ABSENT',
  policies,
  manifest,
  librarySnapshot = null,
  mappingByPackageId = {},
  provenanceDestinationAvailable = false,
  allowSyntheticForTests = false,
  upstreamPhase36 = null,
}) => {
  if (!['DRY_RUN', 'IMPORT'].includes(mode)) throw new TypeError(`Unsupported mode: ${mode}`);
  const policyById = assertProtectedBaselines(manifest, policies);
  const results = evaluatePackages(packages, policies, {
    librarySnapshot,
    mappingByPackageId,
    provenanceDestinationAvailable,
    allowSyntheticForTests,
  });
  if (mode === 'IMPORT' && results.some((item) => item.status === 'READY_FOR_IMPORT')) {
    for (const item of results) {
      if (item.status !== 'READY_FOR_IMPORT') continue;
      item.status = 'IMPORT_BLOCKED';
      item.errorCodes.push('LIBRARY_WRITER_UNAVAILABLE');
      item.nextAction = 'No production Library writer or provenance-preserving destination exists; no write was attempted.';
    }
  }
  const runId = randomUUID();
  return {
    phase: '3.8-controlled-library-integration',
    runId,
    mode,
    generatedAt: new Date().toISOString(),
    outcome: packages.length === 0 ? 'NO_CANDIDATES' : mode === 'IMPORT' ? 'IMPORT_BLOCKED' : 'DRY_RUN_ONLY',
    input: {
      packageDirectory: 'research/phase3-7-approved-content-package/approved-content',
      packageDirectoryState,
      packageCount: packages.length,
      librarySnapshotAvailable: false,
      protectedSourcePolicies: Object.fromEntries(Object.keys(PROTECTED_BASELINES).map((sourceId) => {
        const policy = policyById.get(sourceId);
        return [sourceId, { rightsStatus: policy.rightsStatus, maxReuseMode: policy.maxReuseMode }];
      })),
    },
    upstreamPhase36,
    summary: summarize(results),
    safety: {
      appImported: false,
      libraryModified: false,
      frontendModified: false,
      networkAccessed: false,
      published: false,
      productionWriterConfigured: false,
      partialImport: false,
      rollback: packages.length === 0 ? 'NOT_APPLICABLE' : 'NOT_PERFORMED',
    },
    packageResults: results.map(publicPackageResult),
  };
};

const assertReportPathsAreLocal = (paths) => {
  for (const path of Object.values(paths)) {
    const fromRoot = relative(INTEGRATION_ROOT, path);
    if (fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
      throw new Error(`Refusing to write outside Phase 3.8: ${path}`);
    }
  }
};

export const writeIntegrationRun = (run) => {
  const stem = `integration-run-${run.runId}`;
  const paths = {
    json: resolve(REPORT_DIR, `${stem}.json`),
    markdown: resolve(REPORT_DIR, `${stem}.md`),
  };
  assertReportPathsAreLocal(paths);
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(paths.json, `${JSON.stringify(run, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  const lines = [
    '# Phase 3.8 Controlled Library Integration',
    '',
    `- Run ID: ${run.runId}`,
    `- Mode: ${run.mode}`,
    `- Outcome: ${run.outcome}`,
    `- Package directory: ${run.input.packageDirectoryState} (${run.input.packageCount} package(s))`,
    '',
    '## Upstream Phase 3.6 pilot records (not Phase 3.8 package candidates)',
    '',
  ];
  if (run.upstreamPhase36) {
    const upstream = run.upstreamPhase36;
    lines.push(
      `- Data scope: ${upstream.dataScope}`,
      '',
      '| Phase 3.6 measure | Count |',
      '| --- | ---: |',
      `| Source-derived records processed | ${upstream.summary.recordsProcessed} |`,
      `| PASS | ${upstream.summary.pass} |`,
      `| BLOCKED | ${upstream.summary.blocked} |`,
      `| REVIEW_REQUIRED | ${upstream.summary.reviewRequired} |`,
      `| Ready for Phase 3.7 review | ${upstream.summary.readyForPhase37Review} |`,
      `| Approved for Library import | ${upstream.summary.approvedForLibraryImport} |`,
      '',
      '| Record ID | Source ID | Validation | Simulated review | Error codes | Missing evidence | Next action |',
      '| --- | --- | --- | --- | --- | --- | --- |',
    );
    for (const record of upstream.recordResults) {
      const escape = (value) => String(value ?? '—').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
      lines.push(`| ${escape(record.recordId)} | ${escape(record.sourceId)} | ${record.validationResult} | ${escape(record.simulatedReviewStatus)} | ${escape(record.errorCodes.join(', ') || 'none')} | ${escape(record.missingEvidence.join('; ') || 'none recorded')} | ${escape(record.nextAction)} |`);
    }
  } else {
    lines.push('Not supplied for this isolated in-memory test run.', '');
  }
  lines.push(
    '',
    '## Summary',
    '',
    '| Measure | Count |',
    '| --- | ---: |',
    `| Packages discovered | ${run.summary.packagesDiscovered} |`,
    `| Ready for import gates | ${run.summary.readyForImport} |`,
    `| Blocked | ${run.summary.blocked} |`,
    `| Review required | ${run.summary.reviewRequired} |`,
    `| Exact duplicates | ${run.summary.exactDuplicates} |`,
    `| Possible duplicates | ${run.summary.possibleDuplicates} |`,
    `| Records imported | ${run.summary.recordsImported} |`,
    `| Approved for Library import | ${run.summary.approvedForLibraryImport} |`,
    '',
    '## Per-package result',
    '',
    '| Package | Record | Source | Content type | Reuse / rights | Result | Duplicate | Error codes | Missing evidence / gap | Next action |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  );
  if (run.packageResults.length === 0) {
    lines.push('| None | — | — | — | — | NO_CANDIDATES | NOT_CHECKED | — | No Phase 3.7 approved packages exist. | Resolve Phase 3.6/3.7 eligibility first. |');
  } else {
    for (const item of run.packageResults) {
      const escape = (value) => String(value ?? '—').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
      lines.push(`| ${escape(item.packageId)} | ${escape(item.recordId)} | ${escape(item.sourceName)} (${escape(item.sourceId)}) | ${escape(item.contentType)} | ${escape(item.reuseMode)} / ${escape(item.rightsStatus)} | ${item.status} | ${item.duplicateOutcome} | ${escape(item.errorCodes.join(', ') || 'none')} | ${escape(item.missingEvidence.join('; ') || 'none recorded')} | ${escape(item.nextAction)} |`);
    }
  }
  lines.push(
    '',
    '## Safety and interpretation',
    '',
    '- No app import, Library mutation, frontend modification, network access, or publication was performed.',
    '- The Phase 3.7 package directory is absent; the current real-record baseline remains zero eligible packages.',
    '- PLOS remains `unknown` / `link-only`; VOA remains `partially-verified` / `metadata-only`.',
    '- `READY_FOR_IMPORT` is only a simulated gate result. No record is `APPROVED_FOR_LIBRARY_IMPORT`.',
    '- The static Library has no content writer or provenance-preserving transactional destination. IMPORT remains fail-closed.',
    '- Any positive-path package used by tests is synthetic and in-memory only.',
    '',
  );
  writeFileSync(paths.markdown, `${lines.join('\n')}\n`, { encoding: 'utf8', flag: 'wx' });
  return paths;
};

export const runIntegration = (mode = 'DRY_RUN') => {
  const packageInput = readPackageCandidates();
  const policies = loadPolicies();
  const manifest = readJson(MANIFEST_PATH);
  const upstreamPhase36 = summarizePhase36Results(manifest, readJson(PHASE36_RESULTS_PATH));
  const run = generateIntegrationRun({
    mode,
    packages: packageInput.packages,
    packageDirectoryState: packageInput.state,
    policies,
    manifest,
    upstreamPhase36,
  });
  const paths = writeIntegrationRun(run);
  console.log(JSON.stringify({ ...run.summary, outcome: run.outcome, mode: run.mode }, null, 2));
  console.log(`Reports written only under ${REPORT_DIR}`);
  return { run, paths };
};

export const simulateImportTransaction = ({
  packages,
  policies,
  adapter,
  mappingByPackageId,
  allowSyntheticForTests = false,
}) => {
  if (adapter?.testOnly !== true) {
    throw new TypeError('Transaction simulation accepts only an explicitly test-only in-memory adapter.');
  }
  for (const method of ['snapshot', 'writeBatch', 'readAll', 'restore']) {
    if (typeof adapter?.[method] !== 'function') {
      throw new TypeError(`In-memory transaction adapter requires ${method}().`);
    }
  }
  const snapshot = structuredClone(adapter.snapshot());
  if (!Array.isArray(snapshot)) throw new TypeError('Transaction snapshot must be an array.');
  const results = evaluatePackages(packages, policies, {
    librarySnapshot: snapshot,
    mappingByPackageId,
    provenanceDestinationAvailable: true,
    allowSyntheticForTests,
  });
  if (results.some((item) => item.status !== 'READY_FOR_IMPORT')) {
    return { status: 'PREVALIDATION_FAILED', results: results.map(publicPackageResult), writeCalls: 0, rollbackVerified: null };
  }

  const projections = results.map((item) => item._projection);
  try {
    adapter.writeBatch(projections);
    const after = adapter.readAll();
    const actualIds = new Set(after.map((item) => item?.article?.id ?? item?.id));
    if (projections.some((item) => !actualIds.has(item.article.id))) {
      throw new Error('Post-write verification did not find every prepared article.');
    }
    return { status: 'COMMITTED_IN_MEMORY_TEST_ONLY', results: results.map(publicPackageResult), writeCalls: 1, rollbackVerified: null };
  } catch (writeError) {
    try {
      adapter.restore(structuredClone(snapshot));
      const restored = adapter.readAll();
      const rollbackVerified = JSON.stringify(restored) === JSON.stringify(snapshot);
      if (!rollbackVerified) {
        return {
          status: 'ROLLBACK_FAILED',
          error: writeError instanceof Error ? writeError.message : String(writeError),
          results: results.map(publicPackageResult),
          writeCalls: 1,
          rollbackVerified: false,
        };
      }
      return {
        status: 'ROLLED_BACK_IN_MEMORY_TEST_ONLY',
        error: writeError instanceof Error ? writeError.message : String(writeError),
        results: results.map(publicPackageResult),
        writeCalls: 1,
        rollbackVerified: true,
      };
    } catch (rollbackError) {
      return {
        status: 'ROLLBACK_FAILED',
        error: writeError instanceof Error ? writeError.message : String(writeError),
        rollbackError: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        results: results.map(publicPackageResult),
        writeCalls: 1,
        rollbackVerified: false,
      };
    }
  }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const modeArgument = process.argv.slice(2);
  let mode = 'DRY_RUN';
  if (modeArgument.length === 0) {
    mode = 'DRY_RUN';
  } else if (modeArgument.length === 2 && modeArgument[0] === '--mode' && ['DRY_RUN', 'IMPORT'].includes(modeArgument[1])) {
    mode = modeArgument[1];
  } else {
    console.error('Usage: node scripts/integration.mjs [--mode DRY_RUN|IMPORT]');
    process.exitCode = 2;
  }
  if (process.exitCode !== 2) {
    try {
      runIntegration(mode);
    } catch (error) {
      console.error(`Integration run failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  }
}
