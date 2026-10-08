import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { DictionaryEntry, LookupState } from '../types/dictionary';
import { isWordSaved, removeWord, saveWord } from '../utils/vocabularyStorage';
import './DictionaryPopup.css';

/** Popup width, kept in sync with `.dictionary-popup` in DictionaryPopup.css. */
const POPUP_WIDTH = 380;
/** Preferred popup height. The effective height is additionally capped by the
 *  viewport, so a long entry never pushes the footer off screen. */
const POPUP_MAX_HEIGHT = 520;
/** Smallest gap kept between the popup and every viewport edge. */
const VIEWPORT_MARGIN = 16;
/** Vertical gap between the selected word and the popup. */
const ANCHOR_GAP = 12;
/** Vertical gap used when the popup has to flip below the selected word. */
const BELOW_ANCHOR_GAP = 36;

interface DictionaryPopupProps {
  word: string;
  position: { x: number; y: number };
  lookupState: LookupState;
  dictionaryData: DictionaryEntry | null;
  errorMessage?: string;
  sourceArticleId: string;
  sourceArticleTitle: string;
  onClose: () => void;
  onRetry: () => void;
}

export const DictionaryPopup: React.FC<DictionaryPopupProps> = ({
  word,
  position,
  lookupState,
  dictionaryData,
  errorMessage,
  sourceArticleId,
  sourceArticleTitle,
  onClose,
  onRetry,
}) => {
  const displayWord = dictionaryData?.word || word;
  const [saved, setSaved] = useState<boolean>(() => isWordSaved(displayWord));

  // Play pronunciation audio (audio URL or native Web Speech API)
  const handlePlayAudio = () => {
    if (dictionaryData?.audioUrl) {
      try {
        const audio = new Audio(dictionaryData.audioUrl);
        audio.play().catch(() => speakWord(displayWord));
        return;
      } catch {
        speakWord(displayWord);
        return;
      }
    }
    speakWord(displayWord);
  };

  const speakWord = (text: string) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Toggle Save Word in Vocabulary
  const handleToggleSave = () => {
    if (saved) {
      removeWord(displayWord);
      setSaved(false);
    } else {
      if (!dictionaryData) return;

      saveWord({
        word: displayWord,
        phonetic: dictionaryData.phonetic,
        phoneticUk: dictionaryData.phoneticUk,
        partOfSpeech: dictionaryData.partOfSpeech,
        meaning: dictionaryData.meaning,
        meaningVi: dictionaryData.meaningVi,
        example: dictionaryData.example,
        exampleVi: dictionaryData.exampleVi,
        audioUrl: dictionaryData.audioUrl,
        sourceArticleId,
        sourceArticleTitle,
      });
      setSaved(true);
    }
  };

  // Clamped position calculation.
  //
  // The popup must never grow past the bottom of the viewport, otherwise the
  // footer (and the Save Word button) is clipped by the viewport and cannot be
  // reached by scrolling. Instead of guessing a fixed height we measure the
  // rendered popup, which also covers long entries and the height change from
  // the loading state to the loaded one.
  const popupRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number>(0);

  // Each new lookup must open at the top of the entry. The component is keyed
  // by the word in Reader, but a retry reuses the instance, so reset here too.
  useEffect(() => {
    const node = contentRef.current;
    if (node) node.scrollTop = 0;
  }, [word, lookupState]);

  useEffect(() => {
    const node = popupRef.current;
    if (!node) return;

    const measure = () => setMeasuredHeight(node.offsetHeight);

    measure();

    // Observe the popup so the position is re-clamped whenever the content
    // grows (loading -> success) or the entry is taller than the estimate.
    const observer = new ResizeObserver(measure);
    observer.observe(node);

    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const popupStyle = useMemo(() => {
    const viewportHeight = window.innerHeight;

    // The popup is capped by the design height *and* by the space available in
    // the viewport, so on short screens it shrinks instead of running off the
    // bottom edge.
    const cappedHeight = Math.min(
      POPUP_MAX_HEIGHT,
      Math.max(0, viewportHeight - VIEWPORT_MARGIN * 2)
    );

    // Before the first measurement fall back to the maximum, which is the worst
    // case for positioning.
    const popupHeight = Math.min(measuredHeight || cappedHeight, cappedHeight);

    let left = position.x - POPUP_WIDTH / 2;
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
    if (left + POPUP_WIDTH > window.innerWidth - VIEWPORT_MARGIN) {
      left = window.innerWidth - POPUP_WIDTH - VIEWPORT_MARGIN;
    }

    // Prefer above the word, flip below when there is no room, then clamp so
    // the footer always stays fully visible on screen.
    let top = position.y - popupHeight - ANCHOR_GAP;
    if (top < VIEWPORT_MARGIN) {
      top = position.y + BELOW_ANCHOR_GAP;
    }
    top = Math.min(top, viewportHeight - popupHeight - VIEWPORT_MARGIN);

    return {
      left: `${left}px`,
      top: `${Math.max(VIEWPORT_MARGIN, top)}px`,
      // Belt and braces: even if the measurement is stale the popup can never
      // grow past the space the viewport actually offers.
      maxHeight: `${cappedHeight}px`,
    };
  }, [position, measuredHeight]);

  return (
    <>
      <div
        className="dictionary-popup-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="dictionary-popup"
        ref={popupRef}
        style={popupStyle}
        role="dialog"
        aria-modal="true"
        aria-label={`Dictionary lookup for ${displayWord}`}
      >
        {/* Header */}
        <div className="dict-header">
          <div className="dict-title-area">
            <div className="dict-word-row">
              <span className="dict-word">{displayWord}</span>
              <button
                type="button"
                className="dict-word-audio"
                onClick={handlePlayAudio}
                aria-label={`Listen to pronunciation for ${displayWord}`}
                title="Listen"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M11 5L6 9H2v6h4l5 4V5z" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              </button>
              {dictionaryData?.phonetic && (
                <span className="dict-phonetic">{dictionaryData.phonetic}</span>
              )}
              {dictionaryData?.phoneticUk &&
                dictionaryData.phoneticUk !== dictionaryData.phonetic && (
                  <span className="dict-phonetic dict-phonetic-uk">
                    UK {dictionaryData.phoneticUk}
                  </span>
                )}
            </div>
            {dictionaryData?.partOfSpeech && (
              <span className="dict-part-of-speech">{dictionaryData.partOfSpeech}</span>
            )}
          </div>
          <button
            type="button"
            className="dict-close-btn"
            onClick={onClose}
            aria-label="Close dictionary popup"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable content area. Everything that can be long (meaning,
            translations, examples) lives here so it scrolls on its own while
            the header and the footer stay pinned. */}
        <div className="dict-content" ref={contentRef}>
          {/* State Views */}
          {lookupState === 'loading' && (
            <div className="dict-state-container">
              <div className="dict-spinner" />
              <span className="dict-state-text">Looking up...</span>
            </div>
          )}

          {lookupState === 'error' && (
            <div className="dict-state-container">
              <span className="dict-state-text">
                {errorMessage || 'Could not find a definition for this word.'}
              </span>
              <button
                type="button"
                className="dict-retry-btn"
                onClick={onRetry}
              >
                Retry
              </button>
            </div>
          )}

          {lookupState === 'success' && dictionaryData && (
            <div className="dict-body">
              {/* Meaning Section */}
              {dictionaryData.meaning && (
                <div className="dict-section">
                  <span className="dict-section-title">Meaning</span>
                  <p className="dict-meaning-en">{dictionaryData.meaning}</p>
                </div>
              )}

              {/* Vietnamese Section */}
              {dictionaryData.meaningVi && (
                <div className="dict-section">
                  <span className="dict-section-title">Tiếng Việt</span>
                  <p className="dict-meaning-vi">{dictionaryData.meaningVi}</p>
                </div>
              )}

              {/* Example Section */}
              {dictionaryData.example && (
                <div className="dict-section">
                  <span className="dict-section-title">Example</span>
                  <div className="dict-example-box">
                    <p className="dict-example-en">&ldquo;{dictionaryData.example}&rdquo;</p>
                    {dictionaryData.exampleVi && (
                      <p className="dict-example-vi">{dictionaryData.exampleVi}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pinned footer: the Save Word button is always visible, no matter how
            long the entry is. */}
        {lookupState === 'success' && dictionaryData && (
          <div className="dict-footer">
            <button
              type="button"
              className="dict-listen-btn"
              onClick={handlePlayAudio}
              aria-label={`Listen to pronunciation for ${displayWord}`}
            >
              🔊 Listen
            </button>

            <button
              type="button"
              className={`dict-save-btn ${saved ? 'is-saved' : ''}`}
              onClick={handleToggleSave}
            >
              {saved ? '✓ Saved' : '＋ Save Word'}
            </button>
          </div>
        )}
      </div>
    </>
  );
};
