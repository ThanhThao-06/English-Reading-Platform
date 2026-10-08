import { ARTICLES_DATA } from '../src/data/articles';
import {
  addHighlight,
  deleteHighlight,
  getHighlights,
  updateHighlightNote,
} from '../src/utils/highlightStorage';
import { getArticleParagraphs } from '../src/utils/chapterUtils';

declare const console: { log: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
declare const process: { exit: (code: number) => void };

let passed = 0;
const failures: string[] = [];
const check = (name: string, condition: boolean) => {
  if (condition) passed += 1;
  else failures.push(name);
};

const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
});

const article = ARTICLES_DATA.find((item) => item.id === 'art-001');
if (!article) throw new Error('Existing static article art-001 is required for this regression.');
const paragraph = getArticleParagraphs(article)[0];
const phrase = paragraph.slice(0, 24);
const highlight = addHighlight({
  articleId: article.id,
  paragraphIndex: 0,
  text: phrase,
  startOffset: 0,
  endOffset: phrase.length,
});

check('existing static article text accepts a new highlight', highlight?.text === phrase);
check('highlight remains attached to the original static article id', highlight?.articleId === article.id);
check('highlight round-trips through the existing persistence utility', getHighlights(article.id)[0]?.id === highlight?.id);

const noted = highlight ? updateHighlightNote(article.id, highlight.id, 'SYNTHETIC TEST NOTE') : null;
check('a note can be added to the static article highlight', noted?.note === 'SYNTHETIC TEST NOTE');
check('the note round-trips from the existing storage key', getHighlights(article.id)[0]?.note === 'SYNTHETIC TEST NOTE');
check('highlight and note delete cleanly', Boolean(highlight && deleteHighlight(article.id, highlight.id)));
check('deleting the final highlight clears its article entry', getHighlights(article.id).length === 0);

if (failures.length > 0) {
  console.error(`${failures.length} highlight regression failure(s):`, failures);
  process.exit(1);
}
console.log(`${passed} highlight/note regression assertions passed.`);
