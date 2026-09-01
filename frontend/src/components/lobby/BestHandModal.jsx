import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import api from "../../api/http";
import HandReplay from "../game/HandReplay";

/**
 * The best hand you have ever turned over, replayed.
 *
 * Fetched by id rather than taken from a tournament's recent hands: the hand
 * worth remembering is almost never among the last twenty, and is usually in a
 * tournament that finished weeks ago.
 *
 * Through a portal, because it is opened from inside the stats panel, and every
 * .panel carries a backdrop-filter — which makes a stacking context that no
 * z-index can climb out of. Drawn in place, this dialog was sealed into a
 * column of the lobby and laid over the tiles it came from. See index.css.
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

  // Escape closes it, like every other dialog on the site.
  useEffect(() => {
    const key = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="panel rounded-xl w-full max-w-lg max-h-[85dvh] flex flex-col shadow-2xl shadow-black/70"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-(--color-border)">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-(--color-highlight-text)">{best.name}</h2>
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
        <div className="flex-1 overflow-y-auto p-4">
          {error && <p className="text-sm text-[#c76b7a]">{error}</p>}
          {!error && hand == null && <p className="text-sm text-(--color-text-muted)">Loading…</p>}
          {hand && <HandReplay hand={hand} heroSeat={best.seat ?? null} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}
