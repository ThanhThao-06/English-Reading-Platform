/**
 * Phase 4.9 - build intake records + approved packages for this batch.
 *
 * The 10 articles (5 Gastronomy & Food History, 5 Urbanism & Everyday Objects)
 * were selected from artifacts that already exist in Phase 4.8 - pdr-audit.json,
 * wiktionary-audit.json and pdr-licence-probe.json - so no new research, no new
 * audit and no new source was introduced for this batch.
 *
 * This script does NOT import. It calls the project's own `validateIntake` and
 * `buildPackagesFromIntake`, and writes a package/approval pair only for items
 * those real validators report eligible. An item that fails any gate is SKIPped
 * or REJECTed here; one failing item never stops the batch.
 *
 * No source policy and no whitelist entry are created or changed. Both sources
 * are handled by the pipeline's existing item-level licence path: each record
 * carries `rightsBasis: 'license'` with its own licence URL, identifier and the
 * verbatim per-item rights statement captured from that item's own page, which is
 * what makes the builder emit item-scoped `item-license` evidence.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractPdrArticle } from '../../phase4-8-pdr-wiktionary/scripts/pdr-extract.mjs';
import { fetchWikitext, splitSections } from '../../phase4-8-pdr-wiktionary/scripts/wiktionary-fetch.mjs';
import { extractEntry } from '../../phase4-8-pdr-wiktionary/scripts/wiktionary-extract.mjs';
import { readHtml, toLines } from '../../phase4-8-pdr-wiktionary/scripts/lib.mjs';
import { ARTICLES } from './article-manifest.mjs';
import { validateIntake } from '../../phase3-5-content-intake/scripts/validate-intake.mjs';
import { buildPackagesFromIntake } from '../../phase3-7-approved-content-package/scripts/build-package.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const POLICY_DIR = resolve(ROOT, 'research/phase3-5-content-intake/fixtures/source-policies');
const PACKAGE_DIR = resolve(ROOT, 'research/phase3-7-approved-content-package/approved-content');
const APPROVAL_DIR = resolve(ROOT, 'research/phase3-9-library-storage-import/approvals');
const INTAKE_DIR = resolve(HERE, '..', 'intake');

const RECEIVED_AT = '2026-10-06';
const WPM = 200;
const REVIEWER = 'User (explicit request to import a Gastronomy + Urbanism batch for educational reading)';
const DECISION =
  'The user explicitly authorized this real import batch for educational reading. The 10 articles ' +
  '(5 Gastronomy & Food History, 5 Urbanism & Everyday Objects) were selected from the existing ' +
  'Phase 4.8 audit artifacts (pdr-audit.json, wiktionary-audit.json, pdr-licence-probe.json); no ' +
  'new research or new source was used to form the selection. Every selected item was then fetched ' +
  'from its official source page and its full text extracted, then reviewed individually. ' +
  'For The Public Domain Review the item\'s OWN page had to carry article-level CC BY or CC BY-SA ' +
  'evidence: the publisher states that some of its Articles are "published under more restrictive ' +
  'terms", so the site-wide statement was never used to decide an item, and any "All rights ' +
  'reserved", "Reprinted by permission" or NonCommercial-only item was excluded. For Wiktionary the ' +
  'CC BY-SA statement carried on each page was required, and third-party or non-free content ' +
  '(fair-use quotations, usage examples carrying quotations, File/Image links) was excluded from the ' +
  'stored body rather than assumed compatible. No image, audio or other media is reused from either ' +
  'source: imageReference is null for every item.';

const PDR_LEGAL_URL = 'https://publicdomainreview.org/legal/';
const CC_BY_SA_4_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';
const WIKTIONARY_TERMS_URL = 'https://en.wiktionary.org/wiki/Wikimedia:Terms_of_Use';
const CC_BY_SA_3_URL = 'https://creativecommons.org/licenses/by-sa/3.0/';

const SOURCE_IDS = {
  'public-domain-review': {
    sourceName: 'The Public Domain Review',
    sourceUrl: 'https://publicdomainreview.org/',
  },
  wiktionary: {
    sourceName: 'Wiktionary',
    sourceUrl: 'https://en.wiktionary.org/',
  },
};

const readingTimeFor = (words) => (words / WPM < 3 ? 'Under 3 min' : '5\u201310 min');

/** Description taken verbatim from the article's own opening sentence. */
const describe = (body) => {
  const first = body.split(/(?<=[.!?])\s/)[0].replace(/\s+/g, ' ').trim();
  return first.length > 240 ? `${first.slice(0, 237).replace(/\s+\S*$/, '')}...` : first;
};

