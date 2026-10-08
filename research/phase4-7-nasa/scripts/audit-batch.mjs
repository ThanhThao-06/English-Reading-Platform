/**
 * Audit every candidate in the manifest against the NASA rights, provenance and
 * content-quality rules, and write the per-item evidence report.
 *
 * This script only READS and REPORTS. It writes no intake record, no package and
 * no database row. One failing item never stops the batch.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchNasaArticle } from './nasa-extract.mjs';
import { classifyItem } from './audit-candidates.mjs';
import { ARTICLES } from './article-manifest.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '..');

const audits = [];
for (const entry of ARTICLES) {
  const [slug, url, genre, level] = entry;
  try {
    const article = await fetchNasaArticle(url);
    const result = { slug, genre, level, ...classifyItem(article) };
    audits.push(result);
    console.log(`${result.verdict.padEnd(9)} ${String(result.wordCount).padStart(5)}w ${slug.padEnd(16)} ${level}  ${result.title.slice(0, 46)}`);
    for (const f of result.findings) console.log(`          ! ${f}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    audits.push({ slug, url, genre, level, verdict: 'FAILED', findings: [`FETCH/PARSE: ${message}`] });
    console.log(`FAILED    ${slug.padEnd(16)} ${message}`);
  }
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, 'audit-report.json'), `${JSON.stringify(audits, null, 2)}\n`, 'utf8');

const counts = audits.reduce((acc, a) => ({ ...acc, [a.verdict]: (acc[a.verdict] ?? 0) + 1 }), {});
console.log(`\naudited=${audits.length} ${JSON.stringify(counts)}`);
