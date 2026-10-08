/**
 * Phase 4.8 extraction verification (reads only; writes pdr-extract-check.json).
 *
 * Confirms the stored body is the article itself: real title and byline, no site
 * chrome, no commercial or navigation copy, and no bibliography/footnote residue.
 */
import { writeFileSync } from 'node:fs';
import { extractPdrArticle } from './pdr-extract.mjs';

const URLS = [
  'https://publicdomainreview.org/collection/maskenfest/',
  'https://publicdomainreview.org/collection/the-mowing-devil/',
  'https://publicdomainreview.org/essay/animal-vegetable-lamb/',
  'https://publicdomainreview.org/essay/fear-and-fragility-the-glass-delusion-and-its-history/',
  'https://publicdomainreview.org/essay/magic-by-return-of-post/',
];

/** Copy that must never appear in a stored body. */
const CONTAMINATION = [
  /Community Interest Company/i,
  /GDPR compliant/i,
  /Subscribe to our Newsletter/i,
  /Buy as a Print/i,
  /Add to Cart/i,
  /Premium prints/i,
  /Free Shipping to US/i,
  /Further Reading/i,
  /Public Domain Works/i,
  /Notes Show Notes/i,
  /All rights reserved/i,
  /\bpassage=/i,
  /Internet Archive/,
  /Project Gutenberg/,
  /Google Books/,
  /Become a Friend/,
  /Enjoyed this piece/i,
  /\bIbid\./,
  /Marxists Internet Archive/,
];

const report = [];
for (const url of URLS) {
  const result = await extractPdrArticle(url);
  if (!result.ok) {
    report.push({ url, ok: false, reason: result.reason });
    console.log(`FAILED ${url} -> ${result.reason}`);
    continue;
  }
  const contamination = CONTAMINATION
    .filter((pattern) => pattern.test(result.body))
    .map((pattern) => String(pattern));
  report.push({
    url,
    ok: true,
    title: result.title,
    author: result.author,
    datePublished: result.datePublished,
    wordCount: result.wordCount,
    rightsLine: result.rightsLine,
    contamination,
    clean: contamination.length === 0,
    head: result.body.slice(0, 200),
    tail: result.body.slice(-200),
  });
  console.log(`${contamination.length === 0 ? 'CLEAN' : 'DIRTY'} ${String(result.wordCount).padStart(5)}w  ${result.title.slice(0, 50)}${contamination.length ? '  <- ' + contamination.join(',') : ''}`);
}

writeFileSync(
  'research/phase4-8-pdr-wiktionary/pdr-extract-check.json',
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
console.log(`\nclean=${report.filter((r) => r.clean).length}/${report.length}`);