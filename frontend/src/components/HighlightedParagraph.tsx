import React, { useMemo } from 'react';
import type { Highlight } from '../types/highlight';

/** One run of rendered text: either plain or a highlighted passage. */
interface Segment {
  key: string;
  text: string;
  highlightId?: string;
}

interface HighlightedParagraphProps {
  paragraphIndex: number;
  paragraph: string;
  highlights: Highlight[];
  onHighlightClick: (id: string, anchorRect: DOMRect) => void;
}

interface PlacedHighlight {
  highlight: Highlight;
  start: number;
  end: number;
}

/**
 * Re-locate a stored highlight inside the current paragraph text.
 *
 * The stored offsets are used first, but the passage text is verified against
 * the slice; if it does not match (for example the article text was edited) we
 * fall back to a plain text search, and only give up if it cannot be found.
 */
const locate = (paragraph: string, highlight: Highlight): PlacedHighlight | null => {
  const { startOffset, endOffset, text } = highlight;

  if (startOffset >= 0 && endOffset <= paragraph.length && endOffset > startOffset) {
    if (paragraph.slice(startOffset, endOffset) === text) {
      return { highlight, start: startOffset, end: endOffset };
    }
  }

  const found = paragraph.indexOf(text);
  if (found !== -1) {
    return { highlight, start: found, end: found + text.length };
  }

  return null;
};

/**
 * Render a paragraph with its highlights applied.
 *
 * Overlapping ranges are skipped rather than nested, so the DOM can never end
 * up with a mark inside another mark.
 */
export const HighlightedParagraph: React.FC<HighlightedParagraphProps> = ({
  paragraphIndex,
  paragraph,
  highlights,
  onHighlightClick,
}) => {
  const segments = useMemo<Segment[]>(() => {
    const placed = highlights
      .map((highlight) => locate(paragraph, highlight))
      .filter((item): item is PlacedHighlight => item !== null)
      .sort((a, b) => a.start - b.start);

    const result: Segment[] = [];
    let cursor = 0;

    for (const { highlight, start, end } of placed) {
      // Defensive: never nest or overlap marks in the DOM.
      if (start < cursor) continue;

      if (start > cursor) {
        result.push({
          key: `text-${paragraphIndex}-${cursor}`,
          text: paragraph.slice(cursor, start),
        });
      }

      result.push({
        key: highlight.id,
        text: paragraph.slice(start, end),
        highlightId: highlight.id,
      });

      cursor = end;
    }

    if (cursor < paragraph.length) {
      result.push({
        key: `text-${paragraphIndex}-${cursor}`,
        text: paragraph.slice(cursor),
      });
    }

    return result;
  }, [paragraph, paragraphIndex, highlights]);

  return (
    <>
      {segments.map((segment) => {
        if (!segment.highlightId) {
          return <React.Fragment key={segment.key}>{segment.text}</React.Fragment>;
        }

        const hasNote = highlights.some(
          (item) => item.id === segment.highlightId && Boolean(item.note)
        );

        return (
          <mark
            key={segment.key}
            className="reader-highlight"
            data-has-note={hasNote ? 'true' : 'false'}
            onClick={(event) => {
              // Keep the reader selection from being cleared by this click.
              event.stopPropagation();
              onHighlightClick(
                segment.highlightId as string,
                event.currentTarget.getBoundingClientRect()
              );
            }}
            title="Click to view or edit note"
          >
            {segment.text}
          </mark>
        );
      })}
    </>
  );
};