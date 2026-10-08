/**
 * Dry-run validation for the PROPOSED 006 genre taxonomy migration.
 *
 * Copies the live database to a scratch file, applies the proposed SQL to the
 * COPY, and checks the result. The real library.sqlite is opened read-only and
 * is never written to.
 *
 * Usage:  node research/phase4-4-genre-taxonomy-migration/scripts/validate-proposal.mjs
 */
import { copyFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const LIVE_DB = resolve(ROOT, 'backend', 'data', 'library.sqlite');
const SCRATCH = resolve(HERE, '..', '.scratch-validate.sqlite');
const PROPOSED_SQL = resolve(HERE, '..', 'proposed', '006-expanded-genre-taxonomy.sql');

const EXPECTED = {
  Education: 5,
  'Science & Nature': 1,
  'Health & Psychology': 1,
  'Culture, Art & Travel': 1,
  History: 1,
};

// Snapshot the audit columns + row identity from the LIVE db (read-only).
const live = new DatabaseSync(LIVE_DB, { readOnly: true });
const before = live
  .prepare(
    `SELECT id, source_record_id, rights_json, source_json, provenance_json,
            package_json, import_approval_json
       FROM library_content ORDER BY source_record_id`
  )
  .all();
const beforeVersion = live.prepare('PRAGMA user_version').get();
live.close();

console.log(`live user_version      : ${Object.values(beforeVersion)[0]}`);
console.log(`live rows              : ${before.length}\n`);

// Build an isolated copy and apply the proposal to it.
for (const suffix of ['', '-wal', '-shm']) {
  const from = LIVE_DB + suffix;
  if (existsSync(from)) copyFileSync(from, SCRATCH + suffix);
}

const scratch = new DatabaseSync(SCRATCH);
scratch.exec(readFileSync(PROPOSED_SQL, 'utf8'));
scratch.exec('PRAGMA user_version = 6;');

const after = scratch
  .prepare(
    `SELECT id, source_record_id, rights_json, source_json, provenance_json,
            package_json, import_approval_json
       FROM library_content ORDER BY source_record_id`
  )
  .all();

console.log('--- CHECKS ---');
let ok = true;
const check = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` :: ${detail}` : ''}`);
  if (!pass) ok = false;
};

check('row count preserved', before.length === after.length, `${before.length} -> ${after.length}`);
check(
  'every row still present',
  before.every((b) => after.some((a) => a.id === b.id && a.source_record_id === b.source_record_id))
);
check(
  'audit JSON byte-identical (rights/source/provenance/package/approval)',
  before.every((b) => {
    const a = after.find((x) => x.id === b.id);
    return a
      && a.rights_json === b.rights_json
      && a.source_json === b.source_json
      && a.provenance_json === b.provenance_json
      && a.package_json === b.package_json
      && a.import_approval_json === b.import_approval_json;
  })
);
check(
  'no NULL genre (unmapped source_record_id would abort anyway)',
  scratch.prepare('SELECT COUNT(*) n FROM library_content WHERE genre IS NULL').get().n === 0
);

console.log('\n--- resulting imported-article distribution ---');
const dist = scratch
  .prepare('SELECT genre, COUNT(*) n FROM library_content GROUP BY genre ORDER BY n DESC')
  .all();
for (const row of dist) console.log(`  ${row.genre} = ${row.n}`);
check(
  'expected imported distribution',
  dist.length === Object.keys(EXPECTED).length
    && dist.every((r) => EXPECTED[r.genre] === r.n),
  JSON.stringify(EXPECTED)
);

console.log('\n--- new CHECK constraint accepted ---');
for (const g of ['News & Social Issues', 'Technology & AI', 'Law & Politics']) {
  const accepted = scratch
    .prepare(
      `SELECT COUNT(*) n FROM (
         SELECT genre FROM library_content
         UNION ALL SELECT ?
       ) WHERE genre NOT IN (
         'News & Social Issues','Science & Nature','Technology & AI',
         'Business & Economics','Health & Psychology','Culture, Art & Travel',
         'Stories & Literature','Education','History','Environment','Law & Politics')`
    )
    .get(g).n === 0;
  check(`CHECK accepts "${g}"`, accepted);
}
check(
  'CHECK still rejects a removed old value',
  (() => {
    try {
      scratch.exec(
        `INSERT INTO library_content (id, package_id, package_version, source_id,
           source_record_id, title, description, body, image_reference, level, genre,
           reading_time, language, content_type, source_name, canonical_url, authors_json,
           content_hash, source_json, rights_json, provenance_json, package_json,
           imported_at, import_batch_id, source_url, external_id, doi, content_group,
           categories_json, rights_status, reuse_mode, import_approval_json)
         VALUES ('x','y',1,'z','w','t','d','b',NULL,'B1','Society','Chapter',
           NULL,NULL,'s','https://e.invalid/a','',  'h','{}','{}','{}','{}','t','b',
           NULL,NULL,NULL,NULL,NULL,NULL,NULL);`
      );
      return false;
    } catch {
      return true;
    }
  })()
);

scratch.close();
for (const suffix of ['', '-wal', '-shm']) {
  rmSync(SCRATCH + suffix, { force: true });
}

console.log(`\n${ok ? 'ALL CHECKS PASSED - proposal is sound, NOT applied to the live DB.' : 'CHECKS FAILED'}`);
process.exitCode = ok ? 0 : 1;
