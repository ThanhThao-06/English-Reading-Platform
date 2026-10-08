import {
  findChapterForParagraph,
  formatChapterNumber,
  getArticleParagraphs,
  getChapterForProgress,
  getChapterParagraphs,
  getChapterPosition,
  getChapterRoute,
  getValidChapters,
  validateArticleChapters,
} from '../src/utils/chapterUtils';
import { ARTICLES_DATA } from '../src/data/articles';
import type { Article, ArticleChapter } from '../src/types/article';

/**
 * This script is compiled standalone (outside the app's tsconfig) to run under
 * plain Node, so the usual DOM/Node globals are declared here rather than
 * pulling in extra type packages just for a test run.
 */
declare const console: { log: (...args: unknown[]) => void };
declare const process: { exit: (code: number) => void };

let passed = 0;
const failures: string[] = [];

const check = (name: string, condition: boolean, detail = '') => {
  if (condition) {
    passed += 1;
  } else {
    failures.push(`${name}${detail ? ` -> ${detail}` : ''}`);
  }
};

const eq = (name: string, actual: unknown, expected: unknown) => {
  check(
    name,
    JSON.stringify(actual) === JSON.stringify(expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
};

/** Synthetic article with `paragraphCount` paragraphs split into `chapterCount` chapters. */
const makeArticle = (id: string, paragraphCount: number, chapterCount: number): Article => {
  const content = Array.from({ length: paragraphCount }, (_, i) => `Para ${i}`).join('\n\n');
  const chapters: ArticleChapter[] = [];

  for (let i = 0; i < chapterCount; i += 1) {
    chapters.push({
      id: `${id}-ch${i + 1}`,
      title: `Chapter ${i + 1}`,
      startParagraphIndex: Math.floor((i * paragraphCount) / chapterCount),
      endParagraphIndex: Math.floor(((i + 1) * paragraphCount) / chapterCount) - 1,
    });
  }

  return {
    id,
    title: `Article ${id}`,
    description: '',
    image: '',
    genre: 'Stories & Literature',
    level: 'B1',
    readingTime: 'Chapter',
    content,
    chapters,
  };
};

const ART001 = ARTICLES_DATA.find((a) => a.id === 'art-001')!;
const CH005 = ARTICLES_DATA.find((a) => a.id === 'art-005')!;
const CH003 = ARTICLES_DATA.find((a) => a.id === 'art-003')!;
const ch005 = getValidChapters(CH005);

/* 1. Chapter lookup */
const pos2 = getChapterPosition(CH005, 'art-005-ch2');
check('1 lookup: art-005-ch2 resolves', pos2 !== null);
eq('1 lookup: correct title', pos2!.chapter.title, ch005[1].title);

/* 2. First chapter detection */
const first = getChapterPosition(CH005, ch005[0].id)!;
check('2 first: isFirst is true', first.isFirst);
check('2 first: previous is null', first.previous === null);
check('2 first: next exists', first.next !== null);

/* 3. Last chapter detection */
const last = getChapterPosition(CH005, ch005.at(-1)!.id)!;
check('3 last: isLast is true', last.isLast);
check('3 last: next is null', last.next === null);
check('3 last: previous exists', last.previous !== null);

/* 4. Invalid chapter */
check('4 invalid: unknown id rejected', getChapterPosition(CH005, 'art-005-ch999') === null);
check('4 invalid: empty id rejected', getChapterPosition(CH005, '') === null);
check('4 invalid: null id rejected', getChapterPosition(CH005, null) === null);
check('4 invalid: undefined id rejected', getChapterPosition(CH005, undefined) === null);

/* 5. Previous chapter */
eq('5 previous: chapter 2 -> chapter 1', pos2!.previous!.id, ch005[0].id);
eq('5 previous: middle chapter', getChapterPosition(CH005, ch005[2].id)!.previous!.id, ch005[1].id);

/* 6. Next chapter */
eq('6 next: chapter 2 -> chapter 3', pos2!.next!.id, ch005[2].id);
eq('6 next: last chapter has none', last.next, null);

/* 7. Cross-article chapter id */
check('7 cross-article: art-005 chapter rejected by art-001', getChapterPosition(ART001, 'art-005-ch1') === null);
check('7 cross-article: art-001 chapter rejected by art-005', getChapterPosition(CH005, 'art-001-ch1') === null);

/* 8. Paragraph range extraction */
const art005Paras = getArticleParagraphs(CH005);
const ch2Paras = getChapterParagraphs(CH005, pos2!.chapter);
check('8 range: chapter has paragraphs', ch2Paras.length > 0);
check(
  '8 range: length matches inclusive range',
  ch2Paras.length === pos2!.chapter.endParagraphIndex - pos2!.chapter.startParagraphIndex + 1
);
check('8 range: starts at declared start', ch2Paras[0].index === pos2!.chapter.startParagraphIndex);
check('8 range: ends at declared end', ch2Paras.at(-1)!.index === pos2!.chapter.endParagraphIndex);
// Text must come from the original article content, never a duplicated copy.
eq(
  '8 range: text matches the original article paragraphs',
  ch2Paras.map((p) => p.text),
  art005Paras.slice(pos2!.chapter.startParagraphIndex, pos2!.chapter.endParagraphIndex + 1)
);

/* 9. Global paragraph indexes (Highlights & Notes depend on these) */
check('9 global: chapter 2 does not restart at 0', ch2Paras[0].index !== 0);
check(
  '9 global: indexes are contiguous and in order',
  ch2Paras.every((p, i) => i === 0 || p.index === ch2Paras[i - 1].index + 1)
);
check(
  '9 global: each chapter starts at its declared index',
  ch005.every((c) => getChapterParagraphs(CH005, c)[0]?.index === c.startParagraphIndex)
);
// Every paragraph of the article is covered exactly once across all chapters.
eq(
  '9 global: each paragraph rendered exactly once',
  ch005.flatMap((c) => getChapterParagraphs(CH005, c).map((p) => p.index)),
  art005Paras.map((_, i) => i)
);

/* 10. Chapterless article fallback */
check('10 chapterless: art-003 declares no chapters', CH003.chapters === undefined);
eq('10 chapterless: getValidChapters -> []', getValidChapters(CH003), []);
check('10 chapterless: getChapterPosition -> null', getChapterPosition(CH003, 'art-003-ch1') === null);
check('10 chapterless: getChapterForProgress -> null', getChapterForProgress(CH003, 50) === null);
check('10 chapterless: validation passes', validateArticleChapters(CH003).valid);
check('10 chapterless: whole article still readable', getArticleParagraphs(CH003).length > 0);

/* 11. Chapter count of 2 */
const two = makeArticle('syn-2', 4, 2);
eq('11 count-2: chapter count', getValidChapters(two).length, 2);
check('11 count-2: first isFirst', getChapterPosition(two, 'syn-2-ch1')!.isFirst);
check('11 count-2: first next is ch2', getChapterPosition(two, 'syn-2-ch1')!.next!.id === 'syn-2-ch2');
check('11 count-2: last isLast', getChapterPosition(two, 'syn-2-ch2')!.isLast);
check('11 count-2: last previous is ch1', getChapterPosition(two, 'syn-2-ch2')!.previous!.id === 'syn-2-ch1');

/** Walk the whole article with Next, then walk it back with Previous. */
const walkForward = (article: Article, ids: string[]) => {
  const seen: string[] = [];
  let cursor = getChapterPosition(article, ids[0]);
  while (cursor) {
    seen.push(cursor.chapter.id);
    cursor = cursor.next ? getChapterPosition(article, cursor.next.id) : null;
  }
  return seen;
};

const walkBack = (article: Article, ids: string[]) => {
  const seen: string[] = [];
  let cursor = getChapterPosition(article, ids[ids.length - 1]);
  while (cursor) {
    seen.push(cursor.chapter.id);
    cursor = cursor.previous ? getChapterPosition(article, cursor.previous.id) : null;
  }
  return seen;
};

/* 12. Chapter count of 5+ */
for (const count of [5, 6, 12]) {
  const article = makeArticle(`syn-${count}`, count * 2, count);
  const chapters = getValidChapters(article);
  const ids = chapters.map((c) => c.id);

  eq(`12 count-${count}: chapter count`, chapters.length, count);

  // No hard-coded chapter numbers: a Next chain must reach every chapter.
  eq(`12 count-${count}: Next visits every chapter in order`, walkForward(article, ids), ids);
  eq(`12 count-${count}: Previous returns to the first`, walkBack(article, ids).at(-1), ids[0]);
  eq(`12 count-${count}: Previous visits every chapter`, walkBack(article, ids).length, count);

  // Chapter numbers are generated from position, not hard-coded.
  eq(
    `12 count-${count}: numbering is dynamic`,
    chapters.map((_, i) => formatChapterNumber(i)),
    chapters.map((_, i) => String(i + 1).padStart(2, '0'))
  );
  eq(`12 count-${count}: formatting beyond 9`, formatChapterNumber(count - 1), String(count).padStart(2, '0'));
}

/* 13. Chapter count of 20+ */
for (const count of [20, 25, 30]) {
  const article = makeArticle(`syn-big-${count}`, count * 2, count);
  const chapters = getValidChapters(article);
  const ids = chapters.map((c) => c.id);

  eq(`13 count-${count}: chapter count`, chapters.length, count);

  const lastPos = getChapterPosition(article, ids[count - 1])!;
  check(`13 count-${count}: last isLast`, lastPos.isLast);
  check(`13 count-${count}: last has no Next`, lastPos.next === null);
  check(`13 count-${count}: last index`, lastPos.index === count - 1);
  eq(`13 count-${count}: total reported`, lastPos.total, count);

  // A middle chapter must offer BOTH directions.
  const mid = getChapterPosition(article, ids[Math.floor(count / 2)])!;
  check(`13 count-${count}: middle has Previous`, mid.previous !== null);
  check(`13 count-${count}: middle has Next`, mid.next !== null);
  check(`13 count-${count}: middle is neither first nor last`, !mid.isFirst && !mid.isLast);

  eq(`13 count-${count}: Next reaches the last chapter`, walkForward(article, ids).at(-1), ids[count - 1]);
  check(`13 count-${count}: data still validates`, validateArticleChapters(article).valid);

  // Chapter pages must together still reproduce the whole article.
  eq(
    `13 count-${count}: chapters reproduce the article`,
    chapters.flatMap((c) => getChapterParagraphs(article, c).map((p) => p.text)),
    getArticleParagraphs(article)
  );
}

/* Route shape + resume mapping */
eq('route: chapter URL', getChapterRoute('art-005', 'art-005-ch2'), '/reader/art-005/chapter/art-005-ch2');
check(
  'route: matches /reader/:id/chapter/:chapterId',
  /^\/reader\/[^/]+\/chapter\/[^/]+$/.test(getChapterRoute('art-005', 'art-005-ch2'))
);
check('resume: 0% resumes at the first chapter', getChapterForProgress(CH005, 0)!.id === ch005[0].id);
check('resume: 100% resumes at the last chapter', getChapterForProgress(CH005, 100)!.id === ch005.at(-1)!.id);
check('resume: mid-progress resolves a real chapter', getChapterForProgress(CH005, 42) !== null);
check('resume: 50% resolves inside the article', getChapterForProgress(CH005, 50)!.startParagraphIndex >= 0);

/* Real article data must be untouched: no duplicated or lost paragraphs */
for (const article of ARTICLES_DATA) {
  const result = validateArticleChapters(article);
  check(`data: ${article.id} chapter metadata valid`, result.valid, result.errors.join('; '));
  if (!article.chapters) continue;

  const rendered = getValidChapters(article)
    .flatMap((c) => getChapterParagraphs(article, c))
    .map((p) => p.text)
    .join('\n\n');
  check(
    `data: ${article.id} chapter text reproduces the article`,
    rendered === getArticleParagraphs(article).join('\n\n')
  );

  const starts = getValidChapters(article).map((c) => c.startParagraphIndex);
  check(`data: ${article.id} has no duplicate start indexes`, new Set(starts).size === starts.length);
}

/* Highlights: a paragraph index must resolve back to its own chapter */
check(
  'highlights: chapter 2 paragraph resolves to chapter 2',
  findChapterForParagraph(CH005, ch005[1].startParagraphIndex)!.id === ch005[1].id
);
check(
  'highlights: chapter 3 paragraph resolves to chapter 3',
  findChapterForParagraph(CH005, ch005[2].startParagraphIndex)!.id === ch005[2].id
);
check(
  'highlights: last paragraph resolves to the last chapter',
  findChapterForParagraph(CH005, art005Paras.length - 1)!.id === ch005.at(-1)!.id
);

console.log(`\n${passed} assertions passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('All chapter tests passed.');