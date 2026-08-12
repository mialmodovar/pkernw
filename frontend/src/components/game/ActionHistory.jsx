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
      className="btn-secondary shrink-0 self-end px-4 py-2 rounded font-semibold text-sm transition-colors"
    >
      Hand history
    </button>
  );
}
