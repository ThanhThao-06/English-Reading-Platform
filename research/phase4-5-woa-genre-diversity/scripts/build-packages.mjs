/**
 * Phase 4.5 - build intake records + approved packages for the 12 audited VOA
 * Learning English articles that passed extraction AND carry a VOA-named
 * producer credit.
 *
 * `128165` is deliberately excluded (see article-manifest.mjs).
 *
 * This script does NOT import. It calls the project's own validateIntake and
 * buildPackagesFromIntake, and writes a package/approval pair only for items
 * those real validators report eligible.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchArticle } from './voa-extract.mjs';
import { ARTICLES } from './article-manifest.mjs';
import { validateIntake } from '../../phase3-5-content-intake/scripts/validate-intake.mjs';
import { buildPackagesFromIntake } from '../../phase3-7-approved-content-package/scripts/build-package.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const POLICY_DIR = resolve(ROOT, 'research/phase3-5-content-intake/fixtures/source-policies');
const PACKAGE_DIR = resolve(ROOT, 'research/phase3-7-approved-content-package/approved-content');
const APPROVAL_DIR = resolve(ROOT, 'research/phase3-9-library-storage-import/approvals');
const INTAKE_DIR = resolve(HERE, '..', 'intake');

const RECEIVED_AT = '2026-10-04';
const WPM = 200;
const REVIEWER = 'User (explicit request to import 12 audited VOA articles)';
const DECISION =
  'The user explicitly authorized importing 12 VOA Learning English articles that passed ' +
  'extraction verification and rights validation. Each official page and its full article text ' +
  'were inspected; items without a VOA-named producer credit were excluded rather than ' +
  'force-fitted; unverified third-party media was excluded.';

const POLICY_URL = 'https://learningenglish.voanews.com/p/6861.html';
const POLICY_EXCERPT =
  'Learning English texts, MP3s, photos and videos are in the public domain. You are allowed to ' +
  'reprint them for educational and commercial purposes, with credit to learningenglish.voanews.com. ' +
  'However, stories, photos and video images from news agencies such as AP, Reuters and AFP are ' +
  'copyrighted, so you are not allowed to republish them.';
const ATTRIBUTION = 'Credit to learningenglish.voanews.com';

const readingTimeFor = (words) => (words / WPM < 3 ? 'Under 3 min' : '5–10 min');

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

for (const [id, url, genre, level, contentType, primary, secondary, why] of ARTICLES) {
  const a = await fetchArticle(url);
  const recordId = `voa-learning-english-${id}`;
  const description = describe(a.body);
  const readingTime = readingTimeFor(a.wordCount);

  intake.push({
    recordId,
    sourceId: 'voa-learning-english',
    sourceName: 'VOA Learning English',
    sourceUrl: 'https://learningenglish.voanews.com/',
    title: a.title,
    canonicalUrl: url,
    externalId: id,
    authors: a.authors,
    publishedAt: a.publishedAt,
    receivedAt: RECEIVED_AT,
    contentType,
    language: 'en',
    description,
    classification: {
      contentGroup: 'articles',
      primaryCategory: primary,
      secondaryCategories: secondary,
    },
    libraryPresentation: { description, imageReference: null, level, genre, readingTime },
    rightsStatus: 'verified',
    reuseMode: 'verified-full-text',
    // rightsBasis is intentionally omitted: validate-intake accepts only
    // public-domain | license | permission, and build-package derives the
    // package's "conditional-source-policy" basis from the grant itself.
    rightsEvidenceUrl: POLICY_URL,
    rightsEvidenceExcerpt: POLICY_EXCERPT,
    attributionRequired: true,
    attributionText: ATTRIBUTION,
    body: a.body,
    mediaAssets: [],
    reviewStatus: 'approved',
    reviewNotes: [
      `Official article page inspected and its full text extracted verbatim: ${a.blocks} paragraphs, ${a.wordCount} words.`,
      `Closing producer credit and page byline recorded as authors: ${JSON.stringify(a.authors)}.`,
      'No AP, Reuters, AFP or other agency credit appears in the byline or credit surfaces.',
      'No image or media is retained: no item-level asset-rights evidence was recorded, so imageReference is null.',
      `${level} is a Library-level editorial mapping for this English-learning article, not a claimed formal CEFR label.`,
      `Reading time "${readingTime}" is mapped from the full-text word count (${a.wordCount}) at ${WPM} WPM.`,
      `Genre "${genre}": ${why}`,
    ],
  });

  reviewByRecordId[recordId] = {
    reviewStatus: 'approved',
    reviewer: REVIEWER,
    decision: DECISION,
    reviewedAt: `${RECEIVED_AT}T00:00:00.000Z`,
  };
}

mkdirSync(INTAKE_DIR, { recursive: true });
for (const record of intake) {
  writeFileSync(
    resolve(INTAKE_DIR, `${record.recordId}.json`),
    `${JSON.stringify(record, null, 2)}\n`,
    'utf8'
  );
}


// --- real validators -------------------------------------------------------
const intakeBatch = validateIntake(intake, policies);
const errors = (intakeBatch.errors ?? []).filter((e) => e.severity !== 'warning');
console.log(`intake records : ${intake.length}`);
console.log(`intake errors  : ${errors.length}`);
for (const e of errors) console.log(`  ERROR ${e.recordId} ${e.code} ${e.field}: ${e.message}`);
if (errors.length > 0) {
  console.log('\nSTOPPED: intake validation failed. Nothing written to the Library.');
  process.exit(1);
}

const manifest = ARTICLES
  .map(([id]) => `research/phase4-5-woa-genre-diversity/intake/voa-learning-english-${id}.json`)
  .join('; ');

const build = buildPackagesFromIntake(intake, policies, {
  reviewByRecordId,
  sourceManifest: manifest,
  createdAt: `${RECEIVED_AT}T00:00:00.000Z`,
});

console.log(`\npackages created: ${build.packages.length}`);
for (const r of build.recordResults) {
  console.log(`  ${r.status.padEnd(9)} ${r.recordId} ${(r.errorCodes ?? []).join(',')}`);
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
}

console.log(`\npackages + approvals written: ${written}`);
console.log('NOT imported yet.');
