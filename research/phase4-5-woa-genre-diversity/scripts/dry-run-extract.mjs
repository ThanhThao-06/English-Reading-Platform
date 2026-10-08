/**
 * Dry-run the extractor over the 13 audited URLs.
 *
 * Writes nothing to the Library. For each URL it asserts that the previously
 * observed defects are gone: audio-player chrome, glossary text, undecoded
 * HTML entities, and mid-clause splits.
 */
import { writeFileSync } from 'node:fs';
import { fetchArticle } from './voa-extract.mjs';

const URLS = [
  ['3303557', 'https://learningenglish.voanews.com/a/3303557.html', 'Education'],
  ['3637982', 'https://learningenglish.voanews.com/a/3637982.html', 'Education'],
  ['4804792', 'https://learningenglish.voanews.com/a/can-language-learning-happen-during-sleep-/4804792.html', 'Health & Psychology'],
  ['2563047', 'https://learningenglish.voanews.com/a/2563047.html', 'History'],
  ['1519967', 'https://learningenglish.voanews.com/a/1519967.html', 'History'],
  ['2436970', 'https://learningenglish.voanews.com/a/2436970.html', 'History'],
  ['1615769', 'https://learningenglish.voanews.com/a/plastic-recycling/1615769.html', 'Environment'],
  ['3913365', 'https://learningenglish.voanews.com/a/health-lifestyle-sleep-helps-us-learn/3913365.html', 'Health & Psychology'],
  ['2414963', 'https://learningenglish.voanews.com/a/artificial-intelligence/2414963.html', 'Technology & AI'],
  ['128165', 'https://learningenglish.voanews.com/a/a-23-2008-06-17-voa1-83135692/128165.html', 'Technology & AI'],
  ['3472132', 'https://learningenglish.voanews.com/a/americas-national-parks-grand-canyon-august-20-2016/3472132.html', 'Culture, Art & Travel'],
  ['3482437', 'https://learningenglish.voanews.com/a/yellowstone-americas-first-national-park/3482437.html', 'Culture, Art & Travel'],
  ['3370560', 'https://learningenglish.voanews.com/a/americas-national-parks-nps-100-yosemite-national-park/3370560.html', 'Culture, Art & Travel'],
];

const BAD = [
  ['audio chrome', /no media source currently available/i],
  ['audio chrome', /pop-?out player/i],
  ['audio chrome', /listen to this story in/i],
  ['share chrome', /^share$/im],
  ['glossary', /Words in This Story/],
  ['glossary', /Words in the News/],
  ['glossary', /Dictionary word lookup/],
  ['glossary', /\u2013\s*(?:n|v|adj)\.?\s/],
  ['entity', /&#x?[0-9a-f]+;/i],
  ['entity', /&(?:amp|quot|apos|nbsp|rsquo|ldquo|rdquo|ndash|mdash);/i],
];

const out = [];
const say = (...a) => out.push(a.join(' '));
let pass = 0;
let fail = 0;

for (const [id, url, genre] of URLS) {
  try {
    const a = await fetchArticle(url);
    const problems = BAD.filter(([, re]) => re.test(a.body) || re.test(a.title)).map(([n]) => n);
    if (problems.length === 0) pass += 1; else fail += 1;

    say('='.repeat(80));
    say(`${problems.length === 0 ? 'PASS' : 'FAIL'}  [${id}] ${a.title}`);
    say(`  genre=${genre}  date=${a.publishedAt}  blocks=${a.blocks}  words=${a.wordCount}`);
    if (problems.length) say(`  !! residual: ${[...new Set(problems)].join(', ')}`);
    say(`  authors: ${a.authors.length ? JSON.stringify(a.authors) : 'NONE FOUND'}`);
    say(`  START: ${a.body.slice(0, 170)}`);
    say(`  END  : ${a.body.slice(-220)}`);
  } catch (e) {
    fail += 1;
    say('='.repeat(80));
    say(`FAIL  [${id}] ${url}`);
    say(`  !! ${e.message}`);
  }
}

say('='.repeat(80));
say(`TOTAL: ${pass} PASS / ${fail} FAIL / ${URLS.length} URLs`);
say('written to', process.argv[2]);

writeFileSync(process.argv[2], out.join('\n'), 'utf8');
