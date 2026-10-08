/**
 * Phase 4.7 - build intake records + approved packages for the audited NASA
 * science articles.
 *
 * This script does NOT import. It calls the project's own validateIntake and
 * buildPackagesFromIntake, and writes a package/approval pair only for items
 * those real validators report eligible. An item that fails any gate is
 * SKIPped or REJECTed here; one failing item never stops the batch.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchNasaArticle } from './nasa-extract.mjs';
import { classifyItem } from './audit-candidates.mjs';
import { ARTICLES } from './article-manifest.mjs';
import { validateIntake } from '../../phase3-5-content-intake/scripts/validate-intake.mjs';
import { buildPackagesFromIntake } from '../../phase3-7-approved-content-package/scripts/build-package.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const POLICY_DIR = resolve(ROOT, 'research/phase3-5-content-intake/fixtures/source-policies');
const PACKAGE_DIR = resolve(ROOT, 'research/phase3-7-approved-content-package/approved-content');
const APPROVAL_DIR = resolve(ROOT, 'research/phase3-9-library-storage-import/approvals');
const INTAKE_DIR = resolve(HERE, '..', 'intake');

const RECEIVED_AT = '2026-10-05';
const WPM = 200;
const REVIEWER = 'User (explicit request to import the next real article batch from NASA)';
const DECISION =
  'The user explicitly authorized a real NASA import batch for educational and informational use. ' +
  'Each official NASA page was fetched and its full text extracted verbatim, then reviewed ' +
  'individually: NASA page provenance and a readable citation date are required, and any ' +
  'third-party credit, courtesy/licence notice, syndicated or contributed content, or topic-hub ' +
  'shape excludes the item. NASA Images and Media Usage Guidelines are recorded as the ' +
  'source-policy evidence. No NASA image, insignia or identifier is reused: imageReference is ' +
  'null for every item.';

const POLICY_URL = 'https://www.nasa.gov/nasa-brand-center/images-and-media/';
const POLICY_EXCERPT =
  'NASA content - images, audio, video, and media files used in the rendition of 3-dimensional ' +
  'models, such as texture maps and polygon data in any format - generally are not subject to ' +
  'copyright in the United States. You may use this material for educational or informational ' +
  'purposes, including photo collections, textbooks, public exhibits, computer graphical ' +
  'simulations and Internet Web pages. News outlets, schools, and text-book authors may use NASA ' +
  'content without needing explicit permission, subject to compliance with these guidelines. ' +
  'NASA content used in a factual manner that does not imply endorsement may be used without ' +
  'needing explicit permission. NASA should be acknowledged as the source of the material.';
const ATTRIBUTION = 'NASA';
const SOURCE_ID = 'nasa';
const SOURCE_NAME = 'NASA';
const SOURCE_URL = 'https://www.nasa.gov/';

const readingTimeFor = (words) => (words / WPM < 3 ? 'Under 3 min' : '5\u201310 min');

/** Description taken verbatim from the article's own opening sentence. */
const describe = (body) => {
  const first = body.split(/(?<=[.!?])\s/)[0].replace(/\s+/g, ' ').trim();
  return first.length > 240 ? `${first.slice(0, 237).replace(/\s+\S*$/, '')}...` : first;
};


const policies = readdirSync(POLICY_DIR)
  .filter((f) => f.toLowerCase().endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(resolve(POLICY_DIR, f), 'utf8')));

const intake = [];
const reviewByRecordId = {};
const outcomes = [];

