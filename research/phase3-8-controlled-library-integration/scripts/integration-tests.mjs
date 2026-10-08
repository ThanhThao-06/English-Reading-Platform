import assert from 'node:assert/strict';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INTEGRATION_ROOT,
  evaluatePackages,
  generateIntegrationRun,
  simulateImportTransaction,
  summarizePhase36Results,
  writeIntegrationRun,
} from './integration.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(INTEGRATION_ROOT, '..', '..');
const policyRoot = resolve(PROJECT_ROOT, 'research', 'phase3-5-content-intake', 'fixtures', 'source-policies');
const policies = [
  'plos-one.json',
  'voa-learning-english.json',
  'synthetic-open-source.json',
  'synthetic-metadata-source.json',
].map((file) => JSON.parse(readFileSync(resolve(policyRoot, file), 'utf8')));
const syntheticPolicy = policies.find((policy) => policy.sourceId === 'synthetic-open-source');
const manifest = JSON.parse(readFileSync(resolve(PROJECT_ROOT, 'research', 'phase3-4-pilot', 'pilot-manifest.json'), 'utf8'));
const phase36 = JSON.parse(readFileSync(resolve(PROJECT_ROOT, 'research', 'phase3-6-content-import-dry-run', 'reports', 'dry-run-results.json'), 'utf8'));
const runSchema = JSON.parse(readFileSync(resolve(INTEGRATION_ROOT, 'schemas', 'integration-run.schema.json'), 'utf8'));
const counters = { scenarios: 0, assertions: 0 };

const check = (condition, message) => {
  counters.assertions += 1;
  assert.ok(condition, message);
};
const expectCode = (result, code, message = `expected ${code}`) => {
  check(result.errorCodes.includes(code), `${message}; got ${result.errorCodes.join(', ')}`);
};
const scenario = (name, callback) => {
  callback();
  counters.scenarios += 1;
  console.log(`PASS ${name}`);
};
const clone = (value) => structuredClone(value);

const makeSyntheticPackage = (recordId = 'phase38-synthetic-001') => {
  const timestamp = '2026-10-03T09:00:00.000Z';
  return {
    schemaVersion: 1,
    packageId: recordId,
    version: 1,
    createdAt: timestamp,
    supersedes: null,
    packageStatus: 'ELIGIBLE',
    eligibleForPhase38: true,
    testOnly: true,
    content: {
      recordId,
      title: 'Synthetic Phase 3.8 test article',
      contentType: 'educational',
      contentGroup: 'articles',
      categories: { primary: 'science', secondary: ['education'] },
      language: 'en',
      authors: ['Synthetic Test Author'],
      reuseMode: 'verified-full-text',
      body: 'Synthetic test-only body. Not real content.',
      bodyReference: null,
    },
    source: {
      sourceId: syntheticPolicy.sourceId,
      sourceName: 'Synthetic Test Source',
      sourceUrl: 'https://example.invalid/synthetic-source',
      canonicalUrl: `https://example.invalid/${recordId}`,
      externalId: `${recordId}-external`,
      doi: `10.5555/${recordId}`,
    },
    rights: {
      verificationStatus: 'verified',
      permittedReuseMode: 'verified-full-text',
      rightsBasis: 'license',
      sourcePolicy: { rightsStatus: 'verified', maxReuseMode: 'verified-full-text' },
      license: {
        type: 'creative-commons',
        identifier: 'SYNTHETIC-ONLY',
        url: 'https://example.invalid/synthetic-license',
      },
      attributionRequired: true,
      attributionText: 'Synthetic test attribution; not legal or factual evidence.',
      evidence: [
        {
          evidenceId: `${recordId}-source`,
          evidenceType: 'source-policy',
          sourceUrl: 'https://example.invalid/synthetic-policy',
          reference: 'synthetic policy fixture; not evidence',
          excerpt: 'Synthetic test only.',
          retrievedAt: null,
          scope: 'source',
          appliesToRecordId: syntheticPolicy.sourceId,
        },
        {
          evidenceId: `${recordId}-metadata`,
          evidenceType: 'item-metadata',
          sourceUrl: `https://example.invalid/${recordId}`,
          reference: 'synthetic metadata fixture; not evidence',
          excerpt: 'Synthetic test only.',
          retrievedAt: '2026-10-03',
          scope: 'item',
          appliesToRecordId: recordId,
        },
        {
          evidenceId: `${recordId}-license`,
          evidenceType: 'item-license',
          sourceUrl: 'https://example.invalid/synthetic-license-evidence',
          reference: 'synthetic license fixture; not evidence',
          excerpt: 'Synthetic test only.',
          retrievedAt: '2026-10-03',
          scope: 'item',
          appliesToRecordId: recordId,
        },
      ],
    },
    validation: { validator: 'Phase 3.5 test validator', result: 'PASS', errorCodes: [] },
    review: {
      reviewStatus: 'approved',
      reviewedAt: timestamp,
      reviewer: 'Synthetic test fixture',
      decision: 'Synthetic positive-path test only.',
    },
    provenance: {
      sourceRecordId: recordId,
      intakeRecordId: recordId,
      intakeSchemaVersion: 'phase3.5-independent-intake-v1',
      intakeValidationResult: 'PASS',
      dryRunResult: 'PASS',
      dryRunRecordId: recordId,
      reviewStatus: 'approved',
      packageCreatedAt: timestamp,
      sourceManifest: 'synthetic-test-only',
    },
  };
};

