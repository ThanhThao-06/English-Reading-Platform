/**
 * Post-import verification of the live HTTP API for the NASA batch.
 *
 * Starts the real backend server on an ephemeral local port, calls the real
 * /api/library/articles endpoint, and checks the NASA batch is served with its
 * rights, provenance and null image references intact.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openLibraryDatabase } from '../../../backend/src/database.mjs';
import { loadSourcePolicies } from '../../../backend/src/import-packages.mjs';
import { LibraryRepository } from '../../../backend/src/library-repository.mjs';
import { createLibraryServer } from '../../../backend/src/server.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const INTAKE_DIR = resolve(ROOT, 'research', 'phase4-7-nasa', 'intake');

const expected = readdirSync(INTAKE_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(resolve(INTAKE_DIR, f), 'utf8')))
  .map((r) => ({ recordId: r.recordId, title: r.title, genre: r.libraryPresentation.genre, level: r.libraryPresentation.level }));

let ok = true;
const check = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` :: ${detail}` : ''}`);
  if (!pass) ok = false;
};

const database = openLibraryDatabase(resolve(ROOT, 'backend', 'data', 'library.sqlite'));
const repository = new LibraryRepository(database, loadSourcePolicies());
const server = createLibraryServer(repository);

await new Promise((done) => server.listen(0, '127.0.0.1', done));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

try {
  const health = await (await fetch(`${base}/api/health`)).json();
  check('GET /api/health reports 41 imported articles', health.importedArticles === 41, JSON.stringify(health));

  const listRes = await fetch(`${base}/api/library/articles`);
  const list = await listRes.json();
  check('GET /api/library/articles returns 200', listRes.status === 200, String(listRes.status));
  check('API serves all 41 articles', list.articles?.length === 41, String(list.articles?.length));

  const nasa = list.articles.filter((a) => expected.some((e) => e.title === a.title));
  check('API serves all 10 NASA articles', nasa.length === 10, `${nasa.length}/10`);
  const missing = expected.filter((e) => !nasa.some((a) => a.title === e.title)).map((e) => e.recordId);
  check('every expected NASA record is served', missing.length === 0, missing.join(', '));

  const withImage = nasa.filter((a) => a.image !== null && a.image !== undefined && a.image !== '');
  check('API reports no image for any NASA article', withImage.length === 0, `withImage=${withImage.length}`);

  const details = [];
  for (const a of nasa) {
    const res = await fetch(`${base}/api/library/articles/${encodeURIComponent(a.id)}`);
    details.push({ status: res.status, article: a, body: await res.json() });
  }
  check('GET single NASA article returns 200 for all 10', details.every((d) => d.status === 200), details.map((d) => d.status).join(','));

  const bad = details.filter(({ body }) => {
    const m = body.importMetadata ?? {};
    return !(m.rights?.attributionRequired === true
      && m.rights?.attributionText === 'NASA'
      && m.rights?.permittedReuseMode === 'verified-full-text'
      && m.rights?.rightsBasis === 'permission'
      && m.source?.sourceId === 'nasa'
      && /(^|\.)nasa\.gov$/.test(new URL(m.source?.canonicalUrl ?? '').hostname)
      && m.authors?.includes('NASA')
      && m.libraryImportApproval?.approvalStatus === 'APPROVED_FOR_LIBRARY_IMPORT'
      && m.provenance?.reviewStatus === 'approved'
      && Array.isArray(m.rights?.evidence)
      && m.rights.evidence.some((e) => e.evidenceType === 'item-rights'
        && e.sourceUrl === 'https://www.nasa.gov/nasa-brand-center/images-and-media/'));
  });
  check('detail serves rights evidence, NASA attribution, NASA source, approval and provenance for all 10', bad.length === 0, `bad=${bad.length}`);
  if (bad.length) console.log('   ', bad.map((b) => b.article.title));

  const badImage = details.filter(({ body }) => body.image !== null && body.image !== undefined && body.image !== '');
  check('detail endpoint reports image null for all 10', badImage.length === 0, `bad=${badImage.length}`);

  const noBody = details.filter(({ body }) => !body.content || body.content.length < 400);
  check('detail endpoint serves the full stored body for all 10', noBody.length === 0, `short=${noBody.length}`);

  // The previously imported NOAA and VOA rows must still be served unchanged.
  const voa = list.articles.filter((a) => a.genre === 'Education').length;
  check('pre-existing library content still served', list.articles.length === 41 && voa > 0, `education=${voa}`);

  console.log('\n--- NASA articles served by /api/library/articles ---');
  for (const a of [...nasa].sort((x, y) => x.genre.localeCompare(y.genre) || x.level.localeCompare(y.level))) {
    console.log(`  ${String(a.genre).padEnd(24)} ${a.level}  ${a.title}`);
  }
} finally {
  await new Promise((done) => server.close(done));
  database.close();
}

console.log(`\n${ok ? 'ALL API CHECKS PASSED' : 'API CHECKS FAILED'}`);
process.exitCode = ok ? 0 : 1;
