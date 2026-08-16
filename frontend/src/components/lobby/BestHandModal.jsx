import { useEffect, useState } from "react";

import api from "../../api/http";
import { HandCard } from "../game/HandReview";

/**
 * The best hand you have ever turned over, replayed.
 *
 * Fetched by id rather than taken from a tournament's recent hands: the hand
 * worth remembering is almost never among the last twenty, and is usually in a
 * tournament that finished weeks ago.
 */
export default function BestHandModal({ best, onClose }) {
  const [hand, setHand] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.get(`/tournaments/hands/${best.hand_id}/`)
      .then(({ data }) => { if (!cancelled) setHand(data); })
      .catch(() => { if (!cancelled) setError("That hand could not be loaded."); });
    return () => { cancelled = true; };
  }, [best.hand_id]);

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center px-4" onClick={onClose}>
      <div
        className="panel rounded-xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl shadow-black/70"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-(--color-border)">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-(--color-silver)">
              {best.name}
            </h2>
            <p className="text-xs text-(--color-text-muted) truncate">
              {best.tournament_name} · hand #{best.hand_number}
            </p>
          </div>
          <button
            onClick={onClose}
            className="btn-secondary shrink-0 px-3 py-1 rounded text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {error && <p className="text-sm text-[#c76b7a]">{error}</p>}
          {!error && hand == null && <p className="text-sm text-(--color-text-muted)">Loading…</p>}
          {hand && <HandCard hand={hand} />}
        </div>
      </div>
    </div>
  );
}