const mappingFor = () => ({
  description: 'Synthetic test description.',
  image: '/synthetic/test-only-cover.png',
  imageRightsEvidenceRef: 'synthetic-only; not asset evidence',
  genre: 'Science & Nature',
  level: 'B1',
  readingTime: 'Under 3 min',
});

const evaluateSynthetic = (packages, extras = {}) => evaluatePackages(packages, policies, {
  librarySnapshot: [],
  mappingByPackageId: Object.fromEntries(packages.filter(Boolean).map((pkg) => [pkg.packageId, mappingFor()])),
  provenanceDestinationAvailable: true,
  allowSyntheticForTests: true,
  ...extras,
});

const createMemoryAdapter = (initial = [], { failWrite = false, failRestore = false } = {}) => {
  let content = clone(initial);
  let writes = 0;
  return {
    testOnly: true,
    snapshot: () => clone(content),
    writeBatch(records) {
      writes += 1;
      content.push(...clone(records));
      if (failWrite) throw new Error('Synthetic adapter write failure.');
    },
    readAll: () => clone(content),
    restore(snapshot) {
      if (failRestore) throw new Error('Synthetic adapter restore failure.');
      content = clone(snapshot);
    },
    current: () => clone(content),
    get writes() { return writes; },
  };
};

scenario('run schema and required gates are defined', () => {
  check(runSchema.required.includes('input') && runSchema.required.includes('summary'), 'run schema requires input and summary');
  check(runSchema.properties.safety.properties.libraryModified.const === false, 'schema forbids Library modification');
  check(runSchema.properties.summary.properties.approvedForLibraryImport.const === 0, 'schema fixes production approvals at zero');
  check(runSchema.properties.packageResults.items.properties.readyForPhase37.const === false, 'integration cannot mark package ready for Phase 3.7');
});

scenario('protected PLOS and VOA policy baselines remain unchanged', () => {
  const policyMap = new Map(policies.map((policy) => [policy.sourceId, policy]));
  check(policyMap.get('plos-one').rightsStatus === 'unknown' && policyMap.get('plos-one').maxReuseMode === 'link-only', 'PLOS baseline remains unknown/link-only');
  check(policyMap.get('voa-learning-english').rightsStatus === 'partially-verified' && policyMap.get('voa-learning-english').maxReuseMode === 'metadata-only', 'VOA baseline remains partially-verified/metadata-only');
  const run = generateIntegrationRun({ packages: [], policies, manifest });
  check(run.outcome === 'NO_CANDIDATES' && run.summary.recordsImported === 0, 'no real candidates produces no import');
});

scenario('all Phase 3.4 records are represented by the upstream Phase 3.6 results', () => {
  const upstream = summarizePhase36Results(manifest, phase36);
  check(upstream.summary.recordsProcessed === 8 && upstream.recordResults.length === manifest.records.length, 'all eight pilot records map one-to-one into the upstream report');
  check(upstream.summary.pass === 0 && upstream.summary.blocked === 2 && upstream.summary.reviewRequired === 6, 'upstream outcomes preserve the Phase 3.6 baseline');
  check(upstream.summary.readyForPhase37Review === 0 && upstream.summary.approvedForLibraryImport === 0, 'no upstream record is ready or approved for import');
  check(upstream.recordResults.every((record) => record.errorCodes.every((code) => typeof code === 'string')), 'record error codes remain machine-readable');
});

