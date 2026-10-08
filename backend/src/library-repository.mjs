import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { validatePackage, validatePackageBatch } from '../../research/phase3-7-approved-content-package/scripts/build-package.mjs';

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
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;
const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const sha256Bytes = (value) => createHash('sha256').update(value).digest('hex');
const json = (value) => JSON.stringify(value);
const normalizeCanonicalUrl = (value) => {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
};

const isSafeImageReference = (value) => {
  if (!nonEmpty(value) || value !== value.trim() || value.includes('\\')) return false;
  if (value.startsWith('/') && !value.startsWith('//')) {
    return !value.split(/[?#]/, 1)[0].split('/').some((segment) => segment === '.' || segment === '..');
  }
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
};

const buildPolicySet = (policies) => {
  if (!Array.isArray(policies) || policies.length === 0) {
    throw new TypeError('The unchanged local source-policy set is required.');
  }
  return policies;
};

const mapPackage = (pkg, importedAt, importBatchId) => {
  const presentation = pkg?.libraryPresentation;
  const missing = [];
  const invalid = [];
  const canonicalUrl = normalizeCanonicalUrl(pkg?.source?.canonicalUrl);
  if (nonEmpty(pkg?.source?.canonicalUrl) && !canonicalUrl) invalid.push('source.canonicalUrl');
  if (!presentation || typeof presentation !== 'object' || Array.isArray(presentation)) {
    missing.push('libraryPresentation');
  } else {
    for (const field of ['description', 'genre', 'level', 'readingTime']) {
      if (!nonEmpty(presentation[field])) missing.push(`libraryPresentation.${field}`);
    }
    if (!Object.hasOwn(presentation, 'imageReference')) missing.push('libraryPresentation.imageReference');
    if (nonEmpty(presentation.genre) && !GENRES.has(presentation.genre)) invalid.push('libraryPresentation.genre');
    if (nonEmpty(presentation.level) && !LEVELS.has(presentation.level)) invalid.push('libraryPresentation.level');
    if (nonEmpty(presentation.readingTime) && !READING_TIMES.has(presentation.readingTime)) {
      invalid.push('libraryPresentation.readingTime');
    }
    if (presentation.imageReference !== null
      && nonEmpty(presentation.imageReference)
      && !isSafeImageReference(presentation.imageReference)) {
      invalid.push('libraryPresentation.imageReference');
    }
    if (presentation.imageReference !== null && presentation.imageReference !== undefined
      && !nonEmpty(presentation.imageReference)) {
      invalid.push('libraryPresentation.imageReference');
    }
  }

  if (!nonEmpty(pkg?.content?.body) || pkg?.content?.reuseMode !== 'verified-full-text') {
    missing.push('content.body (verified-full-text required)');
  }
  for (const [field, value] of [
    ['packageId', pkg?.packageId],
    ['version', pkg?.version],
    ['content.recordId', pkg?.content?.recordId],
    ['content.title', pkg?.content?.title],
    ['source.sourceId', pkg?.source?.sourceId],
    ['source.sourceName', pkg?.source?.sourceName],
    ['source.canonicalUrl', pkg?.source?.canonicalUrl],
  ]) {
    if ((typeof value === 'string' && !nonEmpty(value)) || value === undefined || value === null) {
      missing.push(field);
    }
  }

  const recordId = pkg?.content?.recordId;
  const assetEvidence = Array.isArray(pkg?.rights?.evidence) && pkg.rights.evidence.some((item) =>
    item.evidenceType === 'asset-rights'
    && item.scope === 'asset'
    && item.appliesToRecordId === recordId
    && nonEmpty(item.reference));
  if (presentation?.imageReference && !assetEvidence) {
    missing.push('rights.evidence (item-applicable asset-rights required for imageReference)');
  }

  if (missing.length > 0 || invalid.length > 0) return { record: null, missing, invalid };

  const body = pkg.content.body;
  const packageKey = `${pkg.packageId}@${pkg.version}`;
  const id = `imported-${sha256(packageKey).slice(0, 24)}`;
  const record = {
    id,
    package_id: pkg.packageId,
    package_version: pkg.version,
    source_id: pkg.source.sourceId,
    source_record_id: recordId,
    title: pkg.content.title,
    description: presentation.description,
    body,
    image_reference: presentation.imageReference,
    level: presentation.level,
    genre: presentation.genre,
    reading_time: presentation.readingTime,
    language: pkg.content.language,
    content_type: pkg.content.contentType,
    content_group: pkg.content.contentGroup,
    categories_json: json(pkg.content.categories),
    source_name: pkg.source.sourceName,
    source_url: pkg.source.sourceUrl,
    canonical_url: canonicalUrl,
    external_id: pkg.source.externalId,
    doi: pkg.source.doi,
    rights_status: pkg.rights.verificationStatus,
    reuse_mode: pkg.rights.permittedReuseMode,
    authors_json: json(pkg.content.authors ?? null),
    content_hash: sha256(body),
    source_json: json(pkg.source),
    rights_json: json(pkg.rights),
    provenance_json: json(pkg.provenance),
    package_json: json(pkg),
    imported_at: importedAt,
    import_batch_id: importBatchId,
  };
  return { record, missing: [], invalid: [] };
};

const packageIssues = (packages, policies, allowSyntheticForTests) => {
  const validationOptions = { allowSyntheticForTests };
  const batch = validatePackageBatch(packages, policies, validationOptions);
  return packages.map((pkg) => {
    const packageId = typeof pkg?.packageId === 'string' ? pkg.packageId : null;
    const validation = validatePackage(pkg, policies, validationOptions);
    const errors = [
      ...validation.errors,
      ...batch.errors.filter((issue) => issue.packageId === packageId),
    ];
    return { packageId, errors: [...new Map(errors.map((item) => [`${item.code}:${item.field}`, item])).values()] };
  });
};

export class LibraryRepository {
  constructor(database, policies, { allowSyntheticForTests = false } = {}) {
    if (!database || typeof database.prepare !== 'function' || typeof database.transaction !== 'function') {
      throw new TypeError('A persistent SQLite database connection is required.');
    }
    if (allowSyntheticForTests && database.name !== ':memory:') {
      throw new TypeError('Synthetic package mode is restricted to an in-memory test database.');
    }
    this.database = database;
    this.policies = buildPolicySet(policies);
    this.allowSyntheticForTests = allowSyntheticForTests;
  }

  listArticles() {
    return this.database.prepare(`
      SELECT id, title, description, image_reference, genre, level, reading_time
      FROM library_content
      ORDER BY imported_at DESC, id
    `).all().map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      image: row.image_reference,
      genre: row.genre,
      level: row.level,
      readingTime: row.reading_time,
    }));
  }

  getArticle(id) {
    const row = this.database.prepare('SELECT * FROM library_content WHERE id = ?').get(id);
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      image: row.image_reference,
      genre: row.genre,
      level: row.level,
      readingTime: row.reading_time,
      content: row.body,
      importMetadata: {
        packageId: row.package_id,
        packageVersion: row.package_version,
        sourceRecordId: row.source_record_id,
        contentHash: row.content_hash,
        importedAt: row.imported_at,
        importBatchId: row.import_batch_id,
        libraryImportApproval: JSON.parse(row.import_approval_json),
        content: {
          language: row.language,
          contentType: row.content_type,
          contentGroup: row.content_group,
          categories: JSON.parse(row.categories_json),
          reuseMode: row.reuse_mode,
        },
        source: JSON.parse(row.source_json),
        authors: JSON.parse(row.authors_json),
        rights: JSON.parse(row.rights_json),
        provenance: JSON.parse(row.provenance_json),
      },
    };
  }

  getArticleCount() {
    return this.database.prepare('SELECT count(*) AS count FROM library_content').get().count;
  }

  listImportRuns(limit = 50) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new RangeError('Audit limit must be an integer from 1 to 500.');
    }
    return this.database.prepare(`
      SELECT run_id, batch_id, outcome, packages_discovered, approved_packages_discovered,
        records_imported, started_at, finished_at, report_json
      FROM import_runs
      ORDER BY started_at DESC
      LIMIT ?
    `).all(limit).map((row) => ({ ...row, report: JSON.parse(row.report_json) }));
  }

  importBatch(entries) {
    if (!Array.isArray(entries)) throw new TypeError('Import input must be an array of package entries.');

    const runId = randomUUID();
    const batchId = randomUUID();
    const startedAt = new Date().toISOString();
    if (entries.length === 0) {
      const report = {
        runId,
        batchId,
        outcome: 'NO_OP',
        packagesDiscovered: 0,
        approvedPackagesDiscovered: 0,
        recordsImported: 0,
        packageResults: [],
      };
      this.#writeAudit(report, startedAt, new Date().toISOString());
      return report;
    }

    const packages = entries.map((entry) => entry?.package);
    const validations = packageIssues(packages, this.policies, this.allowSyntheticForTests);
    const importedAt = new Date().toISOString();
    const mapped = entries.map((entry, index) => {
      const pkg = entry?.package;
      const approvalErrors = [];
      const approval = entry?.approval;
      const packageBytesValid = Buffer.isBuffer(entry?.packageBytes);
      let packageBytesMatch = false;
      if (packageBytesValid) {
        try {
          packageBytesMatch = isDeepStrictEqual(
            JSON.parse(entry.packageBytes.toString('utf8')),
            pkg,
          );
        } catch {
          packageBytesMatch = false;
        }
      }
      const computedPackageHash = packageBytesValid
        ? sha256Bytes(entry.packageBytes)
        : null;
      if (!approval) {
        approvalErrors.push({ code: 'IMPORT_APPROVAL_REQUIRED', field: 'library-import-approval' });
      } else if (
        !pkg
        || !packageBytesValid
        || !packageBytesMatch
        || approval.approvalStatus !== 'APPROVED_FOR_LIBRARY_IMPORT'
        || approval.packageId !== pkg.packageId
        || approval.packageVersion !== pkg.version
        || approval.packageSha256 !== computedPackageHash
        || !nonEmpty(approval.approver)
        || !nonEmpty(approval.decision)
        || typeof approval.approvedAt !== 'string'
        || !Number.isFinite(Date.parse(approval.approvedAt))
        || new Date(approval.approvedAt).toISOString() !== approval.approvedAt
        || Object.keys(approval).some((key) => ![
          'approvalStatus',
          'packageId',
          'packageVersion',
          'packageSha256',
          'approvedAt',
          'approver',
          'decision',
        ].includes(key))
      ) {
        approvalErrors.push({ code: 'IMPORT_APPROVAL_INVALID', field: 'library-import-approval' });
      }
      return {
        ...mapPackage(pkg ?? {}, importedAt, batchId),
        packageId: typeof pkg?.packageId === 'string' ? pkg.packageId : null,
        approval: approvalErrors.length === 0 ? approval : null,
        approvalErrors,
        validationErrors: validations[index].errors,
      };
    });
    const approvedPackagesDiscovered = mapped.filter((item) => item.approval !== null).length;
    const packageResults = mapped.map((item) => {
      const errors = [
        ...item.approvalErrors,
        ...item.validationErrors.map(({ code, field }) => ({ code, field: field ?? null })),
        ...item.missing.map((field) => ({ code: 'IMPORT_REQUIRED_FIELD_MISSING', field })),
        ...item.invalid.map((field) => ({ code: 'IMPORT_FIELD_INVALID', field })),
      ];
      const explicitlyDenied = errors.some((error) => [
        'PACKAGE_THIRD_PARTY_CONTENT_BLOCKED',
        'PACKAGE_POLICY_RESTRICTED',
        'PACKAGE_POLICY_EXCEEDED',
        'PACKAGE_BODY_NOT_ALLOWED',
      ].includes(error.code));
      const invalidApproval = item.approvalErrors.some((error) => error.code === 'IMPORT_APPROVAL_INVALID');
      return {
        packageId: item.packageId,
        errors,
        status: explicitlyDenied || invalidApproval
          ? 'REJECTED'
          : errors.length > 0
            ? 'SKIPPED'
            : 'READY',
      };
    });

    const readyIndexes = packageResults
      .map((result, index) => result.status === 'READY' ? index : -1)
      .filter((index) => index >= 0);
    const duplicateErrors = this.#findDuplicates(readyIndexes.map((index) => mapped[index]));
    readyIndexes.forEach((index, readyIndex) => {
      if (duplicateErrors[readyIndex].length > 0) {
        packageResults[index].errors.push(...duplicateErrors[readyIndex]);
        packageResults[index].status = 'REJECTED';
      }
    });

    const importIndexes = packageResults
      .map((result, index) => result.status === 'READY' ? index : -1)
      .filter((index) => index >= 0);
    const importCandidates = importIndexes.map((index) => mapped[index]);
    for (const index of importIndexes) packageResults[index].status = 'IMPORTED';

    if (importCandidates.length === 0) {
      const report = {
        runId,
        batchId,
        outcome: entries.length === 0 ? 'NO_OP' : 'BLOCKED',
        packagesDiscovered: entries.length,
        approvedPackagesDiscovered,
        recordsImported: 0,
        skippedPackages: packageResults.filter((result) => result.status === 'SKIPPED').length,
        rejectedPackages: packageResults.filter((result) => result.status === 'REJECTED').length,
        packageResults,
      };
      this.#writeAudit(report, startedAt, new Date().toISOString());
      return report;
    }

    const insert = this.database.prepare(`
      INSERT INTO library_content (
        id, package_id, package_version, source_id, source_record_id,
        title, description, body, image_reference, level, genre, reading_time,
        language, content_type, content_group, categories_json, source_name, source_url,
        canonical_url, external_id, doi, rights_status, reuse_mode, authors_json, content_hash,
        source_json, rights_json, provenance_json, package_json, imported_at, import_batch_id,
        import_approval_json
      ) VALUES (
        @id, @package_id, @package_version, @source_id, @source_record_id,
        @title, @description, @body, @image_reference, @level, @genre, @reading_time,
        @language, @content_type, @content_group, @categories_json, @source_name, @source_url,
        @canonical_url, @external_id, @doi, @rights_status, @reuse_mode, @authors_json, @content_hash,
        @source_json, @rights_json, @provenance_json, @package_json, @imported_at, @import_batch_id,
        @import_approval_json
      )
    `);
    for (const item of importCandidates) {
      if (item.record && item.approval) item.record.import_approval_json = json(item.approval);
    }
    const report = {
      runId,
      batchId,
      outcome: 'COMMITTED',
      packagesDiscovered: entries.length,
      approvedPackagesDiscovered,
      recordsImported: importCandidates.length,
      skippedPackages: packageResults.filter((result) => result.status === 'SKIPPED').length,
      rejectedPackages: packageResults.filter((result) => result.status === 'REJECTED').length,
      packageResults,
    };

    try {
      this.database.transaction(() => {
        for (const item of importCandidates) insert.run(item.record);
        const ids = new Set(importCandidates.map((item) => item.record.id));
        const persisted = this.database.prepare(`
          SELECT id FROM library_content WHERE import_batch_id = ?
        `).all(batchId);
        if (persisted.length !== importCandidates.length || persisted.some((row) => !ids.has(row.id))) {
          throw new Error('Post-write verification failed for the imported batch.');
        }
        this.#insertAudit(report, startedAt, new Date().toISOString());
      }).immediate();
      return report;
    } catch (error) {
      const rolledBack = {
        ...report,
        outcome: 'ROLLED_BACK',
        recordsImported: 0,
        failure: error instanceof Error ? error.message : String(error),
        packageResults: packageResults.map((result) => ({
          ...result,
          status: result.status === 'IMPORTED' ? 'ROLLED_BACK' : result.status,
          errors: [...result.errors, { code: 'IMPORT_BATCH_ROLLED_BACK', field: null }],
        })),
      };
      this.#writeAudit(rolledBack, startedAt, new Date().toISOString());
      return rolledBack;
    }
  }

  recordInputFailure(message) {
    const runId = randomUUID();
    const batchId = randomUUID();
    const startedAt = new Date().toISOString();
    const report = {
      runId,
      batchId,
      outcome: 'BLOCKED',
      packagesDiscovered: 0,
      approvedPackagesDiscovered: 0,
      recordsImported: 0,
      packageResults: [],
      inputError: message,
    };
    this.#writeAudit(report, startedAt, new Date().toISOString());
    return report;
  }

  #findDuplicates(mapped) {
    const packageKeys = new Set();
    const sourceKeys = new Set();
    const canonicalUrls = new Set();
    const hashes = new Set();
    return mapped.map(({ record, packageId }) => {
      const errors = [];
      if (!record) return errors;
      const packageKey = `${record.package_id}\u0000${record.package_version}`;
      const sourceKey = `${record.source_id}\u0000${record.source_record_id}`;
      if (packageKeys.has(packageKey) || this.database.prepare(
        'SELECT 1 FROM library_content WHERE package_id = ? AND package_version = ?',
      ).get(record.package_id, record.package_version)) {
        errors.push({ code: 'DUPLICATE_PACKAGE_VERSION', field: 'packageId/version' });
      }
      if (sourceKeys.has(sourceKey) || this.database.prepare(
        'SELECT 1 FROM library_content WHERE source_id = ? AND source_record_id = ?',
      ).get(record.source_id, record.source_record_id)) {
        errors.push({ code: 'DUPLICATE_SOURCE_CONTENT_ID', field: 'sourceId/content.recordId' });
      }
      if (canonicalUrls.has(record.canonical_url) || this.database.prepare(
        'SELECT 1 FROM library_content WHERE canonical_url = ?',
      ).get(record.canonical_url)) {
        errors.push({ code: 'DUPLICATE_CANONICAL_URL', field: 'source.canonicalUrl' });
      }
      if (hashes.has(record.content_hash) || this.database.prepare(
        'SELECT 1 FROM library_content WHERE content_hash = ?',
      ).get(record.content_hash)) {
        errors.push({ code: 'DUPLICATE_CONTENT_HASH', field: 'content.body' });
      }
      packageKeys.add(packageKey);
      sourceKeys.add(sourceKey);
      canonicalUrls.add(record.canonical_url);
      hashes.add(record.content_hash);
      return errors;
    });
  }

  #writeAudit(report, startedAt, finishedAt) {
    this.database.transaction(() => this.#insertAudit(report, startedAt, finishedAt)).immediate();
  }

  #insertAudit(report, startedAt, finishedAt) {
    this.database.prepare(`
      INSERT INTO import_runs (
        run_id, batch_id, outcome, packages_discovered, approved_packages_discovered,
        records_imported, started_at, finished_at, report_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      report.runId,
      report.batchId,
      report.outcome,
      report.packagesDiscovered,
      report.approvedPackagesDiscovered,
      report.recordsImported,
      startedAt,
      finishedAt,
      json(report),
    );
  }
}

export const contentHash = sha256;
