"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toggleWordStatus = exports.removeWord = exports.saveWord = exports.findSavedWord = exports.isWordSaved = exports.getSavedWords = void 0;
const STORAGE_KEY = 'english-reading-vocabulary';
/**
 * Safely retrieve all saved vocabulary words from localStorage
 */
const getSavedWords = () => {
    try {
        const rawData = localStorage.getItem(STORAGE_KEY);
        if (!rawData)
            return [];
        const parsed = JSON.parse(rawData);
        if (Array.isArray(parsed)) {
            return parsed;
        }
        return [];
    }
    catch (error) {
        console.error('Failed to parse vocabulary from localStorage:', error);
        return [];
    }
};
exports.getSavedWords = getSavedWords;
/**
 * Save words list back to localStorage safely
 */
const persistWords = (words) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
    }
    catch (error) {
        console.error('Failed to save vocabulary to localStorage:', error);
    }
};
/**
 * Check if a word is already saved in vocabulary
 */
const isWordSaved = (wordText) => {
    const normalized = wordText.trim().toLowerCase();
    const words = (0, exports.getSavedWords)();
    return words.some((item) => item.word.trim().toLowerCase() === normalized);
};
exports.isWordSaved = isWordSaved;
/**
 * Find a saved word entry by word text
 */
const findSavedWord = (wordText) => {
    const normalized = wordText.trim().toLowerCase();
    const words = (0, exports.getSavedWords)();
    return words.find((item) => item.word.trim().toLowerCase() === normalized);
};
exports.findSavedWord = findSavedWord;
/**
 * Save a word. If already saved, preserve original entry and source article.
 */
const saveWord = (input) => {
    const words = (0, exports.getSavedWords)();
    const normalized = input.word.trim().toLowerCase();
    const existing = words.find((item) => item.word.trim().toLowerCase() === normalized);
    if (existing) {
        return existing;
    }
    const newWord = {
        id: `vocab-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        word: input.word.trim().toLowerCase(),
        phonetic: input.phonetic,
        phoneticUk: input.phoneticUk,
        partOfSpeech: input.partOfSpeech,
        meaning: input.meaning,
        meaningVi: input.meaningVi,
        example: input.example,
        exampleVi: input.exampleVi,
        audioUrl: input.audioUrl,
        sourceArticleId: input.sourceArticleId,
        sourceArticleTitle: input.sourceArticleTitle,
        status: 'learning',
        savedAt: new Date().toISOString(),
    };
    const updated = [newWord, ...words];
    persistWords(updated);
    return newWord;
};
exports.saveWord = saveWord;
/**
 * Remove a word by word text or by id
 */
const removeWord = (identifier) => {
    const words = (0, exports.getSavedWords)();
    const normalized = identifier.trim().toLowerCase();
    const updated = words.filter((item) => item.id !== identifier && item.word.trim().toLowerCase() !== normalized);
    persistWords(updated);
    return updated;
};
exports.removeWord = removeWord;
/**
 * Toggle learning status between 'learning' and 'learned'
 */
const toggleWordStatus = (id) => {
    const words = (0, exports.getSavedWords)();
    const updated = words.map((item) => {
        if (item.id === id) {
            const nextStatus = item.status === 'learning' ? 'learned' : 'learning';
            return { ...item, status: nextStatus };
        }
        return item;
    });
    persistWords(updated);
    return updated;
};
exports.toggleWordStatus = toggleWordStatus;