scenario('synthetic valid package passes Phase 3.7 validation and all test-only gates', () => {
  const pkg = makeSyntheticPackage();
  const [result] = evaluateSynthetic([pkg]);
  check(result.status === 'READY_FOR_IMPORT', 'synthetic positive path passes every simulated gate');
  check(result.errorCodes.length === 0, 'synthetic positive path has no errors');
  check(result.gates.length === 8 && result.gates.every((item) => item.status === 'PASS'), 'all eight integration gates pass');
  check(result.readyForPhase37 === false, 'integration result cannot promote or label Phase 3.7 readiness');
});

scenario('item-level licensed package without a source policy can pass with no image', () => {
  const pkg = makeSyntheticPackage('unregistered-item-rights-test');
  pkg.source.sourceId = 'unregistered-item-rights-source';
  pkg.rights.sourcePolicy = null;
  pkg.rights.evidence = pkg.rights.evidence.filter((item) => item.evidenceType !== 'source-policy');
  const mapping = { ...mappingFor(), image: null, imageRightsEvidenceRef: null };
  const [result] = evaluatePackages([pkg], policies, {
    librarySnapshot: [],
    mappingByPackageId: { [pkg.packageId]: mapping },
    provenanceDestinationAvailable: true,
    allowSyntheticForTests: true,
  });
  check(result.status === 'READY_FOR_IMPORT', `item license and no image should pass; got ${result.status} (${result.errorCodes.join(', ')})`);
  check(result.gates.every((item) => item.status === 'PASS'), 'absence of source registry policy and image rights does not block cleared text');
});

scenario('PLOS full text above the unchanged link-only ceiling is blocked', () => {
  const pkg = makeSyntheticPackage('plos-policy-test');
  pkg.source.sourceId = 'plos-one';
  pkg.source.sourceName = 'PLOS ONE';
  pkg.rights.sourcePolicy = { rightsStatus: 'unknown', maxReuseMode: 'link-only' };
  const [result] = evaluatePackages([pkg], policies, {
    librarySnapshot: [],
    mappingByPackageId: { [pkg.packageId]: mappingFor() },
    provenanceDestinationAvailable: true,
  });
  check(result.status === 'IMPORT_BLOCKED', 'full-text request is blocked by real PLOS source ceiling');
  expectCode(result, 'PACKAGE_POLICY_EXCEEDED');
});

scenario('unknown rights cannot pass the rights gate', () => {
  const pkg = makeSyntheticPackage('unknown-rights-test');
  pkg.rights.verificationStatus = 'unknown';
  const [result] = evaluateSynthetic([pkg]);
  check(result.status === 'IMPORT_BLOCKED', 'unknown rights block package');
  check(result.gates.find((item) => item.name === 'RIGHTS_VALID').status === 'BLOCKED', 'rights gate is explicitly blocked');
  expectCode(result, 'PACKAGE_RIGHTS_INSUFFICIENT');
});

scenario('missing item evidence and attribution are blocked by package validator', () => {
  const pkg = makeSyntheticPackage('missing-evidence-test');
  pkg.rights.evidence = pkg.rights.evidence.filter((item) => item.evidenceType !== 'item-license');
  pkg.rights.attributionText = null;
  const [result] = evaluateSynthetic([pkg]);
  check(result.status === 'IMPORT_BLOCKED', 'missing evidence blocks package');
  expectCode(result, 'PACKAGE_EVIDENCE_REQUIRED');
  expectCode(result, 'PACKAGE_ATTRIBUTION_REQUIRED');
});

scenario('incomplete provenance is not repaired or promoted', () => {
  const pkg = makeSyntheticPackage('missing-provenance-test');
  pkg.provenance.sourceRecordId = '';
  const before = clone(pkg.provenance);
  const [result] = evaluateSynthetic([pkg]);
  check(result.status === 'IMPORT_BLOCKED', 'incomplete provenance blocks package');
  expectCode(result, 'PACKAGE_PROVENANCE_INCOMPLETE');
  check(JSON.stringify(pkg.provenance) === JSON.stringify(before), 'validation does not mutate provenance');
});

