import assertBase from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { after as afterTests, test as runTest } from 'node:test';
import { openLibraryDatabase } from '../src/database.mjs';
import { discoverApprovedPackages, runImportCommand } from '../src/import-packages.mjs';
import { LibraryRepository } from '../src/library-repository.mjs';
import { createLibraryServer } from '../src/server.mjs';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(TEST_DIR, '..', '..');
let assertionCount = 0;
let scenarioCount = 0;
const assert = new Proxy(assertBase, {
  get(target, property) {
    const method = Reflect.get(target, property);
    if (typeof method !== 'function') return method;
    return (...args) => {
      assertionCount += 1;
      return method(...args);
    };
  },
});
const test = (name, callback) => {
  scenarioCount += 1;
  return runTest(name, callback);
};
const syntheticPolicy = JSON.parse(readFileSync(resolve(
  PROJECT_ROOT,
  'research',
  'phase3-5-content-intake',
  'fixtures',
  'source-policies',
  'synthetic-open-source.json',
), 'utf8'));

const makePackage = (recordId = 'synthetic-record-001') => {
  const now = '2026-10-03T09:00:00.000Z';
  const packageId = `synthetic-package-${recordId}`;
  return {
    schemaVersion: 1,
    packageId,
    version: 1,
    createdAt: now,
    supersedes: null,
    packageStatus: 'ELIGIBLE',
    eligibleForPhase38: true,
    testOnly: true,
    libraryPresentation: {
      description: 'SYNTHETIC TEST ONLY description.',
      imageReference: `https://example.invalid/${recordId}.png`,
      level: 'B1',
      genre: 'Science & Nature',
      readingTime: 'Under 3 min',
    },
    content: {
      recordId,
      title: `SYNTHETIC TEST ONLY ${recordId}`,
      contentType: 'educational',
      contentGroup: 'articles',
      categories: { primary: 'science', secondary: ['education'] },
      language: 'en',
      authors: ['SYNTHETIC TEST AUTHOR'],
      reuseMode: 'verified-full-text',
      body: `SYNTHETIC TEST ONLY body for ${recordId}.`,
      bodyReference: null,
    },
    source: {
      sourceId: syntheticPolicy.sourceId,
      sourceName: 'SYNTHETIC TEST SOURCE',
      sourceUrl: 'https://example.invalid/source',
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
        identifier: 'SYNTHETIC TEST ONLY',
        url: 'https://example.invalid/license',
      },
      attributionRequired: true,
      attributionText: 'SYNTHETIC TEST ONLY attribution; not a rights assertion.',
      evidence: [
        {
          evidenceId: `${recordId}-source`,
          evidenceType: 'source-policy',
          sourceUrl: 'https://example.invalid/policy',
          reference: 'SYNTHETIC TEST ONLY policy evidence.',
          excerpt: 'SYNTHETIC TEST ONLY.',
          retrievedAt: null,
          scope: 'source',
          appliesToRecordId: syntheticPolicy.sourceId,
        },
        {
          evidenceId: `${recordId}-metadata`,
          evidenceType: 'item-metadata',
          sourceUrl: `https://example.invalid/${recordId}`,
          reference: 'SYNTHETIC TEST ONLY item metadata.',
          excerpt: 'SYNTHETIC TEST ONLY.',
          retrievedAt: '2026-10-03',
          scope: 'item',
          appliesToRecordId: recordId,
        },
        {
          evidenceId: `${recordId}-license`,
          evidenceType: 'item-license',
          sourceUrl: 'https://example.invalid/license',
          reference: 'SYNTHETIC TEST ONLY item license.',
          excerpt: 'SYNTHETIC TEST ONLY.',
          retrievedAt: '2026-10-03',
          scope: 'item',
          appliesToRecordId: recordId,
        },
        {
          evidenceId: `${recordId}-image`,
          evidenceType: 'asset-rights',
          sourceUrl: `https://example.invalid/${recordId}.png`,
          reference: 'SYNTHETIC TEST ONLY image rights.',
          excerpt: 'SYNTHETIC TEST ONLY.',
          retrievedAt: '2026-10-03',
          scope: 'asset',
          appliesToRecordId: recordId,
        },
      ],
    },
    validation: { validator: 'SYNTHETIC TEST ONLY validator', result: 'PASS', errorCodes: [] },
    review: {
      reviewStatus: 'approved',
      reviewedAt: now,
      reviewer: 'SYNTHETIC TEST ONLY reviewer',
      decision: 'SYNTHETIC TEST ONLY review; not an approval.',
    },
    provenance: {
      sourceRecordId: recordId,
      intakeRecordId: recordId,
      intakeSchemaVersion: 'phase3.5-independent-intake-v1',
      intakeValidationResult: 'PASS',
      dryRunResult: 'PASS',
      dryRunRecordId: recordId,
      reviewStatus: 'approved',
      packageCreatedAt: now,
      sourceManifest: 'SYNTHETIC TEST ONLY.',
    },
  };
};

