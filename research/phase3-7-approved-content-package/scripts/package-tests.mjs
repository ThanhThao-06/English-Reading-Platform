import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PACKAGE_ROOT,
  buildPackagesFromIntake,
  buildPackagesFromCandidates,
  getPackageOutputPaths,
  loadPackageSchema,
  runPackageBuild,
  validatePackage,
  validatePackageBatch,
} from './build-package.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT_ROOT = resolve(ROOT, '..', '..');
const intakeRoot = resolve(PROJECT_ROOT, 'research', 'phase3-5-content-intake');
const dryRunResults = JSON.parse(readFileSync(resolve(PROJECT_ROOT, 'research', 'phase3-6-content-import-dry-run', 'reports', 'dry-run-results.json'), 'utf8'));
const policies = ['plos-one.json', 'voa-learning-english.json', 'synthetic-open-source.json', 'synthetic-metadata-source.json']
  .map((name) => JSON.parse(readFileSync(resolve(intakeRoot, 'fixtures', 'source-policies', name), 'utf8')));
const syntheticPolicy = policies.find((policy) => policy.sourceId === 'synthetic-open-source');
const fullTextIntakeFixture = JSON.parse(readFileSync(resolve(intakeRoot, 'fixtures', 'valid', 'verified-full-text.json'), 'utf8'));
const schema = loadPackageSchema();
const checks = { assertions: 0, scenarios: 0 };
const check = (condition, message) => {
  checks.assertions += 1;
  assert.ok(condition, message);
};
const expectCode = (result, code) => check(result.errors.some((issue) => issue.code === code), `expected ${code}; received ${result.errors.map((issue) => issue.code).join(', ')}`);
const clone = (value) => structuredClone(value);
const scenario = (name, callback) => {
  callback();
  checks.scenarios += 1;
  console.log(`PASS ${name}`);
};

const makeSyntheticPackage = () => {
  const now = '2026-10-03T09:00:00.000Z';
  const id = 'synthetic-record-001';
  return {
    schemaVersion: 1,
    packageId: 'synthetic-record-001',
    version: 1,
    createdAt: now,
    supersedes: null,
    packageStatus: 'ELIGIBLE',
    eligibleForPhase38: true,
    testOnly: true,
    content: {
      recordId: id,
      title: 'Synthetic package validation fixture',
      contentType: 'educational',
      contentGroup: 'articles',
      categories: { primary: 'science', secondary: ['education'] },
      language: 'en',
      authors: ['Synthetic Test Author'],
      reuseMode: 'verified-full-text',
      body: 'Synthetic in-memory test text only.',
      bodyReference: null,
    },
    source: {
      sourceId: 'synthetic-open-source',
      sourceName: 'Synthetic Test Source',
      sourceUrl: 'https://example.invalid/synthetic-source',
      canonicalUrl: 'https://example.invalid/synthetic-record-001',
      externalId: 'synthetic-external-001',
      doi: '10.5555/synthetic-package.001',
    },
    rights: {
      verificationStatus: 'verified',
      permittedReuseMode: 'verified-full-text',
      rightsBasis: 'license',
      sourcePolicy: { rightsStatus: 'verified', maxReuseMode: 'verified-full-text' },
      license: {
        type: 'creative-commons',
        identifier: 'SYNTHETIC-TEST-ONLY',
        url: 'https://example.invalid/synthetic-license',
      },
      attributionRequired: true,
      attributionText: 'Synthetic test-only attribution; not evidence.',
      evidence: [
        {
          evidenceId: 'synthetic-source-policy',
          evidenceType: 'source-policy',
          sourceUrl: 'https://example.invalid/synthetic-policy',
          reference: 'synthetic-policy-fixture',
          excerpt: 'SYNTHETIC; not real rights evidence.',
          retrievedAt: null,
          scope: 'source',
          appliesToRecordId: 'synthetic-open-source',
        },
        {
          evidenceId: 'synthetic-item-metadata',
          evidenceType: 'item-metadata',
          sourceUrl: 'https://example.invalid/synthetic-record-001',
          reference: 'synthetic-item-fixture',
          excerpt: 'SYNTHETIC; not real content evidence.',
          retrievedAt: '2026-10-03',
          scope: 'item',
          appliesToRecordId: id,
        },
        {
          evidenceId: 'synthetic-item-license',
          evidenceType: 'item-license',
          sourceUrl: 'https://example.invalid/synthetic-license-evidence',
          reference: 'synthetic-license-evidence-fixture',
          excerpt: 'SYNTHETIC; not a real license statement.',
          retrievedAt: '2026-10-03',
          scope: 'item',
          appliesToRecordId: id,
        },
      ],
    },
    validation: { validator: 'Phase 3.5 validator (test fixture)', result: 'PASS', errorCodes: [] },
    review: {
      reviewStatus: 'approved',
      reviewedAt: now,
      reviewer: 'Synthetic test fixture only',
      decision: 'Synthetic test-only positive-path decision; not a real review.',
    },
    provenance: {
      sourceRecordId: id,
      intakeRecordId: id,
      intakeSchemaVersion: 'phase3.5-independent-intake-v1',
      intakeValidationResult: 'PASS',
      dryRunResult: 'PASS',
      dryRunRecordId: id,
      reviewStatus: 'approved',
      packageCreatedAt: now,
      sourceManifest: 'synthetic-test-only',
    },
  };
};

