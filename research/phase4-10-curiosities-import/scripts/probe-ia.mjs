/**
 * Phase 4.10 - read-only probe of Internet Archive candidate items.
 *
 * Rights gate (item level, never publisher-level):
 *   - the item's own metadata must carry a public-domain license URL
 *     (creativecommons publicdomain/mark, publicdomain/zero or equivalent), OR
 *   - an explicit "Public Domain" rights statement, AND
 *   - the item's own details page must display a "Public domain in the USA"
 *     statement, which is captured verbatim as the rights evidence excerpt.
 *
 * The text layer ({id}_djvu.txt) is fetched only for candidates that pass the
 * rights gate, so no body of an unclear-rights item is ever persisted. Results
 * (including SKIP reasons) are written to research/phase4-10-curiosities-import/
 * ia-probe.json. Nothing is written to the Library.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readHtml, toLines } from '../../phase4-8-pdr-wiktionary/scripts/lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '..', 'ia-probe.json');

/** [identifier, topic, expected language] - candidates chosen from IA search. */
const CANDIDATES = [
  // Philosophy & Thought Experiments
  ['EssayOnFirstPrinciples', 'Philosophy & Thought Experiments'],
  ['bub_gb_3Y8AiKNMmUQC', 'Philosophy & Thought Experiments'],
  ['AnEssayContributingTo', 'Philosophy & Thought Experiments'],
  ['essaystreatiseso01hume_1', 'Philosophy & Thought Experiments'],
  // Unsolved Mysteries & Fringe Science
  ['BostomMediumMargery', 'Unsolved Mysteries & Fringe Science'],
  ['NotedWitnessesForPsychicOccurrences', 'Unsolved Mysteries & Fringe Science'],
  ['x-psychical-research-and-the-resurrection', 'Unsolved Mysteries & Fringe Science'],
  ['bub_gb_8CwSAAAAYAAJ', 'Unsolved Mysteries & Fringe Science'],
  // True Crime & Forensic Science
  ['paper-doi-10_1097_00000441-185410000-00014', 'True Crime & Forensic Science'],
  ['DKC0194', 'True Crime & Forensic Science'],
  ['the-national-police-gazette-v-001n-0006-1845-10-18', 'True Crime & Forensic Science'],
  ['an-essay-on-the-trial-by-jury-1852_202507', 'True Crime & Forensic Science'],
];

const PD_LICENSE = /creativecommons\.org\/publicdomain\/(mark|zero)/i;
const PD_RIGHTS = /\bpublic domain\b/i;
const MAX_TEXT_BYTES = 1_600_000;

const rows = [];
for (const [id, topic] of CANDIDATES) {
  try {
    const meta = await fetch(`https://archive.org/metadata/${id}`).then((r) => r.json());
    const m = meta.metadata ?? {};
    const licenseurl = typeof m.licenseurl === 'string' ? m.licenseurl : '';
    const rights = typeof m.rights === 'string' ? m.rights : '';
    const metadataSaysPd = PD_LICENSE.test(licenseurl) || PD_RIGHTS.test(rights);

    // The item's OWN details page must display a US public-domain statement.
    let pdStatement = null;
    try {
      const { status, html } = await readHtml(`https://archive.org/details/${id}`);
      if (status === 200) {
        const flat = toLines(html).join(' ');
        pdStatement = /[^.]*public domain in the (?:USA|United States)[^.]*/i.exec(flat)?.[0]?.trim() ?? null;
      }
    } catch { /* page unavailable: rights stay unclear */ }

    const files = Array.isArray(meta.files) ? meta.files : [];
    const textFile = files.find((f) => f.name === `${id}_djvu.txt`)
      ?? files.find((f) => typeof f.name === 'string' && f.name.endsWith('_djvu.txt'))
      ?? null;

    const row = {
      id,
      topic,
      title: m.title ?? null,
      creator: m.creator ?? null,
      year: m.year ?? m.date ?? null,
      licenseurl: licenseurl || null,
      rights: rights || null,
      metadataSaysPd,
      pdStatement,
      textFile: textFile?.name ?? null,
      textBytes: textFile ? Number(textFile.length ?? 0) : null,
      date: m.date ?? null,
      publisher: m.publisher ?? null,
    };

    if (!metadataSaysPd) { row.status = 'SKIP-NO-PD-METADATA'; rows.push(row); console.log(`SKIP(no pd metadata) ${id}`); continue; }
    if (!pdStatement) { row.status = 'SKIP-NO-PD-STATEMENT-ON-ITEM-PAGE'; rows.push(row); console.log(`SKIP(no pd statement) ${id}`); continue; }
    if (!textFile) { row.status = 'SKIP-NO-TEXT-LAYER'; rows.push(row); console.log(`SKIP(no text) ${id}`); continue; }
    if (row.textBytes > MAX_TEXT_BYTES) { row.status = 'SKIP-TEXT-TOO-LARGE'; rows.push(row); console.log(`SKIP(${row.textBytes}b) ${id}`); continue; }

    const text = await fetch(`https://archive.org/download/${id}/${encodeURIComponent(textFile.name)}`).then((r) => (r.ok ? r.text() : ''));
    const words = text.split(/\s+/).filter(Boolean).length;
    row.words = words;
    if (words < 120) { row.status = 'SKIP-THIN-BODY'; rows.push(row); console.log(`SKIP(thin ${words}w) ${id}`); continue; }

    row.status = 'ELIGIBLE';
    row.sample = text.slice(0, 400).replace(/\s+/g, ' ').trim();
    rows.push(row);
    console.log(`OK   ${String(words).padStart(6)}w  ${id}  | ${String(row.title).slice(0, 70)}`);
  } catch (error) {
    rows.push({ id, topic, status: 'ERROR', error: String(error?.message ?? error) });
    console.log(`ERR  ${id} ${error?.message ?? error}`);
  }
}

writeFileSync(OUT, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
console.log(`\neligible: ${rows.filter((r) => r.status === 'ELIGIBLE').length}/${rows.length}`);
