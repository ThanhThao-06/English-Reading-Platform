import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DictionaryPopup } from '../components/DictionaryPopup';
import { Header } from '../components/Header';
import { useLibraryArticle } from '../hooks/useLibraryData';
import NoteComposer from '../components/HighlightNoteComposer';
import { HighlightPopover } from '../components/HighlightPopover';
import { HighlightedParagraph } from '../components/HighlightedParagraph';
import SelectionToolbar from '../components/HighlightSelectionToolbar';
import {
  formatChapterNumber,
  getArticleParagraphs,
  getChapterParagraphs,
  getChapterPosition,
  getChapterRoute,
  getValidChapters,
} from '../utils/chapterUtils';
import type { ChapterPosition } from '../utils/chapterUtils';
import type { DictionaryEntry, LookupState } from '../types/dictionary';
import type { Highlight } from '../types/highlight';
import { dictionaryErrorMessage, fetchDictionaryEntry } from '../utils/dictionaryService';
import {
  addHighlight,
  deleteHighlight,
  getHighlights,
  updateHighlightNote,
} from '../utils/highlightStorage';
import {
  COMPLETION_THRESHOLD,
  getProgress,
  saveProgress,
} from '../utils/readingProgressStorage';
import './Reader.css';

type FontSize = 'small' | 'medium' | 'large' | 'xlarge';
type LineSpacing = 'compact' | 'normal' | 'relaxed';
type ReadingTheme = 'dark' | 'light' | 'sepia';

const FONT_SIZES: FontSize[] = ['small', 'medium', 'large', 'xlarge'];

/** Wait this long after the last scroll before writing to localStorage. */
const SAVE_DEBOUNCE_MS = 600;

