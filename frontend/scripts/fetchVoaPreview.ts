/**
 * Phase 3.3 - VOA Learning English fetch PROOF OF CONCEPT.
 *
 * WHAT THIS IS
 * ------------
 *     external source -> fetch -> normalise -> preview
 *
 * and deliberately NOT:
 *
 *     external source -> publish into the application
 *
 * Hard boundaries, all enforced below rather than merely promised:
 *
 * - It imports NOTHING from `data/articles.ts` and writes to no data file.
 * - It does not call `getLibraryArticle`, does not create an `Article`, and
 *   never produces a CEFR level, genre, chapters or reading time.
 * - The pure normaliser lives in `src/utils/feedNormalisation.ts` and never
 *   extracts body text; `rawContent` stays absent for every item here.
 * - Output goes to stdout only.
 * - It runs manually, never on a schedule, and calls no AI API.
 *
 * Run it with the command shown in the final report. It is NOT wired into
 * `npm test`, because a unit test must never depend on the network.
 */
import { normalizeFeed } from '../src/utils/feedNormalisation';
import {
  canReuseFullText,
  effectiveReuse,
  getContentSource,
} from '../src/utils/sourceValidation';
import type { ContentSourceDefinition } from '../src/types/source';

const SOURCE_ID = 'voa-learning-english';

/** The source, read from the registry. The feed URL is never hard-coded here. */
const source: ContentSourceDefinition | undefined = getContentSource(SOURCE_ID);

declare const console: { log: (...args: unknown[]) => void };
declare const process: { exit: (code: number) => void };

const run = async (): Promise<void> => {
  console.log('=== Phase 3.3 - VOA Learning English fetch proof of concept ===');
  console.log('');

  if (!source?.feedUrl) {
    console.log('No verified feed URL is recorded for this source. Stopping.');
    process.exit(1);
  }

  console.log(`Source          : ${source.name} (${source.id})`);
  console.log(`Feed URL        : ${source.feedUrl}`);
  console.log(`Rights status   : ${source.rightsStatus}`);
  console.log(`Declared reuse  : ${source.contentReuse}`);
  console.log(`Effective reuse : ${effectiveReuse(source)}`);
  console.log(`Full text allowed by policy: ${canReuseFullText(source)}`);
  console.log('');

  const response = await fetch(source.feedUrl, {
    headers: { 'User-Agent': 'EnglishReadingPlatform-Phase33-PoC/1.0' },
  });
  console.log(`HTTP status     : ${response.status} ${response.statusText}`);

  if (!response.ok) {
    console.log('Feed could not be read. Nothing was fetched.');
    process.exit(1);
  }

  const xml = await response.text();
  const fetchedAt = new Date().toISOString();
  const previews = normalizeFeed(xml, source, fetchedAt);

  console.log(`Fetched at      : ${fetchedAt}`);
  console.log(`Bytes read      : ${xml.length}`);
  console.log(`Items previewed : ${previews.length}`);
  console.log('');
  console.log('--- PREVIEW (first 5) ---');

  for (const preview of previews.slice(0, 5)) {
    console.log('');
    console.log(`  title       : ${preview.title}`);
    console.log(`  url         : ${preview.url}`);
    console.log(`  externalId  : ${preview.externalId ?? '(none)'}`);
    console.log(`  publishedAt : ${preview.publishedAt ?? '(none)'}`);
    console.log(`  description : ${preview.description ?? '(none)'}`);
    console.log(`  rawContent  : ${preview.rawContent === undefined ? 'WITHHELD (never fetched)' : 'PRESENT'}`);
    console.log(`  appliedReuse: ${preview.rightsDecision?.appliedReuse}`);
    console.log(`  fullText    : ${preview.rightsDecision?.fullTextIncluded}`);
    console.log(`  reason      : ${preview.rightsDecision?.reason}`);
  }

  const withBody = previews.filter((preview) => preview.rawContent !== undefined);
  console.log('');
  console.log('--- SAFETY SUMMARY ---');
  console.log(`Items carrying full text : ${withBody.length} (must be 0)`);
  console.log(`Items published          : 0`);
  console.log(`Files written            : 0`);
  console.log('Nothing was stored. This was a read-only demonstration.');
};

run().catch((error: unknown) => {
  console.log(`Fetch failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
