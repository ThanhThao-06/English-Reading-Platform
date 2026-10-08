/**
 * Saved reading position for a single article.
 *
 * `progress` is a whole-number percentage (0-100), `scrollTop` is the exact
 * saved window scroll offset so the reader can resume in the same place.
 */
export interface ReadingProgress {
  articleId: string;
  progress: number;
  scrollTop: number;
  updatedAt: string;
  completed: boolean;
}

/** All saved progress, keyed by article id. */
export type ReadingProgressMap = Record<string, ReadingProgress>;

/**
 * How an article should be described in the UI. Derived from the saved
 * progress so the Library and Article Detail always agree.
 */
export type ProgressStatus =
  | { kind: 'none' }
  | { kind: 'in-progress'; progress: number }
  | { kind: 'completed'; progress: number };