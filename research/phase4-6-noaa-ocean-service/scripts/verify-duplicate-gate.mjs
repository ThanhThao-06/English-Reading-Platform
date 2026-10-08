/**
 * Prove the import is idempotent and the duplicate gate is real, on a THROWAWAY
 * database. The production database is never opened for writing by this script.
 *
 * Run 1 imports the batch. Run 2 must reject every package as a duplicate and
 * import nothing new.
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

const tempRoot = mkdtempSync(join(tmpdir(), 'phase46-idempotency-'));
const databasePath = resolve(tempRoot, 'library.sqlite');

let ok = true;
const check = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` :: ${detail}` : ''}`);
  if (!pass) ok = false;
};

try {
  const first = runImportCommand({ packageDirectory: PACKAGES, approvalDirectory: APPROVALS, databasePath });
  console.log(`run 1 -> outcome=${first.outcome} imported=${first.recordsImported} skipped=${first.skippedPackages} rejected=${first.rejectedPackages}`);

  // 8 legacy VOA packages predate the current package schema and are always
  // SKIPped; the remaining 23 (13 legacy + 10 NOAA) are importable.
  const run1Statuses = first.packageResults.map((r) => r.status);
  const run1Imported = run1Statuses.filter((s) => s === 'IMPORTED').length;
  check('run 1 imports every importable package', run1Imported === 23 && first.recordsImported === 23,
    `imported=${first.recordsImported}/${run1Imported}`);
  check('run 1 SKIPs only the legacy schema-invalid packages', first.skippedPackages === 8,
    `skipped=${first.skippedPackages}`);
  check('run 1 rejects nothing on a clean database', (first.rejectedPackages ?? 0) === 0,
    `rejected=${first.rejectedPackages ?? 0}`);
  check('run 1 outcome is COMMITTED', first.outcome === 'COMMITTED', first.outcome);

  const second = runImportCommand({ packageDirectory: PACKAGES, approvalDirectory: APPROVALS, databasePath });
  console.log(`run 2 -> outcome=${second.outcome} imported=${second.recordsImported} skipped=${second.skippedPackages} rejected=${second.rejectedPackages}`);

  check('run 2 imports nothing', second.recordsImported === 0, `imported=${second.recordsImported}`);
  check('run 2 rejects all 23 previously imported packages as duplicates', second.rejectedPackages === 23,
    `rejected=${second.rejectedPackages}`);

  const notSkipped = second.packageResults.filter((r) => r.status !== 'SKIPPED');
  check('run 2 leaves no package in a READY/IMPORTED state', notSkipped.every((r) => r.status === 'REJECTED'),
    [...new Set(second.packageResults.map((r) => r.status))].join(','));
  check('every run 2 duplicate rejection carries DUPLICATE_* codes',
    notSkipped.every((r) => (r.errors ?? []).some((e) => String(e.code).startsWith('DUPLICATE_'))),
    (notSkipped[0]?.errors ?? []).map((e) => e.code).join(','));
  check('run 2 is BLOCKED (nothing importable, nothing persisted)',
    second.outcome === 'BLOCKED', second.outcome);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

console.log(`\n${ok ? 'IDEMPOTENCY / DUPLICATE GATE VERIFIED' : 'IDEMPOTENCY CHECK FAILED'}`);
process.exitCode = ok ? 0 : 1;