/**
 * A VOA Learning English package built under the conditional publisher grant.
 * There is deliberately no item-license evidence and no license identifier: a
 * VOA-produced article has no separate per-article license document.
 */
const makeVoaPackage = (overrides = {}) => {
  const now = '2026-10-03T09:00:00.000Z';
  const id = 'voa-learning-english-3111026';
  const pkg = makeSyntheticPackage();
  pkg.testOnly = false;
  pkg.content = {
    recordId: id,
    title: 'Lesson 1: Welcome!',
    contentType: 'educational',
    contentGroup: 'articles',
    categories: { primary: 'language-learning', secondary: ['education'] },
    language: 'en',
    authors: ['VOA Learning English'],
    reuseMode: 'verified-full-text',
    body: 'Welcome to Let\'s Learn English. In this lesson we learn how to greet people and say our names.',
    bodyReference: null,
  };
  pkg.source = {
    sourceId: 'voa-learning-english',
    sourceName: 'VOA Learning English',
    sourceUrl: 'https://learningenglish.voanews.com/',
    canonicalUrl: 'https://learningenglish.voanews.com/a/lets-learn-english-lesson-one/3111026.html',
    externalId: '3111026',
    doi: null,
  };
  pkg.rights = {
    verificationStatus: 'verified',
    permittedReuseMode: 'verified-full-text',
    sourcePolicy: { rightsStatus: 'partially-verified', maxReuseMode: 'metadata-only' },
    license: { type: null, identifier: null, url: null },
    attributionRequired: true,
    attributionText: 'Credit to learningenglish.voanews.com',
    evidence: [
      {
        evidenceId: 'voa-source-policy',
        evidenceType: 'source-policy',
        sourceUrl: 'https://learningenglish.voanews.com/p/6861.html',
        reference: 'voa-learning-english-official-reuse-policy',
        excerpt: 'Learning English texts, MP3s, photos and videos are in the public domain. You are allowed to reprint them for educational and commercial purposes, with credit to learningenglish.voanews.com. However, stories, photos and video images from news agencies such as AP, Reuters and AFP are copyrighted, so you are not allowed to republish them.',
        retrievedAt: '2026-10-03',
        scope: 'source',
        appliesToRecordId: 'voa-learning-english',
      },
      {
        evidenceId: 'voa-item-metadata',
        evidenceType: 'item-metadata',
        sourceUrl: 'https://learningenglish.voanews.com/a/lets-learn-english-lesson-one/3111026.html',
        reference: 'voa-item-page-jsonld-author',
        excerpt: 'Page JSON-LD names VOA Learning English as author for a NewsArticle.',
        retrievedAt: '2026-10-03',
        scope: 'item',
        appliesToRecordId: id,
      },
    ],
  };
  pkg.review = {
    reviewStatus: 'approved',
    reviewedAt: now,
    reviewer: 'Phase 4.0 rights-gate regression fixture',
    decision: 'VOA-produced Learning English article cleared under the official reuse policy.',
  };
  pkg.provenance = {
    sourceRecordId: 'voa-learning-english-3111026',
    intakeRecordId: 'voa-learning-english-3111026',
    intakeSchemaVersion: 'phase3.5-independent-intake-v1',
    intakeValidationResult: 'PASS',
    dryRunResult: 'PASS',
    dryRunRecordId: 'voa-learning-english-3111026',
    reviewStatus: 'approved',
    packageCreatedAt: now,
    sourceManifest: 'research/phase4-0-real-content-intake/candidates.json',
  };
  delete pkg.libraryPresentation;
  return { ...pkg, ...overrides };
};

