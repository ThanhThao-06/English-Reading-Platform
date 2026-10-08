import React, { useEffect, useRef, useState } from 'react';

interface NoteComposerProps {
  /** The passage that will be highlighted if the note is saved. */
  selectedText: string;
  /** Viewport coordinates of the selection. */
  anchor: { x: number; y: number };
  onSave: (note: string) => void;
  onCancel: () => void;
}

const POPOVER_WIDTH = 320;
const VIEWPORT_MARGIN = 12;
const APPROX_HEIGHT = 300;

/**
 * Keep the composer fully on screen.
 * Computed during render because the element is `position: fixed` and the
 * anchor is a viewport point captured when the selection was made.
 */
const clampPosition = (anchor: { x: number; y: number }) => {
  const half = POPOVER_WIDTH / 2;
  const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN);

  const left = Math.min(Math.max(anchor.x - half, VIEWPORT_MARGIN), maxLeft);

  const spaceBelow = window.innerHeight - anchor.y;
  const top =
    spaceBelow < APPROX_HEIGHT + VIEWPORT_MARGIN * 2
      ? Math.max(VIEWPORT_MARGIN, anchor.y - APPROX_HEIGHT - 10)
      : anchor.y + 10;

  return { left, top };
};

/**
 * Small editor shown after choosing "Add Note".
 * The highlight is only created once the note is saved, so cancelling leaves
 * nothing behind.
 */
export const NoteComposer: React.FC<NoteComposerProps> = ({
  selectedText,
  anchor,
  onSave,
  onCancel,
}) => {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const position = clampPosition(anchor);

  // Focus the textarea once it is rendered.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => textareaRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const handleSave = () => {
    // An empty note is never stored as an empty highlight.
    if (!note.trim()) {
      setError('Write a note first, or cancel to highlight without one.');
      return;
    }
    onSave(note.trim());
  };

  return (
    <>
      <div className="highlight-popover-backdrop" onClick={onCancel} aria-hidden="true" />

      <div
        className="highlight-popover"
        style={{ left: `${position.left}px`, top: `${position.top}px` }}
        role="dialog"
        aria-label="Add note to highlight"
      >
        <div className="highlight-popover-header">
          <span className="highlight-popover-title">Add Note</span>
          <button
            type="button"
            className="highlight-popover-close"
            onClick={onCancel}
            aria-label="Cancel note"
          >
            ×
          </button>
        </div>

        <blockquote className="highlight-popover-quote">&ldquo;{selectedText}&rdquo;</blockquote>

        <div className="highlight-note-editor">
          <textarea
            ref={textareaRef}
            className="highlight-note-input"
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              if (error) setError('');
            }}
            placeholder="Write a short note about this passage…"
            rows={4}
            maxLength={2000}
            aria-label="Highlight note"
          />

          {error && (
            <p className="highlight-note-error" role="alert">
              {error}
            </p>
          )}

          <div className="highlight-popover-actions">
            <button
              type="button"
              className="highlight-btn highlight-btn-ghost"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className="highlight-btn highlight-btn-primary"
              onClick={handleSave}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default NoteComposer;