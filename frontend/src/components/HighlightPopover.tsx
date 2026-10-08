import React, { useEffect, useRef, useState } from 'react';
import type { Highlight } from '../types/highlight';
// Styles live in Reader.css so they inherit the Reader theme variables.

interface HighlightPopoverProps {
  highlight: Highlight;
  /** Viewport position of the clicked highlight. */
  anchor: { x: number; y: number };
  onClose: () => void;
  onSaveNote: (id: string, note: string) => void;
  onDelete: (id: string) => void;
}

/** Popover width used for clamping, kept in sync with the stylesheet. */
const POPOVER_WIDTH = 320;
const VIEWPORT_MARGIN = 12;
const APPROX_HEIGHT = 260;

/**
 * Clamp the popover so it stays fully on screen, including on narrow phones.
 * Computed during render: the anchor is a viewport point captured when the
 * highlight was clicked, and the element is `position: fixed`, so no state or
 * effect is needed.
 */
const clampPosition = (anchor: { x: number; y: number }) => {
  const halfWidth = POPOVER_WIDTH / 2;
  const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN);

  const left = Math.min(Math.max(anchor.x - halfWidth, VIEWPORT_MARGIN), maxLeft);

  // Prefer below the highlight; flip above when there is no room.
  const spaceBelow = window.innerHeight - anchor.y;
  const top =
    spaceBelow < APPROX_HEIGHT + VIEWPORT_MARGIN * 2
      ? Math.max(VIEWPORT_MARGIN, anchor.y - APPROX_HEIGHT - 10)
      : anchor.y + 10;

  return { left, top };
};

export const HighlightPopover: React.FC<HighlightPopoverProps> = ({
  highlight,
  anchor,
  onClose,
  onSaveNote,
  onDelete,
}) => {
  // The popover is keyed by highlight id in Reader, so this component always
  // remounts for a different highlight and plain state stays correct.
  const [isEditing, setIsEditing] = useState(false);
  const [draftNote, setDraftNote] = useState(highlight.note ?? '');
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const position = clampPosition(anchor);

  /** Open the editor and focus the textarea straight away. */
  const openEditor = () => {
    setDraftNote(highlight.note ?? '');
    setIsEditing(true);
    // Focus after the textarea is rendered.
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  };

  // Close on Escape.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSave = () => {
    // An empty note is never stored: the highlight simply stays without one.
    onSaveNote(highlight.id, draftNote.trim());
    setIsEditing(false);
  };
return (
    <>
      <div className="highlight-popover-backdrop" onClick={onClose} aria-hidden="true" />

      <div
        className="highlight-popover"
        style={{ left: `${position.left}px`, top: `${position.top}px` }}
        role="dialog"
        aria-label="Saved highlight"
      >
        <div className="highlight-popover-header">
          <span className="highlight-popover-title">Highlight</span>
          <button
            type="button"
            className="highlight-popover-close"
            onClick={onClose}
            aria-label="Close highlight"
          >
            ×
          </button>
        </div>

        <blockquote className="highlight-popover-quote">&ldquo;{highlight.text}&rdquo;</blockquote>

        {isEditing ? (
          <div className="highlight-note-editor">
            <textarea
              ref={textareaRef}
              className="highlight-note-input"
              value={draftNote}
              onChange={(event) => setDraftNote(event.target.value)}
              placeholder="Write a short note about this passage…"
              rows={4}
              maxLength={2000}
              aria-label="Highlight note"
            />

            <div className="highlight-popover-actions">
              <button
                type="button"
                className="highlight-btn highlight-btn-ghost"
                onClick={() => {
                  // Cancel restores the original note.
                  setDraftNote(highlight.note ?? '');
                  setIsEditing(false);;
                }}
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
        ) : (
          <>
            {highlight.note ? (
              <p className="highlight-popover-note">{highlight.note}</p>
            ) : (
              <p className="highlight-popover-empty">No note yet.</p>
            )}

            {isConfirmingDelete ? (
              <div className="highlight-confirm">
                <p className="highlight-confirm-text">
                  {highlight.note
                    ? 'Delete this highlight and note?'
                    : 'Delete this highlight?'}
                </p>
                <div className="highlight-popover-actions">
                  <button
                    type="button"
                    className="highlight-btn highlight-btn-ghost"
                    onClick={() => setIsConfirmingDelete(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="highlight-btn highlight-btn-danger"
                    onClick={() => onDelete(highlight.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <div className="highlight-popover-actions">
                <button
                  type="button"
                  className="highlight-btn highlight-btn-danger-ghost"
                  onClick={() => setIsConfirmingDelete(true)}
                >
                  Delete
                </button>
                <button
                  type="button"
                  className="highlight-btn highlight-btn-primary"
                  onClick={openEditor}
                >
                  {highlight.note ? 'Edit Note' : 'Add note'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
};

export default HighlightPopover;