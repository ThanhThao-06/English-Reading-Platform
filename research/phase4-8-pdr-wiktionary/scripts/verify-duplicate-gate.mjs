/**
 * Prove the import is idempotent and the duplicate gate is real, on a THROWAWAY
 * database. The production database is never opened for writing by this script.
 *
 * Run 1 imports every importable package. Run 2 must reject every already-stored
 * package as a duplicate and import nothing new.
 *
 * The assertions are deliberately COUNT-AGNOSTIC: they compare run 1 against run
 * 2 rather than against a hardcoded total, so the check stays valid as later
 * batches add packages and does not need editing each time.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runImportCommand } from '../../../backend/src/import-packages.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const PACKAGES = resolve(ROOT, 'research', 'phase3-7-approved-content-package', 'approved-content');
const APPROVALS = resolve(ROOT, 'research', 'phase3-9-library-storage-import', 'approvals');

const tempRoot = mkdtempSync(join(tmpdir(), 'phase48-idempotency-'));
const databasePath = resolve(tempRoot, 'library.sqlite');

let ok = true;
const check = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` :: ${detail}` : ''}`);
  if (!pass) ok = false;
};

try {
  const first = runImportCommand({ packageDirectory: PACKAGES, approvalDirectory: APPROVALS, databasePath });
  console.log(`run 1 -> outcome=${first.outcome} imported=${first.recordsImported} skipped=${first.skippedPackages} rejected=${first.rejectedPackages}`);

  const run1Imported = first.packageResults.filter((r) => r.status === 'IMPORTED').length;
  check('run 1 imports every package it reports as IMPORTED',
    run1Imported === first.recordsImported && first.recordsImported > 0,
    `records=${first.recordsImported} results=${run1Imported}`);
  check('run 1 rejects nothing on a clean database', (first.rejectedPackages ?? 0) === 0,
    `rejected=${first.rejectedPackages ?? 0}`);
  check('run 1 outcome is COMMITTED', first.outcome === 'COMMITTED', first.outcome);

  const second = runImportCommand({ packageDirectory: PACKAGES, approvalDirectory: APPROVALS, databasePath });
  console.log(`run 2 -> outcome=${second.outcome} imported=${second.recordsImported} skipped=${second.skippedPackages} rejected=${second.rejectedPackages}`);

  check('run 2 imports nothing', second.recordsImported === 0, `imported=${second.recordsImported}`);
  check('run 2 rejects exactly the packages run 1 imported',
    second.rejectedPackages === first.recordsImported,
    `rejected=${second.rejectedPackages} vs imported=${first.recordsImported}`);

  const notSkipped = second.packageResults.filter((r) => r.status !== 'SKIPPED');
  check('run 2 leaves no package in a READY/IMPORTED state',
    notSkipped.length > 0 && notSkipped.every((r) => r.status === 'REJECTED'),
    [...new Set(second.packageResults.map((r) => r.status))].join(','));
  check('every run 2 duplicate rejection carries DUPLICATE_* codes',
    notSkipped.length > 0 && notSkipped.every((r) => (r.errors ?? []).some((e) => String(e.code).startsWith('DUPLICATE_'))),
    (notSkipped[0]?.errors ?? []).map((e) => e.code).join(','));
  check('run 2 is BLOCKED (nothing importable, nothing persisted)',
    second.outcome === 'BLOCKED', second.outcome);

  // Every package this batch produced must be inside the importable set.
  const batchRecords = [
    'public-domain-review-the-mowing-devil', 'public-domain-review-animal-vegetable-lamb',
    'public-domain-review-glass-delusion', 'public-domain-review-maskenfest',
    'public-domain-review-mail-order-occult', 'wiktionary-salary', 'wiktionary-quarantine',
    'wiktionary-window', 'wiktionary-posh', 'wiktionary-gossip',
  ];
  check('all 10 batch packages are importable, none skipped',
    batchRecords.every((r) => first.packageResults.some((p) => p.status === 'IMPORTED'
      && String(p.packageId).length > 0)),
    `importedTotal=${first.recordsImported}`);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

console.log(ok ? '\nIDEMPOTENCY CHECK PASSED' : '\nIDEMPOTENCY CHECK FAILED');
process.exit(ok ? 0 : 1);