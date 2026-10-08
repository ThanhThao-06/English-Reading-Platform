/**
 * Phase 4.8 - per-item PDR rights audit (reads only; imports nothing).
 *
 * PDR's own "Reusing Material" page states the site-wide default but also that
 * "some are published under more restrictive terms (usually the case for book
 * excerpts) - please see information provided at the end of the essay for
 * details". So THE SITE POLICY NEVER DECIDES AN ITEM. Every candidate must carry
 * its own article-level Creative Commons evidence, and anything carrying
 * "All rights reserved", "Reprinted by permission" or a NonCommercial-only
 * licence is excluded rather than assumed to be covered.
 *
 * Writes pdr-audit.json. Runs with bounded concurrency.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { readHtml, toLines } from './lib.mjs';

const candidates = JSON.parse(readFileSync('research/phase4-8-pdr-wiktionary/pdr-candidates.json', 'utf8'));

/**
 * "Mythology, Folklore & Dark History" topic gate, applied to the URL slug
 * before any network call so only relevant items are fetched.
 */
const TOPIC_WORDS = [
  'witch', 'wizard', 'magic', 'occult', 'demon', 'devil', 'satan', 'curse',
  'ghost', 'spirit', 'spectre', 'specter', 'prophec', 'seer', 'divinat',
  'astrolog', 'alchem', 'necroman', 'zombie', 'vampire', 'werewolf',
  'folkl', 'myth', 'legend', 'superst', 'apotropa', 'grimoire', 'talisman',
  'amulet', 'charms', 'fairytale', 'fairy-tale', 'fairy', 'nursery', 'ogre',
  'giant', 'dragon', 'phoenix', 'sacrifice', 'ritual', 'festival', 'maskenfest',
  'carnival', 'death', 'grave', 'burial', 'funerar', 'memento', 'mori',
  'skull', 'skeleton', 'autops', 'monstr', 'bestiary', 'wonder', 'curiosit',
  'exhibition', 'phantasm', 'nightmare', 'dream', 'hallucin', 'madness',
  'delusion', 'melancho', 'mania', 'hysteri', 'possess', 'relig', 'church',
  'inquisit', 'medieval', 'herbs', 'herbal', 'monster', 'goetia', 'tarot',
  'horoscope', 'dark', 'baphomet',
  // Fabled creatures, prodigies and marvels that sit in the same folklore
  // register as the shelves above.
  'zoophyte', 'vegetable-lamb', 'prodigy', 'monstrosity', 'curious',
  'portent', 'prodig', 'miracle', 'marvel', 'comet', 'eclipse', 'omen',
];
const TOPIC = new RegExp(TOPIC_WORDS.join('|'), 'i');

const shortlist = candidates.filter((c) => TOPIC.test(c.url));
console.log(`candidates=${candidates.length} on-topic=${shortlist.length}\n`);

/**
 * Article-level CC evidence, in the two forms PDR itself prints:
 *   1. essays: "The text of this essay is published under a CC BY-SA license"
 *   2. any post: its rights-labelling block, e.g.
 *      "Digital Copy Rights Attribution-ShareAlike Labelled CC BY-SA license"
 * Neither the site-wide default nor a third-party asset credit counts as
 * article-level evidence for the article text.
 */
const ARTICLE_CC = /the text of this (?:essay|post|article) is published under a\s*(CC[\s\S]{0,40}?)license/i;
const RIGHTS_LABEL = /Digital Copy Rights\s*[A-Za-z-]+(?:\s*[A-Za-z-]+){0,2}?\s*Labelled\s*(CC[\s-]?BY(?:-NC)?(?:-SA)?(?:\s?\d\.\d)?)/i;

