import { useCallback, useMemo } from 'react';
import type { ProgressStatus } from '../types/readingProgress';
import { getAllProgress } from '../utils/readingProgressStorage';

/**
 * Read the saved reading progress once and hand back a lookup for card badges.
 *
 * Both the Library and a genre page render the same `ArticleCard`, so they must
 * describe progress identically. The page is freshly mounted whenever the
 * reader navigates back, which keeps the snapshot up to date.
 */
export const useProgressStatusLookup = (): ((articleId: string) => ProgressStatus) => {
  const progressMap = useMemo(() => getAllProgress(), []);

  return useCallback(
    (articleId: string): ProgressStatus => {
      const saved = progressMap[articleId];
      if (!saved) return { kind: 'none' };
      if (saved.completed) return { kind: 'completed', progress: 100 };
      if (saved.progress <= 0) return { kind: 'none' };
      return { kind: 'in-progress', progress: saved.progress };
    },
    [progressMap]
  );
};