scenario('exact and possible duplicate outcomes are distinct', () => {
  const exactPackage = makeSyntheticPackage('exact-duplicate-test');
  const exactSnapshot = [{ id: 'existing', doi: `https://doi.org/${exactPackage.source.doi}`, title: 'Different title' }];
  const [exact] = evaluateSynthetic([exactPackage], { librarySnapshot: exactSnapshot });
  check(exact.duplicateOutcome === 'EXACT_DUPLICATE', 'matching DOI is an exact duplicate');
  check(exact.status === 'EXACT_DUPLICATE_SKIPPED', 'exact duplicate is skipped without merge');

  const possiblePackage = makeSyntheticPackage('possible-duplicate-test');
  const [possible] = evaluateSynthetic([possiblePackage], {
    librarySnapshot: [{ id: 'existing', title: possiblePackage.content.title }],
  });
  check(possible.duplicateOutcome === 'POSSIBLE_DUPLICATE', 'matching title without identifier is possible duplicate');
  check(possible.status === 'REVIEW_REQUIRED', 'possible duplicate requires review');
});

scenario('unavailable Library snapshot fails duplicate gate closed', () => {
  const pkg = makeSyntheticPackage('snapshot-unavailable-test');
  const [result] = evaluatePackages([pkg], policies, {
    mappingByPackageId: { [pkg.packageId]: mappingFor() },
    provenanceDestinationAvailable: true,
    allowSyntheticForTests: true,
  });
  check(result.status === 'IMPORT_BLOCKED', 'unknown duplicate state blocks package');
  check(result.duplicateOutcome === 'NOT_CHECKED', 'missing snapshot is not labeled no-duplicate');
  expectCode(result, 'LIBRARY_SNAPSHOT_UNAVAILABLE');
});

scenario('duplicate package identifiers are caught across a batch', () => {
  const first = makeSyntheticPackage('batch-duplicate-001');
  const second = clone(first);
  second.packageId = 'batch-duplicate-002';
  second.content.recordId = 'batch-duplicate-002';
  second.source.externalId = 'batch-duplicate-002-ext';
  second.source.doi = '10.5555/batch-duplicate-002';
  second.source.canonicalUrl = 'https://example.invalid/batch-duplicate-002';
  second.provenance = {
    ...second.provenance,
    sourceRecordId: 'batch-duplicate-002',
    intakeRecordId: 'batch-duplicate-002',
    dryRunRecordId: 'batch-duplicate-002',
  };
  const duplicate = clone(second);
  duplicate.packageId = 'batch-duplicate-003';
  duplicate.content.recordId = 'batch-duplicate-003';
  duplicate.provenance = {
    ...duplicate.provenance,
    sourceRecordId: 'batch-duplicate-003',
    intakeRecordId: 'batch-duplicate-003',
    dryRunRecordId: 'batch-duplicate-003',
  };
  const results = evaluateSynthetic([second, duplicate]);
  check(results.every((item) => item.status === 'IMPORT_BLOCKED'), 'duplicate batch entries are blocked');
  check(results.some((item) => item.errorCodes.includes('PACKAGE_DUPLICATE_DOI')), 'duplicate DOI validator code is retained');
});

scenario('Article mapping gaps and missing provenance destination block production mapping', () => {
  const pkg = makeSyntheticPackage('mapping-gap-test');
  const [result] = evaluatePackages([pkg], policies, {
    librarySnapshot: [],
    mappingByPackageId: {},
    provenanceDestinationAvailable: false,
    allowSyntheticForTests: true,
  });
  check(result.status === 'IMPORT_BLOCKED', 'unmapped required Article fields block package');
  check(result.gates.find((item) => item.name === 'LIBRARY_MAPPING_VALID').status === 'BLOCKED', 'mapping gate explicitly fails');
  expectCode(result, 'LIBRARY_MAPPING_GAP');
  check(result.missingEvidence.some((item) => item.includes('description')), 'missing editorial fields are reported');
  check(result.missingEvidence.some((item) => item.includes('provenance')), 'missing provenance destination is reported');
});