for (const [slug, url, genre, level, contentType, primary, secondary, why] of ARTICLES) {
  const recordId = `${SOURCE_ID}-${slug}`;

  let a;
  try {
    a = await fetchNasaArticle(url);
  } catch (error) {
    // A fetch/parse failure is a SKIP with no rights claim, never a rejection of
    // the publisher and never a reason to stop the remaining batch.
    const message = error instanceof Error ? error.message : String(error);
    outcomes.push({ recordId, slug, status: 'SKIPPED', reason: `FETCH/PARSE: ${message}` });
    console.log(`SKIP   ${slug.padEnd(18)} ${message}`);
    continue;
  }

  // The full per-item gate is re-applied here so a clean audit is never assumed.
  const verdict = classifyItem(a);
  if (verdict.findings.length > 0) {
    outcomes.push({ recordId, slug, status: 'SKIPPED', reason: verdict.findings.join(' | ') });
    console.log(`SKIP   ${slug.padEnd(18)} ${verdict.findings.join(' | ')}`);
    continue;
  }

  const readingTime = readingTimeFor(a.wordCount);
  const description = describe(a.body);
  const provenance = [
    a.pageEditor ? `NASA Page Editor: ${a.pageEditor}` : null,
    a.nasaOfficial ? `Responsible NASA Official: ${a.nasaOfficial}` : null,
  ].filter(Boolean);

  intake.push({
    recordId,
    sourceId: SOURCE_ID,
    sourceName: SOURCE_NAME,
    sourceUrl: SOURCE_URL,
    title: a.title,
    canonicalUrl: url,
    externalId: slug,
    authors: ['NASA'],
    publishedAt: a.lastUpdatedAt,

    language: 'en',
    description,
    contentType,
    classification: {
      contentGroup: 'articles',
      primaryCategory: primary,
      secondaryCategories: secondary,
    },
    libraryPresentation: { description, genre, level, readingTime, imageReference: null },

    receivedAt: RECEIVED_AT,
    // validate-intake accepts only public-domain | license | permission. NASA
    // content is "generally not subject to copyright" and NASA grants use for
    // educational/informational purposes, which is the closest existing basis.
    rightsStatus: 'verified',
    reuseMode: 'verified-full-text',
    rightsBasis: 'permission',
    rightsEvidenceUrl: POLICY_URL,
    rightsEvidenceExcerpt: POLICY_EXCERPT,
    attributionRequired: true,
    attributionText: ATTRIBUTION,
    body: a.body,
    mediaAssets: [],
    reviewStatus: 'approved',
    reviewNotes: [
      `Official NASA page fetched and its full text extracted verbatim: ${a.blocks} paragraphs, ${a.wordCount} words.`,
      `NASA page provenance recorded verbatim: ${JSON.stringify(provenance)}; "Page Last Updated" ${a.lastUpdatedAt}.`,
      'Page text inspected individually for copyright notices, third-party credits, courtesy/licence notes, syndicated or contributed/guest content and news-agency credits: none found.',
      `In-body link density checked: ${a.anchorCount} links across ${a.blocks} blocks - this is an article, not a topic hub.`,
      'No image, insignia, logotype or NASA identifier is retained: no item-level asset-rights evidence was recorded and those marks are expressly not in the public domain, so imageReference is null.',
      `${level} is a Library-level editorial mapping for this English-learning article, not a claimed formal CEFR label.`,
      `Reading time "${readingTime}" is mapped from the full-text word count (${a.wordCount}) at ${WPM} WPM.`,
      `Genre "${genre}": ${why}`,
      'Reuse is educational/informational, factual, and does not imply NASA endorsement; NASA is acknowledged as the source.',
    ],
  });

  reviewByRecordId[recordId] = {
    reviewStatus: 'approved',
    reviewer: REVIEWER,
    decision: DECISION,
    reviewedAt: `${RECEIVED_AT}T00:00:00.000Z`,
  };

  outcomes.push({ recordId, slug, status: 'INTENDED', reason: 'passed per-item rights and provenance review', words: a.wordCount, genre, level });
  console.log(`INTEND ${slug.padEnd(18)} ${String(a.wordCount).padStart(5)}w ${genre}`);
}

