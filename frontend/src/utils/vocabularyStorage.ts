import type { VocabularyStatus, VocabularyWord } from '../types/vocabulary';

const STORAGE_KEY = 'english-reading-vocabulary';

/**
 * Safely retrieve all saved vocabulary words from localStorage
 */
export const getSavedWords = (): VocabularyWord[] => {
  try {
    const rawData = localStorage.getItem(STORAGE_KEY);
    if (!rawData) return [];
    const parsed = JSON.parse(rawData);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (error) {
    console.error('Failed to parse vocabulary from localStorage:', error);
    return [];
  }
};

/**
 * Save words list back to localStorage safely
 */
const persistWords = (words: VocabularyWord[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
  } catch (error) {
    console.error('Failed to save vocabulary to localStorage:', error);
  }
};

/**
 * Check if a word is already saved in vocabulary
 */
export const isWordSaved = (wordText: string): boolean => {
  const normalized = wordText.trim().toLowerCase();
  const words = getSavedWords();
  return words.some((item) => item.word.trim().toLowerCase() === normalized);
};

/**
 * Find a saved word entry by word text
 */
export const findSavedWord = (wordText: string): VocabularyWord | undefined => {
  const normalized = wordText.trim().toLowerCase();
  const words = getSavedWords();
  return words.find((item) => item.word.trim().toLowerCase() === normalized);
};

export interface SaveWordInput {
  word: string;
  phonetic?: string;
  phoneticUk?: string;
  partOfSpeech?: string;
  meaning: string;
  meaningVi?: string;
  example?: string;
  exampleVi?: string;
  audioUrl?: string;
  sourceArticleId: string;
  sourceArticleTitle: string;
}

/**
 * Save a word. If already saved, preserve original entry and source article.
 */
export const saveWord = (input: SaveWordInput): VocabularyWord => {
  const words = getSavedWords();
  const normalized = input.word.trim().toLowerCase();
  const existing = words.find((item) => item.word.trim().toLowerCase() === normalized);

  if (existing) {
    return existing;
  }

  const newWord: VocabularyWord = {
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

/**
 * Remove a word by word text or by id
 */
export const removeWord = (identifier: string): VocabularyWord[] => {
  const words = getSavedWords();
  const normalized = identifier.trim().toLowerCase();
  const updated = words.filter(
    (item) => item.id !== identifier && item.word.trim().toLowerCase() !== normalized
  );
  persistWords(updated);
  return updated;
};

/**
 * Toggle learning status between 'learning' and 'learned'
 */
export const toggleWordStatus = (id: string): VocabularyWord[] => {
  const words = getSavedWords();
  const updated = words.map((item) => {
    if (item.id === id) {
      const nextStatus: VocabularyStatus = item.status === 'learning' ? 'learned' : 'learning';
      return { ...item, status: nextStatus };
    }
    return item;
  });
  persistWords(updated);
  return updated;
};