const voaPolicy = policies.find((policy) => policy.sourceId === 'voa-learning-english');

const realDryRunCounts = {
  pass: dryRunResults.summary.pass,
  blocked: dryRunResults.summary.blocked,
  reviewRequired: dryRunResults.summary.reviewRequired,
  ready: dryRunResults.summary.readyForPhase37Review,
  approved: dryRunResults.summary.approvedForLibraryImport,
};

scenario('schema defines required package, rights, review, and provenance fields', () => {
  check(schema.required.includes('packageId') && schema.required.includes('version'), 'package identity and version required');
  check(schema.required.includes('content') && schema.required.includes('source') && schema.required.includes('rights'), 'content/source/rights required');
  check(schema.required.includes('validation') && schema.required.includes('review') && schema.required.includes('provenance'), 'validation/review/provenance required');
  check(schema.properties.packageStatus.enum.includes('ELIGIBLE'), 'ELIGIBLE status is defined');
  check(!schema.properties.packageStatus.enum.includes('APPROVED_FOR_LIBRARY_IMPORT'), 'library import approval is not a package status');
  check(schema.properties.libraryPresentation.required.includes('imageReference'), 'Library package explicitly records an image URL or null');
});

scenario('explicit Library presentation validates without making missing editorial facts mandatory upstream', () => {
  const pkg = makeSyntheticPackage();
  pkg.libraryPresentation = {
    description: 'SYNTHETIC test description.',
    imageReference: 'https://example.invalid/synthetic-image.png',
    level: 'B1',
    genre: 'Science & Nature',
    readingTime: 'Under 3 min',
  };
  check(validatePackage(pkg, [syntheticPolicy], { allowSyntheticForTests: true }).eligible, 'all explicitly supplied presentation fields validate');
  pkg.libraryPresentation.level = 'Unknown';
  expectCode(validatePackage(pkg, [syntheticPolicy], { allowSyntheticForTests: true }), 'PACKAGE_SCHEMA_INVALID');
});

scenario('complete synthetic package passes the in-memory positive validation path', () => {
  const pkg = makeSyntheticPackage();
  const result = validatePackage(pkg, [syntheticPolicy], { allowSyntheticForTests: true });
  check(result.eligible && result.packageStatus === 'ELIGIBLE', 'complete test-only package passes the positive validation path');
  check(result.errors.length === 0, 'positive-path test package has no validation errors');
});

scenario('item-level rights package does not require a registered source policy', () => {
  const pkg = makeSyntheticPackage();
  pkg.source.sourceId = 'unregistered-synthetic-source';
  pkg.rights.sourcePolicy = null;
  pkg.rights.evidence = pkg.rights.evidence.filter((item) => item.evidenceType !== 'source-policy');
  const result = validatePackage(pkg, [syntheticPolicy], { allowSyntheticForTests: true });
  check(result.eligible, `item-level license should be sufficient; got ${result.errors.map((issue) => issue.code).join(', ')}`);
});

