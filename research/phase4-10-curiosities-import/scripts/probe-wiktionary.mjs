/**
 * Phase 4.10 - read-only probe of Wiktionary entry candidates (reads only).
 *
 * Uses the same Phase 4.8 fetch/extract path the real build uses: English
 * wikitext via the official MediaWiki API, English etymology + part-of-speech
 * prose only, third-party blocks excluded. The CC BY-SA footer statement is
 * captured from an official Wiktionary page at probe time.
 *
 * A candidate is only reported ELIGIBLE when the page exists, the CC BY-SA
 * footer is present, and the cleaned body has at least 120 words.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchWikitext, splitSections } from '../../phase4-8-pdr-wiktionary/scripts/wiktionary-fetch.mjs';
import { extractEntry } from '../../phase4-8-pdr-wiktionary/scripts/wiktionary-extract.mjs';
import { readHtml, toLines } from '../../phase4-8-pdr-wiktionary/scripts/lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '..', 'wiktionary-probe.json');

/** Candidate entries per Curiosities topic - each entry IS about the topic. */
const CANDIDATES = {
  'Philosophy & Thought Experiments': [
    'thought experiment', 'philosophy', 'epistemology', 'empiricism', 'utilitarianism',
    'paradox', 'syllogism', 'dialectics', 'free will', 'a priori',
    'consciousness', 'determinism', 'sophistry', 'metaphysics', 'nihilism',
  ],
  'Unsolved Mysteries & Fringe Science': [
    'paranormal', 'spiritualism', 'clairvoyance', 'astrology', 'alchemy',
    'pseudoscience', 'superstition', 'poltergeist', 'divination', 'mesmerism',
    'phrenology', 'cryptozoology', 'ufology', 'occult', 'prophecy',
  ],
  'True Crime & Forensic Science': [
    'forensic science', 'ballistics', 'fingerprint', 'autopsy', 'alibi',
    'manslaughter', 'perjury', 'coroner', 'detective', 'pickpocket',
    'embezzlement', 'extortion', 'forgery', 'inquest', 'evidence',
  ],
};

/** The CC BY-SA footer statement, captured from an official Wiktionary page. */
const footer = await (async () => {
  const { status, html } = await readHtml('https://en.wiktionary.org/wiki/English');
  const flat = toLines(html).join(' ');
  const excerpt = /Definitions and other text are available under the Creative Commons Attribution-ShareAlike License[^.]*\./i.exec(flat)?.[0];
  return { status, excerpt: excerpt ?? null };
})();
console.log(`wiktionary CC BY-SA footer: ${Boolean(footer.excerpt)} (status ${footer.status})`);

const rows = [];
for (const [topic, words] of Object.entries(CANDIDATES)) {
  for (const word of words) {
    try {
      const { wikitext, missing } = await fetchWikitext(word);
      if (missing || !wikitext) {
        rows.push({ word, topic, status: 'MISSING' });
        console.log(`MISS  ${word}`);
        continue;
      }
      const entry = extractEntry(splitSections(wikitext));
      if (!entry.ok) {
        rows.push({ word, topic, status: 'EXTRACT-FAILED' });
        console.log(`FAIL  ${word}`);
        continue;
      }
      const words2 = entry.body.split(/\s+/).filter(Boolean).length;
      const ok = Boolean(footer.excerpt) && words2 >= 120;
      rows.push({
        word,
        topic,
        title: entry.title,
        words: words2,
        excludedBlocks: (entry.excluded ?? []).length,
        footerVerified: Boolean(footer.excerpt),
        status: ok ? 'ELIGIBLE' : (words2 < 120 ? 'THIN-BODY' : 'NO-FOOTER'),
      });
      console.log(`${ok ? 'OK   ' : 'SKIP '} ${String(words2).padStart(4)}w  ${word}`);
    } catch (error) {
      rows.push({ word, topic, status: 'ERROR', error: String(error?.message ?? error) });
      console.log(`ERR   ${word} ${error?.message ?? error}`);
    }
  }
}

writeFileSync(OUT, `${JSON.stringify({ footer, rows }, null, 2)}\n`, 'utf8');
const eligible = rows.filter((r) => r.status === 'ELIGIBLE');
console.log(`\neligible: ${eligible.length}`);
for (const r of eligible) console.log(`  [${r.topic}] ${r.words}w  ${r.word}`);
