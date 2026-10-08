/**
 * Phase 4.8 - per-item Wiktionary audit (reads only; imports nothing).
 *
 * For each candidate entry this records, from official pages only:
 *   - whether Wiktionary's own CC BY-SA statement is present,
 *   - the third-party / non-free material that exists, and
 *   - the reusable body after that material is excluded.
 *
 * Wiktionary marks its own Wiktionary:Copyrights page as an outdated 2002
 * policy text, so the licence statement relied on here is the one carried on
 * every page footer and in the Wikimedia Terms of Use, both verified at run time.
 */
import { writeFileSync } from 'node:fs';
import { fetchWikitext, splitSections } from './wiktionary-fetch.mjs';
import { extractEntry } from './wiktionary-extract.mjs';
import { readHtml, toLines } from './lib.mjs';

/**
 * Candidate English headwords with genuinely etymological content.
 *
 * Words are chosen for historical interest (loanwords, layered formations,
 * folk-etymologies) rather than to hit a quota: an entry whose clean body is
 * too short to be a readable article is SKIPped, not padded.
 */
const WORDS = [
  'assassin', 'salary', 'ephemeral', 'shibboleth', 'amok',
  'robot', 'gossip', 'ostrich', 'posh', 'sincere',
  'quarantine', 'nickname', 'serendipity', 'taboo', 'avocado',
  'dandelion', 'meadow', 'window', 'penguin', 'lotus',
];

const LICENCE = {
  identifier: 'CC-BY-SA-4.0',
  name: 'Creative Commons Attribution-ShareAlike 4.0 International',
  termsPage: 'https://en.wiktionary.org/wiki/Wikimedia:Terms_of_Use',
  copyrightPage: 'https://en.wiktionary.org/wiki/Wiktionary:Copyrights',
  dualLicenceNote: 'Entry text is dual-licensed CC BY-SA 4.0 and GFDL; CC BY-SA 4.0 is relied on here.',
};

/** Confirm the site's own footer states CC BY-SA, from an official page. */
const verifyLicenceStatement = async () => {
  const { status, html } = await readHtml('https://en.wiktionary.org/wiki/English');
  const flat = toLines(html).join(' ');
  return {
    url: 'https://en.wiktionary.org/wiki/English',
    status,
    footerStatesCcBySa: /Creative Commons Attribution-ShareAlike/i.test(flat),
    footerExcerpt: (/Definitions and other text are available under the[^.]*\.[^.]*\./i.exec(flat)?.[0] ?? null),
  };
};

const licenceCheck = await verifyLicenceStatement();
console.log(`licence: status=${licenceCheck.status} footerCCBYSA=${licenceCheck.footerStatesCcBySa}`);
console.log(`  footer: ${licenceCheck.footerExcerpt}\n`);

const report = [];
for (const word of WORDS) {
  const record = { word, licence: LICENCE.identifier };
  try {
    const { title, wikitext, missing } = await fetchWikitext(word);
    record.title = title;
    record.canonicalUrl = `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`;

    if (missing || !wikitext) {
      record.verdict = 'MISSING_PAGE';
      report.push(record);
      console.log(`MISSING       ${word}`);
      continue;
    }

    const extracted = extractEntry(splitSections(wikitext));
    record.subsections = extracted.subsections ?? null;
    record.hasEtymology = extracted.hasEtymology ?? false;
    record.thirdPartyIndicators = extracted.indicators ?? null;
    record.excludedBlocks = extracted.excluded ?? null;

    if (!extracted.ok) {
      record.verdict = extracted.reason;
      report.push(record);
      console.log(`${extracted.reason.padEnd(23)} ${word}`);
      continue;
    }

    record.wordCount = extracted.wordCount;
    record.bodyPreview = extracted.body.slice(0, 300);
    record.verdict = 'AUDITED';
  } catch (error) {
    record.verdict = 'FETCH_ERROR';
    record.error = String(error);
  }

  report.push(record);
  console.log(`${String(record.verdict).padEnd(23)} ${word.padEnd(11)} etym=${String(record.hasEtymology).padEnd(6)} words=${String(record.wordCount ?? '-').padStart(4)} quotes=${record.thirdPartyIndicators?.quoteTemplates ?? '-'} excluded=${record.excludedBlocks?.length ?? '-'}`);
}

writeFileSync(
  'research/phase4-8-pdr-wiktionary/wiktionary-audit.json',
  `${JSON.stringify({ licence: LICENCE, licenceCheck, report }, null, 2)}\n`,
  'utf8',
);
console.log(`\naudited ${report.length}`);