scenario('independent batch creates only fully gated packages and records skip/reject outcomes safely', () => {
  const makeIntake = (recordId) => ({
    ...clone(fullTextIntakeFixture),
    recordId,
    sourceId: 'unregistered-cleared-source',
    sourceName: 'Independent test source',
    sourceUrl: 'https://example.invalid/source',
    canonicalUrl: `https://example.invalid/${recordId}`,
    externalId: recordId,
    doi: `10.5555/${recordId}`,
    testOnly: true,
    language: 'en',
    libraryPresentation: {
      description: 'Synthetic test description.',
      imageReference: 'synthetic-figure-1',
      level: 'B1',
      genre: 'Science & Nature',
      readingTime: 'Under 3 min',
    },
  });
  const permitted = makeIntake('independent-permitted');
  delete permitted.sourceUrl;
  delete permitted.contentType;
  delete permitted.classification.contentGroup;
  delete permitted.language;
  const publicDomain = makeIntake('independent-public-domain');
  publicDomain.rightsBasis = 'public-domain';
  delete publicDomain.itemLicenseUrl;
  delete publicDomain.licenseType;
  delete publicDomain.licenseIdentifier;
  const permission = makeIntake('independent-documented-permission');
  permission.rightsBasis = 'permission';
  delete permission.itemLicenseUrl;
  delete permission.licenseType;
  delete permission.licenseIdentifier;
  const unclear = makeIntake('independent-rights-unclear');
  unclear.rightsStatus = 'unknown';
  delete unclear.body;
  const missingMetadata = makeIntake('independent-metadata-missing');
  missingMetadata.libraryPresentation.level = null;
  const restricted = makeIntake('independent-source-restricted');
  restricted.sourceId = 'plos-one';
  const unverifiedImage = makeIntake('independent-image-unverified');
  unverifiedImage.mediaAssets[0].rightsStatus = 'unknown';
  const duplicate = makeIntake('independent-permitted-duplicate');
  duplicate.doi = permitted.doi;
  const noImage = makeIntake('independent-no-image');
  delete noImage.libraryPresentation.imageReference;
  delete noImage.mediaAssets;
  const review = {
    reviewStatus: 'approved',
    reviewedAt: '2026-10-03T10:00:00.000Z',
    reviewer: 'Synthetic test reviewer',
    decision: 'Synthetic isolated test approval only.',
  };
  const result = buildPackagesFromIntake(
    [permitted, duplicate, publicDomain, permission, unclear, missingMetadata, restricted, unverifiedImage, noImage],
    policies,
    {
      reviewByRecordId: {
        [permitted.recordId]: review,
        [publicDomain.recordId]: review,
        [permission.recordId]: review,
        [unverifiedImage.recordId]: review,
        [noImage.recordId]: review,
      },
      sourceManifest: 'synthetic-independent-intake-test',
      createdAt: '2026-10-03T10:01:00.000Z',
      allowSyntheticForTests: true,
    },
  );
  check(result.summary.recordsProcessed === 9, 'all batch records are evaluated independently');
  check(result.summary.packagesCreated === 5, 'only the fully cleared items create packages');
  check(result.recordResults.map((record) => record.status).join(',') === 'ELIGIBLE,REJECTED,ELIGIBLE,ELIGIBLE,SKIPPED,SKIPPED,REJECTED,ELIGIBLE,ELIGIBLE',
    'a duplicate is rejected, rights uncertainty and metadata gaps skip, and explicit policy conflict rejects');
  check(result.packages[0].rights.sourcePolicy === null, 'unregistered source remains explicitly unregistered in provenance');
  check(result.packages[1].rights.rightsBasis === 'public-domain'
    && result.packages[1].rights.evidence.some((item) => item.evidenceType === 'item-rights'),
  'public-domain evidence is preserved without fabricating a license');
  check(result.packages[2].rights.rightsBasis === 'permission'
    && result.packages[2].rights.evidence.some((item) => item.evidenceType === 'item-rights'),
  'documented permission evidence is preserved without fabricating a license');
  check(result.packages[0].source.sourceUrl === null
    && result.packages[0].content.contentType === null
    && result.packages[0].content.contentGroup === null
    && result.packages[0].content.language === null,
  'absent optional source/language/type metadata stays null instead of being invented');
  check(result.packages.every((pkg) => pkg.testOnly === true), 'isolated test packages are explicitly marked test-only');
  check(result.packages[0].libraryPresentation.imageReference === 'synthetic-figure-1', 'an image is retained only when the exact asset is verified');
  check(result.packages[0].content.body === permitted.body, 'eligible body is preserved exactly');
  check(result.packages[3].libraryPresentation.imageReference === null, 'unverified image is omitted rather than blocking its text');
  check(result.packages[4].libraryPresentation.imageReference === null, 'missing image metadata becomes an explicit null without inventing an image');
  check(result.recordResults[7].warningCodes.includes('ASSET_OMITTED_UNVERIFIED')
    && result.recordResults[7].warningCodes.includes('IMAGE_OMITTED_UNVERIFIED'),
  'unsafe image omission is visible in the per-record report');
  check(!JSON.stringify(result.recordResults).includes(permitted.body),
    'per-record batch outcomes contain no article bodies');
});

