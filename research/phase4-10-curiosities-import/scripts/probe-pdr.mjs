/**
 * Phase 4.10 - read-only probe of Public Domain Review candidate pages.
 *
 * Walks the Phase 4.8 candidate list (URLs PDR itself links to), keeps only the
 * slugs that could plausibly match one of the three new Curiosities topics, and
 * runs the SAME Phase 4.8 extractor the real build uses, so the rights evidence
 * recorded here is the article's own page evidence (essay licence statement or
 * collection rights label) - never a site-wide statement.
 *
 * Nothing is written to the Library by this script. It only produces a local
 * probe report used to choose the batch manifest.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractPdrArticle } from '../../phase4-8-pdr-wiktionary/scripts/pdr-extract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const CANDIDATES = resolve(ROOT, 'research', 'phase4-8-pdr-wiktionary', 'pdr-candidates.json');
const OUT = resolve(HERE, '..', 'pdr-probe.json');

const GROUPS = {
  philosophy: ['philosoph', 'thought', 'mind', 'soul', 'dream', 'logic', 'reason', 'conscious',
    'memory', 'imagination', 'wonder', 'curios', 'plato', 'aristotle', 'kant', 'descartes',
    'stoic', 'epicure', 'metaphys', 'epistem', 'utilitar', 'free-will', 'truth', 'idea',
    'psycholog', 'self', 'meditat', 'silence', 'sleep', 'belief', 'superstition-reason'],
  mystery: ['ghost', 'witch', 'magic', 'occult', 'spiritual', 'mesmer', 'alchemy', 'prophe',
    'omen', 'fairy', 'demon', 'devil', 'vampire', 'werewolf', 'monster', 'myster', 'strange',
    'curse', 'crystal', 'astrolog', 'haunt', 'seance', 'table-turn', 'phrenolog', 'luminous',
    'prophec', 'oracle', 'portent', 'supernatural', 'marvel', 'miracle', 'apparition',
    'invisible', 'ether', 'fraud-spirit', 'ghosts', 'witchcraft', 'sorcer', 'divination',
    'palmistry', 'astrology', 'eclipse', 'comet', 'moon', 'planet-mystery', 'delusion'],
  crime: ['murder', 'poison', 'crime', 'criminal', 'trial', 'execution', 'hangman', 'gallows',
    'body-snatch', 'resurrection-man', 'thief', 'theft', 'forgery', 'forger', 'fraud',
    'swindl', 'confidence', 'detective', 'police', 'ripper', 'bluebeard', 'bigamy', 'arson',
    'burglar', 'robbery', 'counterfeit', 'duel', 'assassin', 'bandit', 'outlaw', 'punish',
    'prison', 'hang', 'behead', 'inquest', 'coroner', 'fingerprint', 'forensic', 'evidence',
    'notorious', 'villain', 'scandal', 'elopement', 'kidnap', 'lock-up', 'newgate', 'scull'],
};

const classify = (url) => {
  const slug = url.toLowerCase();
  return Object.entries(GROUPS)
    .filter(([, words]) => words.some((word) => slug.includes(word)))
    .map(([group]) => group);
};

const all = JSON.parse(await import('node:fs').then((fs) => fs.promises.readFile(CANDIDATES, 'utf8')));
const scanAll = process.argv.includes('--all');
const picked = scanAll ? all : all.filter((item) => classify(item.url).length > 0);
console.log(`candidates: ${all.length}  probed subset: ${picked.length}${scanAll ? ' (FULL SCAN)' : ''}`);

const rows = [];
const CONCURRENCY = 8;
let cursor = 0;
const worker = async () => {
  while (cursor < picked.length) {
    const item = picked[cursor++];
    const groups = classify(item.url);
    try {
      const article = await extractPdrArticle(item.url);
      if (!article.ok) {
        rows.push({ url: item.url, groups, status: 'EXTRACT-FAILED' });
        console.log(`FAIL  ${item.url}`);
        continue;
      }
      const rights = article.rightsEvidence ?? {};
      rows.push({
        url: item.url,
        groups,
        title: article.title,
        author: article.author,
        words: article.wordCount,
        licenceToken: rights.licenceToken,
        evidenceForm: rights.evidenceForm,
        allRightsReserved: rights.allRightsReserved,
        reprintedByPermission: rights.reprintedByPermission,
      });
      console.log(`PROBE ${String(article.wordCount).padStart(5)}w  ${String(rights.licenceToken ?? '-').padEnd(10)}  ${item.url}`);
    } catch (error) {
      rows.push({ url: item.url, groups, status: 'FETCH-ERROR', error: String(error?.message ?? error) });
      console.log(`ERR   ${item.url} ${error?.message ?? error}`);
    }
  }
};

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
rows.sort((a, b) => a.url.localeCompare(b.url));
writeFileSync(OUT, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');

const clear = rows.filter((r) => r.licenceToken
  && !/NC/i.test(r.licenceToken)
  && !r.allRightsReserved
  && !r.reprintedByPermission
  && r.words >= 120);
console.log(`\nprobed: ${rows.length}   rights-clear (permissive CC, >=120w): ${clear.length}`);
for (const r of clear) console.log(`CLEAR [${r.groups.join(',')}] ${r.words}w ${r.licenceToken} ${r.url}`);
writeFileSync(resolve(HERE, '..', 'pdr-probe-clear.json'), `${JSON.stringify(clear, null, 2)}\n`, 'utf8');
