import React, { useEffect } from 'react';

interface SelectionToolbarProps {
  /** Viewport coordinates of the current selection. */
  position: { x: number; y: number };
  message?: string;
  onHighlight: () => void;
  onAddNote: () => void;
  onClose: () => void;
}

const TOOLBAR_WIDTH = 210;
const VIEWPORT_MARGIN = 8;

/**
 * Keep the toolbar fully on screen, including on narrow phones.
 * Computed during render because the element is `position: fixed` and the
 * anchor is a viewport point captured when the selection was made.
 */
const clampPosition = (anchor: { x: number; y: number }) => {
  const half = TOOLBAR_WIDTH / 2;
  const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - TOOLBAR_WIDTH - VIEWPORT_MARGIN);

  const left = Math.min(Math.max(anchor.x - half, VIEWPORT_MARGIN), maxLeft);

  // Above the selection by default; drop below when it would clip the top.
  const top = anchor.y - 46 < VIEWPORT_MARGIN ? anchor.y + 26 : anchor.y - 46;

  return { left, top };
};

export const SelectionToolbar: React.FC<SelectionToolbarProps> = ({
  position,
  message,
  onHighlight,
  onAddNote,
  onClose,
}) => {
  const style = clampPosition(position);

  // Dismiss on Escape.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="highlight-selection-toolbar"
      style={{ left: `${style.left}px`, top: `${style.top}px` }}
      role="toolbar"
      aria-label="Highlight selection actions"
      // Keep the browser selection alive while the user clicks a button.
      onMouseDown={(event) => event.preventDefault()}
    >
      {message ? (
        <span className="highlight-selection-message">{message}</span>
      ) : (
        <>
          <button
            type="button"
            className="highlight-selection-btn"
            onClick={onHighlight}
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
              <path d="M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z" />
            </svg>
            Highlight
          </button>

          <span className="highlight-selection-divider" aria-hidden="true" />

          <button
            type="button"
            className="highlight-selection-btn"
            onClick={onAddNote}
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
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
            </svg>
            Add Note
          </button>
        </>
      )}
    </div>
  );
};

export default SelectionToolbar;