scenario('missing item rights evidence is rejected', () => {
  const pkg = makeSyntheticPackage();
  pkg.rights.evidence = pkg.rights.evidence.filter((item) => item.evidenceType !== 'item-license');
  expectCode(validatePackage(pkg, [syntheticPolicy], { allowSyntheticForTests: true }), 'PACKAGE_EVIDENCE_REQUIRED');
});

scenario('full-text package cannot assert the conditional basis without a granted policy rule', () => {
  const pkg = makeSyntheticPackage();
  pkg.rights.rightsBasis = 'conditional-source-policy';
  expectCode(validatePackage(pkg, [syntheticPolicy], { allowSyntheticForTests: true }), 'PACKAGE_RIGHTS_BASIS_REQUIRED');
});

scenario('insufficient item rights status is rejected', () => {
  const pkg = makeSyntheticPackage();
  pkg.rights.verificationStatus = 'partially-verified';
  expectCode(validatePackage(pkg, [syntheticPolicy], { allowSyntheticForTests: true }), 'PACKAGE_RIGHTS_INSUFFICIENT');
});

scenario('reuse broader than policy is rejected', () => {
  const pkg = makeSyntheticPackage();
  const metadataPolicy = { ...syntheticPolicy, rightsStatus: 'partially-verified', maxReuseMode: 'metadata-only' };
  pkg.rights.sourcePolicy = { rightsStatus: metadataPolicy.rightsStatus, maxReuseMode: metadataPolicy.maxReuseMode };
  expectCode(validatePackage(pkg, [metadataPolicy], { allowSyntheticForTests: true }), 'PACKAGE_POLICY_EXCEEDED');
});

scenario('required attribution cannot be omitted', () => {
  const pkg = makeSyntheticPackage();
  pkg.rights.attributionText = null;
  expectCode(validatePackage(pkg, [syntheticPolicy], { allowSyntheticForTests: true }), 'PACKAGE_ATTRIBUTION_REQUIRED');
});

scenario('incomplete provenance is rejected', () => {
  const pkg = makeSyntheticPackage();
  pkg.provenance.sourceRecordId = '';
  expectCode(validatePackage(pkg, [syntheticPolicy], { allowSyntheticForTests: true }), 'PACKAGE_PROVENANCE_INCOMPLETE');
});