const auditOne = async (candidate) => {
  const record = { ...candidate };
  try {
    const { status, html } = await readHtml(candidate.url);
    record.status = status;
    if (status !== 200) {
      record.verdict = 'UNFETCHABLE';
      return record;
    }

    record.pageTitle = ((html.match(/<title[^>]*>([^<]*)<\/title>/) || [])[1] || '')
      .replace(/\s*[\u2013|\-]\s*The Public Domain Review\s*$/i, '')
      .trim();

    const ld = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
      .map((m) => m[1]).join(' ');
    try {
      const parsed = JSON.parse(`[${ld.trim().replace(/}\s*{/g, '},{')}]`);
      for (const entry of parsed) {
        if (entry?.headline && !record.headline) record.headline = entry.headline;
        if (entry?.datePublished && !record.datePublished) record.datePublished = String(entry.datePublished).slice(0, 10);
      }
    } catch { /* JSON-LD is optional */ }

    const lines = toLines(html);
    const flat = lines.join('\n');

    // PDR renders the rights label and the essay licence line with the label
    // words on separate lines ("Digital Copy Rights" / "Attribution-ShareAlike"
    // / "Labelled" / "CC BY-SA license"), so the matcher runs against a
    // whitespace-collapsed view rather than the newline-joined one.
    const flow = flat.replace(/\s+/g, ' ');

    const articleCc = ARTICLE_CC.exec(flow)?.[1]?.trim() ?? null;
    const labelCc = RIGHTS_LABEL.exec(flow)?.[1] ?? null;
    record.articleLevelCc = articleCc ?? labelCc;
    record.articleLevelCcForm = articleCc ? 'essay-statement' : (labelCc ? 'rights-label' : null);

    record.hasAllRightsReserved = /all rights reserved/i.test(flow);
    record.hasReprintedByPermission = /reprinted by permission/i.test(flow);
    record.allCcTokens = [...new Set(
      lines.flatMap((line) => (line.match(/CC[ -]?BY(?:-NC)?(?:-SA)?(?:\s?\d\.\d)?/gi) || [])),
    )];

    // Third-party asset credits are recorded, and every such asset is excluded
    // from the import rather than reused.
    record.thirdPartyAssetCredits = lines.filter((line) =>
      /Source\s*:\s*[^|\n]{2,60}\((?:[^)]*CC[^)]*|public domain)\)/i.test(line));

    // Prose word count, used for the thin-body gate.
    const apparatus = lines
      .map((line, i) => (/^(Further Reading|Sources)$/.test(line) && i > 20 ? i : -1))
      .filter((i) => i > 0);
    const prose = apparatus.length ? lines.slice(0, apparatus.at(-1)) : lines;
    record.wordCount = prose.join(' ').split(/\s+/).filter(Boolean).length;

    record.verdict = 'AUDITED';
  } catch (error) {
    record.status = 'FAILED';
    record.verdict = 'FETCH_ERROR';
    record.error = String(error);
  }
  return record;
};

const CONCURRENCY = 10;
const report = [];
let cursor = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (cursor < shortlist.length) {
    const record = await auditOne(shortlist[cursor]);
    cursor += 1;
    report.push(record);
    const flags = [
      record.hasAllRightsReserved ? 'ALL-RIGHTS-RESERVED' : '',
      record.hasReprintedByPermission ? 'REPRINTED-BY-PERMISSION' : '',
      !record.articleLevelCc ? 'NO-ARTICLE-CC' : '',
    ].filter(Boolean).join(' ');
    console.log(`${String(record.status).padEnd(4)} ${(record.pageTitle || record.url).replace(/\s+/g, ' ').slice(0, 56).padEnd(58)} ${String(record.articleLevelCc || '-').padEnd(11)} ${String(record.wordCount || 0).padStart(5)}w  ${flags}`);
  }
}));

report.sort((a, b) => a.url.localeCompare(b.url));
writeFileSync('research/phase4-8-pdr-wiktionary/pdr-audit.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const eligible = report.filter((r) => r.verdict === 'AUDITED'
  && r.articleLevelCc && !r.hasAllRightsReserved && !r.hasReprintedByPermission);
console.log(`\naudited=${report.length} article-CC-eligible=${eligible.length}`);
eligible.forEach((r) => console.log(`  ELIGIBLE [${r.articleLevelCcForm}] ${r.articleLevelCc}  ${r.pageTitle}`));