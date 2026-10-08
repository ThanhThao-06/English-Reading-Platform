/**
 * Captures a fingerprint of library_content before / after the genre migration
 * so the audit columns can be proven byte-identical.
 *
 *   node verify-migration.mjs snapshot   -> writes baseline.json
 *   node verify-migration.mjs verify     -> compares live DB to baseline.json
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const DB = resolve(ROOT, 'backend', 'data', 'library.sqlite');
const BASELINE = resolve(HERE, 'baseline.json');

const AUDIT_COLUMNS = [
  'id',
  'source_record_id',
  'rights_json',
  'source_json',
  'provenance_json',
  'package_json',
  'import_approval_json',
];

const fingerprint = () => {
  const db = new DatabaseSync(DB, { readOnly: true });
  const version = Object.values(db.prepare('PRAGMA user_version').get())[0];
  const rows = db
    .prepare(`SELECT ${AUDIT_COLUMNS.join(', ')} FROM library_content ORDER BY source_record_id`)
    .all();
  const genres = db
    .prepare('SELECT source_record_id, genre FROM library_content ORDER BY source_record_id')
    .all();
  db.close();
  return {
    userVersion: version,
    rowCount: rows.length,
    // Hash of the audit columns only - genre is deliberately excluded.
    auditHash: createHash('sha256')
      .update(JSON.stringify(rows))
      .digest('hex'),
    ids: rows.map((r) => r.id),
    genres: Object.fromEntries(genres.map((g) => [g.source_record_id, g.genre])),
  };
};

const mode = process.argv[2];
const current = fingerprint();

if (mode === 'snapshot') {
  writeFileSync(BASELINE, JSON.stringify(current, null, 2));
  console.log('baseline written:', BASELINE);
  console.log('  user_version :', current.userVersion);
  console.log('  rows         :', current.rowCount);
  console.log('  auditHash    :', current.auditHash);
} else if (mode === 'verify') {
  if (!existsSync(BASELINE)) {
    console.error('no baseline.json - run "snapshot" BEFORE migrating');
    process.exitCode = 1;
  } else {
    const before = JSON.parse(readFileSync(BASELINE, 'utf8'));
    let ok = true;
    const check = (label, pass, detail = '') => {
      console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` :: ${detail}` : ''}`);
      if (!pass) ok = false;
    };
    check('row count unchanged', before.rowCount === current.rowCount, `${before.rowCount} -> ${current.rowCount}`);
    check('audit JSON byte-identical', before.auditHash === current.auditHash, before.auditHash.slice(0, 16) + ' -> ' + current.auditHash.slice(0, 16));
    check(
      'all ids still present',
      before.ids.every((id) => current.ids.includes(id))
    );
    check(
      'no old genre value remains',
      Object.values(current.genres).every((g) =>
        ['News & Social Issues','Science & Nature','Technology & AI','Business & Economics',
         'Health & Psychology','Culture, Art & Travel','Stories & Literature','Education',
         'History','Environment','Law & Politics'].includes(g)
      )
    );
    console.log(`\nuser_version: ${before.userVersion} -> ${current.userVersion}`);
    process.exitCode = ok ? 0 : 1;
  }
} else {
  console.log('usage: node verify-migration.mjs snapshot|verify');
  process.exitCode = 1;
}