scenario('duplicate protection covers record, source/external id, DOI, canonical URL and package version', () => {
  const first = makeSyntheticPackage();
  const second = clone(first);
  second.packageId = 'synthetic-record-002';
  second.content.recordId = 'synthetic-record-002';
  second.source.externalId = 'synthetic-external-002';
  second.source.doi = '10.5555/synthetic-package.002';
  second.source.canonicalUrl = 'https://example.invalid/synthetic-record-002';
  second.provenance.sourceRecordId = 'synthetic-record-002';
  second.provenance.intakeRecordId = 'synthetic-record-002';
  second.provenance.dryRunRecordId = 'synthetic-record-002';
  const duplicateRecord = clone(second);
  duplicateRecord.packageId = 'synthetic-record-003';
  duplicateRecord.content.recordId = first.content.recordId;
  duplicateRecord.provenance.sourceRecordId = first.content.recordId;
  duplicateRecord.provenance.intakeRecordId = first.content.recordId;
  duplicateRecord.provenance.dryRunRecordId = first.content.recordId;
  duplicateRecord.source.externalId = first.source.externalId;
  duplicateRecord.source.doi = `https://doi.org/${first.source.doi}`;
  duplicateRecord.source.canonicalUrl = `${first.source.canonicalUrl}#duplicate`;
  duplicateRecord.provenance.packageCreatedAt = duplicateRecord.createdAt;
  const duplicateVersion = clone(first);
  duplicateVersion.content.recordId = 'synthetic-record-version';
  duplicateVersion.packageId = first.packageId;
  const batch = validatePackageBatch([first, second, duplicateRecord, duplicateVersion], [syntheticPolicy], { allowSyntheticForTests: true });
  expectCode(batch, 'PACKAGE_DUPLICATE_RECORD_ID');
  expectCode(batch, 'PACKAGE_DUPLICATE_EXTERNAL_ID');
  expectCode(batch, 'PACKAGE_DUPLICATE_DOI');
  expectCode(batch, 'PACKAGE_DUPLICATE_CANONICAL_URL');
  expectCode(batch, 'PACKAGE_DUPLICATE_VERSION');
});

scenario('body is forbidden in metadata-only package', () => {
  const pkg = makeSyntheticPackage();
  pkg.rights.permittedReuseMode = 'metadata-only';
  pkg.content.reuseMode = 'metadata-only';
  pkg.rights.sourcePolicy = { rightsStatus: 'partially-verified', maxReuseMode: 'metadata-only' };
  pkg.rights.verificationStatus = 'partially-verified';
  pkg.content.body = 'synthetic forbidden text';
  const policy = { ...syntheticPolicy, rightsStatus: 'partially-verified', maxReuseMode: 'metadata-only' };
  expectCode(validatePackage(pkg, [policy], { allowSyntheticForTests: true }), 'PACKAGE_BODY_NOT_ALLOWED');
});

scenario('BLOCKED record cannot build an eligible package', () => {
  const pkg = makeSyntheticPackage();
  pkg.validation.result = 'BLOCKED';
  pkg.validation.errorCodes = ['SOURCE_POLICY_EXCEEDED'];
  pkg.provenance.intakeValidationResult = 'FAIL';
  pkg.provenance.dryRunResult = 'BLOCKED';
  const result = buildPackagesFromCandidates([pkg], [syntheticPolicy], { allowSyntheticForTests: true });
  check(result.packages.length === 0, 'BLOCKED candidate creates no eligible package');
  expectCode({ errors: result.rejectedCandidates.flatMap((candidate) => candidate.errorCodes.map((code) => ({ code }))) }, 'PACKAGE_INTAKE_NOT_PASS');
});

scenario('REVIEW_REQUIRED record cannot build an eligible package', () => {
  const pkg = makeSyntheticPackage();
  pkg.validation.result = 'REVIEW_REQUIRED';
  pkg.provenance.intakeValidationResult = 'FAIL';
  pkg.provenance.dryRunResult = 'REVIEW_REQUIRED';
  pkg.review.reviewStatus = 'needs-source-review';
  pkg.provenance.reviewStatus = 'needs-source-review';
  const result = buildPackagesFromCandidates([pkg], [syntheticPolicy], { allowSyntheticForTests: true });
  check(result.packages.length === 0, 'REVIEW_REQUIRED candidate creates no eligible package');
  expectCode({ errors: result.rejectedCandidates.flatMap((candidate) => candidate.errorCodes.map((code) => ({ code }))) }, 'PACKAGE_DRY_RUN_NOT_PASS');
});

