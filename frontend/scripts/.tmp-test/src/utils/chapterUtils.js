"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getChapterForProgress = exports.getChapterRoute = exports.getChapterPosition = exports.getChapterParagraphs = exports.formatChapterNumber = exports.getChapterParagraphCount = exports.findChapterForParagraph = exports.validateArticleChapters = exports.findChapterById = exports.getValidChapters = exports.isValidChapter = exports.getArticleParagraphs = void 0;
/**
 * Split article content into the same paragraph array the Reader renders.
 *
 * This MUST stay identical to the Reader's own split, because highlight and
 * chapter indexes are positions in this array.
 */
const getArticleParagraphs = (article) => article.content.split('\n\n').filter((p) => p.trim().length > 0);
exports.getArticleParagraphs = getArticleParagraphs;
/**
 * Validate a single chapter against an article.
 * Ranges are inclusive and indexes are global to the article.
 */
const isValidChapter = (chapter, paragraphCount, seenIds = new Set()) => {
    if (!chapter || typeof chapter.id !== 'string' || chapter.id.trim() === '')
        return false;
    if (seenIds.has(chapter.id))
        return false;
    if (typeof chapter.title !== 'string' || chapter.title.trim() === '')
        return false;
    const { startParagraphIndex, endParagraphIndex } = chapter;
    if (!Number.isInteger(startParagraphIndex) || !Number.isInteger(endParagraphIndex)) {
        return false;
    }
    // Must sit inside the real paragraph range and must not be empty.
    if (startParagraphIndex < 0)
        return false;
    if (endParagraphIndex >= paragraphCount)
        return false;
    if (endParagraphIndex < startParagraphIndex)
        return false;
    return true;
};
exports.isValidChapter = isValidChapter;
/**
 * Return only the chapters that are safe to render.
 *
 * Invalid chapters (out-of-range indexes, reversed ranges, empty or duplicate
 * ids) are dropped rather than thrown, so a data mistake can never break the
 * Reader. Overlapping ranges are also rejected, because they would make a
 * paragraph belong to two chapters.
 */
const getValidChapters = (article) => {
    if (!article.chapters || article.chapters.length === 0)
        return [];
    const paragraphCount = (0, exports.getArticleParagraphs)(article).length;
    const seenIds = new Set();
    const accepted = [];
    const sorted = [...article.chapters].sort((a, b) => a.startParagraphIndex - b.startParagraphIndex);
    for (const chapter of sorted) {
        if (!(0, exports.isValidChapter)(chapter, paragraphCount, seenIds))
            continue;
        const overlaps = accepted.some((other) => chapter.startParagraphIndex <= other.endParagraphIndex &&
            other.startParagraphIndex <= chapter.endParagraphIndex);
        if (overlaps)
            continue;
        seenIds.add(chapter.id);
        accepted.push(chapter);
    }
    return accepted.sort((a, b) => a.startParagraphIndex - b.startParagraphIndex);
};
exports.getValidChapters = getValidChapters;
/** Find a chapter by id, or null when the article has no such chapter. */
const findChapterById = (article, chapterId) => {
    if (!chapterId)
        return null;
    return (0, exports.getValidChapters)(article).find((chapter) => chapter.id === chapterId) ?? null;
};
exports.findChapterById = findChapterById;
/**
 * Validate every rule for a chapterized article:
 * indexes in range, no overlaps, unique ids, and - when the article is fully
 * divided - every paragraph covered exactly once.
 */
