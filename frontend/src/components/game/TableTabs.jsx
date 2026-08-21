import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import useGameStore from "../../store/gameStore";
import useTablesStore from "../../store/tablesStore";
import { handToShow, openTableTabs } from "../lobby/resumeTable";
import PlayingCard from "./PlayingCard";

// The seat list is a fact about tournaments rather than about this page, and
// tournaments do not start under you every few seconds.
const REFRESH_MS = 12_000;

/**
 * Every table you have open, along the top of the one you are looking at.
 *
 * A player can be seated in three games at once and watching a fourth, and the
 * app used to be able to hold one in its head: leaving a table lost it, and
 * getting back meant a button that guessed which one you meant. These are the
 * others — the hand you were dealt at each, so you can tell them apart at a
 * glance, and a way into any of them without going back to the lobby first.
 *
 * A watched table can be closed, because nothing on the server knows you are
 * looking. A seat cannot: you are in it until you bust.
 */
export default function TableTabs({ currentId }) {
  const navigate = useNavigate();
  const seats = useTablesStore((s) => s.seats);
  const watching = useTablesStore((s) => s.watching);
  const refreshSeats = useTablesStore((s) => s.refreshSeats);
  const closeWatch = useTablesStore((s) => s.closeWatch);
  const hands = useGameStore((s) => s.hands);

  useEffect(() => {
    refreshSeats();
    const timer = setInterval(refreshSeats, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refreshSeats]);

  const tabs = openTableTabs(seats, watching);

  // One table is not a set of tabs — it is the page you are on.
  if (tabs.length < 2) return null;

  return (
    <div className="shrink-0 flex items-stretch gap-1 px-2 py-1 overflow-x-auto
                    border-b border-(--color-border) bg-black/30">
      {tabs.map((tab) => {
        const here = Number(tab.id) === Number(currentId);
        const cards = handToShow(hands, { id: tab.id });
        return (
          <div
            key={`${tab.kind}-${tab.id}`}
            className={`flex items-center gap-2 rounded-md pl-2.5 pr-1.5 py-1 shrink-0 border
                        transition-colors ${
              here
                ? "bg-(--color-accent) text-(--color-accent-text) border-(--color-border-strong)"
                : "panel-raised border-(--color-border) hover:border-(--color-border-strong)"
            }`}
          >
            <button
              type="button"
              onClick={() => {
                if (here) return;
                navigate(tab.kind === "watch" && tab.table != null
                  ? `/tournament/${tab.id}/watch/${tab.table}`
                  : `/tournament/${tab.id}/play`);
              }}
              className="flex items-center gap-2 min-w-0"
              title={tab.kind === "watch" ? `Watching ${tab.label}` : tab.label}
            >
              {tab.kind === "watch" && <span aria-hidden="true" className="text-xs">👁</span>}
              <span className={`text-xs font-semibold max-w-[9rem] truncate ${
                here ? "" : "text-(--color-silver)"
              }`}>
                {tab.label}
              </span>
              {/* The hand you were dealt there, which is how anybody actually
                  tells two tables apart. Goes stale on its own — see
                  handToShow — rather than claiming to be this second's cards. */}
              {cards.length > 0 && (
                <span className="@container flex gap-0.5 w-9 shrink-0" aria-hidden="true">
                  {cards.map((card, index) => (
                    <PlayingCard key={`${card}-${index}`} card={card} size="seat" />
                  ))}
                </span>
              )}
              {tab.status === "paused" && (
                <span className="text-[10px] opacity-70">paused</span>
              )}
            </button>

            {tab.kind === "watch" ? (
              <button
                type="button"
                onClick={() => {
                  closeWatch(tab.id);
                  if (here) navigate("/");
                }}
                title="Stop watching this table"
                aria-label="Stop watching this table"
                className={`w-5 h-5 rounded flex items-center justify-center text-xs
                            transition-colors ${
                  here ? "hover:bg-black/20" : "text-(--color-text-muted) hover:text-(--color-silver)"
                }`}
              >
                ×
              </button>
            ) : (
              // A seat has no close button on purpose: you are in it until you
              // bust or it ends. The space keeps the tabs the same height.
              <span className="w-5" aria-hidden="true" />
            )}
          </div>
        );
      })}
    </div>
  );
}
