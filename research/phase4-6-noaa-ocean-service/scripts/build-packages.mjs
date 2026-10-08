/**
 * Phase 4.6 - build intake records + approved packages for the audited NOAA
 * National Ocean Service Ocean Facts pages.
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
import { fetchNoaaArticle } from './noaa-extract.mjs';
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
const REVIEWER = 'User (explicit request to import NOAA Ocean Service articles)';
const DECISION =
  'The user explicitly authorized a real NOAA Ocean Service import batch. Each official ' +
  'oceanservice.noaa.gov page was fetched and its full text extracted verbatim, then reviewed ' +
  'individually for reuse rights and provenance: a NOAA author credit and citation date are ' +
  'required, and any copyright, third-party credit, courtesy/licence or restriction notice ' +
  'excludes the item. The official NOS disclaimer is recorded as source-policy evidence. ' +
  'No images or media are reused: imageReference is null for every item.';

const POLICY_URL = 'https://oceanservice.noaa.gov/disclaimer.html';
const POLICY_EXCERPT =
  'Information presented on this website is considered public information and may be distributed or ' +
  'copied, unless specifically noted otherwise. This website is maintained by NOAA\u2019s National Ocean Service.';
const ATTRIBUTION = 'NOAA Ocean Service, oceanservice.noaa.gov';
const SOURCE_ID = 'noaa-ocean-service';
const SOURCE_NAME = 'NOAA National Ocean Service';
const SOURCE_URL = 'https://oceanservice.noaa.gov/';

const readingTimeFor = (words) => (words / WPM < 3 ? 'Under 3 min' : '5\u201310 min');

/** Description taken verbatim from the article's own opening sentence. */
const describe = (body) => {
  const first = body.split(/(?<=[.!?])\s/)[0].replace(/\s+/g, ' ').trim();
  return first.length > 240 ? `${first.slice(0, 237).replace(/\s+\S*$/, '')}...` : first;
};

/** Per-item rights gate, re-applied here so a clean audit cannot be assumed. */
const itemRightsFindings = (a) => {
  const findings = [];
  if (a.rightsMarkers.length > 0) findings.push(`copyright/third-party notice in text: ${a.rightsMarkers.map((m) => m.match).join('; ')}`);
  if (!a.authorCredit || !/noaa/i.test(a.authorCredit)) findings.push(`no NOAA author credit on the page (got ${JSON.stringify(a.authorCredit)})`);
  if (!a.lastUpdatedAt) findings.push('no readable citation date on the page');
  if (a.wordCount < 120) findings.push(`body too short (${a.wordCount} words)`);
  const risky = a.provenanceSignals.filter((s) => s === 'copyright-notice' || s === 'third-party-source');
  if (risky.length > 0) findings.push(`page-level restriction/third-party signal: ${risky.join(', ')}`);
  return findings;
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
    a = await fetchNoaaArticle(url);
  } catch (error) {
    // A fetch/parse failure is a SKIP with no rights claim, never a rejection of
    // the publisher and never a reason to stop the remaining batch.
    const message = error instanceof Error ? error.message : String(error);
    outcomes.push({ recordId, slug, status: 'SKIPPED', reason: `FETCH/PARSE: ${message}` });
    console.log(`SKIP   ${slug.padEnd(18)} ${message}`);
    continue;
  }

  const findings = itemRightsFindings(a);
  if (findings.length > 0) {
    // A per-page rights failure is a hard block for this item only.
    outcomes.push({ recordId, slug, status: 'REJECTED', reason: findings.join(' | ') });
    console.log(`REJECT ${slug.padEnd(18)} ${findings.join(' | ')}`);
    continue;
  }

  const readingTime = readingTimeFor(a.wordCount);
  const description = describe(a.body);

  intake.push({
    recordId,
    sourceId: SOURCE_ID,
    sourceName: SOURCE_NAME,
    sourceUrl: SOURCE_URL,
    title: a.title,
    canonicalUrl: url,
    externalId: slug,
    authors: [a.authorCredit],
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
    // validate-intake accepts only public-domain | license | permission, and
    // build-package derives the package's rightsBasis from this recorded basis.
    rightsStatus: 'verified',
    reuseMode: 'verified-full-text',
    rightsBasis: 'public-domain',
    rightsEvidenceUrl: POLICY_URL,
    rightsEvidenceExcerpt: POLICY_EXCERPT,
    attributionRequired: true,
    attributionText: ATTRIBUTION,
    body: a.body,
    mediaAssets: [],
    reviewStatus: 'approved',
    reviewNotes: [
      `Official NOAA Ocean Service page fetched and its full text extracted verbatim: ${a.blocks} paragraphs, ${a.wordCount} words.`,
      `Page-level author credit recorded verbatim as authors: ${JSON.stringify([a.authorCredit])}; page citation date ${a.lastUpdatedAt}.`,
      'Page text inspected individually for copyright, third-party credit, courtesy/licence and restriction notices: none found.',
      `Page-level provenance signals recorded: ${JSON.stringify(a.provenanceSignals)}. Any image/media credit on the page is excluded because no asset is reused.`,
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

  outcomes.push({ recordId, slug, status: 'INTENDED', reason: 'passed per-item rights review', words: a.wordCount, genre, level });
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
  .map(([slug]) => `research/phase4-6-noaa-ocean-service/intake/${SOURCE_ID}-${slug}.json`)
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