const makeApprovedEntry = (pkg) => {
  const packageBytes = Buffer.from(JSON.stringify(pkg), 'utf8');
  return {
    package: pkg,
    packageBytes,
    approval: {
      approvalStatus: 'APPROVED_FOR_LIBRARY_IMPORT',
      packageId: pkg.packageId,
      packageVersion: pkg.version,
      packageSha256: createHash('sha256').update(packageBytes).digest('hex'),
      approvedAt: '2026-10-03T09:30:00.000Z',
      approver: 'SYNTHETIC TEST ONLY authorized approver',
      decision: 'SYNTHETIC TEST ONLY approval; isolated test fixture.',
    },
  };
};
const importPackages = (repository, packages) => repository.importBatch(packages.map(makeApprovedEntry));

const createContext = (t) => {
  const database = openLibraryDatabase(':memory:');
  const repository = new LibraryRepository(database, [syntheticPolicy], { allowSyntheticForTests: true });
  t.after(() => database.close());
  return { database, repository };
};

test('explicitly approved package imports and preserves package, rights, provenance, and audit', (t) => {
  const { database, repository } = createContext(t);
  const pkg = makePackage();
  const entry = makeApprovedEntry(pkg);
  const result = repository.importBatch([entry]);

  assert.equal(result.outcome, 'COMMITTED');
  assert.equal(result.packagesDiscovered, 1);
  assert.equal(result.approvedPackagesDiscovered, 1);
  assert.equal(result.recordsImported, 1);
  const article = repository.getArticle(repository.listArticles()[0].id);
  assert.equal(article.title, pkg.content.title);
  assert.equal(article.content, pkg.content.body);
  assert.equal(article.importMetadata.packageId, pkg.packageId);
  assert.equal(article.importMetadata.packageVersion, pkg.version);
  assert.equal(article.importMetadata.contentHash, createHash('sha256').update(pkg.content.body, 'utf8').digest('hex'));
  assert.deepEqual(article.importMetadata.source, pkg.source);
  assert.deepEqual(article.importMetadata.authors, pkg.content.authors);
  assert.deepEqual(article.importMetadata.content.categories, pkg.content.categories);
  assert.equal(article.importMetadata.content.contentGroup, pkg.content.contentGroup);
  assert.deepEqual(article.importMetadata.rights, pkg.rights);
  assert.deepEqual(article.importMetadata.provenance, pkg.provenance);
  assert.deepEqual(article.importMetadata.libraryImportApproval, entry.approval);
  assert.equal(article.importMetadata.importBatchId, result.batchId);
  assert.equal(repository.listImportRuns()[0].outcome, 'COMMITTED');
  // Latest migration is 006 (expanded genre taxonomy); database.mjs applies
  // every ordered migration, so a fresh in-memory database lands on 6.
  assert.equal(database.pragma('user_version', { simple: true }), 6);
});