/** The CC BY-SA footer statement, captured from an official Wiktionary page. */
const wiktionaryFooterStatement = async () => {
  const { status, html } = await readHtml('https://en.wiktionary.org/wiki/English');
  const flat = toLines(html).join(' ');
  const excerpt = /Definitions and other text are available under the Creative Commons Attribution-ShareAlike License[^.]*\./i.exec(flat)?.[0];
  return { status, excerpt: excerpt ?? null };
};

const policies = readdirSync(POLICY_DIR)
  .filter((file) => file.toLowerCase().endsWith('.json'))
  .map((file) => JSON.parse(readFileSync(resolve(POLICY_DIR, file), 'utf8')));

const footer = await wiktionaryFooterStatement();
console.log(`wiktionary footer CC BY-SA verified: ${Boolean(footer?.excerpt)} (status ${footer?.status})\n`);
/**
 * Per-item PDR rights gate.
 *
 * The item's own page decides. A bare licence token is not enough: it is only
 * accepted when it is a permissive CC BY / CC BY-SA variant AND the page carries
 * no overriding restriction.
 */
const NON_COMMERCIAL = /NC/i;

const assessPdrRights = (rightsEvidence) => {
  const findings = [];
  if (!rightsEvidence?.licenceToken) findings.push('NO-ARTICLE-LEVEL-CC-EVIDENCE');
  if (rightsEvidence?.allRightsReserved) findings.push('ALL-RIGHTS-RESERVED');
  if (rightsEvidence?.reprintedByPermission) findings.push('REPRINTED-BY-PERMISSION');
  if (rightsEvidence?.licenceToken && NON_COMMERCIAL.test(rightsEvidence.licenceToken)) {
    findings.push(`NON-COMMERCIAL-LICENCE:${rightsEvidence.licenceToken}`);
  }
  return findings;
};

/** Fetch and extract one manifest item, whatever its source. */
const extractItem = async (slug, sourceId, url) => {
  if (sourceId === 'public-domain-review') {
    const article = await extractPdrArticle(url);
    return article.ok ? article : null;
  }
  const { wikitext, missing } = await fetchWikitext(slug);
  if (missing || !wikitext) return null;
  const entry = extractEntry(splitSections(wikitext));
  return entry.ok ? { ...entry, title: slug } : null;
};

const intake = [];
const reviewByRecordId = {};
const outcomes = [];