scenario('candidate not marked eligible is rejected and not promoted', () => {
  const pkg = makeSyntheticPackage();
  pkg.packageStatus = 'NOT_ELIGIBLE';
  pkg.eligibleForPhase38 = false;
  const before = clone(pkg);
  const result = buildPackagesFromCandidates([pkg], [syntheticPolicy], { allowSyntheticForTests: true });
  check(result.packages.length === 0, 'ineligible candidate emits no package');
  check(pkg.packageStatus === before.packageStatus && pkg.eligibleForPhase38 === before.eligibleForPhase38, 'builder does not auto-promote candidate');
});

scenario('synthetic test-only packages cannot be emitted in production mode', () => {
  const pkg = makeSyntheticPackage();
  expectCode(validatePackage(pkg, [syntheticPolicy]), 'PACKAGE_SYNTHETIC_NOT_ELIGIBLE');
  const result = buildPackagesFromCandidates([pkg], [syntheticPolicy]);
  check(result.packages.length === 0, 'production builder does not persist or return synthetic packages');
});

scenario('rights decisions are validated without mutation or policy upgrade', () => {
  const pkg = makeSyntheticPackage();
  const before = clone(pkg);
  validatePackage(pkg, [syntheticPolicy], { allowSyntheticForTests: true });
  check(JSON.stringify(pkg.rights) === JSON.stringify(before.rights), 'validator does not mutate rights data');
  const realPlos = policies.find((policy) => policy.sourceId === 'plos-one');
  check(realPlos.rightsStatus === 'unknown' && realPlos.maxReuseMode === 'link-only', 'PLOS policy remains unchanged');
  const realVoa = policies.find((policy) => policy.sourceId === 'voa-learning-english');
  check(realVoa.rightsStatus === 'partially-verified' && realVoa.maxReuseMode === 'metadata-only', 'VOA policy remains unchanged');
});

scenario('real Phase 3.6 results create zero packages and no approved-content directory', () => {
  check(realDryRunCounts.pass === 0 && realDryRunCounts.blocked === 2 && realDryRunCounts.reviewRequired === 6, 'real Phase 3.6 outcome is read from current report');
  check(realDryRunCounts.ready === 0 && realDryRunCounts.approved === 0, 'real records have no Phase 3.7 readiness or Library approval');
  const built = runPackageBuild();
  check(built.packages.length === 0 && built.report.summary.packagesCreated === 0, 'no real package is built');
  check(!existsSync(getPackageOutputPaths().approvedContent), 'approved-content directory is not created without eligible records');
});

