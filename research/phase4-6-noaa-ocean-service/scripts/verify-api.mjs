/**
 * Post-import verification of the live HTTP API.
 *
 * Starts the real backend server on an ephemeral local port, calls the real
 * /api/library/articles endpoint, and checks the NOAA batch is served with its
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
const DB_PATH = resolve(ROOT, 'backend', 'data', 'library.sqlite');
const INTAKE_DIR = resolve(ROOT, 'research', 'phase4-6-noaa-ocean-service', 'intake');

/** Titles of the NOAA records this batch was built to import. */
const expectedTitles = readdirSync(INTAKE_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(resolve(INTAKE_DIR, f), 'utf8')))
  .map((r) => ({ recordId: r.recordId, title: r.title, genre: r.libraryPresentation.genre, level: r.libraryPresentation.level }));

let ok = true;
const check = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` :: ${detail}` : ''}`);
  if (!pass) ok = false;
};

const database = openLibraryDatabase(DB_PATH);
const repository = new LibraryRepository(database, loadSourcePolicies());
const server = createLibraryServer(repository);

await new Promise((done) => server.listen(0, '127.0.0.1', done));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

try {
  const health = await (await fetch(`${base}/api/health`)).json();
  check('GET /api/health reports 31 imported articles', health.importedArticles === 31, JSON.stringify(health));

  const listRes = await fetch(`${base}/api/library/articles`);
  const list = await listRes.json();
  check('GET /api/library/articles returns 200', listRes.status === 200, String(listRes.status));
  check('API serves all 31 articles', list.articles?.length === 31, String(list.articles?.length));

  const noaa = list.articles.filter((a) => expectedTitles.some((e) => e.title === a.title));
  check('API serves all 10 NOAA articles', noaa.length === 10, `${noaa.length}/10`);

  const missing = expectedTitles.filter((e) => !noaa.some((a) => a.title === e.title)).map((e) => e.recordId);
  check('every expected NOAA record is served', missing.length === 0, missing.join(', '));

  const withImage = noaa.filter((a) => a.image !== null && a.image !== undefined && a.image !== '');
  check('API reports no image for any NOAA article', withImage.length === 0, `withImage=${withImage.length}`);

  // Full rights/provenance checks go through the per-article detail endpoint,
  // which nests rights, source, approval and provenance under importMetadata.
  const details = [];
  for (const a of noaa) {
    const res = await fetch(`${base}/api/library/articles/${encodeURIComponent(a.id)}`);
    details.push({ status: res.status, article: a, body: await res.json() });
  }
  check('GET single NOAA article returns 200 for all 10', details.every((d) => d.status === 200), details.map((d) => d.status).join(','));

  const bad = details.filter(({ body }) => {
    const m = body.importMetadata ?? {};
    return !(m.rights?.attributionRequired === true
      && m.rights?.attributionText === 'NOAA Ocean Service, oceanservice.noaa.gov'
      && m.rights?.permittedReuseMode === 'verified-full-text'
      && m.rights?.rightsBasis === 'public-domain'
      && m.source?.sourceId === 'noaa-ocean-service'
      && String(m.source?.canonicalUrl ?? '').startsWith('https://oceanservice.noaa.gov/facts/')
      && m.authors?.includes('NOAA')
      && m.libraryImportApproval?.approvalStatus === 'APPROVED_FOR_LIBRARY_IMPORT'
      && m.provenance?.reviewStatus === 'approved'
      && Array.isArray(m.rights?.evidence)
      && m.rights.evidence.some((e) => e.evidenceType === 'item-rights' && e.sourceUrl === 'https://oceanservice.noaa.gov/disclaimer.html'));
  });
  check('detail serves rights evidence, attribution, NOAA source, approval and provenance for all 10', bad.length === 0, `bad=${bad.length}`);
  if (bad.length) console.log('   ', bad.map((b) => b.article.title));

  const badImage = details.filter(({ body }) => body.image !== null && body.image !== undefined && body.image !== '');
  check('detail endpoint reports image null for all 10', badImage.length === 0, `bad=${badImage.length}`);

  const noBody = details.filter(({ body }) => !body.content || body.content.length < 400);
  check('detail endpoint serves the full stored body for all 10', noBody.length === 0, `short=${noBody.length}`);

  console.log('\n--- NOAA articles served by /api/library/articles ---');
  for (const a of [...noaa].sort((x, y) => x.genre.localeCompare(y.genre) || x.level.localeCompare(y.level))) {
    console.log(`  ${String(a.genre).padEnd(24)} ${a.level}  ${a.title}`);
  }
} finally {
  await new Promise((done) => server.close(done));
  database.close();
}

console.log(`\n${ok ? 'ALL API CHECKS PASSED' : 'API CHECKS FAILED'}`);
process.exitCode = ok ? 0 : 1;