const validateArticleChapters = (article) => {
    const errors = [];
    const paragraphs = (0, exports.getArticleParagraphs)(article);
    const paragraphCount = paragraphs.length;
    if (!article.chapters || article.chapters.length === 0) {
        return { valid: true, errors, chapters: [] };
    }
    const ids = new Set();
    for (const chapter of article.chapters) {
        if (ids.has(chapter.id)) {
            errors.push(`${article.id}: duplicate chapter id "${chapter.id}"`);
        }
        ids.add(chapter.id);
        if (!Number.isInteger(chapter.startParagraphIndex) || chapter.startParagraphIndex < 0) {
            errors.push(`${article.id}/${chapter.id}: invalid startParagraphIndex`);
        }
        if (!Number.isInteger(chapter.endParagraphIndex) ||
            chapter.endParagraphIndex >= paragraphCount) {
            errors.push(`${article.id}/${chapter.id}: endParagraphIndex out of range (0-${paragraphCount - 1})`);
        }
        if (chapter.endParagraphIndex < chapter.startParagraphIndex) {
            errors.push(`${article.id}/${chapter.id}: reversed range`);
        }
    }
    const sorted = [...article.chapters].sort((a, b) => a.startParagraphIndex - b.startParagraphIndex);
    for (let i = 1; i < sorted.length; i += 1) {
        if (sorted[i].startParagraphIndex <= sorted[i - 1].endParagraphIndex) {
            errors.push(`${article.id}: chapters "${sorted[i - 1].id}" and "${sorted[i].id}" overlap`);
        }
    }
    // Full coverage is only required when the article is divided from the first
    // to the last paragraph. Partial division is allowed by design.
    const fullyDivided = sorted.length > 0 &&
        sorted[0].startParagraphIndex === 0 &&
        sorted[sorted.length - 1].endParagraphIndex === paragraphCount - 1;
    if (fullyDivided) {
        let expected = 0;
        for (const chapter of sorted) {
            if (chapter.startParagraphIndex !== expected) {
                errors.push(`${article.id}: gap at paragraph ${expected} (chapter "${chapter.id}" starts at ${chapter.startParagraphIndex})`);
                break;
            }
            expected = chapter.endParagraphIndex + 1;
        }
    }
    return { valid: errors.length === 0, errors, chapters: (0, exports.getValidChapters)(article) };
};
exports.validateArticleChapters = validateArticleChapters;
/** Which chapter contains a paragraph index, or null when it is ungrouped. */
const findChapterForParagraph = (article, paragraphIndex) => (0, exports.getValidChapters)(article).find((chapter) => paragraphIndex >= chapter.startParagraphIndex && paragraphIndex <= chapter.endParagraphIndex) ?? null;
exports.findChapterForParagraph = findChapterForParagraph;
/** Number of paragraphs in a chapter (inclusive range). */
const getChapterParagraphCount = (chapter) => chapter.endParagraphIndex - chapter.startParagraphIndex + 1;
exports.getChapterParagraphCount = getChapterParagraphCount;
/** Zero-padded label such as "01". */
const formatChapterNumber = (index) => String(index + 1).padStart(2, '0');
exports.formatChapterNumber = formatChapterNumber;
/* ==========================================================================
   Single-chapter reading (Phase 2.2 refinement)
   ========================================================================== */
/**
 * The paragraphs of one chapter, paired with their **article-level** index.
 *
 * The index is deliberately global (never renumbered from 0 inside the chapter)
 * because Phase 2.1 highlights store `paragraphIndex` against the whole article.
 */
const getChapterParagraphs = (article, chapter) => {
    const paragraphs = (0, exports.getArticleParagraphs)(article);
    const result = [];
    for (let index = chapter.startParagraphIndex; index <= chapter.endParagraphIndex; index += 1) {
        if (index >= 0 && index < paragraphs.length) {
            result.push({ index, text: paragraphs[index] });
        }
    }
    return result;
};
exports.getChapterParagraphs = getChapterParagraphs;
/**
 * Locate a chapter and its neighbours. Returns null when the chapter id does not
 * belong to this article, which is how a cross-article id is rejected.
 */
const getChapterPosition = (article, chapterId) => {
    if (!chapterId)
        return null;
    const chapters = (0, exports.getValidChapters)(article);
    const index = chapters.findIndex((chapter) => chapter.id === chapterId);
    if (index === -1)
        return null;
    return {
        chapter: chapters[index],
        index,
        total: chapters.length,
        previous: index > 0 ? chapters[index - 1] : null,
        next: index < chapters.length - 1 ? chapters[index + 1] : null,
        isFirst: index === 0,
        isLast: index === chapters.length - 1,
    };
};
exports.getChapterPosition = getChapterPosition;
/** Canonical Reader URL for a chapter. */
const getChapterRoute = (articleId, chapterId) => `/reader/${articleId}/chapter/${chapterId}`;
exports.getChapterRoute = getChapterRoute;
/**
 * Which chapter an article-level progress percentage falls into.
 * Used to resume "Start Reading" on the right chapter.
 */
const getChapterForProgress = (article, progress) => {
    const chapters = (0, exports.getValidChapters)(article);
    if (chapters.length === 0)
        return null;
    const ratio = Math.min(1, Math.max(0, progress / 100));
    const slot = Math.min(chapters.length - 1, Math.floor(ratio * chapters.length));
    // A completed article resumes at its final chapter.
    if (progress >= 100)
        return chapters[chapters.length - 1];
    return chapters[slot];
};
exports.getChapterForProgress = getChapterForProgress;
