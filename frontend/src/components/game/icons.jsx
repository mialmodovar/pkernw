/**
 * The few line icons the table's own navigation uses.
 *
 * Drawn rather than fetched, like the sounds are synthesised rather than
 * shipped: a few paths cost nothing and cannot 404. They inherit `currentColor`,
 * so a button styles its icon by styling itself.
 *
 * The app's icon set proper lives in components/icons; these are the table's,
 * and they stay here until the felt gets the same treatment. Home went first,
 * because the header that used it is now shared with every other page.
 */
function Glyph({ children, className = "w-3.5 h-3.5" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** The tournament lobby: the door back into the room you are playing in. */
export function LobbyIcon(props) {
  return (
    <Glyph {...props}>
      <path d="M14 3h5v18h-5" />
      <path d="M10 8l-4 4 4 4" />
      <path d="M6 12h9" />
    </Glyph>
  );
}

/** Tournament info. */
export function InfoIcon(props) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 7.6h.01" />
    </Glyph>
  );
}

/** Hand history: a clock wound backwards. */
export function HistoryIcon(props) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </Glyph>
  );
}
