/** Post-import verification against the live library database. */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DB = resolve(HERE, '..', '..', '..', 'backend', 'data', 'library.sqlite');
const db = new DatabaseSync(DB, { readOnly: true });

const NEW_IDS = ['3303557','3637982','4804792','2563047','1519967','2436970','1615769','3913365','2414963','3472132','3482437','3370560'];
const OLD_SOURCE_RECORDS = ['3947928','5649722','7940837','7963076','7979814','7980848','7990415','7998765','8003108'];

const rows = db.prepare('SELECT * FROM library_content').all();
let ok = true;
const check = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` :: ${detail}` : ''}`);
  if (!pass) ok = false;
};

console.log(`TOTAL ROWS: ${rows.length}  (was 9)\n`);

check('total is 9 + 12 = 21', rows.length === 21, String(rows.length));

// 2. the 12 new records are present
const newPresent = NEW_IDS.filter((id) => rows.some((r) => r.source_record_id === `voa-learning-english-${id}`));
check('all 12 new records present', newPresent.length === 12, `${newPresent.length}/12`);
if (newPresent.length !== 12) console.log('   missing:', NEW_IDS.filter((i) => !newPresent.includes(i)));

// 3. 128165 must be absent
check('128165 NOT imported', !rows.some((r) => r.source_record_id?.includes('128165')));

// 4. the original 9 survive, exactly once each
const oldCounts = OLD_SOURCE_RECORDS.map((id) => rows.filter((r) => r.source_record_id === `voa-learning-english-${id}`).length);
check('original 9 still present exactly once', oldCounts.every((c) => c === 1), `counts=${oldCounts.join(',')}`);

// no duplicate identity anywhere
const dupes = ['package_id','source_record_id','canonical_url','content_hash']
  .map((c) => [c, db.prepare(`SELECT COUNT(*) n FROM (SELECT ${c} FROM library_content GROUP BY ${c} HAVING COUNT(*)>1)`).get().n]);
check('no duplicate package/source/url/hash', dupes.every(([, n]) => n === 0), JSON.stringify(Object.fromEntries(dupes)));

// 5. rights/source metadata complete on the 12 new
const newRows = rows.filter((r) => NEW_IDS.some((id) => r.source_record_id === `voa-learning-english-${id}`));
const badMeta = newRows.filter((r) => {
  const rights = JSON.parse(r.rights_json);
  return (
    r.rights_status !== 'verified' ||
    r.reuse_mode !== 'verified-full-text' ||
    r.source_id !== 'voa-learning-english' ||
    !r.canonical_url?.startsWith('https://learningenglish.voanews.com/') ||
    !rights.attributionRequired ||
    rights.attributionText !== 'Credit to learningenglish.voanews.com' ||
    !rights.rightsBasis ||
    !Array.isArray(rights.evidence) ||
    rights.evidence.length < 2 ||
    !r.source_json || !r.provenance_json || !r.package_json || !r.import_approval_json ||
    !r.content_hash
  );
});
check('all 12 carry complete rights/source/provenance/package/approval', badMeta.length === 0, `incomplete=${badMeta.length}`);
if (badMeta.length) console.log('   ', badMeta.map((r) => r.source_record_id));

// imageReference null for the batch
const withImage = newRows.filter((r) => r.image_reference !== null);
check('imageReference null for all 12 new', withImage.length === 0, `non-null=${withImage.length}`);

// bodies are real
const shortBodies = newRows.filter((r) => r.body.length < 600);
check('all 12 new bodies are substantial', shortBodies.length === 0, `short=${shortBodies.map((r) => r.source_record_id)}`);

// 8. nothing lost
check('no article lost (9 old + 12 new)', rows.length === 21 && oldCounts.every((c) => c === 1));

console.log('\n--- the 12 new records ---');
for (const r of newRows.sort((a, b) => a.genre.localeCompare(b.genre))) {
  const rights = JSON.parse(r.rights_json);
  console.log(`  ${r.source_record_id.replace('voa-learning-english-', '').padEnd(8)} ${r.genre.padEnd(24)} ${r.level}  ${(r.reading_time + '').padEnd(12)} words=${String(r.body.split(/\s+/).length).padStart(5)}  img=${r.image_reference ?? 'null'}  ${rights.permittedReuseMode}`);
}

console.log('\n--- genre counts (imported only) ---');
for (const r of db.prepare('SELECT genre, COUNT(*) n FROM library_content GROUP BY genre ORDER BY n DESC').all()) {
  console.log(`  ${r.genre.padEnd(26)} ${r.n}`);
}
console.log(`  ${'TOTAL'.padEnd(26)} ${rows.length}`);

console.log(`\n${ok ? 'ALL CHECKS PASSED' : 'CHECKS FAILED'}`);
process.exitCode = ok ? 0 : 1;
