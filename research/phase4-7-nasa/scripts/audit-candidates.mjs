/**
 * Audit candidate NASA pages: fetch each official URL, extract the body
 * verbatim, and report the rights/provenance evidence found per item.
 *
 * This script only READS and REPORTS. It writes no intake record, no package and
 * no database row. One failing item never stops the batch.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchNasaArticle } from './nasa-extract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Per-item eligibility gate for a NASA page.
 *
 * NASA's own guidance is a general permission for educational/informational use
 * that is explicitly bounded: NASA uses third-party copyright-protected material
 * whose rights it "does not convey". Nothing here assumes NASA ownership is
 * sufficient; each finding blocks the item on its own.
 */
export const classifyItem = (article) => {
  const findings = [];

  for (const marker of article.rightsMarkers) {
    findings.push(`THIRD-PARTY/RESTRICTION: body contains "${marker.match}"`);
  }
  for (const credit of article.thirdPartyCredits) {
    findings.push(`THIRD-PARTY-CREDIT: "${credit.match}"`);
  }
  if (!article.pageEditor && !article.nasaOfficial) {
    findings.push('MISSING-PROVENANCE: page carries no NASA page-editor or responsible-official credit');
  }
  if (!article.lastUpdatedAt) {
    findings.push(`MISSING-CITATION-DATE: no readable "Page Last Updated" date (got ${JSON.stringify(article.lastUpdatedText)})`);
  }
  if (article.wordCount < 120) {
    findings.push(`THIN-BODY: only ${article.wordCount} words extracted`);
  }
  // Landing/index pages are link lists rather than articles; their "body" would
  // be navigation links, so they are skipped rather than stored.
  if (article.anchorsPerBlock > 0.5) {
    findings.push(`INDEX-PAGE: ${article.anchorCount} in-body links across ${article.blocks} blocks - this is a topic hub, not an article`);
  }

  return {
    url: article.url,
    title: article.title,
    pageEditor: article.pageEditor,
    nasaOfficial: article.nasaOfficial,
    lastUpdatedAt: article.lastUpdatedAt,
    wordCount: article.wordCount,
    blocks: article.blocks,
    anchorCount: article.anchorCount,
    anchorsPerBlock: article.anchorsPerBlock,
    rightsMarkers: article.rightsMarkers,
    thirdPartyCredits: article.thirdPartyCredits,
    findings,
    verdict: findings.length === 0 ? 'ELIGIBLE' : 'BLOCKED',
  };
};

// Only runs when invoked directly; importing this module exposes classifyItem.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const urls = process.argv.slice(2);
  const results = [];
  for (const url of urls) {
    try {
      const a = await fetchNasaArticle(url);
      const r = classifyItem(a);
      results.push({ ...r, body: a.body });
      console.log(`${r.verdict.padEnd(9)} ${String(r.wordCount).padStart(5)}w ${r.title.slice(0, 58)}`);
      console.log(`         editor=${JSON.stringify(r.pageEditor)} official=${JSON.stringify(r.nasaOfficial)} updated=${r.lastUpdatedAt} anchors=${r.anchorCount}/${r.blocks}`);
      for (const f of r.findings) console.log(`         ! ${f}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ url, verdict: 'FAILED', findings: [`FETCH/PARSE: ${message}`] });
      console.log(`FAILED    ${url}\n          ${message}`);
    }
  }

  writeFileSync(resolve(HERE, '..', 'audit-raw.json'), `${JSON.stringify(results, null, 2)}\n`, 'utf8');
  const counts = results.reduce((a, r) => ({ ...a, [r.verdict]: (a[r.verdict] ?? 0) + 1 }), {});
  console.log(`\naudited=${results.length} ${JSON.stringify(counts)}`);
}
