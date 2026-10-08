import React from 'react';
import type { VocabularyWord } from '../types/vocabulary';
import './Flashcard.css';

interface FlashcardProps {
  word: VocabularyWord;
  /** True once the answer has been revealed and the rating buttons are shown. */
  isRevealed: boolean;
  onReveal: () => void;
  onSpeak: (word: VocabularyWord) => void;
}

/**
 * A single review card.
 *
 * The front shows only the word so the user has to recall the meaning before
 * it appears. The back reuses the word's existing Personal Vocabulary content -
 * nothing here is generated or duplicated.
 */
export const Flashcard: React.FC<FlashcardProps> = ({ word, isRevealed, onReveal, onSpeak }) => {
  // The parent remounts this component with `key={word.id}`, so no local reset
  // is needed when the card changes.
  const handleReveal = () => onReveal();

  const phonetic = word.phonetic || word.phoneticUk;

  return (
    <div className="flashcard" data-revealed={isRevealed ? 'true' : 'false'}>
      {/* Front: the word only */}
      <div className="flashcard-face flashcard-front">
        <span className="flashcard-label">
          {word.status === 'learned' ? 'Learned word' : 'New word'}
        </span>

        <h2 className="flashcard-word">{word.word}</h2>

        {word.partOfSpeech && (
          <span className="flashcard-part-of-speech">{word.partOfSpeech}</span>
        )}

        {!isRevealed && (
          <button
            type="button"
            className="flashcard-reveal-btn"
            onClick={handleReveal}
            autoFocus
          >
            Show Answer
          </button>
        )}
      </div>

      {/* Back: the answer, taken from Personal Vocabulary */}
      {isRevealed && (
        <div className="flashcard-face flashcard-back">
          <div className="flashcard-back-header">
            <h2 className="flashcard-word flashcard-word-small">{word.word}</h2>

            <button
              type="button"
              className="flashcard-audio-btn"
              onClick={() => onSpeak(word)}
              aria-label={`Play pronunciation for ${word.word}`}
              title="Play pronunciation"
            >
              🔊
            </button>
          </div>

          {phonetic && <p className="flashcard-phonetic">{phonetic}</p>}

          <p className="flashcard-meaning">{word.meaning}</p>

          {word.meaningVi && (
            <p className="flashcard-meaning-vi">
              <strong>Tiếng Việt:</strong> {word.meaningVi}
            </p>
          )}

          {word.example && (
            <div className="flashcard-example">
              <p className="flashcard-example-text">&ldquo;{word.example}&rdquo;</p>
              {word.exampleVi && <p className="flashcard-example-vi">{word.exampleVi}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Flashcard;