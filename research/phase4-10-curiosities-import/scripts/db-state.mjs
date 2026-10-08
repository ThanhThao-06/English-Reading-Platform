import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('backend/data/library.sqlite');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('TABLES:' + JSON.stringify(tables.map(r => r.name)));
for (const t of tables.map(r => r.name)) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
    console.log(t + ' COLS:' + JSON.stringify(cols));
    const c = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get();
    console.log(t + ' COUNT:' + c.c);
  } catch (e) { console.log(t + ' ERR:' + e.message); }
}
