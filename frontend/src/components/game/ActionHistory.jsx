import { HistoryIcon } from "./icons";

/** The way into the hand history — and nothing more.
 *
 * This used to be a live log that grew a line per action. Every line changed the
 * height of the whole bottom row, so the betting panel and the waiting message
 * shifted under the mouse while a hand played out. A button is a fixed size, and
 * the history itself reads better in the review panel, where hands are laid out
 * whole instead of scrolling past.
 */
export default function ActionHistory({ onReview }) {
  return (
    <button
      onClick={onReview}
      title="Replay the last few completed hands"
      // Below md the label is gone and the glyph is aria-hidden, which left the
      // button with no accessible name at all — and a title says nothing to a
      // finger. `tap-target` widens the hit area without moving the ink.
      aria-label="Hand history"
      className="btn-secondary tap-target shrink-0 flex items-center gap-1.5 px-2 md:px-3 py-1
                 rounded text-xs font-semibold transition-colors"
    >
      <HistoryIcon />
      <span className="hidden md:inline">Hand history</span>
    </button>
  );
}
