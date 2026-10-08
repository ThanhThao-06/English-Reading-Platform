/**
 * A highlighted passage inside an article.
 *
 * Restoration strategy: the Reader renders `article.content.split('\n\n')`, so a
 * highlight is anchored to `paragraphIndex` plus a character range inside that
 * paragraph. The Selection API is temporary and is never used for restoring.
 */
export interface Highlight {
  id: string;
  articleId: string;
  /** Index into the array produced by `article.content.split('\n\n')`. */
  paragraphIndex: number;
  /** The exact selected passage, used to re-locate the range if offsets drift. */
  text: string;
  /** Character offset of `text` inside the paragraph. */
  startOffset: number;
  /** Character offset just past `text` inside the paragraph. */
  endOffset: number;
  /** Personal note attached to this passage. Optional - plain highlights are valid. */
  note?: string;
  createdAt: string;
  updatedAt: string;
}

/** All highlights, keyed by article id. */
export type HighlightMap = Record<string, Highlight[]>;