scenario('report output stays inside Phase 3.7 and app/network imports are absent', () => {
  const outputPaths = getPackageOutputPaths();
  check(resolve(outputPaths.report).startsWith(`${PACKAGE_ROOT}\\`), 'report output is under Phase 3.7');
  check(resolve(outputPaths.approvedContent).startsWith(`${PACKAGE_ROOT}\\`), 'future package output is under Phase 3.7');
  const source = readFileSync(resolve(ROOT, 'scripts', 'build-package.mjs'), 'utf8');
  check(!/from\s+['"][^'"]*frontend|fetch\s*\(|https?\.request|https?\.get|createConnection|openDatabase/i.test(source), 'builder has no app imports, network calls, or database code');
  check(source.includes('writeFileSync(REPORT_PATH') && source.includes('writeFileSync(packagePaths[index]'), 'writes are restricted to the report and generated package paths');
  check(readFileSync(outputPaths.report, 'utf8').includes('Approved packages created | 0'), 'package report was written and confirms zero outputs');
});

scenario('VOA-produced package is eligible without a per-item license document', () => {
  const pkg = makeVoaPackage();
  check(!pkg.rights.evidence.some((item) => item.evidenceType === 'item-license'), 'VOA package carries no item-license evidence');
  check(pkg.rights.license.identifier === null && pkg.rights.license.url === null, 'VOA package carries no per-article license identifier');
  const result = validatePackage(pkg, [voaPolicy]);
  check(result.eligible, `VOA-produced package should be eligible; got ${result.errors.map((e) => `${e.code}: ${e.message}`).join(' | ')}`);
  check(!result.errors.some((e) => e.code === 'PACKAGE_EVIDENCE_REQUIRED'), 'no item-license evidence is demanded for VOA-produced content');
  check(!result.errors.some((e) => e.code === 'PACKAGE_POLICY_EXCEEDED'), 'the conditional grant lifts the metadata-only ceiling for this package');
  check(voaPolicy.maxReuseMode === 'metadata-only' && voaPolicy.rightsStatus === 'partially-verified', 'the recorded VOA source policy baseline itself is unchanged');
});

scenario('VOA package with AFP, Reuters or AP attribution is never eligible', () => {
  for (const [label, authors] of [
    ['AFP', ['Andrew Smith', 'Malick Rokhy Ba (Agence France-Presse)']],
    ['Reuters', ['VOA Learning English', 'Reporting by Reuters']],
    ['AP', ['VOA Learning English', 'The Associated Press']],
  ]) {
    const pkg = makeVoaPackage();
    pkg.content.authors = authors;
    const result = validatePackage(pkg, [voaPolicy]);
    check(!result.eligible, `VOA package with ${label} attribution must not be eligible`);
    expectCode(result, 'PACKAGE_THIRD_PARTY_CONTENT_BLOCKED');
    const block = result.errors.find((error) => error.code === 'PACKAGE_THIRD_PARTY_CONTENT_BLOCKED');
    check(block.message.includes('cannot override another publisher'), `${label} block explains that the publisher policy cannot override third-party rights`);
    check(result.errors.some((e) => e.code === 'PACKAGE_REVIEW_INCOMPLETE') || result.errors.some((e) => e.code === 'PACKAGE_POLICY_EXCEEDED') || result.errors.some((e) => e.code === 'PACKAGE_CONDITIONAL_RIGHTS_NOT_MET') || result.errors.some((e) => e.code === 'PACKAGE_EVIDENCE_REQUIRED'),
      `${label} is blocked on rights grounds regardless of any accompanying evidence issue`);
  }
});

scenario('conditional package grant requires policy evidence, a VOA byline and the credit line', () => {
  const noByline = makeVoaPackage();
  noByline.content.authors = ['A. Contributor'];
  expectCode(validatePackage(noByline, [voaPolicy]), 'PACKAGE_CONDITIONAL_RIGHTS_NOT_MET');

  const noAttribution = makeVoaPackage();
  noAttribution.rights.attributionText = null;
  const noAttrResult = validatePackage(noAttribution, [voaPolicy]);
  check(!noAttrResult.eligible, 'missing the required credit line blocks eligibility');
  expectCode(noAttrResult, 'PACKAGE_ATTRIBUTION_REQUIRED');

  const offHost = makeVoaPackage();
  offHost.source.canonicalUrl = 'https://mirror.example.invalid/a/3111026.html';
  expectCode(validatePackage(offHost, [voaPolicy]), 'PACKAGE_CONDITIONAL_RIGHTS_NOT_MET');

  const restricted = validatePackage(makeVoaPackage(), [{ ...voaPolicy, rightsStatus: 'restricted' }]);
  check(!restricted.eligible, 'a restricted source policy still vetoes the conditional grant');
  expectCode(restricted, 'PACKAGE_POLICY_RESTRICTED');
});

console.log(`${checks.scenarios} scenarios passed; ${checks.assertions} assertions passed.`);