test('Phase 3.7 eligibility and review approval alone do not authorize Library import', (t) => {
  const { repository } = createContext(t);
  const pkg = makePackage();
  const result = repository.importBatch([{
    package: pkg,
    packageBytes: Buffer.from(JSON.stringify(pkg), 'utf8'),
    approval: null,
  }]);
  assert.equal(result.outcome, 'BLOCKED');
  assert.equal(result.approvedPackagesDiscovered, 0);
  assert.ok(result.packageResults[0].errors.some((error) => error.code === 'IMPORT_APPROVAL_REQUIRED'));
  assert.equal(repository.getArticleCount(), 0);
});

test('package bytes changed after human import approval are blocked', (t) => {
  const { repository } = createContext(t);
  const pkg = makePackage();
  const entry = makeApprovedEntry(pkg);
  entry.packageBytes = Buffer.from(`${JSON.stringify(pkg)} `, 'utf8');
  const result = repository.importBatch([entry]);
  assert.equal(result.outcome, 'BLOCKED');
  assert.equal(result.approvedPackagesDiscovered, 0);
  assert.ok(result.packageResults[0].errors.some((error) => error.code === 'IMPORT_APPROVAL_INVALID'));
  assert.equal(repository.getArticleCount(), 0);
});

test('package discovery pairs a sidecar with the exact package-file digest', (t) => {
  const testRoot = mkdtempSync(join(tmpdir(), 'phase39-approval-pairing-'));
  const packageDirectory = resolve(testRoot, 'approved-content');
  const approvalDirectory = resolve(testRoot, 'approvals');
  mkdirSync(packageDirectory);
  mkdirSync(approvalDirectory);
  t.after(() => rmSync(testRoot, { recursive: true, force: true }));

  const pkg = makePackage();
  const packageBytes = Buffer.from(`${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  const approval = {
    approvalStatus: 'APPROVED_FOR_LIBRARY_IMPORT',
    packageId: pkg.packageId,
    packageVersion: pkg.version,
    packageSha256: createHash('sha256').update(packageBytes).digest('hex'),
    approvedAt: '2026-10-03T09:30:00.000Z',
    approver: 'SYNTHETIC TEST ONLY authorized approver',
    decision: 'SYNTHETIC TEST ONLY isolated approval fixture.',
  };
  writeFileSync(resolve(packageDirectory, 'synthetic-package.json'), packageBytes);
  writeFileSync(resolve(approvalDirectory, 'synthetic-approval.json'), JSON.stringify(approval));

  const entries = discoverApprovedPackages(packageDirectory, approvalDirectory);
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].package, pkg);
  assert.deepEqual(entries[0].approval, approval);
  assert.deepEqual(entries[0].packageBytes, packageBytes);
});

test('invalid package is blocked before any write', (t) => {
  const { repository } = createContext(t);
  const pkg = makePackage();
  pkg.content.title = '';
  const result = importPackages(repository, [pkg]);
  assert.equal(result.outcome, 'BLOCKED');
  assert.equal(result.recordsImported, 0);
  assert.equal(repository.getArticleCount(), 0);
  assert.ok(result.packageResults[0].errors.some((error) => error.code === 'PACKAGE_SCHEMA_INVALID'));
});

test('non-approved package is blocked without promotion', (t) => {
  const { repository } = createContext(t);
  const pkg = makePackage();
  pkg.packageStatus = 'NOT_ELIGIBLE';
  pkg.eligibleForPhase38 = false;
  const result = importPackages(repository, [pkg]);
  assert.equal(result.outcome, 'BLOCKED');
  assert.equal(pkg.packageStatus, 'NOT_ELIGIBLE');
  assert.equal(repository.getArticleCount(), 0);
});

test('missing rights or item-applicable image evidence blocks import', (t) => {
  const { repository } = createContext(t);
  const pkg = makePackage();
  pkg.rights.evidence = pkg.rights.evidence.filter((item) => item.evidenceType !== 'asset-rights');
  const result = importPackages(repository, [pkg]);
  assert.equal(result.outcome, 'BLOCKED');
  assert.ok(result.packageResults[0].errors.some((error) =>
    error.code === 'IMPORT_REQUIRED_FIELD_MISSING'
    && error.field.includes('asset-rights')));
  assert.equal(repository.getArticleCount(), 0);
});

test('missing provenance blocks import', (t) => {
  const { repository } = createContext(t);
  const pkg = makePackage();
  pkg.provenance.sourceManifest = '';
  const result = importPackages(repository, [pkg]);
  assert.equal(result.outcome, 'BLOCKED');
  assert.ok(result.packageResults[0].errors.some((error) => error.code === 'PACKAGE_PROVENANCE_INCOMPLETE'));
  assert.equal(repository.getArticleCount(), 0);
});

test('missing required Library presentation fields blocks import', (t) => {
  const { repository } = createContext(t);
  const pkg = makePackage();
  delete pkg.libraryPresentation.level;
  const result = importPackages(repository, [pkg]);
  assert.equal(result.outcome, 'BLOCKED');
  assert.ok(result.packageResults[0].errors.some((error) =>
    error.code === 'IMPORT_REQUIRED_FIELD_MISSING'
    && error.field === 'libraryPresentation.level'));
  assert.equal(repository.getArticleCount(), 0);
});

test('unsafe image references are rejected rather than rendered', (t) => {
  const { repository } = createContext(t);
  const pkg = makePackage();
  pkg.libraryPresentation.imageReference = 'javascript:alert(1)';
  const result = importPackages(repository, [pkg]);
  assert.equal(result.outcome, 'BLOCKED');
  assert.ok(result.packageResults[0].errors.some((error) =>
    error.code === 'IMPORT_FIELD_INVALID'
    && error.field === 'libraryPresentation.imageReference'));
});

test('duplicate package and version are blocked', (t) => {
  const { repository } = createContext(t);
  const pkg = makePackage();
  assert.equal(importPackages(repository, [pkg]).outcome, 'COMMITTED');
  const duplicate = structuredClone(pkg);
  const result = importPackages(repository, [duplicate]);
  assert.equal(result.outcome, 'BLOCKED');
  assert.ok(result.packageResults[0].errors.some((error) => error.code === 'DUPLICATE_PACKAGE_VERSION'));
  assert.equal(repository.getArticleCount(), 1);
});

test('duplicate stable source and content ID are blocked', (t) => {
  const { repository } = createContext(t);
  const pkg = makePackage();
  assert.equal(importPackages(repository, [pkg]).outcome, 'COMMITTED');
  const duplicate = makePackage('synthetic-record-002');
  duplicate.content.recordId = pkg.content.recordId;
  duplicate.provenance.sourceRecordId = pkg.content.recordId;
  duplicate.provenance.intakeRecordId = pkg.content.recordId;
  duplicate.provenance.dryRunRecordId = pkg.content.recordId;
  duplicate.rights.evidence.forEach((item) => {
    if (item.scope !== 'source') item.appliesToRecordId = pkg.content.recordId;
  });
  const result = importPackages(repository, [duplicate]);
  assert.equal(result.outcome, 'BLOCKED');
  assert.ok(result.packageResults[0].errors.some((error) => error.code === 'DUPLICATE_SOURCE_CONTENT_ID'));
});

test('duplicate canonical URL is blocked after URL fragment normalization', (t) => {
  const { repository } = createContext(t);
  const pkg = makePackage();
  assert.equal(importPackages(repository, [pkg]).outcome, 'COMMITTED');
  const duplicate = makePackage('synthetic-record-002');
  duplicate.source.canonicalUrl = `${pkg.source.canonicalUrl}#campaign`;
  const result = importPackages(repository, [duplicate]);
  assert.equal(result.outcome, 'BLOCKED');
  assert.ok(result.packageResults[0].errors.some((error) => error.code === 'DUPLICATE_CANONICAL_URL'));
  assert.equal(repository.getArticleCount(), 1);
});

test('duplicate exact content hash is blocked', (t) => {
  const { repository } = createContext(t);
  const pkg = makePackage();
  assert.equal(importPackages(repository, [pkg]).outcome, 'COMMITTED');
  const duplicate = makePackage('synthetic-record-002');
  duplicate.content.body = pkg.content.body;
  const result = importPackages(repository, [duplicate]);
  assert.equal(result.outcome, 'BLOCKED');
  assert.ok(result.packageResults[0].errors.some((error) => error.code === 'DUPLICATE_CONTENT_HASH'));
});

test('single and multi-record successful batches commit atomically', (t) => {
  const { repository } = createContext(t);
  const result = importPackages(repository, [makePackage('record-one'), makePackage('record-two')]);
  assert.equal(result.outcome, 'COMMITTED');
  assert.equal(result.recordsImported, 2);
  assert.equal(repository.getArticleCount(), 2);
  assert.ok(repository.listArticles().every((article) => typeof article.image === 'string'));
});

test('a write failure midway rolls back all records and persists a failed audit', (t) => {
  const { database, repository } = createContext(t);
  database.exec(`
    CREATE TRIGGER fail_second_record BEFORE INSERT ON library_content
    WHEN NEW.source_record_id = 'record-two'
    BEGIN SELECT RAISE(ABORT, 'SYNTHETIC TEST ONLY injected failure'); END;
  `);
  const result = importPackages(repository, [makePackage('record-one'), makePackage('record-two')]);
  assert.equal(result.outcome, 'ROLLED_BACK');
  assert.equal(result.recordsImported, 0);
  assert.equal(repository.getArticleCount(), 0);
  assert.equal(repository.listImportRuns()[0].outcome, 'ROLLED_BACK');
  assert.ok(result.packageResults.every((item) =>
    item.errors.some((error) => error.code === 'IMPORT_BATCH_ROLLED_BACK')));
});

test('empty batch is an audited no-op with zero content writes', (t) => {
  const { repository } = createContext(t);
  const result = repository.importBatch([]);
  assert.equal(result.outcome, 'NO_OP');
  assert.equal(result.packagesDiscovered, 0);
  assert.equal(result.recordsImported, 0);
  assert.equal(repository.getArticleCount(), 0);
  assert.equal(repository.listImportRuns()[0].outcome, 'NO_OP');
});

test('mixed batch imports only eligible approved content and audits skips and rejections independently', (t) => {
  const database = openLibraryDatabase(':memory:');
  const restrictedPolicy = {
    ...structuredClone(syntheticPolicy),
    sourceId: 'synthetic-restricted-source',
    rightsStatus: 'restricted',
    maxReuseMode: 'restricted',
  };
  const repository = new LibraryRepository(database, [syntheticPolicy, restrictedPolicy], {
    allowSyntheticForTests: true,
  });
  t.after(() => database.close());

  const permitted = makePackage('synthetic-permitted-001');
  permitted.source.sourceId = 'unregistered-cleared-source';
  permitted.rights.sourcePolicy = null;
  permitted.rights.evidence = permitted.rights.evidence.filter((item) => item.evidenceType !== 'source-policy');
  permitted.libraryPresentation.imageReference = null;
  const unapproved = makePackage('synthetic-unapproved-002');
  const restricted = makePackage('synthetic-restricted-003');
  const unverified = makePackage('synthetic-unverified-004');
  unverified.rights.verificationStatus = 'unknown';
  restricted.source.sourceId = restrictedPolicy.sourceId;
  restricted.rights.sourcePolicy = {
    rightsStatus: restrictedPolicy.rightsStatus,
    maxReuseMode: restrictedPolicy.maxReuseMode,
  };
  restricted.rights.evidence[0].appliesToRecordId = restrictedPolicy.sourceId;
  const incomplete = makePackage('synthetic-incomplete-005');
  incomplete.libraryPresentation.description = '';

  const unapprovedEntry = {
    package: unapproved,
    packageBytes: Buffer.from(JSON.stringify(unapproved), 'utf8'),
    approval: null,
  };
  const result = repository.importBatch([
    makeApprovedEntry(permitted),
    unapprovedEntry,
    makeApprovedEntry(restricted),
    makeApprovedEntry(unverified),
    makeApprovedEntry(incomplete),
  ]);

  assert.equal(result.outcome, 'COMMITTED');
  assert.equal(result.recordsImported, 1);
  assert.equal(result.skippedPackages, 3);
  assert.equal(result.rejectedPackages, 1);
  assert.deepEqual(result.packageResults.map((item) => item.status), [
    'IMPORTED',
    'SKIPPED',
    'REJECTED',
    'SKIPPED',
    'SKIPPED',
  ]);
  assert.ok(result.packageResults[1].errors.some((error) => error.code === 'IMPORT_APPROVAL_REQUIRED'));
  assert.ok(result.packageResults[2].errors.some((error) => error.code === 'PACKAGE_POLICY_RESTRICTED'));
  assert.ok(result.packageResults[3].errors.some((error) => error.code === 'PACKAGE_RIGHTS_INSUFFICIENT'));
  assert.ok(result.packageResults[4].errors.some((error) => error.code === 'IMPORT_REQUIRED_FIELD_MISSING'));
  assert.equal(repository.getArticleCount(), 1);
  assert.equal(repository.getArticle(repository.listArticles()[0].id).image, null);
  const auditJson = JSON.stringify(repository.listImportRuns()[0].report);
  assert.ok(!auditJson.includes(unapproved.content.body), 'audit stores skip reasons without rejected full text');
  assert.ok(!auditJson.includes(restricted.content.body), 'audit stores rejection reasons without rejected full text');
  assert.ok(!auditJson.includes(unverified.content.body), 'audit stores unresolved-rights reasons without full text');
  assert.ok(!auditJson.includes(incomplete.content.body), 'audit stores metadata skip reasons without full text');
});

test('production command with an absent approved-package directory records zero imported', () => {
  const testRoot = mkdtempSync(join(tmpdir(), 'phase39-empty-input-'));
  try {
    const result = runImportCommand({
      packageDirectory: resolve(testRoot, 'approved-content-does-not-exist'),
      databasePath: resolve(testRoot, 'library.sqlite'),
    });
    assert.equal(result.outcome, 'NO_OP');
    assert.equal(result.packagesDiscovered, 0);
    assert.equal(result.recordsImported, 0);
  } finally {
    rmSync(testRoot, { recursive: true, force: true });
  }
});

test('production repository rejects test-only packages', (t) => {
  const database = openLibraryDatabase(':memory:');
  t.after(() => database.close());
  const productionRepository = new LibraryRepository(database, [syntheticPolicy]);
  const result = importPackages(productionRepository, [makePackage()]);
  assert.equal(result.outcome, 'BLOCKED');
  assert.ok(result.packageResults[0].errors.some((error) => error.code === 'PACKAGE_SYNTHETIC_NOT_ELIGIBLE'));
});

test('read API serves imported list, full article with provenance, and 404 safely', async (t) => {
  const { repository } = createContext(t);
  const imported = importPackages(repository, [makePackage()]);
  const articleId = repository.listArticles()[0].id;
  const server = createLibraryServer(repository);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const listResponse = await fetch(`${baseUrl}/api/library/articles`);
  const list = await listResponse.json();
  assert.equal(listResponse.status, 200);
  assert.equal(list.articles.length, 1);
  assert.equal(list.articles[0].id, articleId);

  const articleResponse = await fetch(`${baseUrl}/api/library/articles/${encodeURIComponent(articleId)}`);
  const article = await articleResponse.json();
  assert.equal(articleResponse.status, 200);
  assert.equal(article.content, 'SYNTHETIC TEST ONLY body for synthetic-record-001.');
  assert.equal(article.importMetadata.importBatchId, imported.batchId);

  const missingResponse = await fetch(`${baseUrl}/api/library/articles/not-found`);
  assert.equal(missingResponse.status, 404);
});

afterTests(() => {
  console.log(`Phase 3.9 backend: ${scenarioCount} scenarios, ${assertionCount} assertions.`);
});
