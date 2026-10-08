import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('backend/data/library.sqlite');
const rows = db.prepare("SELECT genre, content_group, categories_json, COUNT(*) c FROM library_content GROUP BY genre, content_group, categories_json").all();
for (const r of rows) console.log(JSON.stringify(r));
console.log('---SAMPLE---');
const s = db.prepare("SELECT id,title,genre,content_group,categories_json,source_id,canonical_url FROM library_content LIMIT 5").all();
for (const r of s) console.log(JSON.stringify(r));
