import { DatabaseSync } from 'node:sqlite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DB = resolve(HERE, '..', '..', '..', 'backend', 'data', 'library.sqlite');
const db = new DatabaseSync(DB, { readOnly: true });

const runs = db
  .prepare('SELECT batch_id, outcome, packages_discovered, records_imported, started_at, finished_at FROM import_runs ORDER BY started_at DESC LIMIT 3')
  .all();
console.log('recent import_runs:');
for (const r of runs) {
  console.log(`  ${r.batch_id} ${r.outcome} discovered=${r.packages_discovered} imported=${r.records_imported} at=${r.finished_at}`);
}

const latest = runs[0];
const rows = db
  .prepare('SELECT title, genre, level, source_name, import_batch_id FROM library_content WHERE import_batch_id = ? ORDER BY title')
  .all(latest.batch_id);
console.log(`\nlibrary_content rows in batch ${latest.batch_id}: ${rows.length}`);
for (const r of rows) console.log(`  - ${r.title} | ${r.source_name} | ${r.genre} | ${r.level}`);

const total = db.prepare('SELECT COUNT(*) AS n FROM library_content').get();
console.log(`\ntotal rows in library: ${total.n}`);
db.close();
