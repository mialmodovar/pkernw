import { useEffect, useState } from "react";

import api from "../../api/http";
import useSandboxStore from "../../dev/sandboxStore";
import HandReplay from "./HandReplay";

/**
 * Replays recently finished hands. The engine has always written nothing to the
 * hand tables, so there was nothing to look back at; now that it does, this
 * reads them.
 */
export default function HandReview({ tournamentId, onClose }) {
  const [hands, setHands] = useState(null);
  const [error, setError] = useState("");
  const sandboxHands = useSandboxStore((s) => (s.active ? s.hands : undefined));

  useEffect(() => {
    // In the layout sandbox there is no server to ask; the panel supplies the
    // hands instead, including "none generated yet", which is its own layout.
    if (sandboxHands !== undefined) {
      setHands(sandboxHands);
      return undefined;
    }
    let cancelled = false;
    api.get(`/tournaments/${tournamentId}/hands/`, { params: { limit: 5 } })
      .then(({ data }) => { if (!cancelled) setHands(data); })
      .catch(() => { if (!cancelled) setError("Could not load the hand history."); });
    return () => { cancelled = true; };
  }, [tournamentId, sandboxHands]);

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center px-4">
      <div className="panel rounded-xl w-full max-w-md max-h-[80dvh] flex flex-col shadow-2xl shadow-black/70">
        <div className="flex items-center justify-between px-4 py-3 border-b border-(--color-border)">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-(--color-silver)">
            Recent hands
          </h2>
          <button
            onClick={onClose}
            className="btn-secondary px-3 py-1 rounded text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>
        {/* A record of hands played, which people read back and quote at each
            other — so unlike the felt it behind it, it can be selected. */}
        <div className="selectable flex-1 overflow-y-auto p-3 space-y-3">
          {error && <p className="text-sm text-[#c76b7a]">{error}</p>}
          {!error && hands == null && (
            <p className="text-sm text-(--color-text-muted)">Loading…</p>
          )}
          {hands?.length === 0 && (
            <p className="text-sm text-(--color-text-muted)">
              No completed hands yet.
            </p>
          )}
          {hands?.map((hand) => <div key={hand.id} className="panel-raised rounded-lg p-3">
              <HandReplay hand={hand} />
            </div>)}
        </div>
      </div>
    </div>
  );
}
