/**
 * Candidate discovery for Phase 4.8 (reads only, writes one JSON list).
 *
 * PDR paginates as /essays/2/ and /collections/all/2/. This walks every page of
 * every section and collects only URLs that PDR itself links to, so the batch is
 * built from real, existing articles rather than guessed slugs.
 */
import { writeFileSync } from 'node:fs';
import { readHtml } from './lib.mjs';

const SECTIONS = ['essays', 'collections', 'all'];
const ARTICLES = new Map();

const collect = (html, section) => {
  const paths = [
    ...html.matchAll(/href=["'](\/(?:essay|collection|conjectures|curators-choice)\/[a-z0-9-]+\/)["']/g),
  ].map((match) => match[1]);
  for (const path of paths) {
    if (!ARTICLES.has(path)) ARTICLES.set(path, section);
  }
  return new Set(paths).size;
};

// Essays and Collections.
for (const section of ['essays', 'collections']) {
  for (let page = 1; page <= 40; page += 1) {
    const url = page === 1
      ? `https://publicdomainreview.org/${section}/`
      : `https://publicdomainreview.org/${section}/all/${page}/`;
    let html;
    let status;
    try {
      ({ html, status } = await readHtml(url));
    } catch {
      break;
    }
    if (status !== 200) break;
    const found = collect(html, section);
    process.stdout.write(`  ${url} [${status}] +${found}\n`);
    if (found === 0) break;
  }
}

const list = [...ARTICLES.entries()].map(([path, section]) => ({
  url: `https://publicdomainreview.org${path}`,
  kind: path.split('/')[1],
  section,
}));

console.log(`\nTOTAL UNIQUE ARTICLE URLS: ${list.length}`);
console.log(JSON.stringify(
  list.reduce((acc, item) => ({ ...acc, [item.kind]: (acc[item.kind] ?? 0) + 1 }), {}),
  null, 2,
));

writeFileSync(
  'research/phase4-8-pdr-wiktionary/pdr-candidates.json',
  `${JSON.stringify(list, null, 2)}\n`,
  'utf8',
);