import type { Highlight, HighlightMap } from '../types/highlight';

/**
 * localStorage key for highlights and notes.
 * Separate from `english-reading-vocabulary` and `english-reading-progress`,
 * both of which are left untouched.
 */
const STORAGE_KEY = 'english-reading-highlights';

/** Longest note we accept, to keep the stored payload small and predictable. */
const MAX_NOTE_LENGTH = 2000;

/** Longest passage we allow to be highlighted, to keep the UI sane. */
const MAX_TEXT_LENGTH = 600;

const isNonNegativeInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

const cleanNote = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim().slice(0, MAX_NOTE_LENGTH);
  // An empty note is never stored: a highlight is valid without one.
  return trimmed.length > 0 ? trimmed : undefined;
};

/** Keep only entries that look like valid highlights. */
const isValidEntry = (value: unknown): value is Highlight => {
  if (!value || typeof value !== 'object') return false;

  const entry = value as Partial<Highlight>;

  return (
    typeof entry.id === 'string' &&
    entry.id.length > 0 &&
    typeof entry.articleId === 'string' &&
    entry.articleId.length > 0 &&
    isNonNegativeInt(entry.paragraphIndex) &&
    typeof entry.text === 'string' &&
    entry.text.trim().length > 0 &&
    entry.text.length <= MAX_TEXT_LENGTH &&
    isNonNegativeInt(entry.startOffset) &&
    isNonNegativeInt(entry.endOffset) &&
    entry.endOffset > entry.startOffset
  );
};

const normalizeEntry = (entry: Highlight): Highlight => ({
  id: entry.id,
  articleId: entry.articleId,
  paragraphIndex: entry.paragraphIndex,
  text: entry.text,
  startOffset: entry.startOffset,
  endOffset: entry.endOffset,
  note: cleanNote(entry.note),
  createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString(),
  updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : new Date().toISOString(),
});

const makeId = (): string =>
  `highlight-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/* ==========================================================================
   Reads
   ========================================================================== */

/**
 * Read every saved highlight.
 * Returns an empty map when storage is unavailable or malformed.
 */
export const getAllHighlights = (): HighlightMap => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const result: HighlightMap = {};

    for (const [articleId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue;

      const valid = value
        .filter(isValidEntry)
        .filter((entry) => entry.articleId === articleId)
        .map(normalizeEntry);

      if (valid.length > 0) result[articleId] = valid;
    }

    return result;
  } catch {
    // Unavailable or corrupted storage simply means "no highlights".
    return {};
  }
};

/** Highlights for one article, ordered by position for easy rendering. */
export const getHighlights = (articleId: string): Highlight[] => {
  if (!articleId) return [];

  return [...(getAllHighlights()[articleId] ?? [])].sort(
    (a, b) => a.paragraphIndex - b.paragraphIndex || a.startOffset - b.startOffset
  );
};

const persist = (map: HighlightMap): boolean => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
};
/* ==========================================================================
   Writes
   ========================================================================== */

/** Do two ranges in the same paragraph overlap (touching counts as overlap)? */
export const rangesOverlap = (
  a: { startOffset: number; endOffset: number },
  b: { startOffset: number; endOffset: number }
): boolean => a.startOffset < b.endOffset && b.startOffset < a.endOffset;

/**
 * Save a new highlight. Returns null when the range is invalid or overlaps an
 * existing one, so the caller can tell the user instead of creating broken
 * nested markup.
 */
export const addHighlight = (input: {
  articleId: string;
  paragraphIndex: number;
  text: string;
  startOffset: number;
  endOffset: number;
  note?: string;
}): Highlight | null => {
  if (!input.articleId) return null;

  // Trim the passage and shift the offsets to match, so the stored text and the
  // stored range always describe exactly the same characters. Without this,
  // restoring by offset would fail whenever the selection had extra whitespace.
  const raw = input.text;
  const trimmedStart = raw.trimStart();
  const leadingWhitespace = raw.length - trimmedStart.length;
  const text = trimmedStart.trimEnd();

  if (!text || text.length > MAX_TEXT_LENGTH) return null;

  const startOffset = input.startOffset + leadingWhitespace;
  const endOffset = startOffset + text.length;

  if (startOffset < 0 || endOffset <= startOffset) return null;

  try {
    const all = getAllHighlights();
    const existing = all[input.articleId] ?? [];

    const clashes = existing.some(
      (item) =>
        item.paragraphIndex === input.paragraphIndex &&
        rangesOverlap(item, { startOffset, endOffset })
    );
    if (clashes) return null;

    const now = new Date().toISOString();
    const highlight: Highlight = {
      id: makeId(),
      articleId: input.articleId,
      paragraphIndex: input.paragraphIndex,
      text,
      startOffset,
      endOffset,
      note: cleanNote(input.note),
      createdAt: now,
      updatedAt: now,
    };

    all[input.articleId] = [...existing, highlight];
    persist(all);

    return highlight;
  } catch {
    return null;
  }
};

/** Attach, replace or clear the note on an existing highlight. */
export const updateHighlightNote = (
  articleId: string,
  id: string,
  note: string
): Highlight | null => {
  if (!articleId || !id) return null;

  try {
    const all = getAllHighlights();
    const existing = all[articleId];
    if (!existing) return null;

    const index = existing.findIndex((item) => item.id === id);
    if (index === -1) return null;

    const updated: Highlight = {
      ...existing[index],
      // Saving an empty note clears it rather than storing a blank string.
      note: cleanNote(note),
      updatedAt: new Date().toISOString(),
    };

    const next = [...existing];
    next[index] = updated;
    all[articleId] = next;
    persist(all);

    return updated;
  } catch {
    return null;
  }
};

/** Remove a highlight and any note attached to it. */
export const deleteHighlight = (articleId: string, id: string): boolean => {
  if (!articleId || !id) return false;

  try {
    const all = getAllHighlights();
    const existing = all[articleId];
    if (!existing) return false;

    const next = existing.filter((item) => item.id !== id);
    if (next.length === existing.length) return false;

    if (next.length === 0) {
      delete all[articleId];
    } else {
      all[articleId] = next;
    }

    persist(all);
    return true;
  } catch {
    return false;
  }
};