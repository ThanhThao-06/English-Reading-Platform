/**
 * Post-import verification against the live library database.
 *
 * Read-only. It reports what was actually committed for the NASA batch and
 * checks every safeguard the batch was required to preserve.
 */
import { DatabaseSync } from 'node:sqlite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const db = new DatabaseSync(resolve(ROOT, 'backend', 'data', 'library.sqlite'), { readOnly: true });

const EXPECTED = [
  'nasa-saturn', 'nasa-black-holes', 'nasa-sun', 'nasa-moon', 'nasa-exoplanets',
  'nasa-dark-matter', 'nasa-earth-science', 'nasa-climate-change',
  'nasa-skywatching', 'nasa-machine-learning',
];

let ok = true;
const check = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` :: ${detail}` : ''}`);
  if (!pass) ok = false;
};

const all = db.prepare('SELECT * FROM library_content').all();
const nasa = db.prepare("SELECT * FROM library_content WHERE source_id = 'nasa' ORDER BY source_record_id").all();
const before = db.prepare('SELECT COUNT(*) n FROM library_content WHERE source_id != ?').get('nasa').n;

console.log(`TOTAL ROWS: ${all.length}  (31 pre-existing + 10 NASA = 41)\n`);

check('total rows is 31 + 10 = 41', all.length === 41, String(all.length));
check('the 31 pre-existing rows are untouched', before === 31, String(before));
check('all 10 NASA records present', nasa.length === 10, `${nasa.length}/10`);
const missing = EXPECTED.filter((id) => !nasa.some((r) => r.source_record_id === id));
check('no NASA record missing', missing.length === 0, missing.join(', '));

const dupes = ['package_id', 'source_record_id', 'canonical_url', 'content_hash']
  .map((c) => [c, db.prepare(`SELECT COUNT(*) n FROM (SELECT ${c} FROM library_content GROUP BY ${c} HAVING COUNT(*)>1)`).get().n]);
check('no duplicate package/source/url/hash', dupes.every(([, n]) => n === 0), JSON.stringify(Object.fromEntries(dupes)));

const badMeta = nasa.filter((r) => {
  const rights = JSON.parse(r.rights_json);
  return !(r.rights_status === 'verified'
    && r.reuse_mode === 'verified-full-text'
    && r.source_id === 'nasa'
    && /(^|\.)nasa\.gov$/.test(new URL(r.canonical_url).hostname)
    && rights.rightsBasis === 'permission'
    && rights.attributionRequired === true
    && rights.attributionText === 'NASA'
    && Array.isArray(rights.evidence) && rights.evidence.length >= 2
    && rights.evidence.some((e) => e.evidenceType === 'item-rights'
      && e.sourceUrl === 'https://www.nasa.gov/nasa-brand-center/images-and-media/'
      && typeof e.excerpt === 'string' && e.excerpt.includes('generally are not subject to copyright'))
    && r.source_json && r.provenance_json && r.package_json && r.import_approval_json && r.content_hash);
});
check('all 10 carry complete rights/source/provenance/package/approval', badMeta.length === 0, `incomplete=${badMeta.length}`);
if (badMeta.length) console.log('   ', badMeta.map((r) => r.source_record_id));

const withImage = nasa.filter((r) => r.image_reference !== null);
check('imageReference null for all 10', withImage.length === 0, `non-null=${withImage.length}`);

// No NASA insignia/logo may appear in stored text.
const markHits = nasa.filter((r) => /\b(insignia|meatball|logotype)\b/i.test(r.body));
check('no NASA insignia/logotype language in stored bodies', markHits.length === 0, markHits.map((r) => r.source_record_id).join(','));

const thin = nasa.filter((r) => r.body.length < 500);
check('all 10 bodies are substantial', thin.length === 0, `thin=${thin.map((r) => r.source_record_id).join(',')}`);

const audit = db.prepare('SELECT report_json FROM import_runs ORDER BY started_at DESC LIMIT 1').get();
check('audit records the batch outcome', /COMMITTED/.test(audit.report_json),
  (audit.report_json.match(/"outcome":"[A-Z_]+"/) ?? [''])[0]);

console.log('\n--- the 10 imported NASA records ---');
for (const r of nasa.sort((a, b) => a.genre.localeCompare(b.genre) || a.level.localeCompare(b.level))) {
  const rights = JSON.parse(r.rights_json);
  console.log(`  ${r.source_record_id.replace('nasa-', '').padEnd(18)} ${r.genre.padEnd(24)} ${r.level}  ${String(r.reading_time).padEnd(12)} words=${String(r.body.split(/\s+/).length).padStart(4)}  img=${r.image_reference ?? 'null'}  ${rights.permittedReuseMode}`);
}

console.log('\n--- source counts (all imported) ---');
for (const r of db.prepare('SELECT source_id, COUNT(*) n FROM library_content GROUP BY source_id ORDER BY source_id').all()) {
  console.log(`  ${String(r.source_id).padEnd(24)} ${r.n}`);
}

console.log(`\n${ok ? 'ALL CHECKS PASSED' : 'CHECKS FAILED'}`);
process.exitCode = ok ? 0 : 1;
