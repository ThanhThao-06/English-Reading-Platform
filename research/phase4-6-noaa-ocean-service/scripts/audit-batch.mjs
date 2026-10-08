/**
 * Audit every candidate in the manifest against the NOAA Ocean Service rights
 * and provenance rules, and write the per-item evidence report.
 *
 * This script only READS and REPORTS. It writes no intake record, no package and
 * no database row. One failing item never stops the batch: each is caught,
 * classified (ELIGIBLE / SKIP / REJECT) and reported individually.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchNoaaArticle } from './noaa-extract.mjs';
import { ARTICLES } from './article-manifest.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '..');

/**
 * Per-item eligibility gate for a NOAA Ocean Service page.
 *
 * Every rule here must hold for one specific page. Nothing is inherited from the
 * publisher name: a NOAA domain does not by itself make an item reusable.
 */
export const classifyItem = (article, manifestEntry) => {
  const findings = [];

  if (article.rightsMarkers.length > 0) {
    for (const marker of article.rightsMarkers) {
      findings.push(`RIGHTS-MARKER: page text contains "${marker.match}"`);
    }
  }
  // The page's own citation credit must name NOAA as the author.
  if (!article.authorCredit || !/noaa/i.test(article.authorCredit)) {
    findings.push(`MISSING-CREDIT: page author credit is ${JSON.stringify(article.authorCredit)}, not a NOAA credit`);
  }
  if (!article.lastUpdatedAt) {
    findings.push('MISSING-CITATION-DATE: page carries no readable "Last updated" citation date');
  }
  if (article.wordCount < 120) {
    findings.push(`THIN-BODY: only ${article.wordCount} words extracted`);
  }
  // Third-party provenance signals must be reviewed, not assumed safe.
  const thirdParty = article.provenanceSignals.filter((s) => s !== 'credits-noaa');
  if (thirdParty.includes('copyright-notice') || thirdParty.includes('third-party-source')) {
    findings.push(`THIRD-PARTY: page shows signals ${JSON.stringify(thirdParty)}; rights must be judged per item`);
  }

  const isBlocked = findings.some((f) => f.startsWith('RIGHTS-MARKER')
    || f.startsWith('MISSING-CREDIT')
    || f.startsWith('MISSING-CITATION-DATE')
    || f.startsWith('THIRD-PARTY'));

  return {
    slug: manifestEntry[0],
    url: manifestEntry[1],
    title: article.title,
    authorCredit: article.authorCredit,
    lastUpdatedAt: article.lastUpdatedAt,
    wordCount: article.wordCount,
    blocks: article.blocks,
    genre: manifestEntry[3],
    level: manifestEntry[4],
    rightsMarkers: article.rightsMarkers,
    provenanceSignals: article.provenanceSignals,
    findings,
    verdict: isBlocked ? 'BLOCKED' : 'ELIGIBLE',
  };
};

const audits = [];
for (const entry of ARTICLES) {
  const [slug, url] = entry;
  try {
    const article = await fetchNoaaArticle(url);
    const result = classifyItem(article, entry);
    audits.push(result);
    console.log(`${result.verdict.padEnd(8)} ${String(result.wordCount).padStart(5)}w ${slug.padEnd(18)} author=${result.authorCredit} ${result.title}`);
    for (const f of result.findings) console.log(`         ! ${f}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    audits.push({ slug, url, verdict: 'FAILED', findings: [`FETCH/PARSE: ${message}`] });
    console.log(`FAILED   ${slug.padEnd(18)} ${message}`);
  }
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, 'audit-report.json'), `${JSON.stringify(audits, null, 2)}\n`, 'utf8');

const counts = audits.reduce((acc, a) => ({ ...acc, [a.verdict]: (acc[a.verdict] ?? 0) + 1 }), {});
console.log(`\naudited=${audits.length} ${JSON.stringify(counts)}`);
