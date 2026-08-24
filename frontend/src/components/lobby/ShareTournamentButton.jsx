import { useEffect, useState } from "react";

import { shareTournament, tournamentUrl } from "./shareTournament";

/** Long enough to read the confirmation, short enough that the button goes
 *  back to being a button. */
const SAID_MS = 2200;

/**
 * Hand this tournament to somebody.
 *
 * A phone offers its own share sheet and that is the one people expect;
 * everywhere else the link goes on the clipboard. The button says which of
 * those happened rather than a hopeful "Shared!", because "Copied" is a promise
 * that something is now in your paste buffer.
 */
export default function ShareTournamentButton({ tournament, className = "" }) {
  const [said, setSaid] = useState(null);

  useEffect(() => {
    if (!said) return undefined;
    const timer = setTimeout(() => setSaid(null), SAID_MS);
    return () => clearTimeout(timer);
  }, [said]);

  const onShare = async () => {
    const result = await shareTournament(tournament);
    // A share sheet somebody dismissed said all it needed to.
    if (result !== "cancelled") setSaid(result);
  };

  const label = {
    copied: "Link copied",
    shared: "Shared",
    failed: "Copy failed",
  }[said];

  return (
    <button
      type="button"
      onClick={onShare}
      title={`Copy the link to ${tournament?.name || "this tournament"}`}
      className={`btn-secondary px-4 py-2 rounded font-semibold text-sm transition-colors ${
        said === "failed" ? "text-[#c76b7a]" : ""
      } ${className}`}
    >
      {label || "Share"}
      {/* Where the link goes, for anybody who would rather select it by hand —
          and the only way to see it at all on a page you reached from a
          bookmark. Hidden until it has been used, so the button stays a
          button. */}
      {said === "failed" && (
        <span className="sr-only">{tournamentUrl(tournament)}</span>
      )}
    </button>
  );
}
