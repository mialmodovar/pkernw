import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import useAuthStore from "../../store/authStore";
import useGameStore from "../../store/gameStore";
import useTablesStore from "../../store/tablesStore";
import PlayingCard from "../game/PlayingCard";
import { handToShow, resumeLabel, shortcutHiddenOn, tableToResume } from "./resumeTable";

// Slower than the lobby's own polling: this only has to notice that a seat of
// yours exists, and a seat does not appear out of nowhere while you read a page.
const REFRESH_MS = 10_000;

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
  const hands = useGameStore((s) => s.hands);
  const seats = useTablesStore((s) => s.seats);
  const refreshSeats = useTablesStore((s) => s.refreshSeats);
  const lastTableId = useTablesStore((s) => s.lastTableId);

  const hidden = !user || shortcutHiddenOn(location.pathname);

  useEffect(() => {
    if (hidden) return undefined;
    refreshSeats();
    const timer = setInterval(refreshSeats, REFRESH_MS);
    return () => clearInterval(timer);
  }, [hidden, location.pathname, refreshSeats]);

  const table = hidden ? null : tableToResume(seats, lastTableId);
  if (!table) return null;

  const cards = handToShow(hands, table);
  const others = seats.filter((one) => one.id !== table.id).length;

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
        {/* Say when there are more, so somebody with three going knows this is
            a way back to one of them rather than to all of them. */}
        {others > 0 && (
          <span className="text-[10px] opacity-80">+{others} more table{others === 1 ? "" : "s"}</span>
        )}
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
