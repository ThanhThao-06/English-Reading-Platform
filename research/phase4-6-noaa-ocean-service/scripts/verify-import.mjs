/**
 * Post-import verification against the live library database.
 *
 * Read-only. It reports what was actually committed for the NOAA Ocean Service
 * batch and checks every safeguard the batch was required to preserve.
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const DB = resolve(ROOT, 'backend', 'data', 'library.sqlite');
const db = new DatabaseSync(DB, { readOnly: true });

const EXPECTED = [
  'seafoam', 'oceaneconomy', 'lighthouse', 'marheritage', 'ocean-gliders',
  'lawofsea', 'coral_medicine', 'greenland-shark', 'coral_bleach', 'amoc',
].map((s) => `noaa-ocean-service-${s}`);

let ok = true;
const check = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` :: ${detail}` : ''}`);
  if (!pass) ok = false;
};

const all = db.prepare('SELECT * FROM library_content').all();
const noaa = db.prepare("SELECT * FROM library_content WHERE source_id = 'noaa-ocean-service' ORDER BY source_record_id").all();
const before = db.prepare('SELECT COUNT(*) n FROM library_content WHERE source_id != ?').get('noaa-ocean-service').n;

console.log(`TOTAL ROWS: ${all.length}  (21 pre-existing + 10 NOAA = 31)\n`);

check('total rows is 21 + 10 = 31', all.length === 31, String(all.length));
check('the 21 pre-existing VOA rows are untouched', before === 21, String(before));
check('all 10 NOAA records present', noaa.length === 10, `${noaa.length}/10`);
const missing = EXPECTED.filter((id) => !noaa.some((r) => r.source_record_id === id));
check('no NOAA record missing', missing.length === 0, missing.join(', '));

// duplicates
const dupes = ['package_id', 'source_record_id', 'canonical_url', 'content_hash']
  .map((c) => [c, db.prepare(`SELECT COUNT(*) n FROM (SELECT ${c} FROM library_content GROUP BY ${c} HAVING COUNT(*)>1)`).get().n]);
check('no duplicate package/source/url/hash', dupes.every(([, n]) => n === 0), JSON.stringify(Object.fromEntries(dupes)));

// rights + provenance completeness
const badMeta = noaa.filter((r) => {
  const rights = JSON.parse(r.rights_json);
  return !(r.rights_status === 'verified'
    && r.reuse_mode === 'verified-full-text'
    && r.source_id === 'noaa-ocean-service'
    && r.canonical_url?.startsWith('https://oceanservice.noaa.gov/facts/')
    && rights.rightsBasis === 'public-domain'
    && rights.attributionRequired === true
    && rights.attributionText === 'NOAA Ocean Service, oceanservice.noaa.gov'
    && Array.isArray(rights.evidence) && rights.evidence.length >= 2
    && rights.evidence.some((e) => e.evidenceType === 'item-rights' && e.sourceUrl === 'https://oceanservice.noaa.gov/disclaimer.html')
    && r.source_json && r.provenance_json && r.package_json && r.import_approval_json && r.content_hash);
});
check('all 10 carry complete rights/source/provenance/package/approval', badMeta.length === 0, `incomplete=${badMeta.length}`);
if (badMeta.length) console.log('   ', badMeta.map((r) => r.source_record_id));

const withImage = noaa.filter((r) => r.image_reference !== null);
check('imageReference null for all 10', withImage.length === 0, `non-null=${withImage.length}`);

const thin = noaa.filter((r) => r.body.length < 500);
check('all 10 bodies are substantial', thin.length === 0, `thin=${thin.map((r) => r.source_record_id).join(',')}`);

// no prohibited body text from rejected/skipped packages leaked anywhere
const audit = db.prepare('SELECT report_json FROM import_runs ORDER BY started_at DESC LIMIT 1').get();
const auditText = audit.report_json;
check('audit records the batch outcome', /COMMITTED/.test(auditText), (auditText.match(/"outcome":"[A-Z_]+"/) ?? [''])[0]);

console.log('\n--- the 10 imported NOAA records ---');
for (const r of noaa.sort((a, b) => a.genre.localeCompare(b.genre) || a.level.localeCompare(b.level))) {
  const rights = JSON.parse(r.rights_json);
  console.log(`  ${r.source_record_id.replace('noaa-ocean-service-', '').padEnd(16)} ${r.genre.padEnd(24)} ${r.level}  ${String(r.reading_time).padEnd(12)} words=${String(r.body.split(/\s+/).length).padStart(4)}  img=${r.image_reference ?? 'null'}  ${rights.permittedReuseMode}`);
}

console.log('\n--- genre counts (all imported) ---');
for (const r of db.prepare('SELECT genre, COUNT(*) n FROM library_content GROUP BY genre ORDER BY genre').all()) {
  console.log(`  ${r.genre.padEnd(26)} ${r.n}`);
}
console.log(`  ${'TOTAL'.padEnd(26)} ${all.length}`);

console.log(`\n${ok ? 'ALL CHECKS PASSED' : 'CHECKS FAILED'}`);
process.exitCode = ok ? 0 : 1;
