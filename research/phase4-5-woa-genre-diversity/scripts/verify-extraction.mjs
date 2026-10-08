/**
 * Explicit verification of the three requested extractor fixes across all 13
 * audited URLs. Read-only: fetches pages, writes nothing to the Library.
 */
import { writeFileSync } from 'node:fs';
import { fetchArticle } from './voa-extract.mjs';

const URLS = [
  ['3303557', 'https://learningenglish.voanews.com/a/3303557.html'],
  ['3637982', 'https://learningenglish.voanews.com/a/3637982.html'],
  ['4804792', 'https://learningenglish.voanews.com/a/can-language-learning-happen-during-sleep-/4804792.html'],
  ['2563047', 'https://learningenglish.voanews.com/a/2563047.html'],
  ['1519967', 'https://learningenglish.voanews.com/a/1519967.html'],
  ['2436970', 'https://learningenglish.voanews.com/a/2436970.html'],
  ['1615769', 'https://learningenglish.voanews.com/a/plastic-recycling/1615769.html'],
  ['3913365', 'https://learningenglish.voanews.com/a/health-lifestyle-sleep-helps-us-learn/3913365.html'],
  ['2414963', 'https://learningenglish.voanews.com/a/artificial-intelligence/2414963.html'],
  ['128165', 'https://learningenglish.voanews.com/a/a-23-2008-06-17-voa1-83135692/128165.html'],
  ['3472132', 'https://learningenglish.voanews.com/a/americas-national-parks-grand-canyon-august-20-2016/3472132.html'],
  ['3482437', 'https://learningenglish.voanews.com/a/yellowstone-americas-first-national-park/3482437.html'],
  ['3370560', 'https://learningenglish.voanews.com/a/americas-national-parks-nps-100-yosemite-national-park/3370560.html'],
];

const CHECKS = [
  ['no audio-player chrome', (a) =>
    !/no media source currently available|pop-?out player|direct link|0:\d{2}:\d{2}|kbps|listen to this story in/i.test(`${a.title}\n${a.body}`)],
  ['no glossary heading or definition list', (a) =>
    !/words\s+in\s+(this|the)\s+stor(y|ies)/i.test(a.body) &&
    !/\u2013\s*(n|v|adj)\.?\s/i.test(a.body) &&
    !/dictionary word lookup/i.test(a.body)],
  ['no undecoded entities', (a) =>
    !/&#x?[0-9a-f]+;|&(amp|quot|apos|nbsp|rsquo|ldquo|rdquo|ndash|mdash|hellip);/i.test(`${a.title}\n${a.body}`)],
  ['no share/social chrome', (a) =>
    !/^(share|copy link|embed share|x \(twitter\)|youtube|instagram|print|related|links)$/im.test(a.body)],
  ['no raw markup leaked', (a) => !/<[a-z/][^>]*>/i.test(a.body)],
  ['body is substantive (>150 words)', (a) => a.wordCount > 150],
];

// Reported separately: this is a rights matter, not an extraction quality one.
const CREDIT = ['VOA credit found (rights gate input)', (a) =>
  a.authors.some((x) => /\bVOA\b|Voice of America/i.test(x))];

const out = [];
const say = (...a) => out.push(a.join(' '));
let allPass = true;

say('# VOA extraction verification - 13 audited URLs');
say('');
say('Extraction quality only. The final column is reported separately because a');
say('missing VOA credit is a RIGHTS outcome (the conditional grant would then');
say('refuse full-text reuse and the item is skipped), not an extraction defect.');
say('');
say(`| # | id | words | ${CHECKS.map(([n]) => n).join(' | ')} | ${CREDIT[0]} |`);
say(`| --- | --- | ---: | ${CHECKS.map(() => '---').join(' | ')} | --- |`);

let creditMissing = 0;

for (const [id, url] of URLS) {
  try {
    const a = await fetchArticle(url);
    const cells = CHECKS.map(([, fn]) => {
      const ok = fn(a);
      if (!ok) allPass = false;
      return ok ? 'PASS' : '**FAIL**';
    });
    const creditOk = CREDIT[1](a);
    if (!creditOk) creditMissing += 1;
    say(`| ${URLS.findIndex(([i]) => i === id) + 1} | \`${id}\` | ${a.wordCount} | ${cells.join(' | ')} | ${creditOk ? 'yes' : '**none**'} |`);
    say(`| | | | ${a.title} | |`);
  } catch (e) {
    allPass = false;
    say(`| - | \`${id}\` | - | ${CHECKS.map(() => 'ERROR').join(' | ')} | - |`);
    say(`| | | | !! ${e.message} | |`);
  }
}

say('');
say(`EXTRACTION: ${allPass ? 'ALL 13 PASS' : 'FAILURES PRESENT'}`);
say(`VOA CREDIT: ${URLS.length - creditMissing}/${URLS.length} items carry a VOA-named credit; ${creditMissing} would be SKIPPED by the rights gate.`);
say('');
say('Word counts are measured from the cleaned body only (glossary and player');
say('chrome excluded), so they are the counts reading time should be derived from.');

writeFileSync(process.argv[2], out.join('\n'), 'utf8');