scenario('ineligible review and blocked Phase 3.7 packages cannot pass', () => {
  const pkg = makeSyntheticPackage('review-not-approved-test');
  pkg.packageStatus = 'NOT_ELIGIBLE';
  pkg.eligibleForPhase38 = false;
  pkg.review.reviewStatus = 'needs-quality-review';
  pkg.provenance.reviewStatus = 'needs-quality-review';
  const [result] = evaluateSynthetic([pkg]);
  check(result.status === 'REVIEW_REQUIRED', 'unapproved package remains under review');
  check(result.gates.find((item) => item.name === 'REVIEW_VALID').status === 'REVIEW_REQUIRED', 'review gate retains waiting status');

  const blocked = makeSyntheticPackage('blocked-package-test');
  blocked.packageStatus = 'NOT_ELIGIBLE';
  blocked.eligibleForPhase38 = false;
  blocked.validation.result = 'BLOCKED';
  blocked.provenance.intakeValidationResult = 'FAIL';
  blocked.provenance.dryRunResult = 'BLOCKED';
  const [blockedResult] = evaluateSynthetic([blocked]);
  check(blockedResult.status === 'IMPORT_BLOCKED', 'blocked package cannot become ready');
});

scenario('IMPORT mode remains blocked even for a synthetic all-gates-pass package', () => {
  const pkg = makeSyntheticPackage('import-mode-test');
  const run = generateIntegrationRun({
    mode: 'IMPORT',
    packages: [pkg],
    packageDirectoryState: 'PRESENT',
    policies,
    manifest,
    librarySnapshot: [],
    mappingByPackageId: { [pkg.packageId]: mappingFor() },
    provenanceDestinationAvailable: true,
    allowSyntheticForTests: true,
  });
  check(run.packageResults[0].status === 'IMPORT_BLOCKED', 'CLI import mode blocks on absent production writer');
  check(run.packageResults[0].errorCodes.includes('LIBRARY_WRITER_UNAVAILABLE'), 'writer absence has a stable error code');
  check(run.summary.recordsImported === 0 && run.summary.approvedForLibraryImport === 0, 'import mode reports zero imported and approved records');
});

scenario('JSON and Markdown run reports are created in Phase 3.8 and test outputs are cleaned', () => {
  const run = generateIntegrationRun({ packages: [], policies, manifest });
  run.runId = `test-${randomUUID()}`;
  const paths = writeIntegrationRun(run);
  try {
    check(existsSync(paths.json) && existsSync(paths.markdown), 'both report formats are written');
    const saved = JSON.parse(readFileSync(paths.json, 'utf8'));
    check(saved.runId === run.runId && saved.summary.recordsImported === 0, 'JSON report preserves run id and zero-import result');
    check(readFileSync(paths.markdown, 'utf8').includes('NO_CANDIDATES'), 'Markdown report describes the empty input');
    check(resolve(paths.json).startsWith(`${INTEGRATION_ROOT}\\reports\\`), 'JSON output stays inside the Phase 3.8 reports directory');
  } finally {
    for (const path of [paths.json, paths.markdown]) {
      if (existsSync(path)) unlinkSync(path);
    }
  }
});

scenario('DRY_RUN evaluation does not mutate Library input', () => {
  const pkg = makeSyntheticPackage('dry-run-no-mutation-test');
  const snapshot = [{ id: 'existing-library-item', title: 'Untouched record' }];
  const before = clone(snapshot);
  evaluateSynthetic([pkg], { librarySnapshot: snapshot });
  check(JSON.stringify(snapshot) === JSON.stringify(before), 'dry-run duplicate evaluation leaves Library snapshot unchanged');
});

scenario('two-candidate preflight completes before any transaction write', () => {
  const first = makeSyntheticPackage('preflight-valid-first');
  const second = makeSyntheticPackage('preflight-invalid-second');
  second.rights.verificationStatus = 'unknown';
  const adapter = createMemoryAdapter([]);
  const result = simulateImportTransaction({
    packages: [first, second],
    policies,
    adapter,
    mappingByPackageId: {
      [first.packageId]: mappingFor(),
      [second.packageId]: mappingFor(),
    },
    allowSyntheticForTests: true,
  });
  check(result.status === 'PREVALIDATION_FAILED', 'invalid second candidate blocks the entire batch');
  check(adapter.writes === 0 && result.writeCalls === 0, 'no writes occur before all candidates pass');
  check(adapter.current().length === 0, 'Library state remains unchanged after preflight failure');
});

