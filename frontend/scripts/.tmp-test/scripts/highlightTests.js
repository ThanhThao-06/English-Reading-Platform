"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const articles_1 = require("../src/data/articles");
const highlightStorage_1 = require("../src/utils/highlightStorage");
const chapterUtils_1 = require("../src/utils/chapterUtils");
let passed = 0;
const failures = [];
const check = (name, condition) => {
    if (condition)
        passed += 1;
    else
        failures.push(name);
};
const storage = new Map();
Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key),
    },
});
const article = articles_1.ARTICLES_DATA.find((item) => item.id === 'art-001');
if (!article)
    throw new Error('Existing static article art-001 is required for this regression.');
const paragraph = (0, chapterUtils_1.getArticleParagraphs)(article)[0];
const phrase = paragraph.slice(0, 24);
const highlight = (0, highlightStorage_1.addHighlight)({
    articleId: article.id,
    paragraphIndex: 0,
    text: phrase,
    startOffset: 0,
    endOffset: phrase.length,
});
check('existing static article text accepts a new highlight', highlight?.text === phrase);
check('highlight remains attached to the original static article id', highlight?.articleId === article.id);
check('highlight round-trips through the existing persistence utility', (0, highlightStorage_1.getHighlights)(article.id)[0]?.id === highlight?.id);
const noted = highlight ? (0, highlightStorage_1.updateHighlightNote)(article.id, highlight.id, 'SYNTHETIC TEST NOTE') : null;
check('a note can be added to the static article highlight', noted?.note === 'SYNTHETIC TEST NOTE');
check('the note round-trips from the existing storage key', (0, highlightStorage_1.getHighlights)(article.id)[0]?.note === 'SYNTHETIC TEST NOTE');
check('highlight and note delete cleanly', Boolean(highlight && (0, highlightStorage_1.deleteHighlight)(article.id, highlight.id)));
check('deleting the final highlight clears its article entry', (0, highlightStorage_1.getHighlights)(article.id).length === 0);
if (failures.length > 0) {
    console.error(`${failures.length} highlight regression failure(s):`, failures);
    process.exit(1);
}
console.log(`${passed} highlight/note regression assertions passed.`);