mkdirSync(INTAKE_DIR, { recursive: true });
for (const record of intake) {
  writeFileSync(resolve(INTAKE_DIR, `${record.recordId}.json`), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

// --- real validators -------------------------------------------------------
const intakeBatch = validateIntake(intake, policies);
const errors = (intakeBatch.errors ?? []).filter((e) => e.severity !== 'warning');
console.log(`\nintake records : ${intake.length}`);
console.log(`intake errors  : ${errors.length}`);
for (const e of errors) console.log(`  ERROR ${e.recordId} ${e.code} ${e.field}: ${e.message}`);
for (const r of intakeBatch.recordResults ?? []) {
  if (r.status !== 'PASS') {
    outcomes.push({ recordId: r.recordId, slug: r.recordId.replace(`${SOURCE_ID}-`, ''), status: r.status, reason: (r.errorCodes ?? []).join(', ') });
  }
}
if (errors.length > 0) {
  writeFileSync(resolve(HERE, '..', 'build-outcomes.json'), `${JSON.stringify(outcomes, null, 2)}\n`, 'utf8');
  console.log('\nSTOPPED: intake validation failed. Nothing written to the Library.');
  process.exit(1);
}

const manifest = ARTICLES
  .map(([slug]) => `research/phase4-7-nasa/intake/${SOURCE_ID}-${slug}.json`)
  .join('; ');

const build = buildPackagesFromIntake(intake, policies, {
  reviewByRecordId,
  sourceManifest: manifest,
  createdAt: `${RECEIVED_AT}T00:00:00.000Z`,
});

console.log(`\npackages created: ${build.packages.length}`);
for (const r of build.recordResults) {
  console.log(`  ${String(r.status).padEnd(9)} ${r.recordId} ${(r.errorCodes ?? []).join(',')}`);
  if (r.status !== 'IMPORTABLE') {
    outcomes.push({ recordId: r.recordId, slug: r.recordId.replace(`${SOURCE_ID}-`, ''), status: r.status, reason: (r.errorCodes ?? []).join(', ') });
  }
}

mkdirSync(PACKAGE_DIR, { recursive: true });
mkdirSync(APPROVAL_DIR, { recursive: true });

let written = 0;
for (const pkg of build.packages) {
  const name = `${encodeURIComponent(pkg.packageId)}-v${pkg.version}.json`;
  const packageFile = resolve(PACKAGE_DIR, name);
  writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  const sha = createHash('sha256').update(readFileSync(packageFile)).digest('hex');
  writeFileSync(
    resolve(APPROVAL_DIR, name),
    `${JSON.stringify({
      approvalStatus: 'APPROVED_FOR_LIBRARY_IMPORT',
      packageId: pkg.packageId,
      packageVersion: pkg.version,
      packageSha256: sha,
      approvedAt: `${RECEIVED_AT}T00:00:00.000Z`,
      approver: REVIEWER,
      decision: DECISION,
    }, null, 2)}\n`,
    'utf8'
  );
  written += 1;
  outcomes.push({
    recordId: pkg.content?.recordId ?? null,
    slug: pkg.content?.recordId?.replace(`${SOURCE_ID}-`, '') ?? null,
    status: 'PACKAGED',
    reason: `package ${pkg.packageId} v${pkg.version} + approval written`,
    genre: pkg.libraryPresentation?.genre ?? null,
    level: pkg.libraryPresentation?.level ?? null,
  });
}

const summary = outcomes.reduce((acc, o) => ({ ...acc, [o.status]: (acc[o.status] ?? 0) + 1 }), {});
writeFileSync(resolve(HERE, '..', 'build-outcomes.json'), `${JSON.stringify(outcomes, null, 2)}\n`, 'utf8');

console.log(`\npackages + approvals written: ${written}`);
console.log(`outcomes: ${JSON.stringify(summary)}`);
console.log('NOT imported yet.');

mkdirSync(INTAKE_DIR, { recursive: true });
for (const record of intake) {
  writeFileSync(resolve(INTAKE_DIR, `${record.recordId}.json`), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}