export const Reader: React.FC = () => {
  // `chapterId` is present only on the single-chapter route
  // (/reader/:id/chapter/:chapterId). It is null on the legacy whole-article route.
  const { id, chapterId } = useParams<{ id: string; chapterId?: string }>();
  const navigate = useNavigate();
  const { article, loading: articleLoading, error: articleError } = useLibraryArticle(id);

  // Reader Customization States
  const [fontSize, setFontSize] = useState<FontSize>('medium');
  const [lineSpacing, setLineSpacing] = useState<LineSpacing>('normal');
  const [theme, setTheme] = useState<ReadingTheme>('dark');
  const [isFocusMode, setIsFocusMode] = useState<boolean>(false);

  // Dictionary Lookup States
  const [selectedWord, setSelectedWord] = useState<string>('');
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [lookupState, setLookupState] = useState<LookupState>('idle');
  const [dictionaryData, setDictionaryData] = useState<DictionaryEntry | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Reading Progress States
  // `isCompleted` starts from the stored record so a finished article shows as
  // completed immediately, before any scrolling happens.
  const [progress, setProgress] = useState<number>(0);
  const [isCompleted, setIsCompleted] = useState<boolean>(
    () => getProgress(id ?? '')?.completed ?? false
  );

  /* ======================================================================
     Highlights & Notes
     ----------------------------------------------------------------------
     Highlighting is paragraph-anchored, so restoring them is a pure text
     lookup. The Dictionary keeps handling single words; these states only ever
     cover multi-word passages.
     ====================================================================== */

  /**
   * Highlights for the current article.
   *
   * The article id is stored with the list so switching articles reloads from
   * storage during render (React's "adjust state when an input changes"
   * pattern) instead of syncing from an effect.
   */
  const [highlightState, setHighlightState] = useState<{
    articleId: string | undefined;
    items: Highlight[];
  }>(() => ({ articleId: id, items: getHighlights(id ?? '') }));
  // A passage the user has selected but not yet turned into a highlight.
  const [pendingSelection, setPendingSelection] = useState<{
    paragraphIndex: number;
    text: string;
    startOffset: number;
    endOffset: number;
  } | null>(null);
  const [selectionToolbar, setSelectionToolbar] = useState<{
    x: number;
    y: number;
    message?: string;
  } | null>(null);
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<{ x: number; y: number } | null>(null);
  const [composerAnchor, setComposerAnchor] = useState<{ x: number; y: number } | null>(null);

  // Refs used by the scroll handler so it never needs to be re-created.
  const articleContentRef = useRef<HTMLElement | null>(null);
  const progressRef = useRef<number>(0);
  const scrollTopRef = useRef<number>(0);
  const completedRef = useRef<boolean>(false);
  const hasScrolledRef = useRef<boolean>(false);
  const saveTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const restoreRafRef = useRef<number | null>(null);
  /**
   * True while a programmatic (chapter) scroll is in flight. Programmatic
   * scrolling fires real scroll events; ignoring them stops a chapter jump from
   * being saved over the reader's existing saved position.
   */
  const suppressProgressRef = useRef<boolean>(false);

  /* ======================================================================
     Chapters
     ----------------------------------------------------------------------
     Each chapter is its own Reader page (route /reader/:id/chapter/:chapterId)
     and renders ONLY its own paragraphs. Those paragraphs keep their original
     article-level `data-paragraph-index`, so every saved highlight from Phase 2.1
     still matches when its chapter is opened.
     ====================================================================== */

  const chapters = article ? getValidChapters(article) : [];

  /**
   * The chapter (if any) currently being read.
   *
   * This is driven entirely by the route, never by scroll position: each
   * chapter is its own page. `null` means the reader is on the whole-article
   * route, which is what chapterless articles use.
   */
  const chapterPosition: ChapterPosition | null = article
    ? getChapterPosition(article, chapterId)
    : null;

  /**
   * A chapter id in the URL that does not belong to this article (typo, or a
   * chapter id copied from another article). Handled with a redirect instead of
   * crashing or silently rendering the wrong chapter.
   */
  const hasInvalidChapterId = chapterId !== undefined && chapterPosition === null;

  /** Whether the compact chapter list is expanded in the Reader. */
  const [isChapterListOpen, setIsChapterListOpen] = useState<boolean>(false);

  /**
   * The scroll listener is registered once per article, but `computeProgress`
   * needs the chapter currently on screen. Reading it through a ref keeps the
   * listener's progress maths correct after a chapter change without having to
   * re-subscribe on every navigation.
   */
  const chapterPositionRef = useRef<ChapterPosition | null>(null);

  // Synced in an effect (not during render) to stay correct under concurrent
  // rendering. Declared before the restore effect, so it is always up to date
  // before progress is measured.
  useEffect(() => {
    chapterPositionRef.current = chapterPosition;
  });

  /* ======================================================================
     Reading Progress
     ----------------------------------------------------------------------
     The reader scrolls the whole window, so progress is measured against the
     article container rather than the document (the sticky toolbar and page
     padding would otherwise skew the percentage).
     ====================================================================== */

  /**
   * Write the latest tracked values to localStorage. Never throws.
   * Skipped when the reader never scrolled, so simply opening an article and
   * leaving again can never overwrite a previously saved position with 0.
   */
  const persistProgress = (articleId: string) => {
    if (!hasScrolledRef.current) return;

    saveProgress({
      articleId,
      progress: progressRef.current,
      scrollTop: scrollTopRef.current,
    });
  };

  /**
   * How far through the article the viewport currently is, as a percentage.
   * Returns 0 until the article top reaches the top of the viewport.
   *
   * Progress stays **article-level** even though each chapter is now its own
   * page: the reader's position inside the chapter (0-1) is mapped onto the
   * chapter's slot in the article, so scrolling Chapter 3 reports the same
   * overall progress that one continuous page would have.
   */
  const computeProgress = (): number => {
    const content = articleContentRef.current;
    if (!content) return 0;

    const rect = content.getBoundingClientRect();
    const contentTop = rect.top + window.scrollY;
    const contentBottom = contentTop + rect.height;
    const viewportHeight = window.innerHeight;

    // Reading has not started yet.
    if (window.scrollY <= contentTop) return 0;

    // Reading is finished once the bottom of the article reaches the bottom
    // of the viewport.
    const finishAt = contentBottom - viewportHeight;
    const withinPage = finishAt <= contentTop ? 1 : (window.scrollY - contentTop) / (finishAt - contentTop);
    const ratio = Math.min(1, Math.max(0, withinPage));

    // On a chapter page, convert the position inside this chapter into a
    // position inside the whole article.
    const position = chapterPositionRef.current;
    if (position) {
      const { index, total } = position;
      const overall = (index + ratio) / total;
      return Math.min(100, Math.max(0, Math.round(overall * 100)));
    }

    return Math.min(100, Math.max(0, Math.round(ratio * 100)));
  };

  // Restore the previous position for this article.
  // Re-runs when the reader switches to a different article.
  // Restore the previous position for this article, or jump to a chapter.
  // Re-runs when the reader switches article or chapter.
  useEffect(() => {
    if (!id) return;

    const saved = getProgress(id);

    progressRef.current = 0;
    scrollTopRef.current = 0;
    hasScrolledRef.current = false;
    completedRef.current = saved?.completed ?? false;

    // Any mount or route change moves the document, and that movement fires real
    // scroll events. Ignoring them stops the transition from being saved over the
    // reader's existing position. Normal tracking resumes straight after.
    const isChapterPage = Boolean(chapterPosition);
    suppressProgressRef.current = true;

    // The article is rendered from local data, so a double animation frame is
    // enough for the browser to finish laying it out before scrolling.
    // Doing this inside rAF also keeps the state updates out of the synchronous
    // effect body.
    //
    // This uses its own raf ref rather than the scroll handler's one: sharing it
    // would leave the scroll handler blocked after the restore frame finished.
    restoreRafRef.current = window.requestAnimationFrame(() => {
      restoreRafRef.current = window.requestAnimationFrame(() => {
        restoreRafRef.current = null;

        if (isChapterPage) {
          // A chapter is its own reading page, so it always opens at its
          // beginning. A saved pixel offset belongs to a different document and
          // would drop the reader into unrelated text.
          window.scrollTo(0, 0);
        } else {
          window.scrollTo(0, saved && saved.scrollTop > 0 ? saved.scrollTop : 0);
        }

        const restored = computeProgress();
        progressRef.current = restored;
        scrollTopRef.current = window.scrollY;
        setProgress(restored);
        setIsCompleted(completedRef.current);
        setIsChapterListOpen(false);

        // Release suppression once the scroll events from this transition have
        // been delivered, so normal tracking resumes as soon as the reader acts.
        window.setTimeout(() => {
          suppressProgressRef.current = false;
        }, 250);
      });
    });

    return () => {
      if (restoreRafRef.current !== null) {
        window.cancelAnimationFrame(restoreRafRef.current);
        restoreRafRef.current = null;
      }
      // Never leave suppression stuck on when leaving the reader.
      suppressProgressRef.current = false;
    };
    // `chapterPosition` is derived from the route params, which are listed so the
    // effect re-runs when the reader navigates between chapters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, chapterId]);

  // Track scrolling. The visual bar updates immediately (frame-throttled) while
  // localStorage writes are debounced to avoid writing on every event.
  useEffect(() => {
    if (!id) return;

    const flushSave = () => {
      saveTimerRef.current = null;
      persistProgress(id);
    };

    const handleScroll = () => {
      // Ignore scroll events produced by a chapter jump so the reader's saved
      // position is not overwritten by the jump itself.
      if (suppressProgressRef.current) return;
      if (rafRef.current !== null) return;

      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;

        const nextProgress = computeProgress();
        scrollTopRef.current = window.scrollY;
        hasScrolledRef.current = true;

        if (nextProgress >= COMPLETION_THRESHOLD && !completedRef.current) {
          completedRef.current = true;
          setIsCompleted(true);
        }

        progressRef.current = nextProgress;

        // Only re-render when the displayed whole percent actually changes.
        setProgress((current) => (current === nextProgress ? current : nextProgress));

        if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(flushSave, SAVE_DEBOUNCE_MS);
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);

      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      // Persist immediately when leaving so the position is never lost.
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      persistProgress(id);
    };
  }, [id]);

  /**
   * Reload highlights and drop any open overlay when the article changes.
   *
   * Done during render rather than in an effect so the article is never
   * painted with another article's highlights for a frame.
   */
  if (highlightState.articleId !== id) {
    setHighlightState({ articleId: id, items: getHighlights(id ?? '') });
    setPendingSelection(null);
    setSelectionToolbar(null);
    setActiveHighlightId(null);
    setPopoverAnchor(null);
    setComposerAnchor(null);
  }

  const highlights = highlightState.articleId === id ? highlightState.items : [];

  /** Close every highlight-related overlay. */
  const CloseHighlightUi = () => {
    setPendingSelection(null);
    setSelectionToolbar(null);
    setActiveHighlightId(null);
    setPopoverAnchor(null);
    setComposerAnchor(null);
  };

  /** Re-read the article's highlights from storage after a change. */
  const RefreshHighlights = () => {
    setHighlightState({ articleId: id, items: getHighlights(id ?? '') });
  };

  /**
   * A chapter id that does not belong to this article - a typo, or an id copied
   * from another article - is sent somewhere sensible instead of rendering the
   * wrong chapter or crashing.
   *
   * Declared here, above the "article not found" early return, so that hooks are
   * always called in the same order.
   */
  useEffect(() => {
    if (!hasInvalidChapterId || !article || !id) return;

    if (chapters.length === 0) {
      // The URL claims a chapter but the article has none: fall back to the
      // normal whole-article reader.
      navigate(`/reader/${id}`, { replace: true });
      return;
    }

    navigate(`/article/${id}`, { replace: true });
  }, [hasInvalidChapterId, article, id, chapters.length, navigate]);

  if (!article) {
    return (
      <div className="reader-page" data-theme="dark">
        <Header />
        <main className="reader-main">
          <div className="reader-not-found-card">
            <h1>{articleLoading ? 'Loading article' : articleError ? 'Article unavailable' : 'Article not found'}</h1>
            <p>
              {articleLoading
                ? 'The requested reading article is loading.'
                : articleError ?? 'The reading content for this article could not be found.'}
            </p>
            <button
              type="button"
              className="reader-back-btn"
              onClick={() => navigate('/')}
            >
              ← Back to Library
            </button>
          </div>
        </main>
      </div>
    );
  }

  /**
   * Move to another chapter.
   *
   * This is a real navigation to that chapter's own page, so the Reader remounts
   * the chapter content and always starts at its beginning. The progress
   * currently on screen is saved first so moving between chapters can never
   * discard reading progress.
   */
  const goToChapter = (nextChapterId: string) => {
    if (nextChapterId === chapterId) return;

    // Save before navigating: the unmount path resets the tracked scroll, so the
    // value has to be written while it is still the outgoing chapter's.
    if (id) persistProgress(id);

    navigate(getChapterRoute(article.id, nextChapterId));
  };

  const goToPreviousChapter = () => {
    if (chapterPosition?.previous) goToChapter(chapterPosition.previous.id);
  };

  const goToNextChapter = () => {
    if (chapterPosition?.next) goToChapter(chapterPosition.next.id);
  };

  const currentFontIndex = FONT_SIZES.indexOf(fontSize);

  const handleDecreaseFont = () => {
    if (currentFontIndex > 0) {
      setFontSize(FONT_SIZES[currentFontIndex - 1]);
    }
  };

  const handleIncreaseFont = () => {
    if (currentFontIndex < FONT_SIZES.length - 1) {
      setFontSize(FONT_SIZES[currentFontIndex + 1]);
    }
  };

  // Perform Dictionary API fetch
  const fetchDictionaryWord = async (wordToSearch: string) => {
    setLookupState('loading');
    setErrorMessage('');
    setDictionaryData(null);

    try {
      const entry = await fetchDictionaryEntry(wordToSearch);
      setDictionaryData(entry);
      setLookupState('success');
    } catch (err) {
      setLookupState('error');
      setErrorMessage(dictionaryErrorMessage(err));
    }
  };

  /** Resolve a range boundary node to the paragraph element that contains it. */
const toParagraphElement = (node: Node): Element | null => {
  const element =
    node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return element?.closest('p[data-paragraph-index]') ?? null;
};

/**
 * Locate the paragraph and character offsets for the current selection.
 *
 * Only single-paragraph selections are supported, which keeps the stored
 * offsets meaningful and prevents nested highlight markup.
 */
const readSelectionAnchor = (articleContent: HTMLElement | null) => {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  const startParagraph = toParagraphElement(range.startContainer);
  const endParagraph = toParagraphElement(range.endContainer);

    // The selection must stay inside one paragraph, and inside the article body.
  if (!startParagraph || startParagraph !== endParagraph) return null;
  if (!articleContent?.contains(startParagraph)) return null;

  const paragraphIndex = Number(startParagraph.getAttribute('data-paragraph-index'));
  if (!Number.isInteger(paragraphIndex)) return null;

  // Measure the offsets against the paragraph's rendered text so they match
  // the stored article content exactly.
  const measure = (node: Node, offset: number): number => {
    const prefix = document.createRange();
    prefix.selectNodeContents(startParagraph);
    prefix.setEnd(node, offset);
    return prefix.toString().length;
  };

  const startOffset = measure(range.startContainer, range.startOffset);
  const endOffset = measure(range.endContainer, range.endOffset);
  if (endOffset <= startOffset) return null;

  return { paragraphIndex, startOffset, endOffset, text: range.toString() };
};

  // Handle word selection on reader content
  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const rawText = selection.toString();
    const trimmed = rawText.trim();
    if (!trimmed) return;

    // Check if selection contains spaces (more than one word)
    if (/\s+/.test(trimmed)) {
      // Multiple words selected -> offer Highlight / Add Note instead.
      // The Dictionary deliberately ignores these, so the two never overlap.
      handlePassageSelection();
      return;
    }

    // A single word belongs to the Dictionary; close any highlight UI first.
    CloseHighlightUi();

    // Strip leading/trailing punctuation (quotes, commas, periods, brackets, semicolons)
    const cleaned = trimmed.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '');

    // Must be a valid single English word (letters or hyphenated words)
    if (!cleaned || !/^[a-zA-Z]+(-[a-zA-Z]+)*$/.test(cleaned)) {
      return;
    }

    // Get selection coordinates
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setPopupPosition({
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
    }

    const normalizedWord = cleaned.toLowerCase();
    setSelectedWord(normalizedWord);
    fetchDictionaryWord(normalizedWord);
  };

  /** Offer the Highlight / Add Note toolbar for a multi-word passage. */
  const handlePassageSelection = () => {
    // Hide the Dictionary while the selection toolbar is showing.
    if (lookupState !== 'idle') {
      setLookupState('idle');
      setSelectedWord('');
      setDictionaryData(null);
      setErrorMessage('');
    }

    setActiveHighlightId(null);
    setPopoverAnchor(null);

    const anchorInfo = readSelectionAnchor(articleContentRef.current);

    if (!anchorInfo) {
      setPendingSelection(null);
      setSelectionToolbar({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        message: 'Select text within a single paragraph.',
      });
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const rect = selection.getRangeAt(0).getBoundingClientRect();

    setPendingSelection({
      paragraphIndex: anchorInfo.paragraphIndex,
      text: anchorInfo.text.trim(),
      startOffset: anchorInfo.startOffset,
      endOffset: anchorInfo.endOffset,
    });

    setSelectionToolbar({
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
  };

  /** Create a highlight from the pending selection, optionally with a note. */
  const createHighlight = (note?: string) => {
    if (!id || !pendingSelection) return;

    const created = addHighlight({
      articleId: id,
      paragraphIndex: pendingSelection.paragraphIndex,
      text: pendingSelection.text,
      startOffset: pendingSelection.startOffset,
      endOffset: pendingSelection.endOffset,
      note,
    });

    RefreshHighlights();

    if (!created) {
      // Overlaps an existing highlight, or the selection was too large.
      setSelectionToolbar({
        x: selectionToolbar?.x ?? window.innerWidth / 2,
        y: selectionToolbar?.y ?? window.innerHeight / 2,
        message: 'This passage overlaps an existing highlight.',
      });
      setPendingSelection(null);
      return;
    }

    CloseHighlightUi();
    window.getSelection()?.removeAllRanges();
  };

  const handleHighlightClick = (highlightId: string, rect: DOMRect) => {
    setPendingSelection(null);
    setSelectionToolbar(null);
    setActiveHighlightId(highlightId);
    setPopoverAnchor({ x: rect.left + rect.width / 2, y: rect.bottom });
  };

  const handleSaveNote = (highlightId: string, note: string) => {
    if (!id) return;
    updateHighlightNote(id, highlightId, note);
    RefreshHighlights();
  };

  const handleDeleteHighlight = (highlightId: string) => {
    if (!id) return;
    deleteHighlight(id, highlightId);
    RefreshHighlights();
    CloseHighlightUi();
  };

  const handleClosePopup = () => {
    setLookupState('idle');
    setSelectedWord('');
    setDictionaryData(null);
    setErrorMessage('');
    window.getSelection()?.removeAllRanges();
  };

  const handleRetryLookup = () => {
    if (selectedWord) {
      fetchDictionaryWord(selectedWord);
    }
  };

  // Split content into paragraphs separated by \n\n
  // Uses the shared splitter so paragraph indexes can never diverge from the
  // chapter metadata or from stored highlights.
  const allParagraphs = getArticleParagraphs(article);

  /**
   * The paragraphs actually rendered on this page.
   *
   * On a chapter route this is ONLY that chapter's paragraphs. Each entry keeps
   * its original article-level index, so `data-paragraph-index` - and therefore
   * every Phase 2.1 highlight - stays exactly where it has always been.
   * On the whole-article route (chapterless articles) it is the full article,
   * exactly as before.
   */
  const visibleParagraphs = chapterPosition
    ? getChapterParagraphs(article, chapterPosition.chapter)
    : allParagraphs.map((text, index) => ({ index, text }));

  /** Highlights belonging to one paragraph, in document order. */
  const highlightsForParagraph = (paragraphIndex: number) =>
    highlights.filter((item) => item.paragraphIndex === paragraphIndex);

  const activeHighlight = highlights.find((item) => item.id === activeHighlightId) ?? null;

  return (
    <div
      className={`reader-page ${isFocusMode ? 'is-focus-mode' : ''}`}
      data-theme={theme}
    >
      {/* Hide website header when in Focus Mode */}
      {!isFocusMode && <Header />}

      {/* Reader Toolbar */}
      <nav className="reader-toolbar-wrapper" aria-label="Reader Controls">
        <div className="reader-toolbar">
          <button
            type="button"
            className="reader-back-btn"
            onClick={() => navigate(`/article/${article.id}`)}
            aria-label="Back to Article Details"
          >
            ← Back to Article
          </button>

          <div className="reader-controls-group">
            {/* Font Size Stepper */}
            <div className="control-block" role="group" aria-label="Font size controls">
              <button
                type="button"
                className="control-btn"
                onClick={handleDecreaseFont}
                disabled={currentFontIndex === 0}
                aria-label="Decrease font size"
                title="Decrease font size (A-)"
              >
                A−
              </button>
              <span className="font-size-label" aria-hidden="true">
                {fontSize === 'small' && '16'}
                {fontSize === 'medium' && '18'}
                {fontSize === 'large' && '20'}
                {fontSize === 'xlarge' && '22'}
              </span>
              <button
                type="button"
                className="control-btn"
                onClick={handleIncreaseFont}
                disabled={currentFontIndex === FONT_SIZES.length - 1}
                aria-label="Increase font size"
                title="Increase font size (A+)"
              >
                A+
              </button>
            </div>

            {/* Line Spacing Selector */}
            <div className="control-block" role="group" aria-label="Line spacing options">
              <button
                type="button"
                className={`control-btn ${lineSpacing === 'compact' ? 'active' : ''}`}
                onClick={() => setLineSpacing('compact')}
                aria-pressed={lineSpacing === 'compact'}
                title="Compact line spacing (1.6)"
              >
                Compact
              </button>
              <button
                type="button"
                className={`control-btn ${lineSpacing === 'normal' ? 'active' : ''}`}
                onClick={() => setLineSpacing('normal')}
                aria-pressed={lineSpacing === 'normal'}
                title="Normal line spacing (1.8)"
              >
                Normal
              </button>
              <button
                type="button"
                className={`control-btn ${lineSpacing === 'relaxed' ? 'active' : ''}`}
                onClick={() => setLineSpacing('relaxed')}
                aria-pressed={lineSpacing === 'relaxed'}
                title="Relaxed line spacing (2.1)"
              >
                Relaxed
              </button>
            </div>

            {/* Theme Selector */}
            <div className="control-block" role="group" aria-label="Reading theme options">
              <button
                type="button"
                className={`control-btn ${theme === 'light' ? 'active' : ''}`}
                onClick={() => setTheme('light')}
                aria-pressed={theme === 'light'}
                title="Light theme"
              >
                Light
              </button>
              <button
                type="button"
                className={`control-btn ${theme === 'sepia' ? 'active' : ''}`}
                onClick={() => setTheme('sepia')}
                aria-pressed={theme === 'sepia'}
                title="Sepia book theme"
              >
                Sepia
              </button>
              <button
                type="button"
                className={`control-btn ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => setTheme('dark')}
                aria-pressed={theme === 'dark'}
                title="Dark theme"
              >
                Dark
              </button>
            </div>

            {/* Focus Mode Toggle Button */}
            <button
              type="button"
              className={`focus-toggle-btn ${isFocusMode ? 'is-active' : ''}`}
              onClick={() => setIsFocusMode(!isFocusMode)}
              aria-pressed={isFocusMode}
              title={isFocusMode ? 'Exit focus mode' : 'Enter focus mode'}
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {isFocusMode ? (
                  <>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </>
                ) : (
                  <>
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                  </>
                )}
              </svg>
              {isFocusMode ? 'Exit Focus' : 'Focus Mode'}
            </button>

            {/* Reading progress percentage */}
            <span
              className="reader-progress-text"
              data-completed={isCompleted ? 'true' : 'false'}
              title={isCompleted ? 'Article completed' : 'Reading progress'}
            >
              {isCompleted ? 'Completed' : `${progress}%`}
            </span>
          </div>
        </div>

        {/* Thin progress bar pinned to the bottom edge of the sticky toolbar */}
        <div
          className="reader-progress-track"
          role="progressbar"
          aria-label="Reading progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div
            className="reader-progress-bar"
            data-completed={isCompleted ? 'true' : 'false'}
            style={{ width: `${progress}%` }}
          />
        </div>
      </nav>

      {/* Main Reading Container */}
      <main className="reader-main">
        <article className="reader-content-container" ref={articleContentRef}>
          {/* Article Header. On a chapter page the chapter is the title,
              so the article title stays as a quiet context line. */}
          <header className="reader-article-header">
            {chapterPosition && (
              <p className="reader-article-parent-title">{article.title}</p>
            )}

            <div className="reader-article-meta">
              <span>{article.genre}</span>
              <span className="meta-dot">·</span>
              <span
                className="reader-level-tag"
                data-level={article.level}
                title={`CEFR Level ${article.level}`}
              >
                Level {article.level}
              </span>
              <span className="meta-dot">·</span>
              <span>{article.readingTime}</span>
            </div>

            {chapterPosition ? (
              <>
                <p className="reader-chapter-position">
                  Chapter {formatChapterNumber(chapterPosition.index)} of{' '}
                  {chapterPosition.total}
                </p>
                <h1 className="reader-article-title">{chapterPosition.chapter.title}</h1>
              </>
            ) : (
              <h1 className="reader-article-title">{article.title}</h1>
            )}
          </header>

          {/* Compact chapter navigation. Selecting a chapter navigates to that
              chapter's own page rather than scrolling within this one. */}
          {chapterPosition && (
            <nav className="reader-toc" aria-label="Article chapters">
              <button
                type="button"
                className="reader-toc-toggle"
                onClick={() => setIsChapterListOpen((open) => !open)}
                aria-expanded={isChapterListOpen}
                aria-controls="reader-chapter-list"
              >
                <span className="reader-toc-label">☰ Chapters</span>
                <span className="reader-toc-count">
                  {formatChapterNumber(chapterPosition.index)} /{' '}
                  {formatChapterNumber(chapterPosition.total - 1)}
                </span>
              </button>

              {isChapterListOpen && (
                <ol className="reader-toc-list" id="reader-chapter-list">
                  {chapters.map((chapter, index) => (
                    <li key={chapter.id}>
                      <button
                        type="button"
                        className="reader-toc-link"
                        data-active={chapter.id === chapterPosition.chapter.id ? 'true' : 'false'}
                        onClick={() => goToChapter(chapter.id)}
                        aria-current={chapter.id === chapterPosition.chapter.id ? 'true' : undefined}
                      >
                        <span className="reader-toc-number">{formatChapterNumber(index)}</span>
                        <span className="reader-toc-title">{chapter.title}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </nav>
          )}

          {/* Article Paragraphs - Selection Area.
              Only the current chapter's paragraphs are rendered. Each keeps its
              original article-level data-paragraph-index, which is what keeps
              Phase 2.1 highlights aligned. */}
          <section
            className="reader-body"
            data-font-size={fontSize}
            data-line-spacing={lineSpacing}
            aria-label={chapterPosition ? chapterPosition.chapter.title : 'Article text'}
            onMouseUp={handleTextSelection}
            onTouchEnd={handleTextSelection}
          >
            {visibleParagraphs.map(({ index, text }) => (
              <p
                key={index}
                className="reader-paragraph"
                data-paragraph-index={index}
                data-chapter-id={chapterPosition?.chapter.id}
              >
                <HighlightedParagraph
                  paragraphIndex={index}
                  paragraph={text}
                  highlights={highlightsForParagraph(index)}
                  onHighlightClick={handleHighlightClick}
                />
              </p>
            ))}
          </section>

          {/* Chapter navigation. On the last chapter, Next becomes a completion action. */}
          {chapterPosition ? (
            <nav className="reader-chapter-nav" aria-label="Chapter navigation">
              {chapterPosition.previous ? (
                <button
                  type="button"
                  className="reader-chapter-nav-btn"
                  onClick={goToPreviousChapter}
                  aria-label={`Previous chapter: ${chapterPosition.previous.title}`}
                >
                  <span className="reader-chapter-nav-direction">← Previous</span>
                  <span className="reader-chapter-nav-title">
                    {chapterPosition.previous.title}
                  </span>
                </button>
              ) : (
                <span className="reader-chapter-nav-spacer" />
              )}

              {chapterPosition.next ? (
                <button
                  type="button"
                  className="reader-chapter-nav-btn"
                  data-align="next"
                  onClick={goToNextChapter}
                  aria-label={`Next chapter: ${chapterPosition.next.title}`}
                >
                  <span className="reader-chapter-nav-direction">Next →</span>
                  <span className="reader-chapter-nav-title">
                    {chapterPosition.next.title}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  className="reader-chapter-nav-btn"
                  data-align="next"
                  onClick={() => navigate(`/article/${article.id}`)}
                >
                  <span className="reader-chapter-nav-direction">Finish Reading</span>
                  <span className="reader-chapter-nav-title">Return to Article</span>
                </button>
              )}
            </nav>
          ) : (
            <footer className="reader-end-marker">
              <span className="reader-end-text">You have completed this article.</span>
              <button
                type="button"
                className="reader-end-btn"
                onClick={() => navigate(`/article/${article.id}`)}
              >
                ← Return to Article Details
              </button>
            </footer>
          )}
        </article>
      </main>

      {/* Dictionary Popup */}
      {lookupState !== 'idle' && (
        <DictionaryPopup
          key={selectedWord}
          word={selectedWord}
          position={popupPosition}
          lookupState={lookupState}
          dictionaryData={dictionaryData}
          errorMessage={errorMessage}
          sourceArticleId={article.id}
          sourceArticleTitle={article.title}
          onClose={handleClosePopup}
          onRetry={handleRetryLookup}
        />
      )}

      {/* Highlight selection toolbar - shown for multi-word passages */}
      {selectionToolbar && !activeHighlight && (
        <SelectionToolbar
          position={{ x: selectionToolbar.x, y: selectionToolbar.y }}
          message={selectionToolbar.message}
          onHighlight={() => createHighlight()}
          onAddNote={() => {
            // Keep the selection context but switch to the note composer.
            const position = { x: selectionToolbar.x, y: selectionToolbar.y + 20 };
            setSelectionToolbar(null);
            setComposerAnchor(position);
          }}
          onClose={CloseHighlightUi}
        />
      )}

      {/* Note composer - creates the highlight together with the note */}
      {pendingSelection && composerAnchor && (
        <NoteComposer
          selectedText={pendingSelection.text}
          anchor={composerAnchor}
          onSave={(note: string) => createHighlight(note)}
          onCancel={() => {
            setComposerAnchor(null);
            setPendingSelection(null);
          }}
        />
      )}

      {/* Popover for an existing highlight */}
      {activeHighlight && popoverAnchor && (
        <HighlightPopover
          key={activeHighlight.id}
          highlight={activeHighlight}
          anchor={popoverAnchor}
          onClose={CloseHighlightUi}
          onSaveNote={handleSaveNote}
          onDelete={handleDeleteHighlight}
        />
      )}
    </div>
  );
};

export default Reader;