scenario('transaction simulation refuses an adapter not explicitly marked test-only', () => {
  const pkg = makeSyntheticPackage('adapter-rejected-test');
  const adapter = {
    snapshot: () => [],
    writeBatch: () => { throw new Error('Must not call a non-test adapter.'); },
    readAll: () => [],
    restore: () => {},
  };
  assert.throws(() => simulateImportTransaction({
    packages: [pkg],
    policies,
    adapter,
    mappingByPackageId: { [pkg.packageId]: mappingFor() },
    allowSyntheticForTests: true,
  }), /explicitly test-only/);
  check(true, 'non-test adapter is refused before any write');
});

scenario('simulated write failure restores and verifies the original snapshot', () => {
  const pkg = makeSyntheticPackage('rollback-test');
  const original = [{ id: 'existing', title: 'Preserve this synthetic row' }];
  const adapter = createMemoryAdapter(original, { failWrite: true });
  const result = simulateImportTransaction({
    packages: [pkg],
    policies,
    adapter,
    mappingByPackageId: { [pkg.packageId]: mappingFor() },
    allowSyntheticForTests: true,
  });
  check(result.status === 'ROLLED_BACK_IN_MEMORY_TEST_ONLY', 'failed write returns explicit rollback state');
  check(result.rollbackVerified === true, 'rollback is checked against the original snapshot');
  check(JSON.stringify(adapter.current()) === JSON.stringify(original), 'in-memory Library returns to its exact original state');
});

scenario('successful transaction commits only to the injected in-memory adapter', () => {
  const pkg = makeSyntheticPackage('memory-commit-test');
  const adapter = createMemoryAdapter([{ id: 'existing', title: 'Existing test row' }]);
  const result = simulateImportTransaction({
    packages: [pkg],
    policies,
    adapter,
    mappingByPackageId: { [pkg.packageId]: mappingFor() },
    allowSyntheticForTests: true,
  });
  check(result.status === 'COMMITTED_IN_MEMORY_TEST_ONLY', 'only the fake adapter reports a test commit');
  check(adapter.writes === 1, 'the fully validated batch is submitted once');
  check(adapter.current().length === 2, 'test adapter contains the pre-existing row plus the mapped synthetic record');
  check(adapter.current()[1].integrationMetadata.packageId === pkg.packageId, 'simulated sidecar retains package provenance');
});

scenario('rollback failure is surfaced, never reported as successful', () => {
  const pkg = makeSyntheticPackage('rollback-failure-test');
  const adapter = createMemoryAdapter([], { failWrite: true, failRestore: true });
  const result = simulateImportTransaction({
    packages: [pkg],
    policies,
    adapter,
    mappingByPackageId: { [pkg.packageId]: mappingFor() },
    allowSyntheticForTests: true,
  });
  check(result.status === 'ROLLBACK_FAILED', 'failed restoration is surfaced');
  check(result.rollbackVerified === false, 'failed rollback is not presented as verified');
});

scenario('runner has no app import, network call, or external write target', () => {
  const source = readFileSync(resolve(INTEGRATION_ROOT, 'scripts', 'integration.mjs'), 'utf8');
  check(!/from\s+['"][^'"]*frontend|import\s*\(\s*['"][^'"]*frontend/i.test(source), 'runner imports no frontend or app modules');
  check(!/\bfetch\s*\(|https?\.request|https?\.get|createConnection|openDatabase/i.test(source), 'runner contains no network or database calls');
  check(source.includes('REPORT_DIR = resolve(INTEGRATION_ROOT, \'reports\')'), 'report writes are rooted inside Phase 3.8');
  check(!source.includes('writeFileSync(APPROVED_CONTENT_ROOT'), 'runner never writes approved packages');
  check(!source.includes('writeFileSync(REPORT_DIR,') && !source.includes('frontend/dist'), 'runner does not target app data or generated frontend outputs');
});

console.log(`\n${counters.scenarios} scenarios, ${counters.assertions} assertions passed.`);