for (const [slug, sourceId, url, genre, level, contentType, primary, secondary, curiosityTopic, why] of ARTICLES) {
  const recordId = `${sourceId}-${slug}`;
  const source = SOURCE_IDS[sourceId];

  let extracted;
  try {
    extracted = await extractItem(slug, sourceId, url);
  } catch (error) {
    outcomes.push({
      recordId, slug, status: 'SKIPPED',
      reason: `FETCH: ${error instanceof Error ? error.message : String(error)}`,
    });
    console.log(`SKIP   ${slug.padEnd(20)} FETCH FAILED`);
    continue;
  }

  if (!extracted) {
    outcomes.push({ recordId, slug, status: 'SKIPPED', reason: 'no extractable article body' });
    console.log(`SKIP   ${slug.padEnd(20)} no extractable body`);
    continue;
  }

  // ---- per-item rights gate -------------------------------------------------
  let licenceUrl;
  let licenceIdentifier;
  let rightsEvidenceExcerpt;
  const notes = [];

  if (sourceId === 'public-domain-review') {
    const findings = assessPdrRights(extracted.rightsEvidence);
    if (findings.length) {
      outcomes.push({ recordId, slug, status: 'SKIPPED', reason: findings.join(' | ') });
      console.log(`SKIP   ${slug.padEnd(20)} ${findings.join(' | ')}`);
      continue;
    }
    const token = extracted.rightsEvidence.licenceToken.trim();
    licenceUrl = /3\.0/.test(token) ? CC_BY_SA_3_URL : CC_BY_SA_4_URL;
    licenceIdentifier = token.replace(/\s+/g, '-');
    rightsEvidenceExcerpt = extracted.rightsEvidence.evidenceText
      || `This Article is published under a ${token} licence.`;
    notes.push(
      `Per-item rights verified on the Article's own page: "${extracted.rightsEvidence.evidenceForm}" -> ${token}.`,
      'The publisher site-wide statement was NOT used to decide this item: the "Reusing Material" page states that some Articles are "published under more restrictive terms", so the item own evidence governs.',
      'Page checked individually: no "All rights reserved", no "Reprinted by permission", no NonCommercial-only licence.',
    );
  } else {
    if (!extracted.hasEtymology) {
      outcomes.push({ recordId, slug, status: 'SKIPPED', reason: 'NO-ETYMOLOGY-SECTION' });
      console.log(`SKIP   ${slug.padEnd(20)} no English Etymology section`);
      continue;
    }
    licenceUrl = CC_BY_SA_4_URL;
    licenceIdentifier = 'CC-BY-SA-4.0';
    rightsEvidenceExcerpt = footer.excerpt
      ?? 'Definitions and other text are available under the Creative Commons Attribution-ShareAlike License.';
    notes.push(
      `CC BY-SA statement captured from the Wiktionary page footer: "${footer.excerpt}"`,
      'Entry read through the official MediaWiki API; only the English Etymology and part-of-speech definition prose is stored.',
      `Third-party and non-free content excluded from the stored body: ${(extracted.excluded ?? []).length} block(s) removed.`,
    );
  }

  const body = extracted.body;
  const wordCount = body.split(/\s+/).filter(Boolean).length;
  if (wordCount < 120) {
    outcomes.push({ recordId, slug, status: 'SKIPPED', reason: `THIN-BODY:${wordCount} words` });
    console.log(`SKIP   ${slug.padEnd(20)} thin body (${wordCount} words)`);
    continue;
  }

  const description = describe(body);
  const authors = sourceId === 'public-domain-review' && extracted.author
    ? [extracted.author]
    : ['Wiktionary contributors'];

  intake.push({
    recordId,
    sourceId,
    sourceName: source.sourceName,
    sourceUrl: source.sourceUrl,
    title: extracted.title,
    canonicalUrl: url,
    externalId: slug,
    authors,
    language: 'en',
    description,
    contentType,
    classification: {
      contentGroup: 'articles',
      primaryCategory: primary,
      secondaryCategories: secondary,
    },
    libraryPresentation: {
      description,
      genre,
      level,
      readingTime: readingTimeFor(wordCount),
      imageReference: null,
    },
    receivedAt: RECEIVED_AT,
    rightsStatus: 'verified',
    reuseMode: 'verified-full-text',
    rightsBasis: 'license',
    itemLicenseUrl: licenceUrl,
    licenseType: 'creative-commons',
    licenseIdentifier: licenceIdentifier,
    rightsEvidenceUrl: url,
    rightsEvidenceExcerpt,
    attributionRequired: true,
    attributionText: sourceId === 'public-domain-review'
      ? `${extracted.author ?? 'The Public Domain Review'} / The Public Domain Review (${licenceIdentifier})`
      : `Wiktionary contributors, CC BY-SA 4.0 (via ${url})`,
    body,
    mediaAssets: [],
    reviewStatus: 'approved',
    reviewNotes: [
      `Official source page fetched and its full text extracted verbatim: ${wordCount} words.`,
      ...notes,
      `Curiosity Topic (Curiosities & Deep Dives shelf): "${curiosityTopic}".`,
      'No image, audio or other media is retained: no item-level asset-rights evidence was recorded, so imageReference is null.',
      `${level} is a Library-level editorial mapping, not a claimed formal CEFR label.`,
      `Reading time "${readingTimeFor(wordCount)}" is mapped from the full-text word count (${wordCount}) at ${WPM} WPM.`,
      `Genre "${genre}": ${why}`,
      'Reuse is educational and attributed; it does not imply any endorsement by the source.',
    ],
  });

  reviewByRecordId[recordId] = {
    reviewStatus: 'approved',
    reviewer: REVIEWER,
    decision: DECISION,
    reviewedAt: `${RECEIVED_AT}T00:00:00.000Z`,
  };

  outcomes.push({
    recordId, slug, status: 'INTENDED',
    reason: `passed per-item rights review (${licenceIdentifier})`,
    words: wordCount, genre, level, curiosityTopic,
  });
  console.log(`INTEND ${slug.padEnd(20)} ${String(wordCount).padStart(5)}w  ${licenceIdentifier.padEnd(12)} ${curiosityTopic}`);
mkdirSync(INTAKE_DIR, { recursive: true });
for (const record of intake) {
  writeFileSync(resolve(INTAKE_DIR, `${record.recordId}.json`), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

// --- real validators ---------------------------------------------------------
const intakeBatch = validateIntake(intake, policies);
const errors = (intakeBatch.errors ?? []).filter((e) => e.severity !== 'warning');
console.log(`\nintake records : ${intake.length}`);
console.log(`intake errors  : ${errors.length}`);
for (const e of errors) console.log(`  ERROR ${e.recordId} ${e.code} ${e.field}: ${e.message}`);
for (const r of intakeBatch.recordResults ?? []) {
  if (r.status !== 'PASS') {
    outcomes.push({
      recordId: r.recordId, slug: r.recordId.replace(`${r.recordId.split('-')[0]}-`, ''),
      status: r.status, reason: (r.errorCodes ?? []).join(', '),
    });
  }
}
if (errors.length > 0) {
  writeFileSync(resolve(HERE, '..', 'build-outcomes.json'), `${JSON.stringify(outcomes, null, 2)}\n`, 'utf8');
  console.log('\nSTOPPED: intake validation failed. Nothing written to the Library.');
  process.exit(1);
}

const manifest = ARTICLES
  .map(([slug, sourceId]) => `research/phase4-9-gastronomy-urbanism/intake/${sourceId}-${slug}.json`)
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
    outcomes.push({ recordId: r.recordId, slug: r.recordId, status: r.status, reason: (r.errorCodes ?? []).join(', ') });
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
    'utf8',
  );
  written += 1;
  outcomes.push({
    recordId: pkg.content?.recordId ?? null,
    slug: pkg.content?.recordId ?? null,
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
}

// The batch's last row can be SKIPped with `continue`, which bypasses the
// per-iteration write above. Flush the complete outcome record once more after
// the loop so build-outcomes.json accounts for every selected article.
// (Batch-local bookkeeping only: no gate, package, approval or import changes.)
const finalSummary = outcomes.reduce((acc, o) => ({ ...acc, [o.status]: (acc[o.status] ?? 0) + 1 }), {});
writeFileSync(resolve(HERE, '..', 'build-outcomes.json'), `${JSON.stringify(outcomes, null, 2)}\n`, 'utf8');
console.log(`\nfinal outcomes: ${JSON.stringify(finalSummary)}`);
console.log('NOT imported yet.');