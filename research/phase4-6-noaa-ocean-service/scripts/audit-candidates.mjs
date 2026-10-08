/**
 * Audit candidate NOAA Ocean Service pages: fetch each official URL, extract the
 * body verbatim, and report the rights/provenance evidence found per item.
 *
 * This script only READS and REPORTS. It writes no intake record, no package and
 * no database row. One failing item never stops the batch.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchNoaaArticle } from './noaa-extract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const urls = process.argv.slice(2);

const results = [];
for (const url of urls) {
  try {
    const a = await fetchNoaaArticle(url);
    results.push({ url, ok: true, ...a });
    console.log(`OK    ${a.wordCount.toString().padStart(5)}w ${a.blocks}b  ${a.title.slice(0, 60)}`);
    console.log(`      markers=[${a.rightsMarkers.map((m) => m.match).join(' | ').slice(0, 150)}]`);
    console.log(`      signals=[${a.provenanceSignals.join(', ')}]`);
  } catch (error) {
    results.push({ url, ok: false, error: error instanceof Error ? error.message : String(error) });
    console.log(`FAIL  ${url} :: ${error instanceof Error ? error.message : String(error)}`);
  }
}

writeFileSync(resolve(HERE, '..', 'audit-raw.json'), `${JSON.stringify(results, null, 2)}\n`, 'utf8');
console.log(`\naudited ${results.length}; ok=${results.filter((r) => r.ok).length}`);
