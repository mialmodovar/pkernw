import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import api from "../../api/http";
import useAuthStore from "../../store/authStore";
import useGameStore from "../../store/gameStore";
import PlayingCard from "../game/PlayingCard";
import { handToShow, resumeLabel, tableToResume } from "./resumeTable";

// Slower than the lobby's own polling: this only has to notice that a seat of
// yours exists, and a seat does not appear out of nowhere while you read a page.
const REFRESH_MS = 10_000;

// Where the pill has no business being. The table itself, obviously, and the
// login pages, which nobody reaches with a seat live.
const HIDDEN_ON = [/^\/tournament\/\d+\/(play|watch)\b/, /^\/(login|register)\b/];

/**
 * A way back to the table, from wherever you have wandered off to.
 *
 * The table used to be a room with no door: every page that knew about your
 * tournament sent you back to it, so there was no leaving to check the lobby.
 * Now that you can leave, this is the door — pinned to the corner of every other
 * page while a seat of yours is being dealt to, saying which game it is and
 * showing the hand you were holding when you walked away.
 *
 * The cards are the last ones dealt to you and they go stale on purpose (see
 * handToShow): a hand from three minutes ago is not what is in front of you, and
 * a stale hand shown as a live one is worse than no hand at all.
 */
export default function TableShortcut() {
  const { user } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const lastHand = useGameStore((s) => s.lastHand);
  const [seats, setSeats] = useState([]);

  const hidden = !user || HIDDEN_ON.some((pattern) => pattern.test(location.pathname));

  useEffect(() => {
    if (hidden) return undefined;
    let cancelled = false;
    const load = () => api.get("/tournaments/", { params: { scope: "mine_active" } })
      .then(({ data }) => { if (!cancelled) setSeats(data); })
      // A door that cannot be drawn is not worth an error over somebody's lobby.
      .catch(() => {});
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [hidden, location.pathname]);

  const table = hidden ? null : tableToResume(seats);
  if (!table) return null;

  const cards = handToShow(lastHand, table);

  return (
    <button
      type="button"
      onClick={() => navigate(`/tournament/${table.id}/play`)}
      title={`Back to ${resumeLabel(table)}`}
      className="fixed bottom-4 right-4 z-40 flex items-center gap-3 pl-4 pr-3 py-2.5
                 rounded-full btn-accent shadow-xl shadow-black/50
                 animate-fade-in transition-transform hover:scale-[1.03]"
    >
      <span className="flex flex-col items-start leading-tight">
        <span className="text-[10px] uppercase tracking-wider opacity-80">
          {table.status === "paused" ? "Paused at" : "You're playing"}
        </span>
        <span className="text-sm font-bold max-w-[11rem] truncate">{resumeLabel(table)}</span>
      </span>

      {/* Your hand, small. A container query unit sizes the cards, so they need a
          size container of their own out here away from the felt. */}
      {cards.length > 0 && (
        <span className="@container flex gap-1 w-14 shrink-0" aria-hidden="true">
          {cards.map((card, index) => (
            <PlayingCard key={`${card}-${index}`} card={card} size="seat" />
          ))}
        </span>
      )}
    </button>
  );
}
