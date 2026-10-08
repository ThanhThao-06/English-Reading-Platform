import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openLibraryDatabase } from './database.mjs';
import { LibraryRepository } from './library-repository.mjs';

const SOURCE_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SOURCE_DIR, '..', '..');
const APPROVED_PACKAGE_DIR = resolve(
  PROJECT_ROOT,
  'research',
  'phase3-7-approved-content-package',
  'approved-content',
);
const IMPORT_APPROVAL_DIR = resolve(
  PROJECT_ROOT,
  'research',
  'phase3-9-library-storage-import',
  'approvals',
);
const POLICY_DIR = resolve(PROJECT_ROOT, 'research', 'phase3-5-content-intake', 'fixtures', 'source-policies');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const readDirectory = (path) => {
  let entries;
  try {
    entries = readdirSync(path, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => resolve(path, entry.name));
};

export const discoverApprovedPackages = (
  packageDirectory = APPROVED_PACKAGE_DIR,
  approvalDirectory = IMPORT_APPROVAL_DIR,
) => {
  const approvalByKey = new Map();
  for (const path of readDirectory(approvalDirectory)) {
    const approval = readJson(path);
    const key = `${approval?.packageId}\u0000${approval?.packageVersion}`;
    if (approvalByKey.has(key)) {
      throw new Error(`Multiple library-import approvals found for ${approval?.packageId}@${approval?.packageVersion}.`);
    }
    approvalByKey.set(key, approval);
  }

  const matchedApprovalKeys = new Set();
  const packageEntries = readDirectory(packageDirectory).map((path) => {
    const packageBytes = readFileSync(path);
    const pkg = JSON.parse(packageBytes.toString('utf8'));
    const key = `${pkg?.packageId}\u0000${pkg?.version}`;
    const approval = approvalByKey.get(key) ?? null;
    if (approval) matchedApprovalKeys.add(key);
    return {
      package: pkg,
      packageBytes,
      approval,
    };
  });
  const orphanedApprovals = [...approvalByKey.keys()].filter((key) => !matchedApprovalKeys.has(key));
  if (orphanedApprovals.length > 0) {
    throw new Error(`Library-import approval has no matching package: ${orphanedApprovals.join(', ')}.`);
  }
  return packageEntries;
};

export const loadSourcePolicies = () => readdirSync(POLICY_DIR, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
  .sort((left, right) => left.name.localeCompare(right.name))
  .map((entry) => readJson(resolve(POLICY_DIR, entry.name)));

export const runImportCommand = ({
  packageDirectory = APPROVED_PACKAGE_DIR,
  approvalDirectory = IMPORT_APPROVAL_DIR,
  databasePath = process.env.LIBRARY_DATABASE_PATH,
} = {}) => {
  const database = openLibraryDatabase(databasePath);
  try {
    const repository = new LibraryRepository(database, loadSourcePolicies());
    let packages;
    try {
      packages = discoverApprovedPackages(packageDirectory, approvalDirectory);
    } catch (error) {
      return repository.recordInputFailure(error instanceof Error ? error.message : String(error));
    }
    return repository.importBatch(packages);
  } finally {
    database.close();
  }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = runImportCommand();
    console.log(JSON.stringify({
      packageCandidatesDiscovered: report.packagesDiscovered,
      approvedPackagesDiscovered: report.approvedPackagesDiscovered,
      recordsImported: report.recordsImported,
      skippedPackages: report.skippedPackages ?? 0,
      rejectedPackages: report.rejectedPackages ?? 0,
      importBatchId: report.batchId,
      outcome: report.outcome,
      packageResults: report.packageResults,
    }, null, 2));
    if (report.outcome === 'BLOCKED' || report.outcome === 'ROLLED_BACK') process.exitCode = 1;
  } catch (error) {
    console.error(`Library import failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
